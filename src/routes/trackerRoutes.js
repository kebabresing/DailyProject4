const express = require('express');
const router = express.Router();
const tracker = require('../controllers/trackerController');
const { requireLogin, requireAdmin } = require('../middleware/auth');

// Dashboard — all logged-in users can view
router.get('/tracker', requireLogin, tracker.getDashboard);

// Manual scan — admin only
router.post('/tracker/run', requireLogin, requireAdmin, tracker.triggerScan);

// Scheduler control — admin only
router.post('/tracker/scheduler/start', requireLogin, requireAdmin, tracker.startScheduler);
router.post('/tracker/scheduler/stop',  requireLogin, requireAdmin, tracker.stopScheduler);

// Results & detail — all logged-in users
router.get('/tracker/results/:alumniId', requireLogin, tracker.getAlumniResults);

// Approve / Reject — admin only
router.post('/tracker/approve/:id', requireLogin, requireAdmin, tracker.approveResult);
router.post('/tracker/reject/:id',  requireLogin, requireAdmin, tracker.rejectResult);

// Audit trail — all logged-in users
router.get('/tracker/audit', requireLogin, tracker.getAudit);

// Job queries — all logged-in users
router.get('/tracker/queries/:jobId', requireLogin, tracker.getJobQueries);

module.exports = router;
