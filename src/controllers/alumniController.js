const Alumni  = require('../models/alumniModel');
const xlsx    = require('xlsx');
const { calcCompletenessScore, maskSensitiveData, autoSuggest } = require('../utils/scoring');

// ── Stats cache (TTL: 60 detik) ───────────────────────────────────────────
let _statsCache = null, _statsCacheTime = 0;
const STATS_TTL_MS = 60 * 1000;

async function getCachedStats() {
  const now = Date.now();
  if (_statsCache && (now - _statsCacheTime) < STATS_TTL_MS) return _statsCache;
  _statsCache = await Alumni.getStats();
  _statsCacheTime = now;
  return _statsCache;
}
function invalidateStatsCache() { _statsCache = null; _statsCacheTime = 0; }

const JENIS_OPTIONS  = ['PNS', 'Swasta', 'BUMN', 'Wirausaha', 'Freelance'];
const STATUS_OPTIONS = [
  'Teridentifikasi dari Sumber Publik',
  'Perlu Verifikasi Manual',
  'Belum Ditemukan di Sumber Publik',
];
const TAHUN_OPTIONS  = Array.from({ length: 2025 - 1990 + 1 }, (_, i) => 1990 + i).reverse();

// Helper: apakah request user punya role admin?
const isAdmin = (req) => req.session?.user?.role === 'admin';

// ── GET /data ─────────────────────────────────────────────────────────────
exports.index = async (req, res, next) => {
  try {
    const search         = req.query.search  || '';
    const tahunLulus     = req.query.tahun   || '';
    const jenisPekerjaan = req.query.jenis   || '';
    const statusFilter   = req.query.status  || '';
    const page           = Math.max(1, parseInt(req.query.page) || 1);
    const limit          = 100;
    const filters        = { tahunLulus, jenisPekerjaan, statusFilter };

    const [{ alumniList: rawList, total }, stats] = await Promise.all([
      Alumni.getAllPaginated(search, page, limit, filters),
      getCachedStats(),
    ]);

    // Hitung completeness score & apply masking for viewers
    const admin = isAdmin(req);
    const alumniList = rawList.map(a => {
      const { score, breakdown } = calcCompletenessScore(a);
      const enriched = { ...a, completenessScore: score, completenessBreakdown: breakdown };
      return admin ? enriched : maskSensitiveData(enriched);
    });

    const alert = req.query.alert || null;
    res.render('index', {
      title: 'Data Master - Sistem Pelacakan Alumni',
      alumniList, search, page, totalPages: Math.ceil(total / limit),
      total, stats, filters, alert,
      JENIS_OPTIONS, TAHUN_OPTIONS, STATUS_OPTIONS,
      isAdmin: admin,
    });
  } catch (err) { next(err); }
};

// ── GET /add ─────────────────────────────────────────────────────────────
exports.formAdd = (req, res) => {
  res.render('form', { title: 'Tambah Data Alumni', isEdit: false, alumni: {}, error: null, suggestions: {}, isAdmin: isAdmin(req) });
};

// ── POST /add ─────────────────────────────────────────────────────────────
exports.add = async (req, res, next) => {
  try {
    const alumni = req.body;
    // Auto-update status berdasarkan scoring
    const { classification } = calcCompletenessScore(alumni);
    if (!alumni.status) alumni.status = classification;

    await Alumni.add(alumni);
    invalidateStatsCache();
    res.redirect('/data?alert=add-success');
  } catch (err) { next(err); }
};

// ── GET /edit/:id ─────────────────────────────────────────────────────────
exports.formEdit = async (req, res, next) => {
  try {
    const alumni = await Alumni.getById(req.params.id);
    if (!alumni) return res.status(404).render('error', { title: '404', code: 404, message: 'Data alumni tidak ditemukan.' });

    const { score, breakdown } = calcCompletenessScore(alumni);
    // Auto suggestion
    const allAlumni = await Alumni.getAll('', 500);
    const suggestions = autoSuggest(alumni, allAlumni);

    res.render('form', {
      title: 'Edit Data Alumni', isEdit: true,
      alumni: { ...alumni, completenessScore: score, completenessBreakdown: breakdown },
      suggestions, error: null, isAdmin: isAdmin(req),
    });
  } catch (err) { next(err); }
};

