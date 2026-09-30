import { Router } from 'express';
import { config } from '../config.js';
import { db, unwrap } from '../db.js';
import { memberCode } from '../lib/codes.js';
import { ApiError } from '../lib/errors.js';
import { buildMeta, created, noContent, ok } from '../lib/response.js';
import { parsePagination, parseSort, queryText, searchPattern, single } from '../lib/query.js';
import {
  assertKnownKeys,
  assertObject,
  dateOnly,
  dropUndefined,
  enumValue,
  text,
  uuid,
} from '../lib/validate.js';

const router = Router();

const MEMBER_STATUS = ['Aktif', 'Nonaktif'];
const WRITABLE = ['member_code', 'full_name', 'email', 'phone', 'status', 'joined_at'];
const SORTABLE = ['created_at', 'updated_at', 'full_name', 'joined_at', 'member_code'];
const TABLE = 'members';

async function findOne(id) {
  const { data } = unwrap(await db().from(TABLE).select('*').eq('id', id).maybeSingle());
  return data;
}

/** GET /members */
router.get('/', async (req, res) => {
  const { page, limit, from, to } = parsePagination(req.query, config.maxPageSize);
  const { column, ascending } = parseSort(req.query, SORTABLE, '-created_at');

  let query = db().from(TABLE).select('*', { count: 'exact' });

  const term = queryText(req.query, 'q');
  if (term !== undefined) query = query.ilike('search_text', searchPattern(term));

  const status = single(req.query.status, 'status');
  if (status !== undefined) {
    query = query.eq('status', enumValue(status, 'status', MEMBER_STATUS, { required: true }));
  }

  const { data, count } = unwrap(await query.order(column, { ascending }).range(from, to));
  return ok(res, data, buildMeta(page, limit, count ?? data.length));
});

/** GET /members/:id */
router.get('/:id', async (req, res) => {
  const id = uuid(req.params.id, 'id', { required: true });
  const row = await findOne(id);
  if (!row) throw ApiError.notFound(`Anggota dengan id ${id} tidak ditemukan.`);
  return ok(res, row);
});

/** POST /members — member_code dibuat otomatis kalau tidak dikirim. */
router.post('/', async (req, res) => {
  const body = assertObject(req.body);
  assertKnownKeys(body, WRITABLE);

  const joinedAt = dateOnly(body.joined_at, 'joined_at');
  const payload = dropUndefined({
    member_code: text(body.member_code, 'member_code', { max: 40 }) ?? memberCode(),
    full_name: text(body.full_name, 'full_name', { required: true, max: 150 }),
    email: text(body.email, 'email', { max: 150, nullable: true }),
    phone: text(body.phone, 'phone', { max: 30, nullable: true }),
    status: enumValue(body.status, 'status', MEMBER_STATUS),
    joined_at: joinedAt,
  });

  const { data: inserted } = unwrap(
    await db().from(TABLE).insert(payload).select('id').single(),
  );

  return created(res, await findOne(inserted.id));
});

/** PATCH /members/:id */
router.patch('/:id', async (req, res) => {
  const id = uuid(req.params.id, 'id', { required: true });
  const body = assertObject(req.body);
  assertKnownKeys(body, WRITABLE);

  const payload = dropUndefined({
    member_code: text(body.member_code, 'member_code', { max: 40 }),
    full_name: text(body.full_name, 'full_name', { max: 150 }),
    email: text(body.email, 'email', { max: 150, nullable: true }),
    phone: text(body.phone, 'phone', { max: 30, nullable: true }),
    status: enumValue(body.status, 'status', MEMBER_STATUS),
    joined_at: dateOnly(body.joined_at, 'joined_at'),
  });

  if (Object.keys(payload).length === 0) {
    throw ApiError.badRequest(`Tidak ada field yang dikirim. Field yang bisa diubah: ${WRITABLE.join(', ')}.`);
  }

  const { data: updated } = unwrap(
    await db().from(TABLE).update(payload).eq('id', id).select('id'),
  );
  if (updated.length === 0) throw ApiError.notFound(`Anggota dengan id ${id} tidak ditemukan.`);

  return ok(res, await findOne(id));
});

/** DELETE /members/:id — ditolak 409 kalau anggota masih punya riwayat peminjaman. */
router.delete('/:id', async (req, res) => {
  const id = uuid(req.params.id, 'id', { required: true });

  const { data } = unwrap(await db().from(TABLE).delete().eq('id', id).select('id'));
  if (data.length === 0) throw ApiError.notFound(`Anggota dengan id ${id} tidak ditemukan.`);

  return noContent(res);
});

/** Dipakai route peminjaman untuk memastikan anggota ada dan masih aktif. */
export async function requireMember(memberId) {
  const { data } = unwrap(
    await db().from(TABLE).select('id, member_code, full_name, status').eq('id', memberId).maybeSingle(),
  );
  if (!data) throw ApiError.notFound(`Anggota dengan id ${memberId} tidak ditemukan.`);
  return data;
}

export default router;
