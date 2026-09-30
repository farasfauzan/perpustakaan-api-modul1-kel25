import cors from 'cors';
import express from 'express';
import { config, missingSupabaseEnv } from './config.js';
import { db } from './db.js';
import { ApiError } from './lib/errors.js';
import booksRouter from './routes/books.js';
import loansRouter from './routes/loans.js';
import membersRouter from './routes/members.js';

const SERVICE = 'perpustakaan-api';
const VERSION = '1.0.0';

const API_ROUTES = [
  { method: 'GET', path: '/books', description: 'Daftar buku (?q=, ?category=, ?available=, ?sort=, ?page=, ?limit=)' },
  { method: 'GET', path: '/books/:id', description: 'Detail satu buku' },
  { method: 'POST', path: '/books', description: 'Tambah buku' },
  { method: 'PATCH', path: '/books/:id', description: 'Ubah buku' },
  { method: 'DELETE', path: '/books/:id', description: 'Hapus buku' },
  { method: 'GET', path: '/members', description: 'Daftar anggota (?q=, ?status=Aktif|Nonaktif)' },
  { method: 'GET', path: '/members/:id', description: 'Detail satu anggota' },
  { method: 'POST', path: '/members', description: 'Tambah anggota' },
  { method: 'PATCH', path: '/members/:id', description: 'Ubah anggota' },
  { method: 'DELETE', path: '/members/:id', description: 'Hapus anggota' },
  { method: 'GET', path: '/loans', description: 'Daftar peminjaman (?status=Dipinjam|Terlambat|Dikembalikan, ?member_id=, ?book_id=, ?q=, ?borrowed_from=, ?borrowed_to=)' },
  { method: 'GET', path: '/loans/:id', description: 'Detail satu peminjaman' },
  { method: 'POST', path: '/loans', description: 'Catat peminjaman baru' },
  { method: 'PATCH', path: '/loans/:id', description: 'Ubah / kembalikan peminjaman (kirim returned_at)' },
  { method: 'DELETE', path: '/loans/:id', description: 'Hapus catatan peminjaman' },
  { method: 'GET', path: '/health', description: 'Status layanan dan koneksi database' },
];

const jsonParser = express.json({ limit: '100kb' });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(cors());

/**
 * Vercel sudah mem-parse body JSON sebelum fungsi dipanggil (req.body berupa
 * objek). Di server lokal belum, jadi parser Express dipakai. Dua kondisi ini
 * ditangani di satu tempat supaya perilakunya sama di lokal dan di Vercel.
 */
app.use((req, res, next) => {
  if (req.body !== undefined) return next();
  return jsonParser(req, res, next);
});

function serviceInfo(req, res) {
  return res.json({
    service: SERVICE,
    description: 'REST API pencatatan peminjaman buku perpustakaan.',
    version: VERSION,
    status: 'ok',
    timezone: 'Asia/Jakarta',
    routes: API_ROUTES,
  });
}

app.get('/', serviceInfo);
app.get('/api', serviceInfo);

app.get(['/health', '/api/health'], async (req, res) => {
  if (missingSupabaseEnv.length > 0) {
    return res.status(503).json({
      status: 'degraded',
      database: { connected: false, reason: 'missing_env', missing_env: missingSupabaseEnv },
    });
  }

  const startedAt = Date.now();
  try {
    const { error } = await db().from('v_loans').select('id', { count: 'exact', head: true });
    if (error) throw error;
    return res.json({
      status: 'ok',
      database: { connected: true, latency_ms: Date.now() - startedAt },
    });
  } catch (error) {
    return res.status(503).json({
      status: 'degraded',
      database: { connected: false, reason: error.message ?? 'unknown' },
    });
  }
});

/** Route yang sama tersedia di root maupun di bawah /api. */
for (const prefix of ['', '/api']) {
  app.use(`${prefix}/books`, booksRouter);
  app.use(`${prefix}/members`, membersRouter);
  app.use(`${prefix}/loans`, loansRouter);
}

app.use((req, res) => {
  return res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl} tidak ada.`,
      hint: 'Kirim GET / untuk melihat daftar endpoint yang tersedia.',
    },
  });
});

// eslint-disable-next-line no-unused-vars -- Express mengenali error handler dari 4 argumen
app.use((error, req, res, next) => {
  if (error instanceof ApiError) {
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }

  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Body bukan JSON yang valid.' },
    });
  }

  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Body melebihi batas 100kb.' },
    });
  }

  console.error('[unhandled]', error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server.' },
  });
});

export { API_ROUTES, SERVICE, VERSION };
export default app;
