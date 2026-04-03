const { findUser, verifyPassword } = require('../config/auth');

// Middleware: cek apakah sudah login
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

// GET /login
function getLogin(req, res) {
  if (req.session && req.session.user) return res.redirect('/');
  const error = req.session.loginError || null;
  req.session.loginError = null;
  res.render('login', { error });
}

// POST /login
function postLogin(req, res) {
  const { username, password } = req.body;
  const user = findUser(username);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    req.session.loginError = 'Username atau password salah.';
    return res.redirect('/login');
  }

  req.session.user = { id: user.id, username: user.username, namaLengkap: user.namaLengkap, role: user.role };
  return res.redirect('/');
}

// POST /logout
function logout(req, res) {
  req.session.destroy(() => {
    res.redirect('/login');
  });
}

module.exports = { requireLogin, getLogin, postLogin, logout };
