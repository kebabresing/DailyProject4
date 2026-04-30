/**
 * Auth Middleware
 * requireLogin  — redirect ke /login jika belum login
 * requireAdmin  — redirect ke /data jika bukan admin (role-based access control)
 */

function requireLogin(req, res, next) {
  if (!req.session?.user) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.session?.user?.role !== 'admin') {
    return res.redirect('/data?alert=forbidden');
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
