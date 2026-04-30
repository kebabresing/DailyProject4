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
          (a.prodi||'').toLowerCase().includes(q) ||
          (a.status||'').toLowerCase().includes(q)
        ).sort((a, b) => b.id - a.id);
      }
      return [...data].sort((a, b) => b.id - a.id);
    },
    getAlumniPaginated: async (searchQuery = '', page = 1, limit = 100, filters = {}) => {
      const clampedLimit = Math.min(limit, 100);
      const { tahunLulus, jenisPekerjaan } = filters;
      let filtered = [...data];
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(a =>
          a.namaLengkap.toLowerCase().includes(q) ||
          (a.nim||'').toLowerCase().includes(q) ||
          (a.prodi||'').toLowerCase().includes(q)
        );
      }
      if (tahunLulus) filtered = filtered.filter(a => a.tahunLulus == parseInt(tahunLulus));
      if (jenisPekerjaan) filtered = filtered.filter(a => a.jenisPekerjaan === jenisPekerjaan);
      filtered.sort((a, b) => b.id - a.id);
      const total = filtered.length;
      const alumniList = filtered.slice((page - 1) * clampedLimit, page * clampedLimit);
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
    },

    // ── Aggregate queries (no full table scan) ──────────────
    getStats: async () => ({
      total:           data.length,
      teridentifikasi: data.filter(a => a.status === 'Teridentifikasi dari Sumber Publik').length,
      perluVerifikasi: data.filter(a => a.status === 'Perlu Verifikasi Manual').length,
      belumDitemukan:  data.filter(a => a.status === 'Belum Ditemukan di Sumber Publik').length,
      bekerja:         data.filter(a => ['PNS','Swasta','BUMN'].includes(a.jenisPekerjaan)).length,
      wirausaha:       data.filter(a => ['Wirausaha','Freelance'].includes(a.jenisPekerjaan)).length,
    }),
    getProdiDistribution: async () => {
      const m = {};
      data.forEach(a => { if (a.prodi) m[a.prodi] = (m[a.prodi] || 0) + 1; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
    },
    getTahunDistribution: async () => {
      const m = {};
      data.forEach(a => { if (a.tahunLulus) m[a.tahunLulus] = (m[a.tahunLulus] || 0) + 1; });
      return Object.entries(m).sort((a, b) => Number(a[0]) - Number(b[0]));
    },
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

  // SQLite: tambah indexes untuk performa
  await dbConfig.exec(`
    CREATE INDEX IF NOT EXISTS idx_alumni_status ON alumni(status);
    CREATE INDEX IF NOT EXISTS idx_alumni_prodi  ON alumni(prodi);
    CREATE INDEX IF NOT EXISTS idx_alumni_tahun  ON alumni(tahunLulus);
    CREATE INDEX IF NOT EXISTS idx_alumni_nim    ON alumni(namaLengkap);
  `).catch(() => {}); // ignore jika sudah ada

  return {
    getAlumni: async (searchQuery = '') => {
      if (searchQuery) {
        const q = `%${searchQuery}%`;
        return await dbConfig.all('SELECT * FROM alumni WHERE namaLengkap LIKE ? OR prodi LIKE ? OR kampus LIKE ? OR status LIKE ? ORDER BY id DESC LIMIT 1000', [q, q, q, q]);
      }
      return await dbConfig.all('SELECT * FROM alumni ORDER BY id DESC LIMIT 1000');
    },
    getAlumniPaginated: async (searchQuery = '', page = 1, limit = 100, filters = {}) => {
      const clampedLimit = Math.min(limit, 100);
      const offset = (page - 1) * clampedLimit;
      const { tahunLulus, jenisPekerjaan } = filters;

      // Build dynamic WHERE clause
      const conditions = [];
      const params = [];
      if (searchQuery) {
        const q = `%${searchQuery}%`;
        conditions.push('(namaLengkap LIKE ? OR nim LIKE ? OR prodi LIKE ?)');
        params.push(q, q, q);
      }
      if (tahunLulus) { conditions.push('tahunLulus = ?'); params.push(parseInt(tahunLulus)); }
      if (jenisPekerjaan) { conditions.push('jenisPekerjaan = ?'); params.push(jenisPekerjaan); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const [rows, countRow] = await Promise.all([
        dbConfig.all(`SELECT * FROM alumni ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, clampedLimit, offset]),
        dbConfig.get(`SELECT COUNT(*) as count FROM alumni ${where}`, params),
      ]);
      return { alumniList: rows, total: countRow.count || 0 };
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
    },

    // ── Aggregate queries (single-query, tidak scan semua rows) ──
    getStats: async () => {
      const row = await dbConfig.get(`
        SELECT
          COUNT(*)                                                              AS total,
          SUM(CASE WHEN status = 'Teridentifikasi dari Sumber Publik' THEN 1 ELSE 0 END) AS teridentifikasi,
          SUM(CASE WHEN status = 'Perlu Verifikasi Manual'            THEN 1 ELSE 0 END) AS perluVerifikasi,
          SUM(CASE WHEN status = 'Belum Ditemukan di Sumber Publik'   THEN 1 ELSE 0 END) AS belumDitemukan,
          SUM(CASE WHEN jenisPekerjaan IN ('PNS','Swasta','BUMN')      THEN 1 ELSE 0 END) AS bekerja,
          SUM(CASE WHEN jenisPekerjaan IN ('Wirausaha','Freelance')    THEN 1 ELSE 0 END) AS wirausaha
        FROM alumni
      `);
      return {
        total:           row.total           || 0,
        teridentifikasi: row.teridentifikasi || 0,
        perluVerifikasi: row.perluVerifikasi || 0,
        belumDitemukan:  row.belumDitemukan  || 0,
        bekerja:         row.bekerja         || 0,
        wirausaha:       row.wirausaha       || 0,
      };
    },
    getProdiDistribution: async () => {
      const rows = await dbConfig.all(
        `SELECT prodi, COUNT(*) AS count FROM alumni WHERE prodi IS NOT NULL AND prodi != '' GROUP BY prodi ORDER BY count DESC LIMIT 10`
      );
      return rows.map(r => [r.prodi, r.count]);
    },
    getTahunDistribution: async () => {
      const rows = await dbConfig.all(
        `SELECT tahunLulus, COUNT(*) AS count FROM alumni WHERE tahunLulus IS NOT NULL AND tahunLulus > 0 GROUP BY tahunLulus ORDER BY tahunLulus`
      );
      return rows.map(r => [String(r.tahunLulus), r.count]);
    },
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
    nama: d.namaLengkap,
    nim: d.nim || null,
    tahun_masuk: parseInt(d.tahunMasuk) || null,
    prodi: d.prodi,
    fakultas: d.fakultas || null,
    tanggal_lulus: parseInt(d.tahunLulus) || 0,
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
    namaLengkap: r.nama,
    nim: r.nim || '-',
    tahunMasuk: r.tahun_masuk || null,
    prodi: r.prodi,
    fakultas: r.fakultas || '-',
    tahunLulus: r.tanggal_lulus,
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
  const { count, error } = await supabase.from('alumniv2').select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`[DB] Peringatan: Gagal mengecek Supabase (Tabel mungkin belum ada atau URL/Key salah). Error: ${error.message}`);
  } else if (count === 0) {
    const rows = fullSeedData.map(toRow);
    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 100) {
        await supabase.from('alumniv2').insert(rows.slice(i, i + 100));
      }
      console.log(`[DB] Seeded ${rows.length} dummy alumni to Supabase (tabel kosong)`);
    } else {
      console.log(`[DB] Data seed kosong, melewatinya.`);
    }
  } else {
    console.log(`[DB] Supabase sudah ada ${count ? count.toLocaleString() : 0} alumni — skip seed`);
  }

  return {
    // ── Data listing (dengan server-side filtering + range pagination) ────
    getAlumni: async (searchQuery = '', limit = 500) => {
      // Dipakai: export excel, tracker scheduler — batasi dengan limit
      let q = supabase.from('alumniv2').select('*').order('id', { ascending: false });
      if (searchQuery) {
        let orQuery = `nama.ilike.%${searchQuery}%,prodi.ilike.%${searchQuery}%,status.ilike.%${searchQuery}%,fakultas.ilike.%${searchQuery}%`;
        if (!isNaN(searchQuery) && String(searchQuery).trim() !== '') {
          orQuery += `,nim.eq.${searchQuery}`;
        }
        q = q.or(orQuery);
      }
      const { data } = await q.limit(limit);
      return (data || []).map(fromRow);
    },

    getAlumniPaginated: async (searchQuery = '', page = 1, limit = 100, filters = {}) => {
      const clampedLimit = Math.min(limit, 100);
      const from = (page - 1) * clampedLimit;
      const to   = from + clampedLimit - 1;
      const { tahunLulus, jenisPekerjaan } = filters;

      // Build query secara dinamis — hanya status Teridentifikasi + filter opsional
      let q = supabase.from('alumniv2')
        .select('*', { count: 'exact' })
        .eq('status', 'Teridentifikasi dari Sumber Publik')
        .order('id', { ascending: false })
        .range(from, to);

      // Search: partial match nama, prodi, fakultas
      if (searchQuery) {
        let orQuery = `nama.ilike.%${searchQuery}%,prodi.ilike.%${searchQuery}%,fakultas.ilike.%${searchQuery}%`;
        if (!isNaN(searchQuery) && String(searchQuery).trim() !== '') {
          orQuery += `,nim.eq.${searchQuery}`;
        }
        q = q.or(orQuery);
      }
      // Filter: tahun lulus
      if (tahunLulus) q = q.eq('tanggal_lulus', parseInt(tahunLulus));
      // Filter: jenis pekerjaan
      if (jenisPekerjaan) q = q.eq('jenis_pekerjaan', jenisPekerjaan);

      const { data, count } = await q;
      return { alumniList: (data || []).map(fromRow), total: count || 0 };
    },

    getAlumniById: async (id) => {
      const { data } = await supabase.from('alumniv2').select('*').eq('id', id).single();
      return fromRow(data);
    },
    addAlumni: async (alumni) => {
      const { data } = await supabase.from('alumniv2').insert([toRow(alumni)]).select().single();
      return fromRow(data);
    },
    updateAlumni: async (id, updateData) => {
      await supabase.from('alumniv2').update(toRow(updateData)).eq('id', id);
      return updateData;
    },
    deleteAlumni: async (id) => {
      await supabase.from('alumniv2').delete().eq('id', id);
      return true;
    },

    // ── Aggregate queries (TIDAK load semua rows ke memory) ───────────────
    // Menggunakan Supabase RPC (1 query) dengan fallback parallel COUNT queries (6 queries)

    getStats: async () => {
      // Coba RPC dulu (satu query, paling cepat — perlu jalankan supabase_setup.sql)
      const { data: rpc, error: rpcErr } = await supabase.rpc('get_alumni_stats');
      if (!rpcErr && rpc) {
        return {
          total:           Number(rpc.total)           || 0,
          teridentifikasi: Number(rpc.teridentifikasi)  || 0,
          perluVerifikasi: Number(rpc.perluVerifikasi)  || 0,
          belumDitemukan:  Number(rpc.belumDitemukan)   || 0,
          bekerja:         Number(rpc.bekerja)          || 0,
          wirausaha:       Number(rpc.wirausaha)        || 0,
        };
      }
      // Fallback: 6 parallel COUNT queries (masih cepat dengan index)
      console.warn('[DB] RPC get_alumni_stats tidak tersedia, pakai fallback COUNT queries');
      const [tot, teri, perlu, belum, bek, wir] = await Promise.all([
        supabase.from('alumniv2').select('*', { count: 'exact', head: true }),
        supabase.from('alumniv2').select('*', { count: 'exact', head: true }).eq('status', 'Teridentifikasi dari Sumber Publik'),
        supabase.from('alumniv2').select('*', { count: 'exact', head: true }).eq('status', 'Perlu Verifikasi Manual'),
        supabase.from('alumniv2').select('*', { count: 'exact', head: true }).eq('status', 'Belum Ditemukan di Sumber Publik'),
        supabase.from('alumniv2').select('*', { count: 'exact', head: true }).in('jenis_pekerjaan', ['PNS', 'Swasta', 'BUMN']),
        supabase.from('alumniv2').select('*', { count: 'exact', head: true }).in('jenis_pekerjaan', ['Wirausaha', 'Freelance']),
      ]);
      return {
        total:           tot.count  || 0,
        teridentifikasi: teri.count || 0,
        perluVerifikasi: perlu.count || 0,
        belumDitemukan:  belum.count || 0,
        bekerja:         bek.count  || 0,
        wirausaha:       wir.count  || 0,
      };
    },

    getProdiDistribution: async () => {
      const { data, error } = await supabase.rpc('get_prodi_distribution');
      if (!error && data) return data.map(r => [r.prodi, Number(r.count)]);
      console.warn('[DB] RPC get_prodi_distribution tidak tersedia');
      return [];
    },

    getTahunDistribution: async () => {
      const { data, error } = await supabase.rpc('get_tahun_distribution');
      if (!error && data) return data.map(r => [String(r.tanggal_lulus), Number(r.count)]);
      console.warn('[DB] RPC get_tahun_distribution tidak tersedia');
      return [];
    },
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
  getAlumni: async (q, limit) => (await getDB()).getAlumni(q, limit),
  getAlumniPaginated: async (q, page, limit) => (await getDB()).getAlumniPaginated(q, page, limit),
  getStats:           async ()  => (await getDB()).getStats(),
  getProdiDistribution: async () => (await getDB()).getProdiDistribution(),
  getTahunDistribution: async () => (await getDB()).getTahunDistribution(),
  getAlumniById: async (id) => (await getDB()).getAlumniById(id),
  addAlumni: async (data) => (await getDB()).addAlumni(data),
  updateAlumni: async (id, data) => (await getDB()).updateAlumni(id, data),
  deleteAlumni: async (id) => (await getDB()).deleteAlumni(id)
};
