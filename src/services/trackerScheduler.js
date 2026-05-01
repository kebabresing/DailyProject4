'use strict';

/**
 * trackerScheduler.js — Background Worker & Mass Batch Scheduler (v2)
 *
 * Fitur utama:
 *  - Batch 1000 data per siklus
 *  - Antrean (queue) internal berbasis `async.queue` — concurrency = 1
 *  - Rate-limit antar scrape: 3–6 detik jeda
 *  - Try-catch kuat: error satu alumni TIDAK crash worker
 *  - Manual trigger via API controller
 *  - Cron-style scheduler via setInterval (opsional)
 */

const asyncLib  = require('async');
const Alumni    = require('../models/alumniModel');
const { runTracking } = require('./trackerEngine');

// ─────────────────────────────────────────────────────────────
// STATE GLOBAL WORKER
// ─────────────────────────────────────────────────────────────

const workerState = {
  status:          'idle',   // 'idle' | 'running' | 'paused' | 'error'
  isSchedulerOn:   false,
  schedulerTimer:  null,
  intervalMinutes: 120,
  batchSize:       1000,
  lastRun:         null,
  nextRun:         null,
  lastError:       null,
  totalRuns:       0,
  // Stats sesi terakhir
  currentJobId:    null,
  queueLength:     0,
  processed:       0,
  autoApproved:    0,
  stagingCount:    0,
};

// ─────────────────────────────────────────────────────────────
// ANTREAN (QUEUE) — Concurrency 1, rate-limit antar item
// ─────────────────────────────────────────────────────────────

/**
 * Setiap task dalam queue adalah SATU alumni.
 * Setelah selesai, jeda 3–6 detik sebelum task berikutnya.
 */
const trackingQueue = asyncLib.queue(async (task) => {
  try {
    const result = await runTracking([task.alumni], task.triggeredBy);

    // Akumulasi stats
    workerState.processed++;
    workerState.autoApproved += result.autoApproved || 0;
    workerState.stagingCount += result.stagingCount || 0;

    if (workerState.processed % 50 === 0) {
      console.log(
        `[Queue] Progress: ${workerState.processed}/${workerState.queueLength} | ` +
        `Auto-approved: ${workerState.autoApproved} | Staging: ${workerState.stagingCount}`
      );
    }
  } catch (err) {
    // Error untuk satu alumni — skip, lanjut ke berikutnya
    console.error(`[Queue] Error alumni "${task.alumni.namaLengkap || task.alumni.nama}": ${err.message}`);
  } finally {
    // Rate-limit: jeda 3–6 detik antar alumni
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
  }
}, 1); // concurrency = 1 (satu per satu, aman dari pemblokiran IP)

// Callback ketika queue kosong (semua selesai)
trackingQueue.drain(async () => {
  workerState.status   = 'idle';
  workerState.lastRun  = new Date().toISOString();
  console.log(
    `[Queue] SELESAI — Processed: ${workerState.processed}, ` +
    `Auto-approved: ${workerState.autoApproved}, Staging: ${workerState.stagingCount}`
  );
});

// Callback error global queue
trackingQueue.error((err, task) => {
  console.error(`[Queue] Task error (${task.alumni?.namaLengkap}): ${err.message}`);
});

// ─────────────────────────────────────────────────────────────
// FETCH ALUMNI — Ambil batch dari DB
// Prioritas: yang belum punya data pekerjaan / status belum teridentifikasi
// ─────────────────────────────────────────────────────────────

