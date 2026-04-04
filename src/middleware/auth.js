/**
 * Middleware: Autentikasi & Otorisasi
 * Bertugas memproteksi route yang memerlukan login.
 */

/**
 * requireLogin - Pastikan user sudah login sebelum mengakses route.
 * Jika belum login, redirect ke halaman /login.
 */
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

module.exports = { requireLogin };
