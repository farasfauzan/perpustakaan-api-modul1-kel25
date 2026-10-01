import { Router } from 'express';
import { config } from '../config.js';
import { db, unwrap } from '../db.js';
import { loanCode } from '../lib/codes.js';
import { addDays, compactDate, today } from '../lib/dates.js';
import { ApiError } from '../lib/errors.js';
import { buildMeta, created, noContent, ok } from '../lib/response.js';
import {
  parsePagination,
  parseSort,
  queryDate,
  queryEnum,
  queryText,
  queryUuid,
  searchPattern,
} from '../lib/query.js';
import {
  assertKnownKeys,
  assertObject,
  dateOnly,
  dropUndefined,
  text,
  uuid,
} from '../lib/validate.js';
import { requireBook } from './books.js';
import { requireMember } from './members.js';

const router = Router();

/** Status tidak disimpan di kolom, tapi dihitung di view v_loans. */
const LOAN_STATUS = ['Dipinjam', 'Terlambat', 'Dikembalikan'];
const WRITABLE = ['loan_code', 'book_id', 'member_id', 'borrowed_at', 'due_at', 'notes'];
const PATCHABLE = ['borrowed_at', 'due_at', 'returned_at', 'notes'];
const SORTABLE = [
  'created_at',
  'updated_at',
  'borrowed_at',
  'due_at',
  'returned_at',
  'loan_code',
  'status',
];
const TABLE = 'loans';
const VIEW = 'v_loans';

async function findOne(id) {
  const { data } = unwrap(await db().from(VIEW).select('*').eq('id', id).maybeSingle());
  return data;
}

/** GET /loans — inti fitur filter, contoh: /loans?status=Terlambat */
router.get('/', async (req, res) => {
  const { page, limit, from, to } = parsePagination(req.query, config.maxPageSize);
  const { column, ascending } = parseSort(req.query, SORTABLE, '-borrowed_at');

  let query = db().from(VIEW).select('*', { count: 'exact' });

  const status = queryEnum(req.query, 'status', LOAN_STATUS);
  if (status !== undefined) query = query.eq('status', status);

  const memberId = queryUuid(req.query, 'member_id');
  if (memberId !== undefined) query = query.eq('member_id', memberId);

  const bookId = queryUuid(req.query, 'book_id');
  if (bookId !== undefined) query = query.eq('book_id', bookId);

  const memberCodeFilter = queryText(req.query, 'member_code', 40);
  if (memberCodeFilter !== undefined) query = query.ilike('member_code', memberCodeFilter);

  const term = queryText(req.query, 'q');
  if (term !== undefined) query = query.ilike('search_text', searchPattern(term));

  const borrowedFrom = queryDate(req.query, 'borrowed_from');
  if (borrowedFrom !== undefined) query = query.gte('borrowed_at', borrowedFrom);

  const borrowedTo = queryDate(req.query, 'borrowed_to');
  if (borrowedTo !== undefined) query = query.lte('borrowed_at', borrowedTo);

  if (borrowedFrom !== undefined && borrowedTo !== undefined && borrowedFrom > borrowedTo) {
    throw ApiError.badRequest('Parameter "borrowed_from" tidak boleh lebih akhir dari "borrowed_to".');
  }

  const { data, count } = unwrap(await query.order(column, { ascending }).range(from, to));
  return ok(res, data, buildMeta(page, limit, count ?? data.length));
});

/** GET /loans/:id */
router.get('/:id', async (req, res) => {
  const id = uuid(req.params.id, 'id', { required: true });
  const row = await findOne(id);
  if (!row) throw ApiError.notFound(`Peminjaman dengan id ${id} tidak ditemukan.`);
  return ok(res, row);
});

/**
 * POST /loans — catat peminjaman baru.
 * Ditolak kalau: buku/anggota tidak ada, anggota nonaktif, stok habis,
 * atau anggota masih memegang salinan yang sama.
 */
