/**
 * Tracking Database — Dual Mode
 * - Vercel / Supabase: gunakan tabel Supabase (tracking_jobs, tracking_queries, tracking_results)
 * - Lokal / Development: gunakan SQLite
 *
 * Deteksi otomatis via env VERCEL dan SUPABASE_URL.
 */

const path = require('path');
const isVercel = process.env.VERCEL === '1';
const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY &&
  !process.env.SUPABASE_URL.includes('xxxxxxxx'));

// ============================================================
// MODE A: SQLite (lokal)
// ============================================================
let _sqliteDB = null;
async function getSQLiteTrackingDB() {
  if (_sqliteDB) return _sqliteDB;

  const sqlite3 = require('sqlite3').verbose();
  const { open } = require('sqlite');
  const db = await open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tracking_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      total_alumni INTEGER DEFAULT 0,
      total_results INTEGER DEFAULT 0,
      triggered_by TEXT DEFAULT 'manual'
    );
    CREATE TABLE IF NOT EXISTS tracking_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      alumni_id INTEGER NOT NULL,
      alumni_name TEXT NOT NULL,
      query_text TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES tracking_jobs(id)
    );
    CREATE TABLE IF NOT EXISTS tracking_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      alumni_id INTEGER NOT NULL,
      alumni_name TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT,
      extracted_name TEXT,
      extracted_title TEXT,
      extracted_company TEXT,
      extracted_location TEXT,
      extracted_activity TEXT,
      raw_snippet TEXT,
      confidence_score INTEGER DEFAULT 0,
      match_classification TEXT DEFAULT 'needs_verification',
      cross_validated INTEGER DEFAULT 0,
      admin_action TEXT,
      admin_note TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES tracking_jobs(id)
    );
  `);

  _sqliteDB = db;
  return db;
}

// ============================================================
// MODE B: Supabase (Vercel / Production)
// Tabel harus sudah dibuat di Supabase terlebih dahulu.
// Jalankan SQL di bawah di Supabase SQL Editor:
//
//   CREATE TABLE IF NOT EXISTS tracking_jobs ( ... );
//   CREATE TABLE IF NOT EXISTS tracking_queries ( ... );
//   CREATE TABLE IF NOT EXISTS tracking_results ( ... );
//
// Lihat schema lengkap di README.md
// ============================================================
let _supabaseClient = null;
function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  const { createClient } = require('@supabase/supabase-js');
  _supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  return _supabaseClient;
}

// ============================================================
// Pilih adapter
// ============================================================
const useSupabase = isVercel || hasSupabase;

// ── Supabase helpers ─────────────────────────────────────────
const supabase = {
  async createJob(triggeredBy = 'manual') {
    const sb = getSupabaseClient();
    const { data } = await sb.from('tracking_jobs')
      .insert([{ triggered_by: triggeredBy, status: 'running', started_at: new Date().toISOString() }])
      .select('id').single();
    return { id: data?.id };
  },
  async finishJob(jobId, totalAlumni, totalResults, status = 'completed') {
    const sb = getSupabaseClient();
    await sb.from('tracking_jobs').update({
      finished_at: new Date().toISOString(),
      status, total_alumni: totalAlumni, total_results: totalResults,
    }).eq('id', jobId);
  },
  async getJobs(limit = 20) {
    const sb = getSupabaseClient();
    const { data } = await sb.from('tracking_jobs').select('*').order('id', { ascending: false }).limit(limit);
    return data || [];
  },
  async getLatestJob() {
    const sb = getSupabaseClient();
    const { data } = await sb.from('tracking_jobs').select('*').order('id', { ascending: false }).limit(1).single();
    return data;
  },
  async saveQuery(jobId, alumniId, alumniName, queryText, source) {
    const sb = getSupabaseClient();
    await sb.from('tracking_queries').insert([{
      job_id: jobId, alumni_id: alumniId, alumni_name: alumniName,
      query_text: queryText, source, created_at: new Date().toISOString(),
    }]);
  },
  async getQueriesByJob(jobId) {
    const sb = getSupabaseClient();
    const { data } = await sb.from('tracking_queries').select('*').eq('job_id', jobId).order('id');
    return data || [];
  },
  async saveResult(result) {
    const sb = getSupabaseClient();
    const { data } = await sb.from('tracking_results').insert([{
      job_id: result.jobId, alumni_id: result.alumniId, alumni_name: result.alumniName,
      source: result.source, source_url: result.sourceUrl,
      extracted_name: result.extractedName, extracted_title: result.extractedTitle,
      extracted_company: result.extractedCompany, extracted_location: result.extractedLocation,
      extracted_activity: result.extractedActivity, raw_snippet: result.rawSnippet,
      confidence_score: result.confidenceScore, match_classification: result.matchClassification,
      cross_validated: result.crossValidated ? true : false,
      created_at: new Date().toISOString(),
    }]).select('id').single();
    return { id: data?.id };
  },
  async getPendingResults(limit = 50) {
    const sb = getSupabaseClient();
    const { data } = await sb.from('tracking_results')
      .select('*').is('admin_action', null)
      .order('confidence_score', { ascending: false })
      .limit(limit);
    return data || [];
  },
  async getResultsByAlumni(alumniId) {
    const sb = getSupabaseClient();
    const { data } = await sb.from('tracking_results').select('*').eq('alumni_id', alumniId).order('created_at', { ascending: false });
    return data || [];
  },
  async getResultById(id) {
    const sb = getSupabaseClient();
    const { data } = await sb.from('tracking_results').select('*').eq('id', id).single();
    return data;
  },
  async resolveResult(id, action, note = '') {
    const sb = getSupabaseClient();
    await sb.from('tracking_results').update({
      admin_action: action, admin_note: note, resolved_at: new Date().toISOString(),
    }).eq('id', id);
  },
  async getAuditTrail(limit = 100) {
    const sb = getSupabaseClient();
    const { data } = await sb.from('tracking_results')
      .select('*').not('admin_action', 'is', null)
      .order('resolved_at', { ascending: false }).limit(limit);
    return data || [];
  },
  async getTrackingStats() {
    const sb = getSupabaseClient();
    const [total, pending, approved, rejected, strongMatch, crossVal, jobs, queries] = await Promise.all([
      sb.from('tracking_results').select('*', { count: 'exact', head: true }),
      sb.from('tracking_results').select('*', { count: 'exact', head: true }).is('admin_action', null),
      sb.from('tracking_results').select('*', { count: 'exact', head: true }).eq('admin_action', 'approved'),
      sb.from('tracking_results').select('*', { count: 'exact', head: true }).eq('admin_action', 'rejected'),
      sb.from('tracking_results').select('*', { count: 'exact', head: true }).eq('match_classification', 'strong_match'),
      sb.from('tracking_results').select('*', { count: 'exact', head: true }).eq('cross_validated', true),
      sb.from('tracking_jobs').select('*', { count: 'exact', head: true }),
      sb.from('tracking_queries').select('*', { count: 'exact', head: true }),
    ]);
    return {
      totalResults: total.count || 0,
      pendingResults: pending.count || 0,
      approvedResults: approved.count || 0,
      rejectedResults: rejected.count || 0,
      strongMatches: strongMatch.count || 0,
      crossValidated: crossVal.count || 0,
      totalJobs: jobs.count || 0,
      totalQueries: queries.count || 0,
    };
  },
};

// ── SQLite helpers (wrap sqlite API → same interface) ────────
async function sqliteAdapter() {
  const db = await getSQLiteTrackingDB();
  return {
    async createJob(triggeredBy) {
      const r = await db.run('INSERT INTO tracking_jobs (triggered_by) VALUES (?)', [triggeredBy]);
      return { id: r.lastID };
    },
    async finishJob(jobId, totalAlumni, totalResults, status = 'completed') {
      await db.run(`UPDATE tracking_jobs SET finished_at = datetime('now'), status = ?, total_alumni = ?, total_results = ? WHERE id = ?`,
        [status, totalAlumni, totalResults, jobId]);
    },
    async getJobs(limit = 20) {
      return await db.all('SELECT * FROM tracking_jobs ORDER BY id DESC LIMIT ?', [limit]);
    },
    async getLatestJob() {
      return await db.get('SELECT * FROM tracking_jobs ORDER BY id DESC LIMIT 1');
    },
    async saveQuery(jobId, alumniId, alumniName, queryText, source) {
      await db.run('INSERT INTO tracking_queries (job_id, alumni_id, alumni_name, query_text, source) VALUES (?, ?, ?, ?, ?)',
        [jobId, alumniId, alumniName, queryText, source]);
    },
    async getQueriesByJob(jobId) {
      return await db.all('SELECT * FROM tracking_queries WHERE job_id = ? ORDER BY id', [jobId]);
    },
    async saveResult(result) {
      const r = await db.run(
        `INSERT INTO tracking_results (job_id, alumni_id, alumni_name, source, source_url, extracted_name, extracted_title, extracted_company, extracted_location, extracted_activity, raw_snippet, confidence_score, match_classification, cross_validated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.jobId, result.alumniId, result.alumniName, result.source, result.sourceUrl,
        result.extractedName, result.extractedTitle, result.extractedCompany,
        result.extractedLocation, result.extractedActivity, result.rawSnippet,
        result.confidenceScore, result.matchClassification, result.crossValidated ? 1 : 0]);
      return { id: r.lastID };
    },
    async getPendingResults(limit = 50) {
      return await db.all('SELECT * FROM tracking_results WHERE admin_action IS NULL ORDER BY confidence_score DESC LIMIT ?', [limit]);
    },
    async getResultsByAlumni(alumniId) {
      return await db.all('SELECT * FROM tracking_results WHERE alumni_id = ? ORDER BY created_at DESC', [alumniId]);
    },
    async getResultById(id) {
      return await db.get('SELECT * FROM tracking_results WHERE id = ?', [id]);
    },
    async resolveResult(id, action, note = '') {
      await db.run(`UPDATE tracking_results SET admin_action = ?, admin_note = ?, resolved_at = datetime('now') WHERE id = ?`,
        [action, note, id]);
    },
    async getAuditTrail(limit = 100) {
      return await db.all('SELECT * FROM tracking_results WHERE admin_action IS NOT NULL ORDER BY resolved_at DESC LIMIT ?', [limit]);
    },
    async getTrackingStats() {
      const [total, pending, approved, rejected, strongMatch, crossVal, jobs, queries] = await Promise.all([
        db.get('SELECT COUNT(*) as count FROM tracking_results'),
        db.get('SELECT COUNT(*) as count FROM tracking_results WHERE admin_action IS NULL'),
        db.get(`SELECT COUNT(*) as count FROM tracking_results WHERE admin_action = 'approved'`),
        db.get(`SELECT COUNT(*) as count FROM tracking_results WHERE admin_action = 'rejected'`),
        db.get(`SELECT COUNT(*) as count FROM tracking_results WHERE match_classification = 'strong_match'`),
        db.get('SELECT COUNT(*) as count FROM tracking_results WHERE cross_validated = 1'),
        db.get('SELECT COUNT(*) as count FROM tracking_jobs'),
        db.get('SELECT COUNT(*) as count FROM tracking_queries'),
      ]);
      return {
        totalResults: total.count,
        pendingResults: pending.count,
        approvedResults: approved.count,
        rejectedResults: rejected.count,
        strongMatches: strongMatch.count,
        crossValidated: crossVal.count,
        totalJobs: jobs.count,
        totalQueries: queries.count,
      };
    },
  };
}

