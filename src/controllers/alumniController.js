const Alumni = require('../models/alumniModel');

exports.index = async (req, res) => {
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 50;
  const { alumniList, total } = await Alumni.getAllPaginated(search, page, limit);
  const totalPages = Math.ceil(total / limit);
  res.render('index', { title: 'Data Master - Sistem Pelacakan Alumni', alumniList, search, page, totalPages, total });
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

exports.simulateBot = async (req, res) => {
  // Generator 1000 data alumni unik
  const namaDepan = ['Ahmad','Budi','Citra','Deni','Elvira','Fajar','Gita','Hendra','Indah','Joko','Kiki','Lukman','Mega','Nadia','Oki','Putri','Rizal','Siti','Taufik','Umar','Vina','Wahyu','Yoga','Zahra','Arief','Dewi','Eko','Fitria','Galih','Hasan','Ilham','Kartika','Laila','Maya','Nurul','Rina','Siska','Tiara','Winda','Yusuf','Adi','Bayu','Dimas','Endah','Faisal','Anisa','Rendi','Ratih','Bagus','Amira','Devi','Anton','Novia','Surya','Lina','Raka','Sari','Dian','Agus','Nia'];
  const namaBelakang = ['Pratama','Saputra','Wulandari','Hidayat','Kusuma','Ramadhan','Fitriani','Maulana','Permata','Setiawan','Anggraeni','Rahman','Lestari','Nugroho','Amalia','Kurniawan','Sari','Aditya','Basri','Zahra','Firmansyah','Marlina','Hakim','Wijaya','Sasmita','Putra','Rahayu','Puspita','Wicaksono','Hendrawan','Azzahra','Santoso','Cahyani','Utami','Prasetyo','Handayani','Suryani','Wahyudi','Gunawan','Susanti'];
  const prodiList = ['Informatika','Sistem Informasi','Teknik Elektro','Teknik Mesin','Teknik Sipil','Teknik Industri','Teknik Komputer','Hukum','Manajemen','Akuntansi','Ekonomi Pembangunan','Ilmu Komunikasi','Psikologi','Sosiologi','Ilmu Pemerintahan','Pendidikan Dokter','Farmasi','Keperawatan','Kedokteran Gigi','Pendidikan Bahasa Inggris','Pendidikan Matematika','PGSD','Agroteknologi','Agribisnis','Biologi','DKV','Pendidikan Agama Islam','Teknik Informatika'];
  const sumberList = [
    'LinkedIn (Bot): Profil terverifikasi sebagai alumni UMM.',
    'Google Scholar (Bot): Publikasi ilmiah afiliasi UMM ditemukan.',
    'ResearchGate (Bot): Profil peneliti, riwayat pendidikan UMM.',
    'Instagram (Bot): Bio menyebutkan almamater UMM.',
    'Situs Perusahaan (Bot): Data karyawan lulusan UMM.',
    'SINTA (Bot): Terdaftar sebagai peneliti afiliasi UMM.',
    'Facebook (Bot): Postingan wisuda UMM terverifikasi.',
    'Twitter / X (Bot): Profil menyebutkan alumni UMM.',
    'GitHub (Bot): Repository/profil mencantumkan alumni UMM.',
    'Behance (Bot): Portfolio desainer, bio alumni UMM.',
    'Situs RS/IDI (Bot): Tenaga medis terdaftar, lulusan UMM.',
    'Web Kemenag (Bot): Guru bersertifikasi, alumni UMM.',
    'Situs Dapodik (Bot): Tenaga pendidik alumni UMM.',
    'ORCID (Bot): Profil akademik dengan afiliasi UMM.',
    'Jobstreet (Bot): CV online mencantumkan pendidikan di UMM.'
  ];

  const currentData = await Alumni.getAll();
  const existingNames = new Set(currentData.map(a => a.namaLengkap));
  let addedCount = 0;

  // Generate bertahap: 5-10 alumni baru per klik, target 2300
  const targetTotal = 2300;
  const batchSize = Math.floor(Math.random() * 6) + 5; // 5-10 per klik
  const needed = Math.min(batchSize, targetTotal - currentData.length);

  if (needed > 0) {
    for (let i = 0; i < needed; i++) {
      let nama;
      let attempts = 0;
      // Pastikan nama unik
      do {
        const depan = namaDepan[Math.floor(Math.random() * namaDepan.length)];
        const belakang = namaBelakang[Math.floor(Math.random() * namaBelakang.length)];
        // Tambah angka jika sudah banyak kombinasi terpakai
        const suffix = attempts > 5 ? ` ${String.fromCharCode(65 + (i % 26))}` : '';
        nama = `${depan} ${belakang}${suffix}`;
        attempts++;
      } while (existingNames.has(nama) && attempts < 20);

      if (existingNames.has(nama)) continue;
      existingNames.add(nama);

      const prodi = prodiList[Math.floor(Math.random() * prodiList.length)];
      const tahun = 2015 + Math.floor(Math.random() * 10); // 2015-2024
      const jejak = sumberList[Math.floor(Math.random() * sumberList.length)];

      // Distribusi status realistis: 70% teridentifikasi, 20% perlu verifikasi, 10% belum ditemukan
      const rand = Math.random();
      let status, score;
      if (rand < 0.70) {
        status = 'Teridentifikasi dari Sumber Publik';
        score = Math.floor(Math.random() * 25) + 75; // 75-99
      } else if (rand < 0.90) {
        status = 'Perlu Verifikasi Manual';
        score = Math.floor(Math.random() * 30) + 35; // 35-64
      } else {
        status = 'Belum Ditemukan di Sumber Publik';
        score = Math.floor(Math.random() * 25) + 5;  // 5-29
      }
      // Generate NIM realistis: tahunMasuk + kode prodi + sequence
      const tahunMasuk = tahun - 4; // asumsi 4 tahun kuliah
      const prodiCode = String(prodiList.indexOf(prodi) + 1).padStart(2, '0');
      const seq = String(i + 16).padStart(3, '0');
      const nim = `${tahunMasuk}10370311${prodiCode}${seq}`;

      await Alumni.add({
        nim,
        namaLengkap: nama,
        prodi,
        tahunLulus: tahun,
        kampus: 'Universitas Muhammadiyah Malang',
        status,
        confidenceScore: score,
        jejak
      });
      addedCount++;
    }
  }

  if (addedCount > 0) {
    res.redirect('/data?alert=bot-success');
  } else {
    res.redirect('/data?alert=bot-exist');
  }
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
