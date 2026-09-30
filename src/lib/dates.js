/**
 * Semua tanggal yang dipakai API mengikuti zona waktu Asia/Jakarta (WIB),
 * sama seperti ekspresi `(now() at time zone 'Asia/Jakarta')::date` di
 * supabase/schema.sql. Jadi perhitungan status "Terlambat" di database dan
 * di API tidak pernah berbeda hari.
 */
const JAKARTA_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Tanggal hari ini di WIB, format YYYY-MM-DD. */
export function today() {
  return JAKARTA_DATE.format(new Date());
}

/** Tambah/kurangi hari dari sebuah tanggal YYYY-MM-DD. */
export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "20260930" — dipakai untuk membentuk kode yang mudah dibaca. */
export function compactDate(isoDate) {
  return isoDate.replaceAll('-', '');
}
