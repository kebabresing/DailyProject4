const bcrypt = require('bcryptjs');

// Akun default admin (username & password bisa diganti di sini)
// Untuk generate hash baru: node -e "console.log(require('bcryptjs').hashSync('PASSWORD_BARU', 10))"
const USERS = [
  {
    id: 1,
    username: 'admin',
    passwordHash: '$2b$10$1CWNmC4Ryp4640fpCg137epPuziFosqXLp0SjoM2eZw5SzU99xwpa',
    role: 'admin',
    namaLengkap: 'Administrator'
  }
];

function findUser(username) {
  return USERS.find(u => u.username === username) || null;
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

module.exports = { findUser, verifyPassword };
