const { findUser, verifyPassword } = require('../config/auth');

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

module.exports = { getLogin, postLogin, logout };
