
-- ── 0. BIKIN/UPDATE TABEL ALUMNIV2 ───────────────────────────
CREATE TABLE IF NOT EXISTS alumniv2 (
  id SERIAL PRIMARY KEY,
  nama TEXT,
  nim BIGINT,
  tahun_masuk INTEGER,
  tanggal_lulus INTEGER,
  fakultas TEXT,
  prodi TEXT
);

-- Pastikan semua kolom yang dibutuhkan aplikasi tersedia
ALTER TABLE alumniv2
  ADD COLUMN IF NOT EXISTS kampus TEXT DEFAULT 'Universitas Muhammadiyah Malang',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Belum Ditemukan di Sumber Publik',
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jejak TEXT,
  ADD COLUMN IF NOT EXISTS linkedin TEXT,
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS facebook TEXT,
  ADD COLUMN IF NOT EXISTS tiktok TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS no_hp TEXT,
  ADD COLUMN IF NOT EXISTS tempat_kerja TEXT,
  ADD COLUMN IF NOT EXISTS alamat_kerja TEXT,
  ADD COLUMN IF NOT EXISTS posisi TEXT,
  ADD COLUMN IF NOT EXISTS jenis_pekerjaan TEXT,
  ADD COLUMN IF NOT EXISTS sosmed_tempat_kerja TEXT;

-- =============================================================
-- Alumni Tracker — Supabase Setup Script
-- Jalankan di: Supabase Dashboard > SQL Editor
-- =============================================================

-- ── 1. INDEXES (Wajib untuk performa 100k+ data) ─────────────
-- Aktifkan pg_trgm extension untuk mendukung ILIKE yang cepat (% prefix & suffix)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index trigram untuk kolom yang sering dicari dengan ILIKE
CREATE INDEX IF NOT EXISTS idx_alumni_nama_trgm
    ON alumniv2 USING gin(nama gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alumni_nim_trgm
    ON alumniv2 USING gin((nim::text) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alumni_prodi_trgm
    ON alumniv2 USING gin(prodi gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alumni_fakultas_trgm
    ON alumniv2 USING gin(fakultas gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alumni_prodi
    ON alumniv2(prodi);

CREATE INDEX IF NOT EXISTS idx_alumni_tanggal_lulus
    ON alumniv2(tanggal_lulus);

CREATE INDEX IF NOT EXISTS idx_alumni_jenis_pekerjaan
    ON alumniv2(jenis_pekerjaan);

-- Composite index: paling sering dipakai di getAlumniPaginated
CREATE INDEX IF NOT EXISTS idx_alumni_status_id
    ON alumniv2(status, id DESC);



-- ── 1.5 Tracking Tables (buat jika belum ada) ─────────────────
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
  FROM alumniv2;
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
  FROM alumniv2
  WHERE prodi IS NOT NULL AND prodi <> ''
  GROUP BY prodi
  ORDER BY count DESC
  LIMIT 10;
$$;


-- ── 5. RPC: get_tahun_distribution ───────────────────────────
-- Distribusi alumni per tahun kelulusan
-- Dipanggil via: supabase.rpc('get_tahun_distribution')

CREATE OR REPLACE FUNCTION get_tahun_distribution()
RETURNS TABLE(tanggal_lulus INTEGER, count BIGINT)
LANGUAGE SQL
STABLE
AS $$
  SELECT tanggal_lulus, COUNT(*) AS count
  FROM alumniv2
  WHERE tanggal_lulus IS NOT NULL AND tanggal_lulus > 0
  GROUP BY tanggal_lulus
  ORDER BY tanggal_lulus ASC;
$$;



-- ── Verifikasi: Cek semua index berhasil dibuat ──────────────
SELECT indexname, tablename FROM pg_indexes
WHERE tablename IN ('alumniv2', 'tracking_results', 'tracking_queries')
ORDER BY tablename, indexname;
