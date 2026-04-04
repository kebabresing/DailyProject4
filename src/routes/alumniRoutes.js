const express = require('express');
const router = express.Router();
const alumniController = require('../controllers/alumniController');
const { requireLogin, getLogin, postLogin, logout } = require('../controllers/authController');

// Auth routes (no login required)
router.get('/login', getLogin);
router.post('/login', postLogin);
router.post('/logout', logout);

// Protected routes (login required)
router.get('/', requireLogin, alumniController.getLaporan);
router.get('/data', requireLogin, alumniController.index);
router.get('/add', requireLogin, alumniController.formAdd);
router.post('/add', requireLogin, alumniController.add);
router.get('/edit/:id', requireLogin, alumniController.formEdit);
router.post('/edit/:id', requireLogin, alumniController.edit);
router.get('/delete/:id', requireLogin, alumniController.delete);
router.get('/export', requireLogin, alumniController.exportExcel);
router.get('/pipeline', requireLogin, alumniController.getPipeline);
router.get('/pipeline/resolve/:id', requireLogin, alumniController.resolvePipeline);

module.exports = router;
