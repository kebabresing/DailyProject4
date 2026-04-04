/**
 * Tracking Database Schema & CRUD
 * Tabel terpisah untuk modul tracking — tidak mengganggu tabel alumni utama.
 */
const path = require('path');

let trackingDB = null;

async function getTrackingDB() {
  if (trackingDB) return trackingDB;

  const sqlite3 = require('sqlite3').verbose();
  const { open } = require('sqlite');

  const db = await open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
  });

  // ── Tabel 1: Tracking Jobs (sesi pelacakan) ──
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tracking_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      total_alumni INTEGER DEFAULT 0,
      total_results INTEGER DEFAULT 0,
      triggered_by TEXT DEFAULT 'manual'
    )
  `);

  // ── Tabel 2: Tracking Queries (query pencarian per alumni) ──
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tracking_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      alumni_id INTEGER NOT NULL,
      alumni_name TEXT NOT NULL,
      query_text TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES tracking_jobs(id)
    )
  `);

  // ── Tabel 3: Tracking Results (hasil temuan per alumni) ──
  await db.exec(`
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
    )
  `);

  trackingDB = db;
  return db;
}

// ── CRUD Functions ──

async function createJob(triggeredBy = 'manual') {
  const db = await getTrackingDB();
  const result = await db.run(
    'INSERT INTO tracking_jobs (triggered_by) VALUES (?)',
    [triggeredBy]
  );
  return { id: result.lastID };
}

async function finishJob(jobId, totalAlumni, totalResults, status = 'completed') {
  const db = await getTrackingDB();
  await db.run(
    `UPDATE tracking_jobs SET finished_at = datetime('now'), status = ?, total_alumni = ?, total_results = ? WHERE id = ?`,
    [status, totalAlumni, totalResults, jobId]
  );
}

async function getJobs(limit = 20) {
  const db = await getTrackingDB();
  return await db.all('SELECT * FROM tracking_jobs ORDER BY id DESC LIMIT ?', [limit]);
}

async function getLatestJob() {
  const db = await getTrackingDB();
  return await db.get('SELECT * FROM tracking_jobs ORDER BY id DESC LIMIT 1');
}

async function saveQuery(jobId, alumniId, alumniName, queryText, source) {
  const db = await getTrackingDB();
  await db.run(
    'INSERT INTO tracking_queries (job_id, alumni_id, alumni_name, query_text, source) VALUES (?, ?, ?, ?, ?)',
    [jobId, alumniId, alumniName, queryText, source]
  );
}

async function getQueriesByJob(jobId) {
  const db = await getTrackingDB();
  return await db.all('SELECT * FROM tracking_queries WHERE job_id = ? ORDER BY id', [jobId]);
}

async function saveResult(result) {
  const db = await getTrackingDB();
  const r = await db.run(
    `INSERT INTO tracking_results 
     (job_id, alumni_id, alumni_name, source, source_url, extracted_name, extracted_title, 
      extracted_company, extracted_location, extracted_activity, raw_snippet, 
      confidence_score, match_classification, cross_validated) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [result.jobId, result.alumniId, result.alumniName, result.source, result.sourceUrl,
     result.extractedName, result.extractedTitle, result.extractedCompany,
     result.extractedLocation, result.extractedActivity, result.rawSnippet,
     result.confidenceScore, result.matchClassification, result.crossValidated ? 1 : 0]
  );
  return { id: r.lastID };
}

async function getPendingResults(limit = 50) {
  const db = await getTrackingDB();
  return await db.all(
    `SELECT * FROM tracking_results WHERE admin_action IS NULL ORDER BY confidence_score DESC LIMIT ?`,
    [limit]
  );
}

async function getResultsByAlumni(alumniId) {
  const db = await getTrackingDB();
  return await db.all(
    'SELECT * FROM tracking_results WHERE alumni_id = ? ORDER BY created_at DESC',
    [alumniId]
  );
}

async function getResultById(id) {
  const db = await getTrackingDB();
  return await db.get('SELECT * FROM tracking_results WHERE id = ?', [id]);
}

async function resolveResult(id, action, note = '') {
  const db = await getTrackingDB();
  await db.run(
    `UPDATE tracking_results SET admin_action = ?, admin_note = ?, resolved_at = datetime('now') WHERE id = ?`,
    [action, note, id]
  );
}

async function getAuditTrail(limit = 100) {
  const db = await getTrackingDB();
  return await db.all(
    `SELECT * FROM tracking_results WHERE admin_action IS NOT NULL ORDER BY resolved_at DESC LIMIT ?`,
    [limit]
  );
}

async function getTrackingStats() {
  const db = await getTrackingDB();
  const total = await db.get('SELECT COUNT(*) as count FROM tracking_results');
  const pending = await db.get('SELECT COUNT(*) as count FROM tracking_results WHERE admin_action IS NULL');
  const approved = await db.get('SELECT COUNT(*) as count FROM tracking_results WHERE admin_action = ?', ['approved']);
  const rejected = await db.get('SELECT COUNT(*) as count FROM tracking_results WHERE admin_action = ?', ['rejected']);
  const strongMatch = await db.get('SELECT COUNT(*) as count FROM tracking_results WHERE match_classification = ?', ['strong_match']);
  const crossValidated = await db.get('SELECT COUNT(*) as count FROM tracking_results WHERE cross_validated = 1');
  const jobs = await db.get('SELECT COUNT(*) as count FROM tracking_jobs');
  const queries = await db.get('SELECT COUNT(*) as count FROM tracking_queries');

  return {
    totalResults: total.count,
    pendingResults: pending.count,
    approvedResults: approved.count,
    rejectedResults: rejected.count,
    strongMatches: strongMatch.count,
    crossValidated: crossValidated.count,
    totalJobs: jobs.count,
    totalQueries: queries.count
  };
}

module.exports = {
  getTrackingDB,
  createJob, finishJob, getJobs, getLatestJob,
  saveQuery, getQueriesByJob,
  saveResult, getPendingResults, getResultsByAlumni, getResultById, resolveResult,
  getAuditTrail, getTrackingStats
};
