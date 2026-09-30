-- ============================================================================
--  perpustakaan-api — skema database Supabase
--
--  Cara pakai:
--    Supabase Dashboard → SQL Editor → New query → tempel isi file ini → Run.
--    File ini idempoten, jadi aman dijalankan ulang.
--
--  Catatan zona waktu:
--    Semua kolom bertipe `date` dan dihitung dengan (now() at time zone
--    'Asia/Jakarta')::date, sehingga "hari ini" mengikuti WIB (UTC+7), bukan UTC.
--    Status Terlambat dihitung di view v_loans, bukan disimpan di kolom, supaya
--    tidak pernah basi.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
--  Tabel
-- ----------------------------------------------------------------------------

create table if not exists public.books (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  author         text not null,
  isbn           text unique,
  category       text,
  publisher      text,
  published_year integer check (published_year between 1500 and 2100),
  total_copies   integer not null default 1 check (total_copies >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  search_text    text generated always as (
                   lower(
                     title || ' ' || author || ' ' ||
                     coalesce(isbn, '') || ' ' || coalesce(category, '') || ' ' ||
                     coalesce(publisher, '')
                   )
                 ) stored
);

create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  member_code text not null unique,
  full_name   text not null,
  email       text unique,
  phone       text,
  status      text not null default 'Aktif' check (status in ('Aktif', 'Nonaktif')),
  joined_at   date not null default ((now() at time zone 'Asia/Jakarta')::date),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  search_text text generated always as (
                lower(
                  member_code || ' ' || full_name || ' ' ||
                  coalesce(email, '') || ' ' || coalesce(phone, '')
                )
              ) stored
);

create table if not exists public.loans (
  id          uuid primary key default gen_random_uuid(),
  loan_code   text not null unique,
  book_id     uuid not null references public.books (id) on delete restrict,
  member_id   uuid not null references public.members (id) on delete restrict,
  borrowed_at date not null default ((now() at time zone 'Asia/Jakarta')::date),
  due_at      date not null,
  returned_at date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint loans_due_after_borrowed check (due_at >= borrowed_at),
  constraint loans_returned_after_borrowed check (returned_at is null or returned_at >= borrowed_at)
);

-- Menambahkan kolom pencarian kalau tabelnya sudah terlanjur dibuat lebih dulu.
alter table public.books
  add column if not exists search_text text generated always as (
    lower(
      title || ' ' || author || ' ' ||
      coalesce(isbn, '') || ' ' || coalesce(category, '') || ' ' || coalesce(publisher, '')
    )
  ) stored;

alter table public.members
  add column if not exists search_text text generated always as (
    lower(
      member_code || ' ' || full_name || ' ' ||
      coalesce(email, '') || ' ' || coalesce(phone, '')
    )
  ) stored;

-- ----------------------------------------------------------------------------
--  Index
-- ----------------------------------------------------------------------------

create index if not exists books_created_at_idx on public.books (created_at desc);
create index if not exists books_search_trgm_idx on public.books using gin (search_text gin_trgm_ops);
create index if not exists members_created_at_idx on public.members (created_at desc);
create index if not exists members_search_trgm_idx on public.members using gin (search_text gin_trgm_ops);
create index if not exists loans_book_id_idx on public.loans (book_id);
create index if not exists loans_member_id_idx on public.loans (member_id);
create index if not exists loans_due_at_idx on public.loans (due_at);
create index if not exists loans_active_idx on public.loans (due_at) where returned_at is null;

-- ----------------------------------------------------------------------------
--  updated_at otomatis
-- ----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists books_touch_updated_at on public.books;
create trigger books_touch_updated_at
  before update on public.books
  for each row execute function public.touch_updated_at();

drop trigger if exists members_touch_updated_at on public.members;
create trigger members_touch_updated_at
  before update on public.members
  for each row execute function public.touch_updated_at();

drop trigger if exists loans_touch_updated_at on public.loans;
create trigger loans_touch_updated_at
  before update on public.loans
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
--  View baca
--
--  v_books  : menambahkan available_copies / borrowed_copies dari hitungan
--             peminjaman yang belum dikembalikan (tidak disimpan, jadi tidak
--             pernah salah hitung).
--  v_loans  : gabungan peminjaman + buku + anggota, lengkap dengan kolom
--             `status` (Dipinjam | Terlambat | Dikembalikan) dan `days_late`.
--             Kolom inilah yang dipakai endpoint GET /loans?status=Terlambat.
-- ----------------------------------------------------------------------------

create or replace view public.v_books
with (security_invoker = true)
as
select
  b.id,
  b.title,
  b.author,
  b.isbn,
  b.category,
  b.publisher,
  b.published_year,
  b.total_copies,
  b.total_copies - coalesce(active.total, 0) as available_copies,
  coalesce(active.total, 0)                    as borrowed_copies,
  b.search_text,
  b.created_at,
  b.updated_at
from public.books b
left join (
  select book_id, count(*)::int as total
  from public.loans
  where returned_at is null
  group by book_id
) active on active.book_id = b.id;

create or replace view public.v_loans
with (security_invoker = true)
as
select
  l.id,
  l.loan_code,
  l.book_id,
  l.member_id,
  l.borrowed_at,
  l.due_at,
  l.returned_at,
  l.notes,
  case
    when l.returned_at is not null then 'Dikembalikan'
    when l.due_at < (now() at time zone 'Asia/Jakarta')::date then 'Terlambat'
    else 'Dipinjam'
  end as status,
  greatest((now() at time zone 'Asia/Jakarta')::date - l.due_at, 0) as days_late,
  b.title  as book_title,
  b.author as book_author,
  b.isbn   as book_isbn,
  m.member_code,
  m.full_name as member_name,
  m.email     as member_email,
  lower(
    l.loan_code || ' ' || b.title || ' ' || b.author || ' ' ||
    m.member_code || ' ' || m.full_name
  ) as search_text,
  l.created_at,
  l.updated_at
from public.loans l
join public.books b   on b.id = l.book_id
join public.members m on m.id = l.member_id;

-- ----------------------------------------------------------------------------
--  Hak akses
--
--  API ini mengakses database lewat service role key dari sisi server.
--  Kolom tabel mentah dicabut dari anon/authenticated supaya kunci publik
--  (kalau nanti dipakai di frontend) tidak bisa menulis data langsung.
--  RLS diaktifkan sebagai lapisan kedua; service role otomatis melewatinya.
-- ----------------------------------------------------------------------------

alter table public.books   enable row level security;
alter table public.members enable row level security;
alter table public.loans   enable row level security;

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on public.books      to service_role;
grant select, insert, update, delete on public.members    to service_role;
grant select, insert, update, delete on public.loans      to service_role;
grant select on public.v_books to service_role;
grant select on public.v_loans to service_role;

revoke all on public.books   from anon, authenticated;
revoke all on public.members from anon, authenticated;
revoke all on public.loans   from anon, authenticated;
revoke all on public.v_books from anon, authenticated;
revoke all on public.v_loans from anon, authenticated;

-- Supaya PostgREST langsung mengenali tabel dan view yang baru dibuat.
notify pgrst, 'reload schema';
