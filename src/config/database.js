const path = require('path');
const isVercel = process.env.VERCEL === '1';
const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY &&
  !process.env.SUPABASE_URL.includes('xxxxxxxx'));

// Data fallback kosong — semua data bersumber dari Supabase
const fullSeedData = [];



// ============================================================
// MODE 1: In-Memory Database (untuk Vercel / Serverless)
// ============================================================
function createMemoryDB() {
  let data = JSON.parse(JSON.stringify(fullSeedData));
  let nextId = data.length + 1;

  return {
    getAlumni: async (searchQuery = '') => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return data.filter(a =>
          a.namaLengkap.toLowerCase().includes(q) ||
          a.prodi.toLowerCase().includes(q) ||
          a.kampus.toLowerCase().includes(q) ||
          a.status.toLowerCase().includes(q)
        ).sort((a, b) => b.id - a.id);
      }
      return [...data].sort((a, b) => b.id - a.id);
    },
    getAlumniPaginated: async (searchQuery = '', page = 1, limit = 50) => {
      let filtered = searchQuery
        ? data.filter(a =>
            a.namaLengkap.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (a.prodi||'').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (a.status||'').toLowerCase().includes(searchQuery.toLowerCase())
          )
        : [...data];
      filtered.sort((a, b) => b.id - a.id);
      const total = filtered.length;
      const alumniList = filtered.slice((page - 1) * limit, page * limit);
      return { alumniList, total };
    },
    getAlumniById: async (id) => {
      return data.find(a => a.id === parseInt(id)) || null;
    },
    addAlumni: async (alumni) => {
      const newAlumni = { ...alumni, id: nextId++, confidenceScore: parseInt(alumni.confidenceScore) || 0, tahunLulus: parseInt(alumni.tahunLulus) || 0 };
      data.push(newAlumni);
      return newAlumni;
    },
    updateAlumni: async (id, updateData) => {
      const index = data.findIndex(a => a.id === parseInt(id));
      if (index !== -1) {
        data[index] = { ...data[index], ...updateData, id: parseInt(id), confidenceScore: parseInt(updateData.confidenceScore) || 0, tahunLulus: parseInt(updateData.tahunLulus) || 0 };
      }
      return updateData;
    },
    deleteAlumni: async (id) => {
      data = data.filter(a => a.id !== parseInt(id));
      return true;
    }
  };
}

// ============================================================
// MODE 2: SQLite Database (untuk Lokal / Development)
// ============================================================
async function createSQLiteDB() {
  const sqlite3 = require('sqlite3').verbose();
  const { open } = require('sqlite');

  const dbConfig = await open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
  });

  await dbConfig.exec(`
    CREATE TABLE IF NOT EXISTS alumni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      namaLengkap TEXT, prodi TEXT, tahunLulus INTEGER,
      kampus TEXT, status TEXT, confidenceScore INTEGER, jejak TEXT
    )
  `);

  const countResult = await dbConfig.get('SELECT COUNT(*) AS count FROM alumni');
  if (countResult && countResult.count === 0) {
    const trx = await dbConfig.prepare('INSERT INTO alumni (namaLengkap, prodi, tahunLulus, kampus, status, confidenceScore, jejak) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const d of fullSeedData) {
      await trx.run(d.namaLengkap, d.prodi, d.tahunLulus, d.kampus, d.status, d.confidenceScore, d.jejak);
    }
    await trx.finalize();
  }

  return {
    getAlumni: async (searchQuery = '') => {
      if (searchQuery) {
        const q = `%${searchQuery}%`;
        return await dbConfig.all('SELECT * FROM alumni WHERE namaLengkap LIKE ? OR prodi LIKE ? OR kampus LIKE ? OR status LIKE ? ORDER BY id DESC', [q, q, q, q]);
      }
      return await dbConfig.all('SELECT * FROM alumni ORDER BY id DESC');
    },
    getAlumniById: async (id) => await dbConfig.get('SELECT * FROM alumni WHERE id = ?', [id]),
    addAlumni: async (alumni) => {
      const { namaLengkap, prodi, tahunLulus, kampus, status, confidenceScore, jejak } = alumni;
      const result = await dbConfig.run('INSERT INTO alumni (namaLengkap, prodi, tahunLulus, kampus, status, confidenceScore, jejak) VALUES (?, ?, ?, ?, ?, ?, ?)', [namaLengkap, prodi, tahunLulus, kampus, status, confidenceScore, jejak]);
      return { ...alumni, id: result.lastID };
    },
    updateAlumni: async (id, updateData) => {
      const { namaLengkap, prodi, tahunLulus, kampus, status, confidenceScore, jejak } = updateData;
      await dbConfig.run('UPDATE alumni SET namaLengkap = ?, prodi = ?, tahunLulus = ?, kampus = ?, status = ?, confidenceScore = ?, jejak = ? WHERE id = ?', [namaLengkap, prodi, tahunLulus, kampus, status, confidenceScore, jejak, id]);
      return updateData;
    },
    deleteAlumni: async (id) => {
      await dbConfig.run('DELETE FROM alumni WHERE id = ?', [id]);
      return true;
    }
  };
}

