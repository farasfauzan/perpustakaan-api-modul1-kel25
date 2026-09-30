/** Pembuat kode unik yang mudah dibaca manusia. */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomToken(length) {
  let token = '';
  for (let index = 0; index < length; index += 1) {
    token += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return token;
}

/** Kode anggota, contoh: AGT-7K2QMP */
export function memberCode() {
  return `AGT-${randomToken(6)}`;
}

/** Kode peminjaman, contoh: PJM-20260930-4H7B */
export function loanCode(compactIsoDate) {
  return `PJM-${compactIsoDate}-${randomToken(4)}`;
}
