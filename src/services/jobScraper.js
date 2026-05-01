/**
 * jobScraper.js — Pencari Data Pekerjaan Alumni
 *
 * Tugas tunggal: cari 4 data pekerjaan dari sumber publik (DuckDuckGo):
 *   1. Tempat kerja (nama perusahaan / instansi)
 *   2. Posisi / jabatan
 *   3. Alamat tempat bekerja
 *   4. Klasifikasi: PNS | BUMN | Swasta | Wirausaha | Freelance
 *
 * Mode:
 *   OSINT_MODE=real        → scraping nyata via DuckDuckGo Lite
 *   OSINT_MODE=simulation  → data simulasi realistis (default, untuk dev/demo)
 */

const axios   = require('axios');
const cheerio = require('cheerio');

// ── Konstanta HTTP ──────────────────────────────────────────────────────────

const DDG_URL = 'https://lite.duckduckgo.com/lite/';

const HTTP_HEADERS = {
  'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
  'Accept'         : 'text/html,application/xhtml+xml',
  'Referer'        : 'https://lite.duckduckgo.com/',
  'Content-Type'   : 'application/x-www-form-urlencoded',
};

// ── Pattern Deteksi ────────────────────────────────────────────────────────

// Klasifikasi jenis pekerjaan
const PAT_PNS      = /\b(PNS|ASN|pegawai negeri|aparatur sipil|CPNS|birokrat)\b/i;
const PAT_BUMN     = /\b(BUMN|persero|perusahaan negara|PT Telkom|PT PLN|PT Pertamina|Bank BRI|Bank Mandiri|Bank BNI)\b/i;
const PAT_WIRAUSAHA = /\b(wirausaha|wiraswasta|entrepreneur|founder|owner|co-founder|usaha sendiri|bisnis sendiri|CEO|direktur utama)\b/i;
const PAT_FREELANCE = /\b(freelance|freelancer|konsultan|independent|remote worker|kontrak)\b/i;