// ── POST /edit/:id ────────────────────────────────────────────────────────
exports.edit = async (req, res, next) => {
  try {
    const alumni = req.body;
    // Re-calculate status from scoring
    const { classification } = calcCompletenessScore(alumni);
    alumni.status = classification;

    await Alumni.update(req.params.id, alumni);
    invalidateStatsCache();
    res.redirect('/data?alert=edit-success');
  } catch (err) { next(err); }
};

// ── GET /delete/:id ───────────────────────────────────────────────────────
exports.delete = async (req, res, next) => {
  try {
    await Alumni.delete(req.params.id);
    invalidateStatsCache();
    res.redirect('/data?alert=delete-success');
  } catch (err) { next(err); }
};

// ── GET / — Laporan ───────────────────────────────────────────────────────
exports.getLaporan = async (req, res, next) => {
  try {
    const [stats, prodiChart, tahunChart, pekChart, topComp] = await Promise.all([
      getCachedStats(),
      Alumni.getProdiDistribution(),
      Alumni.getTahunDistribution(),
      Alumni.getPekerjaanDistribution(),
      Alumni.getTopCompanies(),
    ]);

    // Persentase bekerja
    const persenBekerja = stats.total > 0
      ? Math.round(((stats.bekerja + (stats.wirausaha || 0)) / stats.total) * 100)
      : 0;

    res.render('laporan', {
      title: 'Laporan & Statistik Pelacakan',
      stats, prodiChart, tahunChart, pekChart, topComp, persenBekerja,
      isAdmin: isAdmin(req),
    });
  } catch (err) { next(err); }
};

// ── GET /export ───────────────────────────────────────────────────────────
exports.exportExcel = async (req, res, next) => {
  try {
    const alumniList = await Alumni.getAll();
    const data = alumniList.map(a => ({
      'NIM':              a.nim           || '-',
      'Nama Lengkap':     a.namaLengkap,
      'Prodi':            a.prodi,
      'Fakultas':         a.fakultas      || '-',
      'Tahun Lulus':      a.tahunLulus,
      'Status':           a.status,
      'Completeness (%)': calcCompletenessScore(a).score,
      'Email':            a.email         || '-',
      'No HP/WA':         a.noHp          || '-',
      'LinkedIn':         a.linkedin      || '-',
      'Instagram':        a.instagram     || '-',
      'Facebook':         a.facebook      || '-',
      'TikTok':           a.tiktok        || '-',
      'Tempat Bekerja':   a.tempatKerja   || '-',
      'Posisi':           a.posisi        || '-',
      'Jenis Pekerjaan':  a.jenisPekerjaan|| '-',
      'Alamat Kerja':     a.alamatKerja   || '-',
      'Sosmed Kerja':     a.sosmedTempatKerja || '-',
    }));

    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Data_Alumni');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.attachment(`Data_Alumni_DP4_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.status(200).send(buffer);
  } catch (err) { next(err); }
};

// ── GET /pipeline ─────────────────────────────────────────────────────────
exports.getPipeline = async (req, res, next) => {
  try {
    const fullList = await Alumni.getAll();
    const pendingAlumni = fullList.filter(a =>
      a.status === 'Perlu Verifikasi Manual' ||
      (a.confidenceScore < 70 && a.status !== 'Belum Ditemukan di Sumber Publik')
    );
    res.render('pipeline', { title: 'Data Scraping & Verification Pipeline', pendingAlumni });
  } catch (err) { next(err); }
};

// ── GET /pipeline/resolve/:id ─────────────────────────────────────────────
exports.resolvePipeline = async (req, res, next) => {
  try {
    const { action } = req.query;
    const alumni = await Alumni.getById(req.params.id);
    if (!alumni) return res.redirect('/pipeline');

    if (action === 'approve') {
      alumni.status = 'Teridentifikasi dari Sumber Publik';
      if (alumni.confidenceScore < 70) alumni.confidenceScore = 95;
      alumni.jejak = '[VERIFIED] ' + (alumni.jejak || '');
    } else if (action === 'reject') {
      alumni.status = 'Belum Ditemukan di Sumber Publik';
      alumni.confidenceScore = 0;
      alumni.jejak = '[REJECTED] Removed noisy scraped data.';
    }

    await Alumni.update(req.params.id, alumni);
    invalidateStatsCache();
    res.redirect('/pipeline');
  } catch (err) { next(err); }
};