// ── Exported unified API ─────────────────────────────────────
let _adapter = null;
async function getAdapter() {
  if (_adapter) return _adapter;
  if (useSupabase) {
    console.log('[TrackingDB] Using Supabase adapter');
    _adapter = supabase;
  } else {
    console.log('[TrackingDB] Using SQLite adapter');
    _adapter = await sqliteAdapter();
  }
  return _adapter;
}

module.exports = {
  getTrackingDB: getAdapter,
  createJob: async (...a) => (await getAdapter()).createJob(...a),
  finishJob: async (...a) => (await getAdapter()).finishJob(...a),
  getJobs: async (...a) => (await getAdapter()).getJobs(...a),
  getLatestJob: async () => (await getAdapter()).getLatestJob(),
  saveQuery: async (...a) => (await getAdapter()).saveQuery(...a),
  getQueriesByJob: async (...a) => (await getAdapter()).getQueriesByJob(...a),
  saveResult: async (...a) => (await getAdapter()).saveResult(...a),
  getPendingResults: async (...a) => (await getAdapter()).getPendingResults(...a),
  getResultsByAlumni: async (...a) => (await getAdapter()).getResultsByAlumni(...a),
  getResultById: async (...a) => (await getAdapter()).getResultById(...a),
  resolveResult: async (...a) => (await getAdapter()).resolveResult(...a),
  getAuditTrail: async (...a) => (await getAdapter()).getAuditTrail(...a),
  getTrackingStats: async () => (await getAdapter()).getTrackingStats(),
};
