import 'dotenv/config';

const raw = process.env;

export const config = {
  port: Number(raw.PORT ?? 3000),
  supabaseUrl: (raw.SUPABASE_URL ?? '').trim(),
  supabaseServiceKey: (raw.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
  defaultLoanDays: Number(raw.DEFAULT_LOAN_DAYS ?? 7),
  maxPageSize: Number(raw.MAX_PAGE_SIZE ?? 100),
};

/**
 * Env var Supabase yang belum terisi. Dipakai supaya API bisa membalas pesan
 * yang jelas (bukan 500 buta) ketika kredensial belum dipasang.
 */
export const missingSupabaseEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(
  (key) => !(raw[key] ?? '').trim(),
);

export const supabaseConfigured = missingSupabaseEnv.length === 0;
