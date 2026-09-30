/**
 * Validasi request body tanpa dependency tambahan.
 *
 * Aturan umum: `undefined` berarti field tidak dikirim (dilewati), `null`
 * hanya diterima kalau field memang boleh null. Nilai yang gagal validasi
 * dilempar sebagai ApiError(422) supaya pesannya rapi ke pengguna API.
 *
 * Import alias yang dipakai di route:
 *   import * as v from '../lib/validate.js';
 */
import { ApiError } from './errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertObject(value, label = 'Body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw ApiError.badRequest(
      `${label} harus berupa objek JSON dan header Content-Type: application/json harus dikirim.`,
    );
  }
  return value;
}

export function assertKnownKeys(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw ApiError.badRequest(`Field tidak dikenal: ${unknown.join(', ')}.`, { allowed });
  }
}

/** Buang field yang tidak dikirim supaya tidak menimpa kolom dengan NULL. */
export function dropUndefined(source) {
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function text(value, field, { required = false, max = 500, nullable = false } = {}) {
  if (value === undefined) {
    if (required) throw ApiError.unprocessable(`Field "${field}" wajib diisi.`);
    return undefined;
  }
  if (value === null) {
    if (nullable) return null;
    if (required) throw ApiError.unprocessable(`Field "${field}" wajib diisi.`);
    return undefined;
  }
  if (typeof value !== 'string') throw ApiError.unprocessable(`Field "${field}" harus berupa teks.`);

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    if (nullable) return null;
    throw ApiError.unprocessable(`Field "${field}" tidak boleh kosong.`);
  }
  if (trimmed.length > max) {
    throw ApiError.unprocessable(`Field "${field}" maksimal ${max} karakter.`);
  }
  return trimmed;
}

export function uuid(value, field, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw ApiError.unprocessable(`Field "${field}" wajib diisi.`);
    return undefined;
  }
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    throw ApiError.unprocessable(`Field "${field}" harus berupa UUID yang valid.`);
  }
  return value.trim().toLowerCase();
}

export function dateOnly(value, field, { required = false, nullable = false } = {}) {
  if (value === undefined) {
    if (required) throw ApiError.unprocessable(`Field "${field}" wajib diisi.`);
    return undefined;
  }
  if (value === null) {
    if (nullable) return null;
    if (required) throw ApiError.unprocessable(`Field "${field}" wajib diisi.`);
    return undefined;
  }
  if (typeof value !== 'string') {
    throw ApiError.unprocessable(`Field "${field}" harus berupa teks bertipe tanggal.`);
  }

  const iso = value.trim();
  if (!DATE_RE.test(iso)) {
    throw ApiError.unprocessable(`Field "${field}" harus berformat YYYY-MM-DD.`);
  }
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
    throw ApiError.unprocessable(`Field "${field}" bukan tanggal yang valid.`);
  }
  return iso;
}

export function integer(value, field, { required = false, min = 0, max = 1_000_000 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw ApiError.unprocessable(`Field "${field}" wajib diisi.`);
    return undefined;
  }
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isInteger(parsed)) {
    throw ApiError.unprocessable(`Field "${field}" harus berupa bilangan bulat.`);
  }
  if (parsed < min || parsed > max) {
    throw ApiError.unprocessable(`Field "${field}" harus bernilai antara ${min} dan ${max}.`);
  }
  return parsed;
}

export function enumValue(value, field, allowed, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw ApiError.unprocessable(`Field "${field}" wajib diisi.`);
    return undefined;
  }
  if (typeof value !== 'string') throw ApiError.unprocessable(`Field "${field}" harus berupa teks.`);

  const candidate = value.trim().toLowerCase();
  const match = allowed.find((option) => option.toLowerCase() === candidate);
  if (!match) {
    throw ApiError.unprocessable(`Field "${field}" harus salah satu dari: ${allowed.join(', ')}.`, {
      allowed,
    });
  }
  return match;
}
