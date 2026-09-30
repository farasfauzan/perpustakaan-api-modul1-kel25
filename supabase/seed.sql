-- ============================================================================
--  perpustakaan-api — data contoh
--
--  Opsional, tapi berguna supaya endpoint langsung punya isi yang bisa diuji
--  (ketiga status peminjaman terwakili). Jalankan setelah supabase/schema.sql.
--  Idempoten: memakai UUID tetap + `on conflict do nothing`.
-- ============================================================================

insert into public.books (id, title, author, isbn, category, publisher, published_year, total_copies) values
  ('b0000001-0000-4000-8000-000000000001', 'Laskar Pelangi', 'Andrea Hirata', '9789793062792', 'Novel', 'Bentang Pustaka', 2005, 3),
  ('b0000001-0000-4000-8000-000000000002', 'Bumi Manusia', 'Pramoedya Ananta Toer', '9789799731234', 'Novel', 'Lentera Dipantara', 1980, 2),
  ('b0000001-0000-4000-8000-000000000003', 'Algoritma dan Pemrograman', 'Rinaldi Munir', '9786022214148', 'Teknologi', 'Informatika', 2016, 5),
  ('b0000001-0000-4000-8000-000000000004', 'Clean Code', 'Robert C. Martin', '9780132350884', 'Teknologi', 'Prentice Hall', 2008, 2),
  ('b0000001-0000-4000-8000-000000000005', 'Sapiens: Riwayat Singkat Umat Manusia', 'Yuval Noah Harari', '9786024242163', 'Sejarah', 'Kepustakaan Populer Gramedia', 2017, 4),
  ('b0000001-0000-4000-8000-000000000006', 'Sistem Basis Data', 'Fathansyah', '9786023756463', 'Teknologi', 'Informatika', 2018, 3)
on conflict (id) do nothing;

insert into public.members (id, member_code, full_name, email, phone, status, joined_at) values
  ('a0000001-0000-4000-8000-000000000001', 'AGT-0001', 'Faras Fauzan Attaqi', 'faras@students.undip.ac.id', '081200000001', 'Aktif', ((now() at time zone 'Asia/Jakarta')::date - 300)),
  ('a0000001-0000-4000-8000-000000000002', 'AGT-0002', 'Ade Raihan Hakim', 'ade@students.undip.ac.id', '081200000002', 'Aktif', ((now() at time zone 'Asia/Jakarta')::date - 240)),
  ('a0000001-0000-4000-8000-000000000003', 'AGT-0003', 'Nadia Puspita Sari', 'nadia@students.undip.ac.id', '081200000003', 'Aktif', ((now() at time zone 'Asia/Jakarta')::date - 180)),
  ('a0000001-0000-4000-8000-000000000004', 'AGT-0004', 'Bayu Setiawan', 'bayu@students.undip.ac.id', '081200000004', 'Nonaktif', ((now() at time zone 'Asia/Jakarta')::date - 400)),
  ('a0000001-0000-4000-8000-000000000005', 'AGT-0005', 'Rizky Ananda Putri', 'rizky@students.undip.ac.id', '081200000005', 'Aktif', ((now() at time zone 'Asia/Jakarta')::date - 90))
on conflict (id) do nothing;

-- Tiga status terwakili: Dikembalikan, Terlambat, dan Dipinjam.
insert into public.loans (id, loan_code, book_id, member_id, borrowed_at, due_at, returned_at, notes) values
  ('c0000001-0000-4000-8000-000000000001', 'PJM-CONTOH-0001', 'b0000001-0000-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000001',
   ((now() at time zone 'Asia/Jakarta')::date - 30), ((now() at time zone 'Asia/Jakarta')::date - 23), ((now() at time zone 'Asia/Jakarta')::date - 25),
   'Dikembalikan lebih awal, kondisi buku baik.'),

  ('c0000001-0000-4000-8000-000000000002', 'PJM-CONTOH-0002', 'b0000001-0000-4000-8000-000000000003', 'a0000001-0000-4000-8000-000000000002',
   ((now() at time zone 'Asia/Jakarta')::date - 21), ((now() at time zone 'Asia/Jakarta')::date - 14), ((now() at time zone 'Asia/Jakarta')::date - 15),
   null),

  ('c0000001-0000-4000-8000-000000000003', 'PJM-CONTOH-0003', 'b0000001-0000-4000-8000-000000000004', 'a0000001-0000-4000-8000-000000000003',
   ((now() at time zone 'Asia/Jakarta')::date - 15), ((now() at time zone 'Asia/Jakarta')::date - 8), null,
   'Belum dikembalikan sampai tenggat.'),

  ('c0000001-0000-4000-8000-000000000004', 'PJM-CONTOH-0004', 'b0000001-0000-4000-8000-000000000005', 'a0000001-0000-4000-8000-000000000002',
   ((now() at time zone 'Asia/Jakarta')::date - 10), ((now() at time zone 'Asia/Jakarta')::date - 3), null,
   null),

  ('c0000001-0000-4000-8000-000000000005', 'PJM-CONTOH-0005', 'b0000001-0000-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000005',
   ((now() at time zone 'Asia/Jakarta')::date - 2), ((now() at time zone 'Asia/Jakarta')::date + 5), null,
   'Masih dalam masa pinjam.'),

  ('c0000001-0000-4000-8000-000000000006', 'PJM-CONTOH-0006', 'b0000001-0000-4000-8000-000000000006', 'a0000001-0000-4000-8000-000000000001',
   ((now() at time zone 'Asia/Jakarta')::date - 1), ((now() at time zone 'Asia/Jakarta')::date + 6), null,
   null)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
