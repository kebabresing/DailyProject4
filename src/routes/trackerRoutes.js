'use strict';

const express  = require('express');
const router   = express.Router();
const tracker  = require('../controllers/trackerController');
const { requireLogin, requireAdmin } = require('../middleware/auth');

// ── Tracker Dashboard ────────────────────────────────────────
router.get('/tracker',        requireLogin,              tracker.getDashboard);
router.post('/tracker/start', requireLogin, requireAdmin, tracker.startTracker);
router.post('/tracker/stop',  requireLogin, requireAdmin, tracker.stopTracker);
router.get('/tracker/status', requireLogin,              tracker.getStatus);

// ── Staging Area (Verifikasi Manual 40–69%) ──────────────────
router.get('/staging',             requireLogin, requireAdmin, tracker.getStagingPage);
router.get('/staging/data',        requireLogin, requireAdmin, tracker.getStagingData);
router.post('/staging/:id/approve', requireLogin, requireAdmin, tracker.approveStaging);
router.post('/staging/:id/reject',  requireLogin, requireAdmin, tracker.rejectStaging);

module.exports = router;
