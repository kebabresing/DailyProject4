/**
 * jobTracker.js — Background Worker Pelacakan Pekerjaan Alumni
 *
 * Cara kerja:
 *   1. Ambil batch alumni dari Supabase yang belum ada data pekerjaannya
 *   2. Masukkan ke dalam antrean (queue) satu-per-satu
 *   3. Setiap item di-scrape menggunakan jobScraper.js
 *   4. Jika data ditemukan → update langsung ke Supabase
 *   5. Jeda antar-scrape: 5-10 detik (aman dari pemblokiran IP)
 *
 * Cara memulai dari controller:
 *   const tracker = require('./jobTracker');
 *   tracker.startBatch(50);           // proses 50 alumni
 *   tracker.getStatus();              // cek status antrean
 *   tracker.stop();                   // hentikan
 */

const { createClient } = require('@supabase/supabase-js');
const { findJob }      = require('./jobScraper');

// ── Supabase Client ─────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}

// ── State Tracker ────────────────────────────────────────────────────────────

const state = {
  isRunning    : false,
  queue        : [],        // array of alumni objects
  currentIndex : 0,
  totalQueued  : 0,
  totalDone    : 0,
  totalUpdated : 0,
  totalSkipped : 0,
  lastError    : null,
  startedAt    : null,
};

// ── Delay Helper ─────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Ambil Data Alumni dari Supabase ──────────────────────────────────────────
// Hanya alumni yang BELUM ada data pekerjaannya (tempat_kerja IS NULL)

async function fetchPendingAlumni(limit = 50, offset = 0) {
  const sb = getSupabase();

  const { data, error } = await sb
    .from('alumniv2')
    .select('id, nama, prodi, kampus, tanggal_lulus')
    .is('tempat_kerja', null)         // belum ada data pekerjaan
    .order('nama', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`[JobTracker] Gagal ambil data: ${error.message}`);
  return data || [];
}

// ── Update Data Pekerjaan ke Supabase ────────────────────────────────────────

async function updateJobData(alumniId, jobData) {
  const sb = getSupabase();

  // Hanya update kolom yang ada isinya (tidak menimpa data yang sudah ada)
  const updatePayload = {};
  if (jobData.tempatKerja)    updatePayload.tempat_kerja    = jobData.tempatKerja;
  if (jobData.posisi)         updatePayload.posisi          = jobData.posisi;
  if (jobData.alamatKerja)    updatePayload.alamat_kerja    = jobData.alamatKerja;
  if (jobData.jenisPekerjaan) updatePayload.jenis_pekerjaan = jobData.jenisPekerjaan;

  // Update status agar tidak lagi "Belum Ditemukan di Sumber Publik"
  updatePayload.status = 'Teridentifikasi dari Sumber Publik';

  // Jika tidak ada data sama sekali, tidak perlu update
  if (Object.keys(updatePayload).length === 0) return false;

  const { error } = await sb
    .from('alumniv2')
    .update(updatePayload)
    .eq('id', alumniId);

  if (error) throw new Error(`[JobTracker] Gagal update alumni ${alumniId}: ${error.message}`);
  return true;
}

// ── Proses Satu Alumni ───────────────────────────────────────────────────────

async function processOne(alumniRow) {
  // Petakan nama kolom Supabase (snake_case) → format yang dipakai scraper
  const alumni = {
    id           : alumniRow.id,
    namaLengkap  : alumniRow.nama,
    prodi        : alumniRow.prodi        || '',
    kampus       : alumniRow.kampus       || 'Universitas Muhammadiyah Malang',
    tahunLulus   : alumniRow.tanggal_lulus || '',
  };

  try {
    const jobData = await findJob(alumni);
    const hasData = Object.values(jobData).some(Boolean);

    if (hasData) {
      await updateJobData(alumni.id, jobData);
      state.totalUpdated++;
      console.log(`[JobTracker] ✓ Updated: ${alumni.namaLengkap} → ${jobData.jenisPekerjaan} @ ${jobData.tempatKerja}`);
    } else {
      state.totalSkipped++;
      console.log(`[JobTracker] – Skip: ${alumni.namaLengkap} (tidak ada data pekerjaan)`);
    }
  } catch (err) {
    state.totalSkipped++;
    state.lastError = err.message;
    console.error(`[JobTracker] ✗ Error untuk ${alumni.namaLengkap}: ${err.message}`);
    // Tidak crash — lanjut ke berikutnya
  }

  state.totalDone++;
}

