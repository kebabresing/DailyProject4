/**
 * Tracker Scheduler — Pelacakan Berkala Otomatis
 * 
 * Scheduler in-process menggunakan setInterval.
 * Menjalankan batch tracking secara berkala tanpa mengganggu sistem utama.
 */

const Alumni = require('../models/alumniModel');
const { runTracking } = require('./trackerEngine');

// ── Scheduler State ──
let schedulerInterval = null;
let schedulerState = {
  status: 'idle',          // 'idle' | 'running' | 'error'
  lastRun: null,
  lastError: null,
  nextRun: null,
  intervalMinutes: 60,     // default: setiap 60 menit
  batchSize: 10,           // proses 10 alumni per cycle
  totalRuns: 0,
  isEnabled: false
};

// ── Start Scheduler ──
function startScheduler(intervalMinutes = 60, batchSize = 10) {
  if (schedulerInterval) {
    stopScheduler();
  }

  schedulerState.intervalMinutes = intervalMinutes;
  schedulerState.batchSize = batchSize;
  schedulerState.isEnabled = true;
  schedulerState.status = 'idle';

  const intervalMs = intervalMinutes * 60 * 1000;
  schedulerState.nextRun = new Date(Date.now() + intervalMs).toISOString();

  schedulerInterval = setInterval(async () => {
    await runScheduledBatch();
  }, intervalMs);

  console.log(`[Scheduler] Started — every ${intervalMinutes}min, batch size ${batchSize}`);
  return schedulerState;
}

// ── Stop Scheduler ──
function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  schedulerState.isEnabled = false;
  schedulerState.status = 'idle';
  schedulerState.nextRun = null;
  console.log('[Scheduler] Stopped');
  return schedulerState;
}

// ── Run a single batch ──
async function runScheduledBatch() {
  if (schedulerState.status === 'running') {
    console.log('[Scheduler] Skip — already running');
    return null;
  }

  schedulerState.status = 'running';
  schedulerState.lastRun = new Date().toISOString();

  try {
    // Get random batch of alumni to track
    const allAlumni = await Alumni.getAll();
    
    if (!allAlumni || allAlumni.length === 0) {
      schedulerState.status = 'idle';
      return null;
    }

    // Shuffle and pick a batch
    const shuffled = [...allAlumni].sort(() => Math.random() - 0.5);
    const batch = shuffled.slice(0, schedulerState.batchSize);

    // Run tracking
    const result = await runTracking(batch, 'scheduler');
    
    schedulerState.totalRuns++;
    schedulerState.status = 'idle';
    schedulerState.lastError = null;

    if (schedulerState.isEnabled) {
      schedulerState.nextRun = new Date(Date.now() + schedulerState.intervalMinutes * 60 * 1000).toISOString();
    }

    console.log(`[Scheduler] Completed — Job #${result.jobId}: ${result.totalAlumni} alumni, ${result.totalResults} results`);
    return result;

  } catch (err) {
    schedulerState.status = 'error';
    schedulerState.lastError = err.message;
    console.error('[Scheduler] Error:', err.message);
    return null;
  }
}

// ── Manual trigger (sama seperti scheduler tapi sekali jalan) ──
async function runManualTracking(batchSize = 10) {
  const prevStatus = schedulerState.status;
  schedulerState.status = 'running';

  try {
    const allAlumni = await Alumni.getAll();
    if (!allAlumni || allAlumni.length === 0) {
      schedulerState.status = prevStatus;
      return { error: 'No alumni data available' };
    }

    const shuffled = [...allAlumni].sort(() => Math.random() - 0.5);
    const batch = shuffled.slice(0, batchSize);

    const result = await runTracking(batch, 'manual');
    schedulerState.status = prevStatus === 'running' ? 'running' : 'idle';
    schedulerState.lastRun = new Date().toISOString();
    schedulerState.totalRuns++;

    return result;

  } catch (err) {
    schedulerState.status = 'error';
    schedulerState.lastError = err.message;
    throw err;
  }
}

// ── Get scheduler state ──
function getSchedulerState() {
  return { ...schedulerState };
}

module.exports = {
  startScheduler,
  stopScheduler,
  runManualTracking,
  getSchedulerState
};
