const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const alumniController = require('../controllers/alumniController');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const { getLogin, postLogin, logout } = require('../controllers/authController');

// Multer: memory storage untuk file upload (tidak simpan ke disk)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Auth (public) ──────────────────────────────────────────────────────────
router.get('/login',  getLogin);
router.post('/login', postLogin);
router.post('/logout', logout);

// ── Dashboard & Laporan (login required) ──────────────────────────────────
router.get('/', requireLogin, alumniController.getLaporan);

// ── Data Master ────────────────────────────────────────────────────────────
router.get('/data',       requireLogin,              alumniController.index);
router.get('/add',        requireLogin, requireAdmin, alumniController.formAdd);
router.post('/add',       requireLogin, requireAdmin, alumniController.add);
router.get('/edit/:id',   requireLogin, requireAdmin, alumniController.formEdit);
router.post('/edit/:id',  requireLogin, requireAdmin, alumniController.edit);
router.get('/delete/:id', requireLogin, requireAdmin, alumniController.delete);

// ── Export ────────────────────────────────────────────────────────────────
router.get('/export', requireLogin, alumniController.exportExcel);

// ── Pipeline ──────────────────────────────────────────────────────────────
router.get('/pipeline',             requireLogin, requireAdmin, alumniController.getPipeline);
router.get('/pipeline/resolve/:id', requireLogin, requireAdmin, alumniController.resolvePipeline);

// ── CSV/Excel Import ──────────────────────────────────────────────────────
router.get('/import',          requireLogin, requireAdmin, alumniController.getImport);
router.post('/import/preview', requireLogin, requireAdmin, upload.single('file'), alumniController.previewImport);
router.post('/import/confirm', requireLogin, requireAdmin, alumniController.confirmImport);

module.exports = router;
