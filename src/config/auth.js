const bcrypt = require('bcryptjs');

// ─────────────────────────────────────────────────────────────
//  USERS — Tambah akun baru di sini.
//  Generate hash baru:
//    node -e "console.log(require('bcryptjs').hashSync('PASSWORD', 10))"
//
//  role: 'admin'  → akses penuh (CRUD, export, import, delete)
//  role: 'viewer' → hanya lihat & search; data sensitif dimasking
// ─────────────────────────────────────────────────────────────
const USERS = [
  {
    id: 1,
    username: 'admin',
    passwordHash: '$2b$10$1CWNmC4Ryp4640fpCg137epPuziFosqXLp0SjoM2eZw5SzU99xwpa', // "admin123"
    role: 'admin',
    namaLengkap: 'Administrator',
  },
  {
    id: 2,
    username: 'viewer',
    passwordHash: '$2b$10$W5ZvSfUqrAj44R8QmSmRO.dIQD/KQ7KOwXLX2xSAlfH/jNHCfpPKu', // "viewer123"
    role: 'viewer',
    namaLengkap: 'Viewer Umum',
  },
];

function findUser(username) {
  return USERS.find(u => u.username === username) || null;
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

module.exports = { findUser, verifyPassword };
