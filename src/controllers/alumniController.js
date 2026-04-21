const Alumni = require('../models/alumniModel');
const xlsx   = require('xlsx');

// ── In-memory stats cache (TTL: 60 detik) ────────────────────────────────
// getCachedStats memanggil Alumni.getStats() yang menjalankan query agregat
// di server (COUNT + GROUP BY), bukan fetch semua baris.
let _statsCache = null;
let _statsCacheTime = 0;
const STATS_TTL_MS = 60 * 1000;

async function getCachedStats() {
  const now = Date.now();
  if (_statsCache && (now - _statsCacheTime) < STATS_TTL_MS) return _statsCache;
  _statsCache = await Alumni.getStats(); // ← server-side aggregate, bukan getAll()
  _statsCacheTime = now;
  return _statsCache;
}

function invalidateStatsCache() {
  _statsCache = null;
  _statsCacheTime = 0;
}

// Opsi filter statis (dipassing ke view untuk membangun UI dropdown)
const JENIS_OPTIONS = ['PNS', 'Swasta', 'BUMN', 'Wirausaha', 'Freelance'];
const TAHUN_OPTIONS = Array.from({ length: 2025 - 1990 + 1 }, (_, i) => 1990 + i).reverse(); // 2025..1990

// ── GET /data — Data Master ───────────────────────────────────────────────
exports.index = async (req, res, next) => {
  try {
    const search        = req.query.search        || '';
    const tahunLulus    = req.query.tahun         || '';
    const jenisPekerjaan= req.query.jenis         || '';
    const page          = Math.max(1, parseInt(req.query.page) || 1);
    const limit         = 100;

    const filters = { tahunLulus, jenisPekerjaan };

    // Paginated query + stats berjalan paralel
    const [{ alumniList, total }, stats] = await Promise.all([
      Alumni.getAllPaginated(search, page, limit, filters),
      getCachedStats(),
    ]);

    const totalPages = Math.ceil(total / limit);
    res.render('index', {
      title: 'Data Master - Sistem Pelacakan Alumni',
      alumniList, search, page, totalPages, total, stats,
      filters, JENIS_OPTIONS, TAHUN_OPTIONS,
    });
  } catch (err) {
    console.error('[Controller] index error:', err);
    next(err);
  }
};

// ── GET /add — Form Tambah ─────────────────────────────────────────────────
exports.formAdd = (req, res) => {
  res.render('form', { title: 'Tambah Data Alumni', isEdit: false, alumni: {}, error: null });
};

// ── POST /add ──────────────────────────────────────────────────────────────
exports.add = async (req, res, next) => {
  try {
    await Alumni.add(req.body);
    invalidateStatsCache();
    res.redirect('/data?alert=add-success');
  } catch (err) {
    console.error('[Controller] add error:', err);
    next(err);
  }
};

// ── GET /edit/:id — Form Edit ──────────────────────────────────────────────
exports.formEdit = async (req, res, next) => {
  try {
    const alumni = await Alumni.getById(req.params.id);
    if (!alumni) return res.status(404).render('error', { title: '404', code: 404, message: 'Data alumni tidak ditemukan.' });
    res.render('form', { title: 'Edit Data Alumni', isEdit: true, alumni, error: null });
  } catch (err) {
    console.error('[Controller] formEdit error:', err);
    next(err);
  }
};

// ── POST /edit/:id ─────────────────────────────────────────────────────────
exports.edit = async (req, res, next) => {
  try {
    await Alumni.update(req.params.id, req.body);
    invalidateStatsCache();
    res.redirect('/data?alert=edit-success');
  } catch (err) {
    console.error('[Controller] edit error:', err);
    next(err);
  }
};

// ── GET /delete/:id ────────────────────────────────────────────────────────
exports.delete = async (req, res, next) => {
  try {
    await Alumni.delete(req.params.id);
    invalidateStatsCache();
    res.redirect('/data?alert=delete-success');
  } catch (err) {
    console.error('[Controller] delete error:', err);
    next(err);
  }
};

// ── GET / — Laporan & Statistik ───────────────────────────────────────────
exports.getLaporan = async (req, res, next) => {
  try {
    // Semua query berjalan paralel di server — tidak ada getAll()
    const [stats, prodiChart, tahunChart] = await Promise.all([
      getCachedStats(),                  // aggregate COUNT (sangat cepat)
      Alumni.getProdiDistribution(),     // GROUP BY prodi LIMIT 10
      Alumni.getTahunDistribution(),     // GROUP BY tahun_lulus
    ]);

    res.render('laporan', {
      title: 'Laporan & Statistik Pelacakan',
      stats, prodiChart, tahunChart,
    });
  } catch (err) {
    console.error('[Controller] getLaporan error:', err);
    next(err);
  }
};

// ── GET /export — Export Excel ────────────────────────────────────────────
exports.exportExcel = async (req, res, next) => {
  try {
    const alumniList = await Alumni.getAll();
    const data = alumniList.map(a => ({
      'NIM':               a.nim         || '-',
      'Nama Lengkap':      a.namaLengkap,
      'Prodi':             a.prodi,
      'Fakultas':          a.fakultas    || '-',
      'Tahun Lulus':       a.tahunLulus,
      'Status Pelacakan':  a.status,
      'Confidence Score':  a.confidenceScore,
      'Email':             a.email       || '-',
      'No HP/WA':          a.noHp        || '-',
      'LinkedIn':          a.linkedin    || '-',
      'Tempat Bekerja':    a.tempatKerja || '-',
      'Posisi':            a.posisi      || '-',
      'Jenis Pekerjaan':   a.jenisPekerjaan || '-',
      'Alamat Kerja':      a.alamatKerja || '-',
    }));

    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Data_Alumni');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.attachment(`Data_Alumni_DP4_${new Date().toISOString().slice(0,10)}.xlsx`);
    res.status(200).send(buffer);
  } catch (err) {
    console.error('[Controller] exportExcel error:', err);
    next(err);
  }
};

// ── GET /pipeline ──────────────────────────────────────────────────────────
exports.getPipeline = async (req, res, next) => {
  try {
    const fullList = await Alumni.getAll();
    const pendingAlumni = fullList.filter(a =>
      a.status === 'Perlu Verifikasi Manual' ||
      (a.confidenceScore < 70 && a.status !== 'Belum Ditemukan di Sumber Publik')
    );
    res.render('pipeline', {
      title: 'Data Scraping & Verification Pipeline',
      pendingAlumni,
    });
  } catch (err) {
    console.error('[Controller] getPipeline error:', err);
    next(err);
  }
};

// ── GET /pipeline/resolve/:id ──────────────────────────────────────────────
exports.resolvePipeline = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.query;
    const alumni = await Alumni.getById(id);
    if (!alumni) return res.redirect('/pipeline');

    if (action === 'approve') {
      alumni.status = 'Teridentifikasi dari Sumber Publik';
      if (alumni.confidenceScore < 70) alumni.confidenceScore = 95;
      alumni.jejak = '[VERIFIED] ' + (alumni.jejak || '');
    } else if (action === 'reject') {
      alumni.status = 'Belum Ditemukan di Sumber Publik';
      alumni.confidenceScore = 0;
      alumni.jejak = '[REJECTED - False Positive Match] Removed noisy scraped data.';
    }

    await Alumni.update(id, alumni);
    invalidateStatsCache();
    res.redirect('/pipeline');
  } catch (err) {
    console.error('[Controller] resolvePipeline error:', err);
    next(err);
  }
};
