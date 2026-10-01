/**
 * Helper query string: pagination, sorting, dan pencarian.
 * Semua parameter divalidasi di sini supaya route tetap ringkas.
 */
import { ApiError } from './errors.js';

/** Ambil satu nilai string dari query, tolak kalau dikirim berulang. */
export function single(value, field) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    throw ApiError.badRequest(`Parameter "${field}" hanya boleh dikirim sekali.`);
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest(`Parameter "${field}" tidak boleh kosong.`);
  }
  return value.trim();
}

function positiveInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw ApiError.badRequest(`Parameter "${field}" harus bilangan bulat >= 1.`);
  }
  return parsed;
}

/** return { page, limit, from, to } untuk dipakai `.range(from, to)` PostgREST. */
export function parsePagination(query, maxPageSize, defaultLimit = 20) {
  const page = positiveInteger(single(query.page, 'page') ?? 1, 'page');
  const requested = positiveInteger(single(query.limit, 'limit') ?? defaultLimit, 'limit');
  const limit = Math.min(requested, maxPageSize);
  const from = (page - 1) * limit;
  return { page, limit, from, to: from + limit - 1 };
}

/** sort=-created_at berarti descending. */
export function parseSort(query, allowed, fallback) {
  const raw = single(query.sort, 'sort') ?? fallback;
  const descending = raw.startsWith('-');
  const column = descending ? raw.slice(1) : raw;
  if (!allowed.includes(column)) {
    throw ApiError.badRequest(
      `Kolom sort "${column}" tidak dikenal. Pilihan: ${allowed.join(', ')}.`,
      { allowed },
    );
  }
  return { column, ascending: !descending };
}

export function queryText(query, field, max = 200) {
  const raw = single(query[field], field);
  if (raw === undefined) return undefined;
  if (raw.length > max) {
    throw ApiError.badRequest(`Parameter "${field}" maksimal ${max} karakter.`);
  }
  return raw;
}

export function queryDate(query, field) {
  const raw = single(query[field], field);
  if (raw === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw ApiError.badRequest(`Parameter "${field}" harus berformat YYYY-MM-DD.`);
  }
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw ApiError.badRequest(`Parameter "${field}" bukan tanggal yang valid.`);
  }
  return raw;
}

export function queryUuid(query, field) {
  const raw = single(query[field], field);
  if (raw === undefined) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    throw ApiError.badRequest(`Parameter "${field}" harus berupa UUID yang valid.`);
  }
  return raw.toLowerCase();
}

export function queryBoolean(query, field) {
  const raw = single(query[field], field)?.toLowerCase();
  if (raw === undefined) return undefined;
  if (['true', '1', 'ya', 'yes'].includes(raw)) return true;
  if (['false', '0', 'tidak', 'no'].includes(raw)) return false;
  throw ApiError.badRequest(`Parameter "${field}" harus bernilai true atau false.`);
}

/**
 * Validasi nilai enum pada query string.
 * Berbeda dengan `enumValue` di validate.js yang khusus request body (422),
 * parameter query yang salah adalah permintaan yang cacat sehingga dibalas 400
 * — sama seperti validator query lain di file ini.
 */
export function queryEnum(query, field, allowed) {
  const raw = single(query[field], field);
  if (raw === undefined) return undefined;

  const match = allowed.find((option) => option.toLowerCase() === raw.toLowerCase());
  if (!match) {
    throw ApiError.badRequest(`Parameter "${field}" harus salah satu dari: ${allowed.join(', ')}.`, {
      allowed,
    });
  }
  return match;
}

/**
 * Pola untuk kolom pencarian `search_text` di view v_books / v_loans.
 * PostgREST memakai tanda `*` sebagai pengganti `%` pada operator ilike.
 */
export function searchPattern(raw) {
  const cleaned = raw.replace(/[*%]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2) {
    throw ApiError.badRequest('Parameter "q" minimal 2 karakter yang bisa dicari.');
  }
  return `*${cleaned}*`;
}