exports.getImport = (req, res) => {
  res.render('import', {
    title: 'Import Data CSV/Excel',
    preview: null, errors: [], totalRows: 0, columns: [],
    isAdmin: isAdmin(req),
    alertType: req.query.alert || null,
    imported:  req.query.imported || 0,
    skipped:   req.query.skipped  || 0,
  });
};

// ── POST /import/preview ──────────────────────────────────────────────────
exports.previewImport = async (req, res, next) => {
  try {
    if (!req.file) return res.redirect('/import?alert=no-file');

    const wb    = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws    = wb.Sheets[wb.SheetNames[0]];
    const rows  = xlsx.utils.sheet_to_json(ws, { defval: null, raw: false });

    const MAX_PREVIEW = 200;
    const preview = rows.slice(0, MAX_PREVIEW);
    const errors  = [];

    preview.forEach((row, i) => {
      const rowNum = i + 2; // header is row 1
      // Nama wajib ada
      const nama = row['Nama Lulusan'] || row['nama'] || row['Nama'];
      if (!nama) errors.push({ row: rowNum, field: 'Nama', msg: 'Nama wajib diisi' });

      // Validasi NIM format angka
      const nim = row['NIM'] || row['nim'];
      if (nim && isNaN(String(nim).replace(/\s/g, ''))) {
        errors.push({ row: rowNum, field: 'NIM', msg: 'NIM harus berupa angka' });
      }

      // Validasi tahun masuk
      const tahun = parseInt(row['Tahun Masuk'] || row['tahun_masuk']);
      if (tahun && (tahun < 1960 || tahun > 2030)) {
        errors.push({ row: rowNum, field: 'Tahun Masuk', msg: `Tahun masuk tidak valid: ${tahun}` });
      }
    });

    // Simpan ke session sementara untuk konfirmasi import
    req.session.importData = rows;

    res.render('import', {
      title: 'Import Data CSV/Excel',
      preview: preview.slice(0, 20), // tampilkan 20 baris pertama
      totalRows: rows.length,
      errors: errors.slice(0, 50),
      columns: Object.keys(rows[0] || {}),
      isAdmin: isAdmin(req),
    });
  } catch (err) { next(err); }
};

// ── POST /import/confirm ──────────────────────────────────────────────────
exports.confirmImport = async (req, res, next) => {
  try {
    const rows = req.session.importData;
    if (!rows || rows.length === 0) return res.redirect('/import?alert=no-data');

    let imported = 0, skipped = 0;

    for (const row of rows) {
      try {
        const nama = row['Nama Lulusan'] || row['nama'] || row['Nama'] || '';
        if (!nama.trim()) { skipped++; continue; }

        const alumniData = {
          namaLengkap:      nama.trim(),
          nim:              row['NIM'] || row['nim'] || '',
          tahunMasuk:       parseInt(row['Tahun Masuk'] || row['tahun_masuk']) || null,
          tahunLulus:       row['Tanggal Lulus'] || row['tanggal_lulus'] || null,
          fakultas:         row['Fakultas'] || row['fakultas'] || '',
          prodi:            row['Program Studi'] || row['prodi'] || row['Prodi'] || '',
          kampus:           row['Kampus'] || 'Universitas Muhammadiyah Malang',
          email:            row['Email'] || row['email'] || null,
          noHp:             row['No HP'] || row['no_hp'] || null,
          linkedin:         row['LinkedIn'] || row['linkedin'] || null,
          instagram:        row['Instagram'] || row['instagram'] || null,
          facebook:         row['Facebook'] || row['facebook'] || null,
          tiktok:           row['TikTok'] || row['tiktok'] || null,
          tempatKerja:      row['Tempat Kerja'] || row['tempat_kerja'] || null,
          alamatKerja:      row['Alamat Kerja'] || row['alamat_kerja'] || null,
          posisi:           row['Posisi'] || row['posisi'] || null,
          jenisPekerjaan:   row['Jenis Pekerjaan'] || row['jenis_pekerjaan'] || null,
          sosmedTempatKerja:row['Sosmed Tempat Kerja'] || row['sosmed_tempat_kerja'] || null,
        };

        // Auto-classify status dari scoring
        const { classification } = calcCompletenessScore(alumniData);
        alumniData.status = classification;

        await Alumni.add(alumniData);
        imported++;
      } catch (_) { skipped++; }
    }

    delete req.session.importData;
    invalidateStatsCache();
    res.redirect(`/import?alert=import-success&imported=${imported}&skipped=${skipped}`);
  } catch (err) { next(err); }
};