router.post('/', async (req, res) => {
  const body = assertObject(req.body);
  assertKnownKeys(body, WRITABLE);

  const bookId = uuid(body.book_id, 'book_id', { required: true });
  const memberId = uuid(body.member_id, 'member_id', { required: true });

  const borrowedAt = dateOnly(body.borrowed_at, 'borrowed_at') ?? today();
  const dueAt = dateOnly(body.due_at, 'due_at') ?? addDays(borrowedAt, config.defaultLoanDays);
  if (dueAt < borrowedAt) {
    throw ApiError.unprocessable('Field "due_at" tidak boleh lebih awal dari "borrowed_at".');
  }

  const book = await requireBook(bookId);
  const member = await requireMember(memberId);

  if (member.status !== 'Aktif') {
    throw ApiError.conflict(
      `Anggota ${member.full_name} (${member.member_code}) berstatus ${member.status}, tidak bisa meminjam.`,
    );
  }
  if (book.available_copies < 1) {
    throw ApiError.conflict(
      `Semua salinan "${book.title}" sedang dipinjam (${book.total_copies} eksemplar).`,
    );
  }

  const { data: held } = unwrap(
    await db()
      .from(TABLE)
      .select('loan_code')
      .eq('member_id', memberId)
      .eq('book_id', bookId)
      .is('returned_at', null)
      .limit(1),
  );
  if (held.length > 0) {
    throw ApiError.conflict(
      `Anggota ini masih memegang "${book.title}" pada peminjaman ${held[0].loan_code}.`,
    );
  }

  const payload = {
    loan_code: text(body.loan_code, 'loan_code', { max: 40 }) ?? loanCode(compactDate(borrowedAt)),
    book_id: bookId,
    member_id: memberId,
    borrowed_at: borrowedAt,
    due_at: dueAt,
    notes: text(body.notes, 'notes', { max: 500, nullable: true }) ?? null,
  };

  const { data: inserted } = unwrap(
    await db().from(TABLE).insert(payload).select('id').single(),
  );

  return created(res, await findOne(inserted.id));
});

/**
 * PATCH /loans/:id — ubah tanggal/judul catatan, atau tandai dikembalikan.
 * Kirim `"returned_at": null` untuk membatalkan pengembalian.
 * book_id dan member_id sengaja tidak bisa diubah supaya stok tetap konsisten.
 */
router.patch('/:id', async (req, res) => {
  const id = uuid(req.params.id, 'id', { required: true });
  const body = assertObject(req.body);
  assertKnownKeys(body, PATCHABLE);

  const existing = unwrap(
    await db().from(TABLE).select('*').eq('id', id).maybeSingle(),
  ).data;
  if (!existing) throw ApiError.notFound(`Peminjaman dengan id ${id} tidak ditemukan.`);

  const payload = dropUndefined({
    borrowed_at: dateOnly(body.borrowed_at, 'borrowed_at'),
    due_at: dateOnly(body.due_at, 'due_at'),
    returned_at: dateOnly(body.returned_at, 'returned_at', { nullable: true }),
    notes: text(body.notes, 'notes', { max: 500, nullable: true }),
  });

  if (Object.keys(payload).length === 0) {
    throw ApiError.badRequest(
      `Tidak ada field yang dikirim. Field yang bisa diubah: ${PATCHABLE.join(', ')}.`,
    );
  }

  const nextBorrowed = payload.borrowed_at ?? existing.borrowed_at;
  const nextDue = payload.due_at ?? existing.due_at;
  const nextReturned =
    Object.prototype.hasOwnProperty.call(payload, 'returned_at') ? payload.returned_at : existing.returned_at;

  if (nextDue < nextBorrowed) {
    throw ApiError.unprocessable('Field "due_at" tidak boleh lebih awal dari "borrowed_at".');
  }
  if (nextReturned && nextReturned < nextBorrowed) {
    throw ApiError.unprocessable('Field "returned_at" tidak boleh lebih awal dari "borrowed_at".');
  }

  const { data: updated } = unwrap(
    await db().from(TABLE).update(payload).eq('id', id).select('id'),
  );
  if (updated.length === 0) throw ApiError.notFound(`Peminjaman dengan id ${id} tidak ditemukan.`);

  return ok(res, await findOne(id));
});

/** DELETE /loans/:id */
router.delete('/:id', async (req, res) => {
  const id = uuid(req.params.id, 'id', { required: true });

  const { data } = unwrap(await db().from(TABLE).delete().eq('id', id).select('id'));
  if (data.length === 0) throw ApiError.notFound(`Peminjaman dengan id ${id} tidak ditemukan.`);

  return noContent(res);
});

export default router;
