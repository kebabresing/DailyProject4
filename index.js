require('dotenv').config();
const express = require('express');
const path = require('path');
const logger = require('morgan');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const alumniRoutes = require('./src/routes/alumniRoutes');
const trackerRoutes = require('./src/routes/trackerRoutes');

const app = express();

// ── Security Headers (Helmet) ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",    // untuk script inline di EJS
        'cdn.tailwindcss.com',
        'cdn.jsdelivr.net',
        'fonts.googleapis.com',
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'fonts.googleapis.com',
        'cdn.tailwindcss.com',
      ],
      fontSrc: ["'self'", 'fonts.gstatic.com', 'fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'https://*.supabase.co'],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // agar Chart.js CDN tidak diblok
}));

// ── Gzip Compression ──────────────────────────────────────────────────────
app.use(compression());

// ── View Engine ───────────────────────────────────────────────────────────
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// ── Logging ───────────────────────────────────────────────────────────────
const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(logger(logFormat));

// ── Body Parsers ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
}));

// ── Session ───────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'umm-alumni-tracker-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8, // 8 jam
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only di production
    sameSite: 'lax',
  },
}));

// ── Rate Limit (Global — anti-flood) ─────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak request. Coba lagi dalam 15 menit.' },
});
app.use(globalLimiter);

// ── Rate Limit khusus Login (anti brute-force) ────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 menit
  max: 5,                  // max 5 percobaan login/menit
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.session.loginError = 'Terlalu banyak percobaan login. Tunggu 1 menit.';
    res.redirect('/login');
  },
});
app.use('/login', loginLimiter);

// ── Inject user ke semua view ─────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;   // untuk active nav indicator
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/', alumniRoutes);
app.use('/', trackerRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 — Halaman Tidak Ditemukan',
    code: 404,
    message: 'Halaman yang Anda cari tidak ditemukan.',
  });
});

// ── Global Error Handler (production-safe, no stack trace exposed) ────────
app.use((err, req, res, _next) => {
  console.error('[Global Error]', err.stack);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).render('error', {
    title: 'Terjadi Kesalahan',
    code: err.status || 500,
    message: isDev ? err.message : 'Terjadi kesalahan pada server. Silakan coba lagi.',
  });
});

// ── Start Server ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