// ============================================================
// MODE 3: Supabase (Produksi / Cloud)
// ============================================================
async function createSupabaseDB() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  // Map camelCase app → snake_case Supabase
  const toRow = (d) => ({
    nama_lengkap: d.namaLengkap,
    nim: d.nim || null,
    prodi: d.prodi,
    fakultas: d.fakultas || null,
    tahun_lulus: parseInt(d.tahunLulus) || 0,
    kampus: d.kampus || 'Universitas Muhammadiyah Malang',
    status: d.status,
    confidence_score: parseInt(d.confidenceScore) || 0,
    jejak: d.jejak,
    // === Kolom baru DP4 ===
    linkedin: d.linkedin || null,
    instagram: d.instagram || null,
    facebook: d.facebook || null,
    tiktok: d.tiktok || null,
    email: d.email || null,
    no_hp: d.noHp || null,
    tempat_kerja: d.tempatKerja || null,
    alamat_kerja: d.alamatKerja || null,
    posisi: d.posisi || null,
    jenis_pekerjaan: d.jenisPekerjaan || null,
    sosmed_tempat_kerja: d.sosmedTempatKerja || null,
  });

  // Map snake_case Supabase → camelCase app
  const fromRow = (r) => r ? ({
    id: r.id,
    namaLengkap: r.nama_lengkap,
    nim: r.nim || '-',
    prodi: r.prodi,
    fakultas: r.fakultas || '-',
    tahunLulus: r.tahun_lulus,
    kampus: r.kampus,
    status: r.status,
    confidenceScore: r.confidence_score,
    jejak: r.jejak,
    // === Kolom baru DP4 ===
    linkedin: r.linkedin || '',
    instagram: r.instagram || '',
    facebook: r.facebook || '',
    tiktok: r.tiktok || '',
    email: r.email || '',
    noHp: r.no_hp || '',
    tempatKerja: r.tempat_kerja || '',
    alamatKerja: r.alamat_kerja || '',
    posisi: r.posisi || '',
    jenisPekerjaan: r.jenis_pekerjaan || '',
    sosmedTempatKerja: r.sosmed_tempat_kerja || '',
  }) : null;

  // Seed otomatis HANYA jika tabel benar-benar kosong
  const { count, error } = await supabase.from('alumni').select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`[DB] Peringatan: Gagal mengecek Supabase (Tabel mungkin belum ada atau URL/Key salah). Error: ${error.message}`);
  } else if (count === 0) {
    const rows = fullSeedData.map(toRow);
    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 100) {
        await supabase.from('alumni').insert(rows.slice(i, i + 100));
      }
      console.log(`[DB] Seeded ${rows.length} dummy alumni to Supabase (tabel kosong)`);
    } else {
      console.log(`[DB] Data seed kosong, melewatinya.`);
    }
  } else {
    console.log(`[DB] Supabase sudah ada ${count ? count.toLocaleString() : 0} alumni — skip seed`);
  }

  return {
    getAlumni: async (searchQuery = '') => {
      // Dipakai laporan statistik — semua data
      let q = supabase.from('alumni').select('*').order('id', { ascending: false }).limit(1000);
      if (searchQuery) {
        q = q.or(`nama_lengkap.ilike.%${searchQuery}%,prodi.ilike.%${searchQuery}%,status.ilike.%${searchQuery}%,nim.ilike.%${searchQuery}%,fakultas.ilike.%${searchQuery}%`);
      }
      const { data } = await q;
      return (data || []).map(fromRow);
    },
    getAlumniPaginated: async (searchQuery = '', page = 1, limit = 50) => {
      // Dipakai Data Master — hanya yang Teridentifikasi dari Sumber Publik
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      let q = supabase.from('alumni')
        .select('*', { count: 'exact' })
        .eq('status', 'Teridentifikasi dari Sumber Publik')
        .order('id', { ascending: false })
        .range(from, to);
      if (searchQuery) {
        q = supabase.from('alumni')
          .select('*', { count: 'exact' })
          .eq('status', 'Teridentifikasi dari Sumber Publik')
          .or(`nama_lengkap.ilike.%${searchQuery}%,prodi.ilike.%${searchQuery}%,nim.ilike.%${searchQuery}%,fakultas.ilike.%${searchQuery}%`)
          .order('id', { ascending: false })
          .range(from, to);
      }
      const { data, count } = await q;
      return { alumniList: (data || []).map(fromRow), total: count || 0 };
    },
    getAlumniById: async (id) => {
      const { data } = await supabase.from('alumni').select('*').eq('id', id).single();
      return fromRow(data);
    },
    addAlumni: async (alumni) => {
      const { data } = await supabase.from('alumni').insert([toRow(alumni)]).select().single();
      return fromRow(data);
    },
    updateAlumni: async (id, updateData) => {
      await supabase.from('alumni').update(toRow(updateData)).eq('id', id);
      return updateData;
    },
    deleteAlumni: async (id) => {
      await supabase.from('alumni').delete().eq('id', id);
      return true;
    }
  };
}

// ============================================================
// Pilih mode berdasarkan environment
// PRIORITAS: Supabase > SQLite (lokal) > In-Memory (Vercel fallback)
// ============================================================
let dbInstance;
async function getDB() {
  if (dbInstance) return dbInstance;
  if (hasSupabase) {
    console.log('[DB] Using Supabase mode ☁️');
    dbInstance = await createSupabaseDB();
  } else if (isVercel) {
    console.log('[DB] Using In-Memory mode (Vercel - no Supabase configured)');
    dbInstance = createMemoryDB();
  } else {
    console.log('[DB] Using SQLite mode (Local)');
    dbInstance = await createSQLiteDB();
  }
  return dbInstance;
}

module.exports = {
  getAlumni: async (q) => (await getDB()).getAlumni(q),
  getAlumniPaginated: async (q, page, limit) => (await getDB()).getAlumniPaginated(q, page, limit),
  getAlumniById: async (id) => (await getDB()).getAlumniById(id),
  addAlumni: async (data) => (await getDB()).addAlumni(data),
  updateAlumni: async (id, data) => (await getDB()).updateAlumni(id, data),
  deleteAlumni: async (id) => (await getDB()).deleteAlumni(id)
};