// ── Loop Antrean (jantung dari worker) ──────────────────────────────────────

async function runQueue() {
  state.isRunning = true;
  console.log(`[JobTracker] Mulai memproses ${state.queue.length} alumni...`);

  for (let i = 0; i < state.queue.length; i++) {
    if (!state.isRunning) {
      console.log('[JobTracker] Dihentikan oleh pengguna.');
      break;
    }

    state.currentIndex = i + 1;
    const alumni = state.queue[i];

    await processOne(alumni);

    // Jeda antar alumni: 5–10 detik (aman, tidak diblokir IP)
    if (i < state.queue.length - 1) {
      const jeda = 5000 + Math.random() * 5000;
      console.log(`[JobTracker] Menunggu ${(jeda / 1000).toFixed(1)}s sebelum alumni berikutnya...`);
      await delay(jeda);
    }
  }

  state.isRunning = false;
  console.log(`[JobTracker] Selesai. Updated: ${state.totalUpdated}, Skip: ${state.totalSkipped}`);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Mulai proses batch alumni.
 * @param {number} batchSize  - Jumlah alumni yang diproses (default: 20)
 * @param {number} offset     - Offset dari database (untuk pagination manual)
 */
async function startBatch(batchSize = 20, offset = 0) {
  if (state.isRunning) {
    return { error: 'Tracker sedang berjalan. Tunggu hingga selesai atau panggil stop().' };
  }

  // Reset state
  state.queue        = [];
  state.currentIndex = 0;
  state.totalQueued  = 0;
  state.totalDone    = 0;
  state.totalUpdated = 0;
  state.totalSkipped = 0;
  state.lastError    = null;
  state.startedAt    = new Date().toISOString();

  try {
    const pendingAlumni = await fetchPendingAlumni(batchSize, offset);

    if (pendingAlumni.length === 0) {
      return { message: 'Tidak ada alumni yang perlu diproses (semua sudah punya data pekerjaan).' };
    }

    state.queue       = pendingAlumni;
    state.totalQueued = pendingAlumni.length;

    console.log(`[JobTracker] Mengantrekan ${pendingAlumni.length} alumni...`);

    // Jalankan di background (tidak memblokir response HTTP)
    runQueue().catch(err => {
      state.isRunning = false;
      state.lastError = err.message;
      console.error('[JobTracker] Fatal error:', err.message);
    });

    return {
      message     : `Tracker dimulai untuk ${pendingAlumni.length} alumni.`,
      totalQueued : pendingAlumni.length,
      status      : 'running',
    };
  } catch (err) {
    state.isRunning = false;
    state.lastError = err.message;
    throw err;
  }
}

/**
 * Hentikan proses yang sedang berjalan.
 */
function stop() {
  state.isRunning = false;
  return { message: 'Tracker akan berhenti setelah alumni saat ini selesai.' };
}

/**
 * Dapatkan status antrean saat ini.
 */
function getStatus() {
  return {
    isRunning    : state.isRunning,
    currentIndex : state.currentIndex,
    totalQueued  : state.totalQueued,
    totalDone    : state.totalDone,
    totalUpdated : state.totalUpdated,
    totalSkipped : state.totalSkipped,
    lastError    : state.lastError,
    startedAt    : state.startedAt,
    progress     : state.totalQueued > 0
      ? `${state.totalDone}/${state.totalQueued}`
      : '0/0',
  };
}

module.exports = { startBatch, stop, getStatus };
