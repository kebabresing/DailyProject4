-- =============================================================
-- Alumni Tracker — Supabase Setup Script
-- Jalankan di: Supabase Dashboard > SQL Editor
-- =============================================================

-- ── 1. INDEXES (Wajib untuk performa 100k+ data) ─────────────
-- Aktifkan pg_trgm extension untuk mendukung ILIKE yang cepat (% prefix & suffix)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index trigram untuk kolom yang sering dicari dengan ILIKE
CREATE INDEX IF NOT EXISTS idx_alumni_nama_trgm
    ON alumni USING gin(nama_lengkap gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alumni_nim_trgm
    ON alumni USING gin(nim gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alumni_prodi_trgm
    ON alumni USING gin(prodi gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alumni_fakultas_trgm
    ON alumni USING gin(fakultas gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alumni_prodi
    ON alumni(prodi);

CREATE INDEX IF NOT EXISTS idx_alumni_tahun_lulus
    ON alumni(tahun_lulus);

CREATE INDEX IF NOT EXISTS idx_alumni_jenis_pekerjaan
    ON alumni(jenis_pekerjaan);

-- Composite index: paling sering dipakai di getAlumniPaginated
CREATE INDEX IF NOT EXISTS idx_alumni_status_id
    ON alumni(status, id DESC);


-- ── 2. TRACKING TABLE INDEXES ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tracking_results_admin_action
    ON tracking_results(admin_action);

CREATE INDEX IF NOT EXISTS idx_tracking_results_alumni_id
    ON tracking_results(alumni_id);

CREATE INDEX IF NOT EXISTS idx_tracking_results_confidence
    ON tracking_results(confidence_score DESC);


-- ── 3. RPC: get_alumni_stats ──────────────────────────────────
-- Menghitung semua statistik dalam SATU query (sangat cepat dengan index)
-- Dipanggil via: supabase.rpc('get_alumni_stats')

CREATE OR REPLACE FUNCTION get_alumni_stats()
RETURNS JSON
LANGUAGE SQL
STABLE  -- Boleh di-cache oleh query planner
AS $$
  SELECT json_build_object(
    'total',           COUNT(*),
    'teridentifikasi', COUNT(*) FILTER (WHERE status = 'Teridentifikasi dari Sumber Publik'),
    'perluVerifikasi', COUNT(*) FILTER (WHERE status = 'Perlu Verifikasi Manual'),
    'belumDitemukan',  COUNT(*) FILTER (WHERE status = 'Belum Ditemukan di Sumber Publik'),
    'bekerja',         COUNT(*) FILTER (WHERE jenis_pekerjaan IN ('PNS', 'Swasta', 'BUMN')),
    'wirausaha',       COUNT(*) FILTER (WHERE jenis_pekerjaan IN ('Wirausaha', 'Freelance'))
  )
  FROM alumni;
$$;


-- ── 4. RPC: get_prodi_distribution ───────────────────────────
-- Distribusi alumni per program studi (top 10)
-- Dipanggil via: supabase.rpc('get_prodi_distribution')

CREATE OR REPLACE FUNCTION get_prodi_distribution()
RETURNS TABLE(prodi TEXT, count BIGINT)
LANGUAGE SQL
STABLE
AS $$
  SELECT prodi, COUNT(*) AS count
  FROM alumni
  WHERE prodi IS NOT NULL AND prodi <> ''
  GROUP BY prodi
  ORDER BY count DESC
  LIMIT 10;
$$;


-- ── 5. RPC: get_tahun_distribution ───────────────────────────
-- Distribusi alumni per tahun kelulusan
-- Dipanggil via: supabase.rpc('get_tahun_distribution')

CREATE OR REPLACE FUNCTION get_tahun_distribution()
RETURNS TABLE(tahun_lulus INTEGER, count BIGINT)
LANGUAGE SQL
STABLE
AS $$
  SELECT tahun_lulus, COUNT(*) AS count
  FROM alumni
  WHERE tahun_lulus IS NOT NULL AND tahun_lulus > 0
  GROUP BY tahun_lulus
  ORDER BY tahun_lulus ASC;
$$;


-- ── 6. Tracking Tables (buat jika belum ada) ─────────────────
CREATE TABLE IF NOT EXISTS tracking_jobs (
  id            SERIAL PRIMARY KEY,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'running',
  total_alumni  INTEGER DEFAULT 0,
  total_results INTEGER DEFAULT 0,
  triggered_by  TEXT DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS tracking_queries (
  id          SERIAL PRIMARY KEY,
  job_id      INTEGER NOT NULL REFERENCES tracking_jobs(id),
  alumni_id   INTEGER NOT NULL,
  alumni_name TEXT NOT NULL,
  query_text  TEXT NOT NULL,
  source      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracking_results (
  id                   SERIAL PRIMARY KEY,
  job_id               INTEGER NOT NULL REFERENCES tracking_jobs(id),
  alumni_id            INTEGER NOT NULL,
  alumni_name          TEXT NOT NULL,
  source               TEXT NOT NULL,
  source_url           TEXT,
  extracted_name       TEXT,
  extracted_title      TEXT,
  extracted_company    TEXT,
  extracted_location   TEXT,
  extracted_activity   TEXT,
  raw_snippet          TEXT,
  confidence_score     INTEGER DEFAULT 0,
  match_classification TEXT DEFAULT 'needs_verification',
  cross_validated      BOOLEAN DEFAULT FALSE,
  admin_action         TEXT,
  admin_note           TEXT,
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Verifikasi: Cek semua index berhasil dibuat ──────────────
SELECT indexname, tablename FROM pg_indexes
WHERE tablename IN ('alumni', 'tracking_results', 'tracking_queries')
ORDER BY tablename, indexname;
