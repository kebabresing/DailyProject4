require('dotenv').config();
const express = require('express');
const path = require('path');
const logger = require('morgan');
const session = require('express-session');
const alumniRoutes = require('./src/routes/alumniRoutes');
const trackerRoutes = require('./src/routes/trackerRoutes');

const app = express();

// Set View Engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middlewares
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'umm-alumni-tracker-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8, // 8 jam
    httpOnly: true
  }
}));

// Inject user ke semua view (agar bisa dipakai di EJS)
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
app.use('/', alumniRoutes);
app.use('/', trackerRoutes);

// Export app for Vercel, or listen locally
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