// Posisi jabatan
const PAT_POSISI = [
  /(?:sebagai|bekerja sebagai|menjabat|jabatan|posisi)[:\s]+([A-Za-z\s\-/]{3,40}?)(?:\s+(?:di|at|pada)|[.,]|$)/i,
  /([A-Za-z\s\-/]{3,35})\s+(?:at|di|@|pada)\s+([A-Za-z0-9\s\-,.'"]{3,50}?)(?:\s*[|\-•]|[.,]|$)/i,
];

// Nama perusahaan
const PAT_PERUSAHAAN = [
  /(?:bekerja di|works at|employed at|employed by|bergabung di)[:\s]+([A-Za-z0-9\s\-,.']{3,60}?)(?:\s*[|\-•]|[.,]|$)/i,
  /(?:at|di|@|pada)\s+((?:PT|CV|Bank|RS|RSUD|Dinas|Kementerian|Badan|Lembaga)\s+[A-Za-z0-9\s\-,.]{2,50}?)(?:\s*[|\-•]|[.,]|$)/i,
];

// Kota Indonesia (untuk alamat)
const KOTA = [
  'Jakarta', 'Surabaya', 'Bandung', 'Malang', 'Semarang', 'Yogyakarta',
  'Medan', 'Makassar', 'Bali', 'Depok', 'Bekasi', 'Tangerang', 'Sidoarjo',
  'Batu', 'Kediri', 'Jember', 'Blitar', 'Mojokerto', 'Probolinggo',
];
const PAT_LOKASI = new RegExp(`(${KOTA.join('|')})[^,.\n]{0,30}`, 'i');

// ── Helper: delay ───────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Helper: buat hasil kosong ────────────────────────────────────────────────

function emptyJob() {
  return {
    tempatKerja   : null,
    posisi        : null,
    alamatKerja   : null,
    jenisPekerjaan: null,
  };
}

// ── Ekstrak sinyal pekerjaan dari teks snippet ───────────────────────────────

function extractJobFromText(text, result) {
  // 1. Klasifikasi pekerjaan (prioritas: PNS > BUMN > Wirausaha > Freelance > Swasta default)
  if (!result.jenisPekerjaan) {
    if (PAT_PNS.test(text))       result.jenisPekerjaan = 'PNS';
    else if (PAT_BUMN.test(text)) result.jenisPekerjaan = 'BUMN';
    else if (PAT_WIRAUSAHA.test(text)) result.jenisPekerjaan = 'Wirausaha';
    else if (PAT_FREELANCE.test(text)) result.jenisPekerjaan = 'Freelance';
    // 'Swasta' di-assign setelah perusahaan ditemukan
  }

  // 2. Posisi jabatan
  if (!result.posisi) {
    for (const pat of PAT_POSISI) {
      const m = text.match(pat);
      if (m && m[1] && m[1].trim().length >= 3 && m[1].trim().length <= 50) {
        result.posisi = m[1].trim();
        break;
      }
    }
  }

  // 3. Nama perusahaan
  if (!result.tempatKerja) {
    for (const pat of PAT_PERUSAHAAN) {
      const m = text.match(pat);
      if (m) {
        const candidate = (m[1] || '').trim();
        if (candidate.length >= 3 && candidate.length <= 80) {
          result.tempatKerja = candidate;
          // Jika belum ada klasifikasi dan ada perusahaan → Swasta
          if (!result.jenisPekerjaan) result.jenisPekerjaan = 'Swasta';
          break;
        }
      }
    }
  }

  // 4. Lokasi / alamat kantor
  if (!result.alamatKerja) {
    const m = text.match(PAT_LOKASI);
    if (m) result.alamatKerja = m[0].trim();
  }
}

// ── Bangun query pencarian ───────────────────────────────────────────────────

function buildJobQueries(alumni) {
  const name  = (alumni.namaLengkap || '').trim();
  const kampus = alumni.kampus || 'Universitas Muhammadiyah Malang';
  const prodi  = alumni.prodi  || '';
  const tahun  = alumni.tahunLulus || '';

  // Nama pendek (nama depan + nama belakang)
  const parts     = name.split(/\s+/);
  const shortName = parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1]}` : name;

  return [
    // Query 1: fokus LinkedIn (paling banyak data pekerjaan)
    `"${name}" "${kampus}" site:linkedin.com`,
    // Query 2: cari pekerjaan tanpa LinkedIn
    `"${name}" "${prodi || kampus}" bekerja OR pekerjaan OR jabatan -site:linkedin.com`,
    // Query 3: nama pendek + alumni
    `"${shortName}" alumni ${tahun || ''} ${kampus} kerja`,
  ].filter(Boolean);
}

// ── REAL Scraping via DuckDuckGo Lite ───────────────────────────────────────

async function realScrapeJob(alumni) {
  const result  = emptyJob();
  const queries = buildJobQueries(alumni);

  for (const query of queries) {
    try {
      await delay(3000 + Math.random() * 2000); // jeda 3-5 detik per query

      const body = new URLSearchParams({ q: query, b: '', kl: 'id-id' });
      const resp = await axios.post(DDG_URL, body.toString(), {
        headers: HTTP_HEADERS,
        timeout: 10000,
      });

      const $ = cheerio.load(resp.data);

      // Struktur DDG Lite: <a class="result-link"> + <td class="result-snippet">
      $('tr').each((_, row) => {
        const linkText    = $(row).find('a.result-link').text();
        const snippetText = $(row).find('.result-snippet').text();
        const fullText    = `${linkText} ${snippetText}`.trim();
        if (fullText) extractJobFromText(fullText, result);
      });

      // Berhenti lebih awal jika sudah dapat data inti
      if (result.tempatKerja || result.posisi) {
        console.log(`[JobScraper] Data ditemukan untuk "${alumni.namaLengkap}" via query: "${query.slice(0, 60)}..."`);
        break;
      }
    } catch (err) {
      console.warn(`[JobScraper] Query gagal: "${query.slice(0, 60)}" — ${err.message}`);
    }
  }

  return result;
}

// ── SIMULASI (untuk dev / demo) ─────────────────────────────────────────────

function simulateJob(alumni) {
  const prodi = (alumni.prodi || '').toLowerCase();
  const rand  = Math.random();

  // Tentukan jenis pekerjaan berdasarkan prodi
  let jenis, tempat, posisi, kota;
  kota = KOTA[Math.floor(rand * KOTA.length)];

  if (prodi.includes('kedokter') || prodi.includes('profesi dokter')) {
    jenis  = 'Swasta';
    tempat = ['RSUD dr. Saiful Anwar', 'RS UMM', 'Klinik Pratama Malang', 'Puskesmas Kota'][Math.floor(rand * 4)];
    posisi = ['Dokter Umum', 'Dokter Spesialis', 'Dokter Internship', 'Medical Staff'][Math.floor(rand * 4)];
  } else if (prodi.includes('hukum') || prodi.includes('ilmu hukum')) {
    jenis  = rand > 0.5 ? 'PNS' : 'Swasta';
    tempat = rand > 0.5 ? 'Pengadilan Negeri Malang' : 'Kantor Hukum & Notaris';
    posisi = rand > 0.5 ? 'Hakim / Panitera' : 'Legal Officer';
  } else if (prodi.includes('guru') || prodi.includes('pendidikan')) {
    jenis  = rand > 0.4 ? 'PNS' : 'Swasta';
    tempat = rand > 0.4 ? `SDN / SMPN / SMAN ${Math.floor(rand * 30) + 1} Malang` : 'Sekolah Swasta Islam Malang';
    posisi = 'Guru';
  } else if (prodi.includes('manajemen') || prodi.includes('akuntansi') || prodi.includes('ekonomi')) {
    jenis  = rand > 0.3 ? 'Swasta' : 'BUMN';
    tempat = rand > 0.3 ? ['PT Astra International', 'PT Indofood', 'KPMG Indonesia'][Math.floor(rand * 3)] : ['Bank BRI', 'Bank Mandiri', 'PT Pertamina'][Math.floor(rand * 3)];
    posisi = ['Financial Analyst', 'Accounting Staff', 'Business Analyst', 'Marketing Executive'][Math.floor(rand * 4)];
  } else if (prodi.includes('informatika') || prodi.includes('teknik') || prodi.includes('sistem informasi')) {
    jenis  = rand > 0.2 ? 'Swasta' : 'BUMN';
    tempat = rand > 0.2 ? ['Tokopedia', 'Gojek', 'PT Telkom', 'Startup Malang'][Math.floor(rand * 4)] : 'PT Telkom Indonesia';
    posisi = ['Software Engineer', 'Web Developer', 'Data Analyst', 'IT Consultant'][Math.floor(rand * 4)];
  } else {
    const types = ['PNS', 'Swasta', 'BUMN', 'Wirausaha', 'Freelance'];
    jenis  = types[Math.floor(rand * types.length)];
    tempat = `Instansi / Perusahaan di ${kota}`;
    posisi = 'Staff Profesional';
  }

  return {
    tempatKerja   : tempat,
    posisi        : posisi,
    alamatKerja   : `${kota}, Indonesia`,
    jenisPekerjaan: jenis,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Cari data pekerjaan untuk satu alumni.
 *
 * @param {object} alumni - { namaLengkap, kampus, prodi, tahunLulus }
 * @returns {Promise<{tempatKerja, posisi, alamatKerja, jenisPekerjaan}>}
 */
async function findJob(alumni) {
  const mode = (process.env.OSINT_MODE || 'simulation').toLowerCase();

  if (mode === 'real') {
    const result = await realScrapeJob(alumni);
    const found  = Object.values(result).some(Boolean);

    if (found) {
      console.log(`[JobScraper] REAL — ditemukan untuk: ${alumni.namaLengkap}`);
      return result;
    }
    console.log(`[JobScraper] REAL — tidak ditemukan untuk: ${alumni.namaLengkap}, pakai simulasi.`);
  }

  // Fallback atau mode simulasi
  await delay(500 + Math.random() * 500); // simulasi delay
  const sim = simulateJob(alumni);
  console.log(`[JobScraper] SIM — "${alumni.namaLengkap}" → ${sim.jenisPekerjaan} @ ${sim.tempatKerja}`);
  return sim;
}

module.exports = { findJob, emptyJob, buildJobQueries };
