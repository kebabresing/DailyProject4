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
  const bekerja = fullList.filter(a => ['PNS', 'Swasta', 'BUMN'].includes(a.jenisPekerjaan)).length;
  const wirausaha = fullList.filter(a => ['Wirausaha', 'Freelance'].includes(a.jenisPekerjaan)).length;

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
