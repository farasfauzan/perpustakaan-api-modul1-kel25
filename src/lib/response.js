/**
 * Bentuk respons API.
 *
 *   satu baris   : { "data": { ... } }
 *   daftar       : { "data": [ ... ], "meta": { page, limit, total, total_pages } }
 *   error        : { "error": { code, message, details? } }
 */

export function ok(res, data, meta) {
  return res.json(meta ? { data, meta } : { data });
}

export function created(res, data) {
  return res.status(201).json({ data });
}

export function noContent(res) {
  return res.status(204).end();
}

export function buildMeta(page, limit, total) {
  return {
    page,
    limit,
    total,
    total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}
