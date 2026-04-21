const Alumni = require('../models/alumniModel');
const xlsx = require('xlsx');

// ── Helper: Hitung statistik dari daftar alumni ───────────────────────────
// Dijalankan sekali, menghindari duplikasi logika di beberapa controller.
function computeAlumniStats(list) {
  const total = list.length;
  const teridentifikasi = list.filter(a => a.status === 'Teridentifikasi dari Sumber Publik').length;
  const perluVerifikasi  = list.filter(a => a.status === 'Perlu Verifikasi Manual').length;
  const belumDitemukan   = list.filter(a => a.status === 'Belum Ditemukan di Sumber Publik').length;

  const bekerja = list.filter(a => {
    if (['PNS', 'Swasta', 'BUMN'].includes(a.jenisPekerjaan)) return true;
    if (!a.jenisPekerjaan && a.jejak) {
      const j = a.jejak.toLowerCase();
      return j.includes('pt') || j.includes('bank') || j.includes('konsultan') ||
             j.includes('staff') || j.includes('pns') || j.includes('dinas');
    }
    return false;
  }).length;

  const wirausaha = list.filter(a => {
    if (['Wirausaha', 'Freelance'].includes(a.jenisPekerjaan)) return true;
    if (!a.jenisPekerjaan && a.jejak) {
      const j = a.jejak.toLowerCase();
      return j.includes('owner') || j.includes('founder') ||
             j.includes('wirausaha') || j.includes('freelance');
    }
    return false;
  }).length;

  return { total, teridentifikasi, perluVerifikasi, belumDitemukan, bekerja, wirausaha };
}

// ── Simple in-memory stats cache (TTL: 60 detik) ─────────────────────────
let _statsCache = null;
let _statsCacheTime = 0;
const STATS_TTL_MS = 60 * 1000;

async function getCachedStats() {
  const now = Date.now();
  if (_statsCache && (now - _statsCacheTime) < STATS_TTL_MS) {
    return _statsCache;
  }
  const fullList = await Alumni.getAll();
  _statsCache = computeAlumniStats(fullList);
  _statsCacheTime = now;
  return _statsCache;
}

function invalidateStatsCache() {
  _statsCache = null;
  _statsCacheTime = 0;
}

// ── GET /data — Data Master ───────────────────────────────────────────────
exports.index = async (req, res) => {
  try {
    const search = req.query.search || '';
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = 50;

    // Jalankan paginated query + stats dari cache secara paralel
    const [{ alumniList, total }, stats] = await Promise.all([
      Alumni.getAllPaginated(search, page, limit),
      getCachedStats(),
    ]);

    const totalPages = Math.ceil(total / limit);
    res.render('index', {
      title: 'Data Master - Sistem Pelacakan Alumni',
      alumniList, search, page, totalPages, total, stats,
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
// [PERF-1] Gunakan stats cache — tidak perlu fetch semua baris lagi
exports.getLaporan = async (req, res, next) => {
  try {
    const [stats, fullList] = await Promise.all([
      getCachedStats(),
      Alumni.getAll(),
    ]);

    // Distribusi per Prodi (untuk bar chart)
    const prodiMap = {};
    fullList.forEach(a => {
      if (!a.prodi) return;
      prodiMap[a.prodi] = (prodiMap[a.prodi] || 0) + 1;
    });
    const prodiChart = Object.entries(prodiMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // top 10 prodi

    // Distribusi per tahun lulus
    const tahunMap = {};
    fullList.forEach(a => {
      if (!a.tahunLulus) return;
      tahunMap[a.tahunLulus] = (tahunMap[a.tahunLulus] || 0) + 1;
    });
    const tahunChart = Object.entries(tahunMap).sort((a, b) => a[0] - b[0]);

    res.render('laporan', {
      title: 'Laporan & Statistik Pelacakan',
      stats,
      prodiChart,
      tahunChart,
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
