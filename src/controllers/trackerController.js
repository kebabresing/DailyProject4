'use strict';

/**
 * trackerController.js — Handler Modul Intelligent Tracker (v2)
 *
 * Routes:
 *   GET  /tracker              → Dashboard tracker + status worker
 *   POST /tracker/start        → Mulai batch massal (max 1000)
 *   POST /tracker/stop         → Hentikan/kosongkan queue
 *   GET  /tracker/status       → JSON status (untuk polling JS)
 *   GET  /staging              → Halaman verifikasi data 40–69%
 *   GET  /staging/data         → JSON list staging (untuk AJAX)
 *   POST /staging/:id/approve  → Approve satu staging result (AJAX)
 *   POST /staging/:id/reject   → Reject satu staging result (AJAX)
 */

const scheduler  = require('../services/trackerScheduler');
const trackingDB = require('../config/trackingDB');
const Alumni     = require('../models/alumniModel');

// ─────────────────────────────────────────────────────────────
// GET /tracker — Dashboard
// ─────────────────────────────────────────────────────────────

exports.getDashboard = async (req, res, next) => {
  try {
    const [stats, trackingStats, workerStatus] = await Promise.all([
      Alumni.getStats(),
      trackingDB.getTrackingStats().catch(() => ({})),
      Promise.resolve(scheduler.getStatus()),
    ]);

    res.render('tracker', {
      title:         'Intelligent Tracker — Pelacakan Alumni',
      stats,
      trackingStats,
      workerStatus,
      isAdmin:       req.session?.user?.role === 'admin',
      alertParam:    req.query.alert || null,
      osintMode:     process.env.OSINT_MODE || 'simulation',
    });
  } catch (err) {
    console.error('[TrackerCtrl] Dashboard error:', err.message);
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// POST /tracker/start — Mulai batch massal
// ─────────────────────────────────────────────────────────────

exports.startTracker = async (req, res) => {
  try {
    const batchSize = Math.min(parseInt(req.body.batchSize) || 1000, 1000);
    const result    = await scheduler.runManualTracking(batchSize);

    if (result.error) {
      console.warn('[TrackerCtrl] Start blocked:', result.error);
      return res.redirect('/tracker?alert=already-running');
    }

    console.log(`[TrackerCtrl] Tracker dimulai: ${result.totalQueued} alumni di-enqueue`);
    res.redirect(`/tracker?alert=started&total=${result.totalQueued}`);
  } catch (err) {
    console.error('[TrackerCtrl] Start error:', err.message);
    res.redirect('/tracker?alert=error');
  }
};

// ─────────────────────────────────────────────────────────────
// POST /tracker/stop — Hentikan queue
// ─────────────────────────────────────────────────────────────

exports.stopTracker = (req, res) => {
  try {
    scheduler.pauseQueue();
  } catch (err) {
    console.error('[TrackerCtrl] Stop error:', err.message);
  }
  res.redirect('/tracker?alert=stopped');
};

// ─────────────────────────────────────────────────────────────
// GET /tracker/status — JSON polling
// ─────────────────────────────────────────────────────────────

exports.getStatus = (req, res) => {
  try {
    const status = scheduler.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /staging — Halaman verifikasi (data skor 40–69%)
// ─────────────────────────────────────────────────────────────

exports.getStagingPage = async (req, res, next) => {
  res.redirect('/pipeline');
};

// ─────────────────────────────────────────────────────────────
// GET /staging/data — JSON list staging (AJAX)
// ─────────────────────────────────────────────────────────────

exports.getStagingData = async (req, res) => {
  try {
    const limit   = Math.min(parseInt(req.query.limit) || 50, 200);
    const results = await trackingDB.getPendingResults(limit);
    res.json({ success: true, data: results, total: results.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /staging/:id/approve — Approve via AJAX (Bagian 3: auto-update Supabase)
// ─────────────────────────────────────────────────────────────

exports.approveStaging = async (req, res) => {
  const { id } = req.params;
  const note    = req.body.note || 'Disetujui oleh admin';

  try {
    // 1. Ambil data staging dari trackingDB
    const stagingResult = await trackingDB.getResultById(id);
    if (!stagingResult) {
      return res.status(404).json({ success: false, error: 'Staging result tidak ditemukan.' });
    }

    // 2. Resolve di staging tabel
    await trackingDB.resolveResult(id, 'approved', note);

    // 3. Update tabel alumni di Supabase (8 titik data, hanya yang kosong)
    const alumni = await Alumni.getById(stagingResult.alumni_id);
    if (alumni) {
      const EMPTY = (v) => !v || String(v).trim() === '' || v === '-';
      const updatePayload = {};

      const fieldMap = [
        ['posisi',            stagingResult.extracted_title,    'posisi'],
        ['tempatKerja',       stagingResult.extracted_company,  'tempatKerja'],
        ['alamatKerja',       stagingResult.extracted_location, 'alamatKerja'],
      ];
      fieldMap.forEach(([appField, newVal, updateKey]) => {
        if (newVal && EMPTY(alumni[appField])) updatePayload[updateKey] = newVal;
      });

      updatePayload.status          = 'Teridentifikasi dari Sumber Publik';
      updatePayload.confidenceScore = stagingResult.confidence_score;

      const ts      = new Date().toISOString().split('T')[0];
      const snippet = `[APPROVED ${ts}] Admin: ${req.session?.user?.username || 'admin'} — Score: ${stagingResult.confidence_score}%`;
      updatePayload.jejak = alumni.jejak ? `${alumni.jejak} | ${snippet}` : snippet;

      // Merge dengan data alumni lama (Alumni.update butuh semua field)
      await Alumni.update(alumni.id, { ...alumni, ...updatePayload });
    }

    res.json({
      success:  true,
      message:  'Data berhasil diapprove dan diperbarui ke Supabase.',
      id:       parseInt(id),
      action:   'approved',
    });
  } catch (err) {
    console.error(`[StagingCtrl] Approve error (id ${id}):`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /staging/:id/reject — Reject via AJAX
// ─────────────────────────────────────────────────────────────

exports.rejectStaging = async (req, res) => {
  const { id } = req.params;
  const note    = req.body.note || 'Ditolak oleh admin';

  try {
    await trackingDB.resolveResult(id, 'rejected', note);

    res.json({
      success: true,
      message: 'Data ditolak dan dihapus dari staging.',
      id:      parseInt(id),
      action:  'rejected',
    });
  } catch (err) {
    console.error(`[StagingCtrl] Reject error (id ${id}):`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
