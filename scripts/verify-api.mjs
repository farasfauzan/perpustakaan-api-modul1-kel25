#!/usr/bin/env node
/**
 * Verifikasi endpoint perpustakaan-api secara nyata (bukan mock).
 * Skrip ini membuat datanya sendiri, memeriksa semua endpoint, lalu
 * membersihkan sisa datanya kembali.
 *
 *   node scripts/verify-api.mjs
 *   node scripts/verify-api.mjs https://perpustakaan-api.vercel.app
 *   API_BASE_URL=https://... npm run verify
 */
const BASE = (process.env.API_BASE_URL ?? process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '');

const jakartaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const state = { bookId: null, memberId: null, loanId: null, plainBookId: null, inactiveMemberId: null };
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function call(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }
  return { status: response.status, payload };
}

async function step(label, fn) {
  try {
    const detail = await fn();
    results.push({ label, verdict: 'PASS', detail: detail ?? '' });
  } catch (error) {
    results.push({ label, verdict: 'FAIL', detail: error.message });
  }
}

async function main() {
  console.log(`\nMemeriksa ${BASE}\n${'-'.repeat(72)}`);

  await step('GET / — info layanan', async () => {
    const { status, payload } = await call('GET', '/');
    assert(status === 200, `harap 200, dapat ${status}`);
    assert(payload?.service === 'perpustakaan-api', 'field service tidak sesuai');
    return `${payload.routes.length} route terdaftar`;
  });

  await step('GET /health — koneksi Supabase', async () => {
    const { status, payload } = await call('GET', '/health');
    assert(status === 200, `harap 200, dapat ${status} (${JSON.stringify(payload)})`);
    assert(payload?.database?.connected === true, 'database belum terhubung');
    return `terhubung dalam ${payload.database.latency_ms} ms`;
  });

  await step('POST /books — tambah buku', async () => {
    const { status, payload } = await call('POST', '/books', {
      title: 'Refactoring: Improving the Design of Existing Code',
      author: 'Martin Fowler',
      isbn: `9780134757599-${Date.now()}`,
      category: 'Teknologi',
      publisher: 'Addison-Wesley',
      published_year: 2018,
      total_copies: 2,
    });
    assert(status === 201, `harap 201, dapat ${status} (${JSON.stringify(payload)})`);
    assert(payload?.data?.id, 'respons tidak memuat id');
    assert(payload.data.available_copies === 2, 'available_copies awal harus sama dengan total_copies');
    state.bookId = payload.data.id;
    return `id=${payload.data.id} available=${payload.data.available_copies}`;
  });

  await step('GET /books?q= — pencarian (ilike)', async () => {
    const { status, payload } = await call('GET', '/books?q=refactoring&limit=5');
    assert(status === 200, `harap 200, dapat ${status}`);
    assert(Array.isArray(payload?.data), 'data bukan array');
    assert(payload.data.some((row) => row.id === state.bookId), 'buku hasil pencarian tidak ditemukan');
    return `${payload.data.length} hasil, meta.total=${payload.meta.total}`;
  });

  await step('GET /books/:id — detail', async () => {
    const { status, payload } = await call('GET', `/books/${state.bookId}`);
    assert(status === 200, `harap 200, dapat ${status}`);
    assert(payload.data.author === 'Martin Fowler', 'author tidak sesuai');
    return payload.data.title;
  });

  await step('PATCH /books/:id — ubah stok', async () => {
    const { status, payload } = await call('PATCH', `/books/${state.bookId}`, { total_copies: 3 });
    assert(status === 200, `harap 200, dapat ${status}`);
    assert(payload.data.available_copies === 3, 'available_copies tidak ikut berubah');
    return `available_copies=${payload.data.available_copies}`;
  });

  await step('POST /books — ISBN duplikat ditolak 409', async () => {
    const duplicate = {
      title: 'Buku Duplikat',
      author: 'Penulis',
      isbn: `9780134757599-${Date.now()}`,
    };
    const first = await call('POST', '/books', duplicate);
    assert(first.status === 201, `harap 201, dapat ${first.status}`);
    state.plainBookId = first.payload.data.id;

    const second = await call('POST', '/books', { ...duplicate, title: 'Buku Duplikat 2' });
    assert(second.status === 409, `harap 409, dapat ${second.status}`);
    return second.payload.error.code;
  });

  await step('POST /members — tambah anggota (kode otomatis)', async () => {
    const { status, payload } = await call('POST', '/members', {
      full_name: 'Anggota Contoh Verifikasi',
      email: `anggota.${Date.now()}@contoh.id`,
      phone: '081299998888',
    });
    assert(status === 201, `harap 201, dapat ${status} (${JSON.stringify(payload)})`);
    assert(/^AGT-/.test(payload.data.member_code), 'member_code otomatis tidak terbentuk');
    state.memberId = payload.data.id;
    return payload.data.member_code;
  });

  await step('GET /members?q= — pencarian anggota', async () => {
    const { status, payload } = await call('GET', '/members?q=anggota contoh&limit=10');
    assert(status === 200, `harap 200, dapat ${status}`);
    assert(payload.data.some((row) => row.id === state.memberId), 'anggota tidak ditemukan');
    return `${payload.data.length} hasil`;
  });

  await step('POST /loans — catat peminjaman', async () => {
    const { status, payload } = await call('POST', '/loans', {
      book_id: state.bookId,
      member_id: state.memberId,
      notes: 'Dibuat oleh skrip verifikasi.',
    });
    assert(status === 201, `harap 201, dapat ${status} (${JSON.stringify(payload)})`);
    assert(payload.data.status === 'Dipinjam', `status harap Dipinjam, dapat ${payload.data.status}`);
    assert(payload.data.book_title && payload.data.member_name, 'relasi buku/anggota tidak ter-join');
    state.loanId = payload.data.id;
    return `${payload.data.loan_code} jatuh tempo ${payload.data.due_at}`;
  });

  await step('Stok berkurang setelah peminjaman', async () => {
    const { payload } = await call('GET', `/books/${state.bookId}`);
    assert(payload.data.available_copies === 2, `harap 2, dapat ${payload.data.available_copies}`);
    return `available_copies=${payload.data.available_copies}`;
  });

  await step('Peminjaman ganda buku yang sama ditolak 409', async () => {
    const { status, payload } = await call('POST', '/loans', {
      book_id: state.bookId,
      member_id: state.memberId,
    });
    assert(status === 409, `harap 409, dapat ${status}`);
    return payload.error.code;
  });

  await step('Buku dengan stok 0 ditolak 409', async () => {
    const created = await call('POST', '/books', {
      title: 'Buku Tanpa Salinan',
      author: 'Penulis',
      isbn: `9780000000${Date.now()}`,
      total_copies: 0,
    });
    const { status, payload } = await call('POST', '/loans', {
      book_id: created.payload.data.id,
      member_id: state.memberId,
    });
    assert(status === 409, `harap 409, dapat ${status}`);
    await call('DELETE', `/books/${created.payload.data.id}`);
    return payload.error.message;
  });

  await step('Anggota nonaktif ditolak 409', async () => {
    const member = await call('POST', '/members', {
      full_name: 'Anggota Nonaktif Verifikasi',
      status: 'Nonaktif',
    });
    state.inactiveMemberId = member.payload.data.id;
    const { status, payload } = await call('POST', '/loans', {
      book_id: state.bookId,
      member_id: state.inactiveMemberId,
    });
    assert(status === 409, `harap 409, dapat ${status}`);
    return payload.error.code;
  });

  await step('GET /loans?status=Dipinjam — filter status', async () => {
    const { status, payload } = await call('GET', '/loans?status=Dipinjam&limit=50');
    assert(status === 200, `harap 200, dapat ${status}`);
    assert(payload.data.some((row) => row.id === state.loanId), 'peminjaman baru tidak muncul');
    assert(payload.meta.total >= 1, 'meta.total tidak terisi');
    return `${payload.data.length} baris, meta.total=${payload.meta.total}`;
  });

  await step('GET /loans?status=Terlambat — filter contoh soal', async () => {
    const { status, payload } = await call('GET', '/loans?status=Terlambat&limit=50');
    assert(status === 200, `harap 200, dapat ${status}`);
    assert(Array.isArray(payload.data), 'data bukan array');
    for (const row of payload.data) {
      assert(row.returned_at === null, 'baris Terlambat tidak boleh sudah dikembalikan');
      assert(row.days_late > 0, 'days_late harus lebih dari 0');
    }
    return `${payload.data.length} peminjaman terlambat`;
  });

  await step('GET /loans?status=dipinjam — filter tidak peka huruf besar/kecil', async () => {
    const { status, payload } = await call('GET', '/loans?status=dipinjam&limit=5');
    assert(status === 200, `harap 200, dapat ${status}`);
    return `${payload.data.length} baris`;
  });

  await step('GET /loans?member_id=&borrowed_from= — filter gabungan', async () => {
    const { status, payload } = await call(
      'GET',
      `/loans?member_id=${state.memberId}&borrowed_from=2020-01-01&sort=-borrowed_at`,
    );
    assert(status === 200, `harap 200, dapat ${status}`);
    assert(payload.data.length === 1, `harap 1 baris, dapat ${payload.data.length}`);
    return `loan_code=${payload.data[0].loan_code}`;
  });

  await step('GET /loans/:id — detail', async () => {
    const { status, payload } = await call('GET', `/loans/${state.loanId}`);
    assert(status === 200, `harap 200, dapat ${status}`);
    assert(payload.data.status === 'Dipinjam', 'status tidak sesuai');
    return payload.data.loan_code;
  });

  await step('PATCH /loans/:id — tandai dikembalikan', async () => {
    const { status, payload } = await call('PATCH', `/loans/${state.loanId}`, {
      returned_at: jakartaDate.format(new Date()),
    });
    assert(status === 200, `harap 200, dapat ${status} (${JSON.stringify(payload)})`);
    assert(payload.data.status === 'Dikembalikan', `status harap Dikembalikan, dapat ${payload.data.status}`);
    assert(payload.data.days_late === 0, 'days_late harus 0 setelah dikembalikan');
    return `status=${payload.data.status}`;
  });

  await step('GET /loans?status=Dikembalikan — hasil pengembalian muncul', async () => {
    const { status, payload } = await call('GET', '/loans?status=Dikembalikan&limit=50');
    assert(status === 200, `harap 200, dapat ${status}`);
    assert(payload.data.some((row) => row.id === state.loanId), 'peminjaman yang dikembalikan tidak muncul');
    return `${payload.data.length} baris`;
  });

  await step('PATCH /loans/:id — returned_at tidak boleh sebelum borrowed_at', async () => {
    const { status, payload } = await call('PATCH', `/loans/${state.loanId}`, { returned_at: '2000-01-01' });
    assert(status === 422, `harap 422, dapat ${status}`);
    return payload.error.code;
  });

  await step('DELETE /loans/:id — hapus catatan', async () => {
    const { status } = await call('DELETE', `/loans/${state.loanId}`);
    assert(status === 204, `harap 204, dapat ${status}`);
    const after = await call('GET', `/loans/${state.loanId}`);
    assert(after.status === 404, `setelah hapus harap 404, dapat ${after.status}`);
    return '204 lalu 404';
  });

  await step('DELETE /members/:id — hapus anggota', async () => {
    const { status } = await call('DELETE', `/members/${state.memberId}`);
    assert(status === 204, `harap 204, dapat ${status}`);
    return '204';
  });

  await step('DELETE /books/:id — hapus buku', async () => {
    const first = await call('DELETE', `/books/${state.bookId}`);
    const second = await call('DELETE', `/books/${state.plainBookId}`);
    const third = await call('DELETE', `/members/${state.inactiveMemberId}`);
    assert(first.status === 204 && second.status === 204 && third.status === 204, 'ada yang bukan 204');
    return 'semua sisa data verifikasi terhapus';
  });

  await step('POST /members — status tidak valid ditolak 422', async () => {
    const { status, payload } = await call('POST', '/members', {
      full_name: 'Nama',
      status: 'Kadaluarsa',
    });
    assert(status === 422, `harap 422, dapat ${status}`);
    return payload.error.code;
  });

  await step('POST /members — field asing ditolak 400', async () => {
    const { status, payload } = await call('POST', '/members', {
      full_name: 'Nama',
      alamat_rumah: 'Jl. Contoh',
    });
    assert(status === 400, `harap 400, dapat ${status}`);
    return payload.error.code;
  });

  await step('GET /loans?status=Salah — nilai filter tidak dikenal ditolak 400', async () => {
    const { status, payload } = await call('GET', '/loans?status=Salah');
    assert(status === 400, `harap 400, dapat ${status}`);
    return payload.error.code;
  });

  await step('GET /tidak-ada — route tak dikenal 404', async () => {
    const { status, payload } = await call('GET', '/tidak-ada');
    assert(status === 404, `harap 404, dapat ${status}`);
    return payload.error.code;
  });

  await step('GET /api/loans — alias prefix /api', async () => {
    const { status, payload } = await call('GET', '/api/loans?limit=2');
    assert(status === 200, `harap 200, dapat ${status}`);
    assert(payload.meta.limit === 2, 'meta.limit tidak sesuai');
    return `${payload.data.length} baris`;
  });

  await step('Content-Type salah tetap aman', async () => {
    const response = await fetch(`${BASE}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"full_name": ',
    });
    assert(response.status === 400, `harap 400, dapat ${response.status}`);
    return '400 INVALID_JSON';
  });

  const width = Math.max(...results.map((row) => row.label.length));
  console.log('');
  for (const row of results) {
    const tag = row.verdict === 'PASS' ? '\u001b[32mPASS\u001b[0m' : '\u001b[31mFAIL\u001b[0m';
    console.log(`${tag}  ${row.label.padEnd(width)}  ${row.detail}`);
  }

  const failed = results.filter((row) => row.verdict === 'FAIL');
  console.log(`${'-'.repeat(72)}`);
  console.log(`${results.length - failed.length}/${results.length} pemeriksaan lulus di ${BASE}\n`);

  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nGagal menjalankan verifikasi: ${error.message}`);
  console.error(`Pastikan API hidup di ${BASE}.\n`);
  process.exitCode = 1;
});
