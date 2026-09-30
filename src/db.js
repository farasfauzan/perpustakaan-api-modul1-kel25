/**
 * Klien Supabase + penerjemah error database ke ApiError.
 *
 * API ini berjalan di sisi server (Express / Vercel Function), jadi memakai
 * SUPABASE_SERVICE_ROLE_KEY. Kunci itu TIDAK PERNAH dikirim ke browser:
 * respons API hanya berisi data, bukan kredensial.
 */
import { createClient } from '@supabase/supabase-js';
import { config, missingSupabaseEnv, supabaseConfigured } from './config.js';
import { ApiError } from './lib/errors.js';

let client = null;

export function db() {
  if (!supabaseConfigured) {
    throw new ApiError(
      503,
      'SUPABASE_NOT_CONFIGURED',
      `Env var berikut belum diisi: ${missingSupabaseEnv.join(', ')}.`,
      { missing_env: missingSupabaseEnv },
    );
  }
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-application-name': 'perpustakaan-api' } },
    });
  }
  return client;
}

/**
 * Terjemahkan error Postgres/PostgREST menjadi ApiError yang bisa dibaca.
 * Mengembalikan null kalau error-nya tidak dikenali (biar jadi 500).
 */
export function fromDbError(error) {
  if (!error) return null;

  const code = error.code ?? '';
  const detail = error.details ?? error.hint ?? error.message;

  switch (code) {
    case 'PGRST116':
      return new ApiError(404, 'NOT_FOUND', 'Data tidak ditemukan.');
    case '23505':
      return ApiError.conflict(`Nilai unik sudah dipakai: ${detail}`, { pg_code: code });
    case '23503':
      return ApiError.conflict(
        'Relasi data tidak valid: baris yang dirujuk tidak ada, atau masih dipakai baris lain.',
        { pg_code: code, detail },
      );
    case '23514':
      return ApiError.unprocessable(`Nilai tidak memenuhi aturan database: ${detail}`, { pg_code: code });
    case '22P02':
      return ApiError.badRequest('Format nilai tidak sesuai tipe kolom.', { pg_code: code });
    case '42501':
      return new ApiError(
        500,
        'PERMISSION_DENIED',
        'Service role tidak punya hak akses ke tabel/view. Jalankan supabase/schema.sql di Supabase SQL Editor.',
        { pg_code: code },
      );
    case '42P01':
    case 'PGRST205':
      return new ApiError(
        500,
        'SCHEMA_MISSING',
        'Tabel/view belum ada di database. Jalankan supabase/schema.sql di Supabase SQL Editor.',
        { pg_code: code },
      );
    case 'PGRST301':
      return new ApiError(502, 'SUPABASE_AUTH', 'Kunci Supabase ditolak. Periksa SUPABASE_SERVICE_ROLE_KEY.');
    default:
      break;
  }

  if (error.status === 401) {
    return new ApiError(502, 'SUPABASE_AUTH', 'Kunci Supabase ditolak. Periksa SUPABASE_SERVICE_ROLE_KEY.');
  }
  return null;
}

/** Buka respons supabase-js: { data, error, count } → { data, count }. */
export function unwrap(response) {
  if (response.error) {
    throw (
      fromDbError(response.error) ??
      new ApiError(500, 'DATABASE_ERROR', response.error.message ?? 'Query database gagal.')
    );
  }
  return { data: response.data, count: response.count ?? null };
}
