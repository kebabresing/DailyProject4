/**
 * Tracker Controller — Handler untuk modul intelligent tracking
 */

const trackingDB = require('../config/trackingDB');
const { SOURCES, classifyLabel, buildSearchQueries } = require('../services/trackerEngine');
const { startScheduler, stopScheduler, runManualTracking, getSchedulerState } = require('../services/trackerScheduler');
const Alumni = require('../models/alumniModel');

// ── GET /tracker — Dashboard utama ──
exports.getDashboard = async (req, res) => {
  try {
    const stats = await trackingDB.getTrackingStats();
    const pending = await trackingDB.getPendingResults(20);
    const jobs = await trackingDB.getJobs(10);
    const scheduler = getSchedulerState();

    // Enrich pending with classification labels
    const enrichedPending = pending.map(r => ({
      ...r,
      classificationLabel: classifyLabel(r.match_classification),
      sourceIcon: SOURCES.find(s => s.id === r.source)?.icon || '🔍',
      sourceName: SOURCES.find(s => s.id === r.source)?.name || r.source
    }));

    res.render('tracker', {
      title: 'Intelligent Tracker — Monitoring Dashboard',
      stats,
      pendingResults: enrichedPending,
      jobs,
      scheduler,
      sources: SOURCES
    });
  } catch (err) {
    console.error('[Tracker] Dashboard error:', err);
    res.status(500).send('Tracker dashboard error: ' + err.message);
  }
};

// ── POST /tracker/run — Trigger manual scan ──
exports.triggerScan = async (req, res) => {
  try {
    const batchSize = parseInt(req.body.batchSize) || 10;
    const result = await runManualTracking(batchSize);
    
    if (result.error) {
      return res.redirect('/tracker?alert=no-data');
    }

    res.redirect(`/tracker?alert=scan-complete&jobId=${result.jobId}&total=${result.totalResults}`);
  } catch (err) {
    console.error('[Tracker] Manual scan error:', err);
    res.redirect('/tracker?alert=scan-error');
  }
};

// ── POST /tracker/scheduler/start — Start scheduler ──
exports.startScheduler = (req, res) => {
  const interval = parseInt(req.body.interval) || 60;
  const batchSize = parseInt(req.body.batchSize) || 10;
  startScheduler(interval, batchSize);
  res.redirect('/tracker?alert=scheduler-started');
};

// ── POST /tracker/scheduler/stop — Stop scheduler ──
exports.stopScheduler = (req, res) => {
  stopScheduler();
  res.redirect('/tracker?alert=scheduler-stopped');
};

// ── GET /tracker/results/:alumniId — Detail per alumni ──
exports.getAlumniResults = async (req, res) => {
  try {
    const alumniId = parseInt(req.params.alumniId);
    const results = await trackingDB.getResultsByAlumni(alumniId);
    const alumni = await Alumni.getById(alumniId);

    // Get search queries for this alumni
    let queries = [];
    if (alumni) {
      queries = buildSearchQueries(alumni);
    }

    const enrichedResults = results.map(r => ({
      ...r,
      classificationLabel: classifyLabel(r.match_classification),
      sourceIcon: SOURCES.find(s => s.id === r.source)?.icon || '🔍',
      sourceName: SOURCES.find(s => s.id === r.source)?.name || r.source
    }));

    res.json({
      alumni,
      queries,
      results: enrichedResults,
      totalResults: results.length
    });
  } catch (err) {
    console.error('[Tracker] Alumni results error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ── POST /tracker/approve/:id — Approve hasil ──
exports.approveResult = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const note = req.body.note || '';
    const result = await trackingDB.getResultById(id);
    
    if (!result) return res.redirect('/tracker');

    // Mark as approved in tracking table
    await trackingDB.resolveResult(id, 'approved', note);

    // Update the alumni record with enriched data (non-destructive — append to jejak)
    const alumni = await Alumni.getById(result.alumni_id);
    if (alumni) {
      const enrichment = [];
      if (result.extracted_company && !alumni.tempatKerja) {
        alumni.tempatKerja = result.extracted_company;
        enrichment.push(`Workplace: ${result.extracted_company}`);
      }
      if (result.extracted_title && !alumni.posisi) {
        alumni.posisi = result.extracted_title;
        enrichment.push(`Position: ${result.extracted_title}`);
      }
      if (result.extracted_location && !alumni.alamatKerja) {
        alumni.alamatKerja = result.extracted_location;
        enrichment.push(`Location: ${result.extracted_location}`);
      }

      // Enrich social media links if source matches
      if (result.source === 'linkedin' && result.source_url && !alumni.linkedin) {
        alumni.linkedin = result.source_url;
      }
      if (result.source === 'instagram' && result.source_url && !alumni.instagram) {
        alumni.instagram = result.source_url;
      }
      if (result.source === 'facebook' && result.source_url && !alumni.facebook) {
        alumni.facebook = result.source_url;
      }

      // Append verified evidence to jejak
      const timestamp = new Date().toISOString().split('T')[0];
      const evidenceLog = `[TRACKER-VERIFIED ${timestamp}] Source: ${result.source} (${result.confidence_score}%) — ${result.raw_snippet}`;
      alumni.jejak = alumni.jejak 
        ? alumni.jejak + ' | ' + evidenceLog
        : evidenceLog;

      // Update confidence if tracker score is higher
      if (result.confidence_score > (alumni.confidenceScore || 0)) {
        alumni.confidenceScore = result.confidence_score;
      }

      // Update status
      if (result.confidence_score >= 70) {
        alumni.status = 'Teridentifikasi dari Sumber Publik';
      }

      await Alumni.update(result.alumni_id, alumni);
    }

    res.redirect('/tracker?alert=approved');
  } catch (err) {
    console.error('[Tracker] Approve error:', err);
    res.redirect('/tracker?alert=error');
  }
};

// ── POST /tracker/reject/:id — Reject hasil ──
exports.rejectResult = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const note = req.body.note || 'Admin rejected — false positive or irrelevant match.';
    
    await trackingDB.resolveResult(id, 'rejected', note);
    res.redirect('/tracker?alert=rejected');
  } catch (err) {
    console.error('[Tracker] Reject error:', err);
    res.redirect('/tracker?alert=error');
  }
};

// ── GET /tracker/audit — Audit trail ──
exports.getAudit = async (req, res) => {
  try {
    const audit = await trackingDB.getAuditTrail(100);
    const enrichedAudit = audit.map(r => ({
      ...r,
      classificationLabel: classifyLabel(r.match_classification),
      sourceIcon: SOURCES.find(s => s.id === r.source)?.icon || '🔍',
      sourceName: SOURCES.find(s => s.id === r.source)?.name || r.source
    }));

    res.json({ audit: enrichedAudit });
  } catch (err) {
    console.error('[Tracker] Audit error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ── GET /tracker/queries/:jobId — Get queries for a job ──
exports.getJobQueries = async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const queries = await trackingDB.getQueriesByJob(jobId);
    res.json({ queries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
