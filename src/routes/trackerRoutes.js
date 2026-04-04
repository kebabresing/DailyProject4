/**
 * Tracker Routes — Definisi rute modul Intelligent Tracking
 */
const express = require('express');
const router = express.Router();
const tracker = require('../controllers/trackerController');
const { requireLogin } = require('../middleware/auth');

// Dashboard
router.get('/tracker', requireLogin, tracker.getDashboard);

// Manual scan
router.post('/tracker/run', requireLogin, tracker.triggerScan);

// Scheduler control
router.post('/tracker/scheduler/start', requireLogin, tracker.startScheduler);
router.post('/tracker/scheduler/stop', requireLogin, tracker.stopScheduler);

// Results & detail
router.get('/tracker/results/:alumniId', requireLogin, tracker.getAlumniResults);

// Approve / Reject
router.post('/tracker/approve/:id', requireLogin, tracker.approveResult);
router.post('/tracker/reject/:id', requireLogin, tracker.rejectResult);

// Audit trail
router.get('/tracker/audit', requireLogin, tracker.getAudit);

// Job queries
router.get('/tracker/queries/:jobId', requireLogin, tracker.getJobQueries);

module.exports = router;
