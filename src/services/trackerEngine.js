'use strict';

/**
 * trackerEngine.js — Intelligent Alumni Tracking Core (v2)
 *
 * Mengorkestra pipeline lengkap:
 *  1. Ambil data alumni dari DB
 *  2. Jalankan enrichment (scrape + scoring)
 *  3. Auto-approve ke tabel utama Supabase jika score >= 70%
 *  4. Simpan ke staging (tracking_results) jika 40–69% — tunggu verifikasi admin
 *  5. Catat audit trail ke tracking_jobs & tracking_queries
 */

const trackingDB = require('../config/trackingDB');

// ─────────────────────────────────────────────────────────────
// SCORING HELPERS (mirror dari enrichmentService untuk standalone use)
// ─────────────────────────────────────────────────────────────

function classifyMatch(score) {
  if (score >= 70) return 'strong_match';
  if (score >= 40) return 'needs_verification';
  return 'no_match';
}

function classifyLabel(c) {
  return c === 'strong_match'       ? 'Kemungkinan Kuat'
       : c === 'needs_verification' ? 'Perlu Verifikasi Manual'
       : 'Tidak Cocok';
}

// ─────────────────────────────────────────────────────────────
// MAIN TRACKING FUNCTION
// Proses satu batch alumni dan simpan hasilnya ke DB
// ─────────────────────────────────────────────────────────────

/**
 * Jalankan tracking untuk batch alumni.
 *
 * @param {Array}  alumniList   — Array record alumni (camelCase dari DB)
 * @param {string} triggeredBy — 'manual' | 'scheduler' | 'api'
 * @returns {object}           — { jobId, totalAlumni, totalResults, autoApproved, stagingCount }
 */
async function runTracking(alumniList, triggeredBy = 'manual') {
  if (!alumniList || alumniList.length === 0) {
    return { jobId: null, totalAlumni: 0, totalResults: 0, autoApproved: 0, stagingCount: 0 };
  }

  // Lazy-load untuk menghindari circular dependency
  const { enrichBatch, autoUpdateToSupabase } = require('./enrichmentService');
  const Alumni = require('../models/alumniModel');

  // Buat tracking job
  let jobId = null;
  try {
    const job = await trackingDB.createJob(triggeredBy);
    jobId = job.id;
  } catch (err) {
    console.warn(`[Engine] Tidak bisa buat tracking job: ${err.message}`);
  }

  let autoApproved = 0;
  let stagingCount = 0;
  const allResults = [];

  // Jalankan enrichment batch (concurrent, rate-limited di dalam enrichBatch)
  const enrichResults = await enrichBatch(alumniList);

  for (const { alumni, enrichment, updatePayload, hasNewData, error } of enrichResults) {
    if (error || !enrichment) continue;

    const score          = enrichment.confidence_score;
    const classification = enrichment.classification;

    // ── Simpan query ke audit log ──
    if (jobId) {
      for (const src of enrichment.sources.slice(0, 3)) {
        try {
          await trackingDB.saveQuery(jobId, alumni.id, alumni.namaLengkap, src.snippet || src.title, 'osint');
        } catch (_) { /* non-critical */ }
      }
    }

    // ── Buat tracking result object ──
    const trackingResult = {
      jobId,
      alumniId:             alumni.id,
      alumniName:           alumni.namaLengkap,
      source:               'osint',
      sourceUrl:            enrichment.social_media.find(s => s.platform === 'LinkedIn')?.url
                            || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(alumni.namaLengkap)}`,
      extractedName:        enrichment.name,
      extractedTitle:       enrichment.job_title,
      extractedCompany:     enrichment.company,
      extractedLocation:    enrichment.work_address,
      extractedActivity:    enrichment.activity,
      rawSnippet:           `${enrichment.job_title || '-'} @ ${enrichment.company || '-'} | Score: ${score}% | ${classifyLabel(classification)}`,
      confidenceScore:      score,
      matchClassification:  classification,
      crossValidated:       score >= 70,
      adminAction:          score >= 70 ? 'approved' : null,
      adminNote:            score >= 70 ? `Auto-approved (score: ${score}%)` : null,
      resolvedAt:           score >= 70 ? new Date().toISOString() : null,
    };

    allResults.push(trackingResult);

    // ── Simpan ke staging ──
    let savedId = null;
    try {
      const saved = await trackingDB.saveResult(trackingResult);
      savedId = saved?.id;
    } catch (e) {
      console.warn(`[Engine] Gagal simpan staging result: ${e.message}`);
    }

    // ── AUTO-APPROVE: score >= 70% → update tabel utama Supabase ──
    if (score >= 70) {
      try {
        await autoUpdateToSupabase(alumni, enrichment);
        autoApproved++;
      } catch (e) {
        console.error(`[Engine] autoUpdateToSupabase gagal: ${e.message}`);
        // Fallback: update via model
        try {
          await Alumni.update(alumni.id, updatePayload);
        } catch (_) {}
      }
      // Resolve staging record
      if (savedId) {
        try { await trackingDB.resolveResult(savedId, 'approved', 'Auto-approved by Intelligent Tracker'); } catch (_) {}
      }

    // ── STAGING: score 40–69% → masuk antrean verifikasi admin ──
    } else if (score >= 40) {
      try {
        await Alumni.update(alumni.id, {
          ...alumni,
          status:          'Perlu Verifikasi Manual',
          confidenceScore: score,
        });
      } catch (e) {
        console.warn(`[Engine] Update status staging gagal: ${e.message}`);
      }
      stagingCount++;
    }
    // score < 40 → tidak ada aksi, data tidak diubah
  }

  // Selesaikan tracking job
  if (jobId) {
    try {
      await trackingDB.finishJob(jobId, alumniList.length, allResults.length);
    } catch (_) {}
  }

  console.log(`[Engine] Job ${jobId} selesai — alumni: ${alumniList.length}, auto-approved: ${autoApproved}, staging: ${stagingCount}`);

  return {
    jobId,
    totalAlumni:  alumniList.length,
    totalResults: allResults.length,
    autoApproved,
    stagingCount,
  };
}

module.exports = {
  classifyMatch,
  classifyLabel,
  runTracking,
};