async function fetchPendingAlumni(batchSize = 1000) {
  // Ambil 1000 alumni yang belum ditemukan atau perlu verifikasi
  // Gunakan randomPage untuk merotasi data sehingga tidak stuck di batch yang sama
  try {
    const stats = await Alumni.getStats();
    const pendingTotal = (stats.belumDitemukan || 0) + (stats.perluVerifikasi || 0) || 1;
    const perPage    = Math.min(batchSize, 1000);
    const totalPages = Math.max(1, Math.ceil(pendingTotal / perPage));
    const randomPage = Math.floor(Math.random() * totalPages) + 1;

    const { alumniList } = await Alumni.getAllPaginated(
      '',
      randomPage,
      perPage,
      { statusFilter: 'Belum Ditemukan di Sumber Publik' }
    );

    return alumniList || [];
  } catch (err) {
    console.error(`[Scheduler] fetchPendingAlumni error: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// ENQUEUE BATCH — Masukkan alumni ke antrean
// ─────────────────────────────────────────────────────────────

function enqueueBatch(alumniList, triggeredBy = 'manual') {
  // Reset stats untuk sesi baru
  workerState.processed     = 0;
  workerState.autoApproved  = 0;
  workerState.stagingCount  = 0;
  workerState.queueLength   = alumniList.length;
  workerState.status        = 'running';
  workerState.totalRuns++;

  // Acak urutan agar tidak selalu mulai dari huruf A
  const shuffled = [...alumniList].sort(() => Math.random() - 0.5);

  shuffled.forEach(alumni => {
    trackingQueue.push({ alumni, triggeredBy });
  });

  console.log(`[Scheduler] Enqueued ${shuffled.length} alumni (triggered by: ${triggeredBy})`);
  return shuffled.length;
}

// ─────────────────────────────────────────────────────────────
// MANUAL TRIGGER — Dipanggil dari API controller
// ─────────────────────────────────────────────────────────────

/**
 * Mulai pemrosesan massal secara manual.
 * Batch size default: 1000. Berjalan di background.
 *
 * @param {number} batchSize
 * @returns {Promise<object>}
 */
async function runManualTracking(batchSize = 1000) {
  // Jika queue masih ada isi, tolak permintaan baru
  if (trackingQueue.length() > 0 || workerState.status === 'running') {
    return {
      error: `Worker sedang berjalan. Queue tersisa: ${trackingQueue.length()} items. Tunggu hingga selesai.`,
      queueLength: trackingQueue.length(),
    };
  }

  const alumniList = await fetchPendingAlumni(batchSize);

  if (!alumniList || alumniList.length === 0) {
    return { error: 'Tidak ada alumni yang perlu diproses (semua sudah teridentifikasi).' };
  }

  const totalEnqueued = enqueueBatch(alumniList, 'manual');
  workerState.lastRun = new Date().toISOString();

  return {
    status:      'started',
    totalQueued: totalEnqueued,
    batchSize:   totalEnqueued,
    message:     `${totalEnqueued} alumni masuk antrean. Proses berjalan di background.`,
  };
}

// ─────────────────────────────────────────────────────────────
// SCHEDULER — Otomatis setiap N menit
// ─────────────────────────────────────────────────────────────

async function runScheduledBatch() {
  // Skip jika queue masih jalan
  if (trackingQueue.length() > 0 || workerState.status === 'running') {
    console.log('[Scheduler] Skip — queue masih berjalan');
    return null;
  }

  try {
    const alumniList = await fetchPendingAlumni(workerState.batchSize);
    if (!alumniList || alumniList.length === 0) {
      console.log('[Scheduler] Tidak ada alumni pending — skip siklus ini');
      return null;
    }

    enqueueBatch(alumniList, 'scheduler');
  } catch (err) {
    workerState.status    = 'error';
    workerState.lastError = err.message;
    console.error('[Scheduler] Error:', err.message);
  }
}

/**
 * Mulai scheduler otomatis.
 * @param {number} intervalMinutes  — default: 120 menit
 * @param {number} batchSize        — default: 1000 alumni per siklus
 */
function startScheduler(intervalMinutes = 120, batchSize = 1000) {
  stopScheduler(); // Hentikan dulu jika ada yang lama

  workerState.isSchedulerOn   = true;
  workerState.intervalMinutes = intervalMinutes;
  workerState.batchSize       = batchSize;

  const intervalMs        = intervalMinutes * 60 * 1000;
  workerState.nextRun     = new Date(Date.now() + intervalMs).toISOString();

  workerState.schedulerTimer = setInterval(async () => {
    workerState.nextRun = new Date(Date.now() + intervalMs).toISOString();
    await runScheduledBatch();
  }, intervalMs);

  console.log(`[Scheduler] Started — setiap ${intervalMinutes} menit, batch ${batchSize} alumni`);
  return getStatus();
}

function stopScheduler() {
  if (workerState.schedulerTimer) {
    clearInterval(workerState.schedulerTimer);
    workerState.schedulerTimer = null;
  }
  workerState.isSchedulerOn = false;
  workerState.nextRun       = null;
  console.log('[Scheduler] Stopped');
  return getStatus();
}

/**
 * Hentikan queue yang sedang berjalan.
 * Items dalam queue dibuang, worker tidak dimatikan secara paksa.
 */
function pauseQueue() {
  trackingQueue.kill(); // Buang semua item pending dari queue
  workerState.status = 'idle';
  console.log('[Queue] Killed — semua pending task dibatalkan');
  return getStatus();
}

// ─────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────

function getStatus() {
  return {
    status:          workerState.status,
    isSchedulerOn:   workerState.isSchedulerOn,
    intervalMinutes: workerState.intervalMinutes,
    batchSize:       workerState.batchSize,
    lastRun:         workerState.lastRun,
    nextRun:         workerState.nextRun,
    lastError:       workerState.lastError,
    totalRuns:       workerState.totalRuns,
    queuePending:    trackingQueue.length(),
    // Stats sesi terakhir
    sessionProcessed:    workerState.processed,
    sessionAutoApproved: workerState.autoApproved,
    sessionStaging:      workerState.stagingCount,
    sessionTotal:        workerState.queueLength,
    progress: workerState.queueLength > 0
      ? `${workerState.processed}/${workerState.queueLength}`
      : '0/0',
  };
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  startScheduler,
  stopScheduler,
  pauseQueue,
  runManualTracking,
  getStatus,
  // Alias untuk kompatibilitas dengan controller lama
  getSchedulerState: getStatus,
  runScheduledBatch,
};
