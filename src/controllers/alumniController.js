const Alumni = require('../models/alumniModel');
const xlsx = require('xlsx');

exports.index = async (req, res) => {
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 50;
  const { alumniList, total } = await Alumni.getAllPaginated(search, page, limit);
  const totalPages = Math.ceil(total / limit);
  
  const fullList = await Alumni.getAll();
  const teridentifikasi = fullList.filter(a => a.status === 'Teridentifikasi dari Sumber Publik').length;
  
  // Hitung "Bekerja" dari field eksplisit ATAU dari ekstraksi teks jejak riwayat
  const bekerja = fullList.filter(a => {
      if (['PNS', 'Swasta', 'BUMN'].includes(a.jenisPekerjaan)) return true;
      if (!a.jenisPekerjaan && a.jejak) {
          const j = a.jejak.toLowerCase();
          return j.includes('pt') || j.includes('bank') || j.includes('konsultan') || j.includes('staff') || j.includes('pns') || j.includes('dinas');
      }
      return false;
  }).length;

  // Hitung "Wirausaha" dari field eksplisit ATAU dari ekstraksi teks jejak riwayat
  const wirausaha = fullList.filter(a => {
      if (['Wirausaha', 'Freelance'].includes(a.jenisPekerjaan)) return true;
      if (!a.jenisPekerjaan && a.jejak) {
          const j = a.jejak.toLowerCase();
          return j.includes('owner') || j.includes('founder') || j.includes('wirausaha') || j.includes('freelance');
      }
      return false;
  }).length;

  res.render('index', { 
      title: 'Data Master - Sistem Pelacakan Alumni', 
      alumniList, search, page, totalPages, total,
      stats: { total: fullList.length, teridentifikasi, bekerja, wirausaha }
  });
};

exports.formAdd = (req, res) => {
  res.render('form', { title: 'Tambah Data Alumni', isEdit: false, alumni: {} });
};

exports.add = async (req, res) => {
  await Alumni.add(req.body);
  res.redirect('/data');
};

exports.formEdit = async (req, res) => {
  const alumni = await Alumni.getById(req.params.id);
  if (!alumni) return res.status(404).send('Alumni not found');
  res.render('form', { title: 'Edit Data Alumni', isEdit: true, alumni });
};

exports.edit = async (req, res) => {
  await Alumni.update(req.params.id, req.body);
  res.redirect('/data');
};

exports.delete = async (req, res) => {
  await Alumni.delete(req.params.id);
  res.redirect('/data');
};


exports.getLaporan = async (req, res) => {
  const alumniList = await Alumni.getAll();
  
  // Calculate basic statistics
  const total = alumniList.length;
  const teridentifikasi = alumniList.filter(a => a.status === 'Teridentifikasi dari Sumber Publik').length;
  const perluVerifikasi = alumniList.filter(a => a.status === 'Perlu Verifikasi Manual').length;
  const belumDitemukan = alumniList.filter(a => a.status === 'Belum Ditemukan di Sumber Publik').length;

  res.render('laporan', { 
    title: 'Laporan & Statistik Pelacakan', 
    stats: { total, teridentifikasi, perluVerifikasi, belumDitemukan }
  });
};

exports.exportExcel = async (req, res) => {
  const alumniList = await Alumni.getAll();
  const data = alumniList.map(a => ({
    'NIM': a.nim,
    'Nama Lengkap': a.namaLengkap,
    'Prodi': a.prodi,
    'Tahun Lulus': a.tahunLulus,
    'Status Pelacakan': a.status,
    'Email': a.email || '-',
    'No HP/WA': a.noHp || '-',
    'LinkedIn': a.linkedin || '-',
    'Tempat Bekerja': a.tempatKerja || '-',
    'Posisi': a.posisi || '-',
    'Jenis Pekerjaan': a.jenisPekerjaan || '-',
    'Alamat Bekerja': a.alamatKerja || '-'
  }));

  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Data_Alumni");
  
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.attachment('Data_Alumni_DP4_Report.xlsx');
  res.status(200).send(buffer);
};

exports.getPipeline = async (req, res) => {
  const fullList = await Alumni.getAll();
  // Simulate active staging pipeline using unverified records
  const pendingAlumni = fullList.filter(a => a.status === 'Perlu Verifikasi Manual' || a.confidenceScore < 70 && a.status !== 'Belum Ditemukan di Sumber Publik');
  
  res.render('pipeline', { 
    title: 'Data Scraping & Verification Pipeline', 
    pendingAlumni
  });
};

exports.resolvePipeline = async (req, res) => {
  const { id } = req.params;
  const { action } = req.query; // 'approve' or 'reject'
  
  const alumni = await Alumni.getById(id);
  if (!alumni) return res.redirect('/pipeline');

  if (action === 'approve') {
    alumni.status = 'Teridentifikasi dari Sumber Publik';
    if(alumni.confidenceScore < 70) alumni.confidenceScore = 95; // Boost score due to manual verification
    alumni.jejak = '[VERIFIED] ' + alumni.jejak;
  } else if (action === 'reject') {
    alumni.status = 'Belum Ditemukan di Sumber Publik';
    alumni.confidenceScore = 0;
    alumni.jejak = '[REJECTED - False Positive Match] Removed noisy scraped data.';
  }

  await Alumni.update(id, alumni);
  res.redirect('/pipeline');
};
