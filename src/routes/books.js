import { Router } from 'express';
import { config } from '../config.js';
import { db, unwrap } from '../db.js';
import { ApiError } from '../lib/errors.js';
import { buildMeta, created, noContent, ok } from '../lib/response.js';
import {
  parsePagination,
  parseSort,
  queryBoolean,
  queryText,
  searchPattern,
} from '../lib/query.js';
import {
  assertKnownKeys,
  assertObject,
  dropUndefined,
  integer,
  text,
  uuid,
} from '../lib/validate.js';

const router = Router();

const WRITABLE = [
  'title',
  'author',
  'isbn',
  'category',
  'publisher',
  'published_year',
  'total_copies',
];
const SORTABLE = ['created_at', 'updated_at', 'title', 'author', 'published_year', 'total_copies'];
const VIEW = 'v_books';

function readPayload(body) {
  return dropUndefined({
    title: text(body.title, 'title', { required: true, max: 250 }),
    author: text(body.author, 'author', { required: true, max: 250 }),
    isbn: text(body.isbn, 'isbn', { max: 32, nullable: true }),
    category: text(body.category, 'category', { max: 80, nullable: true }),
    publisher: text(body.publisher, 'publisher', { max: 150, nullable: true }),
    published_year: integer(body.published_year, 'published_year', { min: 1500, max: 2100 }),
    total_copies: integer(body.total_copies, 'total_copies', { min: 0, max: 10_000 }),
  });
}

async function findOne(id) {
  const { data } = unwrap(await db().from(VIEW).select('*').eq('id', id).maybeSingle());
  return data;
}

/** GET /books — daftar buku + pencarian, filter, sort, pagination. */
router.get('/', async (req, res) => {
  const { page, limit, from, to } = parsePagination(req.query, config.maxPageSize);
  const { column, ascending } = parseSort(req.query, SORTABLE, '-created_at');

  let query = db().from(VIEW).select('*', { count: 'exact' });

  const term = queryText(req.query, 'q');
  if (term !== undefined) query = query.ilike('search_text', searchPattern(term));

  const category = queryText(req.query, 'category', 80);
  if (category !== undefined) query = query.ilike('category', category);

  const available = queryBoolean(req.query, 'available');
  if (available === true) query = query.gt('available_copies', 0);
  if (available === false) query = query.eq('available_copies', 0);

  const { data, count } = unwrap(await query.order(column, { ascending }).range(from, to));
  return ok(res, data, buildMeta(page, limit, count ?? data.length));
});

/** GET /books/:id */
router.get('/:id', async (req, res) => {
  const id = uuid(req.params.id, 'id', { required: true });
  const row = await findOne(id);
  if (!row) throw ApiError.notFound(`Buku dengan id ${id} tidak ditemukan.`);
  return ok(res, row);
});

/** POST /books */
router.post('/', async (req, res) => {
  const body = assertObject(req.body);
  assertKnownKeys(body, WRITABLE);

  const payload = readPayload(body);
  const { data: inserted } = unwrap(
    await db().from('books').insert(payload).select('id').single(),
  );

  return created(res, await findOne(inserted.id));
});

/** PATCH /books/:id */
router.patch('/:id', async (req, res) => {
  const id = uuid(req.params.id, 'id', { required: true });
  const body = assertObject(req.body);
  assertKnownKeys(body, WRITABLE);

  const payload = dropUndefined({
    title: text(body.title, 'title', { max: 250 }),
    author: text(body.author, 'author', { max: 250 }),
    isbn: text(body.isbn, 'isbn', { max: 32, nullable: true }),
    category: text(body.category, 'category', { max: 80, nullable: true }),
    publisher: text(body.publisher, 'publisher', { max: 150, nullable: true }),
    published_year: integer(body.published_year, 'published_year', { min: 1500, max: 2100 }),
    total_copies: integer(body.total_copies, 'total_copies', { min: 0, max: 10_000 }),
  });

  if (Object.keys(payload).length === 0) {
    throw ApiError.badRequest(`Tidak ada field yang dikirim. Field yang bisa diubah: ${WRITABLE.join(', ')}.`);
  }

  const { data: updated } = unwrap(
    await db().from('books').update(payload).eq('id', id).select('id'),
  );
  if (updated.length === 0) throw ApiError.notFound(`Buku dengan id ${id} tidak ditemukan.`);

  return ok(res, await findOne(id));
});

/** DELETE /books/:id — ditolak 409 kalau buku masih dipakai peminjaman. */
router.delete('/:id', async (req, res) => {
  const id = uuid(req.params.id, 'id', { required: true });

  const { data } = unwrap(await db().from('books').delete().eq('id', id).select('id'));
  if (data.length === 0) throw ApiError.notFound(`Buku dengan id ${id} tidak ditemukan.`);

  return noContent(res);
});

/** Dipakai route lain yang butuh memastikan buku ada. */
export async function requireBook(bookId) {
  const { data } = unwrap(
    await db().from(VIEW).select('id, title, total_copies, available_copies').eq('id', bookId).maybeSingle(),
  );
  if (!data) throw ApiError.notFound(`Buku dengan id ${bookId} tidak ditemukan.`);
  return data;
}

export default router;
