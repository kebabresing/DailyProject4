'use strict';

/**
 * osintScraper.js — OSINT Digital Footprint Scraper (v2)
 *
 * Mencari 8 titik data alumni dari sumber publik internet:
 *  1. Sosial Media Pribadi  : LinkedIn, Instagram, Facebook, TikTok
 *  2. Email
 *  3. Tempat Kerja          (Nama Perusahaan / Instansi)
 *  4. Alamat Kerja          (Kota / Wilayah)
 *  5. Posisi / Jabatan
 *  6. Klasifikasi Pekerjaan (PNS | BUMN | Swasta | Wirausaha | Freelance)
 *  7. Sosial Media Tempat Kerja
 *
 * Strategi pencarian:
 *  - Gunakan data alumni YANG SUDAH ADA (nama, kampus, prodi, tahun lulus)
 *    sebagai kata kunci agar pencarian presisi & tidak salah orang.
 *  - Cari via DuckDuckGo Lite (anti-bot-block), dengan fallback multi-query.
 *  - Rate-limit per-query: 1.5–3 detik jeda.
 *  - Jika semua query gagal → kembalikan objek kosong (TIDAK simulasi data palsu).
 *
 * ENV:
 *  OSINT_MODE = 'real'       → Scraping nyata (DuckDuckGo)
 *  OSINT_MODE = 'simulation' → Data simulasi realistis (default; untuk dev/demo)
 */

const axios   = require('axios');
const cheerio = require('cheerio');

// ─────────────────────────────────────────────────────────────────────────────
// KONSTANTA
// ─────────────────────────────────────────────────────────────────────────────

const DDG_URL = 'https://lite.duckduckgo.com/lite/';
const REQUEST_TIMEOUT_MS = 10_000;

// Daftar kota Indonesia untuk ekstrasi lokasi
const KOTA_ID = [
  'Malang', 'Surabaya', 'Jakarta', 'Bandung', 'Semarang', 'Yogyakarta',
  'Medan', 'Makassar', 'Bali', 'Denpasar', 'Depok', 'Bekasi', 'Tangerang',
  'Sidoarjo', 'Batu', 'Pasuruan', 'Blitar', 'Kediri', 'Mojokerto',
  'Jember', 'Probolinggo', 'Bogor', 'Palembang', 'Pekanbaru', 'Balikpapan',
];

// HTTP headers yang menyerupai browser sungguhan
const BASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://lite.duckduckgo.com/',
  'Content-Type': 'application/x-www-form-urlencoded',
};

// ─────────────────────────────────────────────────────────────────────────────
// POLA REGEX UNTUK EKSTRAKSI SINYAL
// ─────────────────────────────────────────────────────────────────────────────

const PATTERNS = {
  // ── Sosial Media (URL patterns) ──
  linkedin:  /linkedin\.com\/in\/([a-zA-Z0-9\-_%]+)/i,
  instagram: /(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.]+)/i,
  facebook:  /facebook\.com\/(people\/[^/]+\/\d+|[a-zA-Z0-9.]+)/i,
  tiktok:    /tiktok\.com\/@([a-zA-Z0-9_.]+)/i,

  // ── Kontak ──
  email: /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,7}\b/,
  phone: /(?:\+62|62|0)(?:8[1-9][0-9]{6,10}|2[0-9]{7,9}|[3-9][0-9]{6,9})/,

  // ── Jenis Pekerjaan ──
  pns:       /\b(PNS|ASN|pegawai negeri|aparatur sipil|birokrat|CPNS)\b/i,
  bumn:      /\b(BUMN|persero|perusahaan negara|state-owned enterprise)\b/i,
  wirausaha: /\b(wirausaha|wiraswasta|entrepreneur|founder|co-founder|owner|direktur utama|CEO|usaha sendiri|bisnis sendiri|pengusaha)\b/i,

  // ── Posisi / Jabatan ──
  positions: [
    /(?:sebagai|bekerja sebagai|menjabat|jabatan|posisi|position)[:\s]+([A-Za-z\s\-/]{3,40})(?:\s+(?:di|at|@|pada)|\.|,|$)/i,
    /([A-Za-z\s\-/]{3,35})\s+(?:at|di|@|pada)\s+([A-Za-z0-9\s\-,.'&]{3,50}?)(?:\s*[|\-•·]|\.|$)/i,
    /(?:job title|title|position|jabatan)[:\s]+([A-Za-z\s\-/]{3,40})(?:\s*[|\-•·]|\.|,|$)/i,
  ],

  // ── Perusahaan / Instansi ──
  companies: [
    /(?:bekerja di|works? at|works? for|employed (?:at|by))[:\s]+([A-Za-z0-9\s\-,.'&]{3,60})(?:\s*[|\-•·]|\.|,|$)/i,
    /(?:at|di|@|pada)\s+(PT\s+[A-Za-z0-9\s\-.&]+|CV\s+[A-Za-z0-9\s\-.&]+|[A-Za-z0-9\s\-.&]{4,50}(?:\s+(?:Indonesia|Tbk|Group|Corp|Inc|Ltd|Persero|Pemerintah|Kota|Kab)))/i,
    /(?:Dinas|Badan|Kementerian|Lembaga|Universitas|RS|RSUD|Bank|PT|CV)\s+[A-Za-z0-9\s\-.&]{3,50}/i,
  ],

  // ── Lokasi ──
  locations: [
    new RegExp(
      `(${KOTA_ID.join('|')})[^,.\\n]{0,40}`,
      'i'
    ),
    /(?:kota|kabupaten|provinsi|wilayah)[:\s]+([A-Za-z\s]{3,30})/i,
  ],

  // ── Sosmed Tempat Kerja ──
  companyLinkedIn:  /linkedin\.com\/company\/([a-zA-Z0-9\-_]+)/i,
  companyInstagram: /instagram\.com\/([a-zA-Z0-9_.]+)/i,
  companyFacebook:  /facebook\.com\/(pages\/[^/]+\/[^/?#]+|[a-zA-Z0-9.]+)/i,
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────────────────────

/** Jeda async */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Template objek hasil kosong (8 titik data) */
function emptyResult() {
  return {
    // Sosial media pribadi
    linkedin:           null,
    instagram:          null,
    facebook:           null,
    tiktok:             null,
    // Kontak
    email:              null,
    noHp:               null,
    // Pekerjaan
    tempatKerja:        null,
    alamatKerja:        null,
    posisi:             null,
    jenisPekerjaan:     null,
    // Sosmed tempat kerja
    sosmedTempatKerja:  null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY BUILDER — Berbasis data mahasiswa yang sudah ada di DB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buat daftar query pencarian spesifik berdasarkan data mahasiswa.
 * Ini memastikan hasil pencarian presisi dan tidak salah orang.
 *
 * @param {object} alumni  — { namaLengkap, kampus, prodi, tahunLulus, fakultas }
 * @returns {string[]}      — Array query strings
 */
function buildSearchQueries(alumni) {
  const name    = (alumni.namaLengkap || '').trim();
  const kampus  = alumni.kampus  || 'Universitas Muhammadiyah Malang';
  const prodi   = alumni.prodi   || '';
  const tahun   = alumni.tahunLulus || '';
  const kampusAbbr = kampus.includes('Muhammadiyah Malang') ? 'UMM' : kampus.substring(0, 10);

  // Ambil nama depan + nama belakang untuk variasi pencarian
  const parts    = name.split(/\s+/).filter(Boolean);
  const shortName = parts.length >= 2
    ? `${parts[0]} ${parts[parts.length - 1]}`
    : name;

  const queries = [];

  // 1. LinkedIn (paling akurat untuk profil profesional)
  queries.push(`"${name}" "${kampus}" site:linkedin.com`);
  if (prodi) queries.push(`"${name}" "${prodi}" site:linkedin.com`);
  queries.push(`"${shortName}" "${kampusAbbr}" linkedin`);

  // 2. LinkedIn via Google tanpa site: filter (untuk snippet)
  queries.push(`"${name}" "${kampus}" linkedin profil`);

  // 3. General web — nama + kampus + tahun lulus (kunci disambiguasi)
  if (tahun) {
    queries.push(`"${name}" "${kampusAbbr}" alumni ${tahun}`);
    queries.push(`"${name}" alumni ${tahun} Indonesia`);
  }

  // 4. Cari email/kontak publik
  queries.push(`"${name}" "${kampus}" email OR kontak OR WhatsApp`);

  // 5. Instagram / sosmed
  queries.push(`"${name}" site:instagram.com OR site:facebook.com`);

  // 6. Nama pendek + prodi (fallback)
  if (prodi) queries.push(`"${shortName}" "${prodi}" Indonesia`);

  return queries;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTOR — Menggali sinyal dari teks & URL hasil scraping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ekstrak semua sinyal dari pasangan (teks_snippet, url) hasil DuckDuckGo.
 * Memodifikasi objek `result` secara in-place.
 */
function extractFromText(text, url, result) {
  const combinedText = `${text} ${url || ''}`;

  // ── Sosial Media (dari URL lebih akurat) ──
  if (!result.linkedin && url) {
    const m = url.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
    if (m) result.linkedin = `https://linkedin.com/in/${m[1]}`;
  }
  if (!result.linkedin) {
    const m = combinedText.match(/linkedin\.com\/in\/([a-zA-Z0-9\-%_]+)/i);
    if (m) result.linkedin = `https://linkedin.com/in/${m[1]}`;
  }

  if (!result.instagram && url && PATTERNS.instagram.test(url) && !url.match(/\/p\/|\/reel\/|\/stories\//)) {
    const m = url.match(/(?:instagram\.com|instagr\.am)\/([^/?#\s]+)/i);
    if (m && !['explore', 'accounts', 'p', 'tv', 'reel'].includes(m[1])) {
      result.instagram = `https://instagram.com/${m[1]}`;
    }
  }

  if (!result.facebook && url && PATTERNS.facebook.test(url)) {
    const m = url.match(/facebook\.com\/(people\/[^/?#\s]+\/\d+|[a-zA-Z0-9.]+)/i);
    const SKIP = ['login', 'home', 'groups', 'pages', 'events', 'marketplace', 'watch'];
    if (m && !SKIP.includes(m[1].toLowerCase())) {
      result.facebook = `https://facebook.com/${m[1]}`;
    }
  }

  if (!result.tiktok && url && PATTERNS.tiktok.test(url)) {
    const m = url.match(/tiktok\.com\/@([^/?#\s]+)/i);
    if (m) result.tiktok = `https://tiktok.com/@${m[1]}`;
  }

  // ── Email ──
  if (!result.email) {
    const m = text.match(PATTERNS.email);
    if (m && !m[0].includes('example') && !m[0].includes('placeholder') && !m[0].includes('noreply')) {
      result.email = m[0].toLowerCase().trim();
    }
  }

  // ── No HP ──
  if (!result.noHp) {
    const m = text.match(PATTERNS.phone);
    if (m) result.noHp = m[0].replace(/[\s\-()]/g, '');
  }

  // ── Jenis Pekerjaan ──
  if (!result.jenisPekerjaan) {
    if (PATTERNS.pns.test(combinedText))       result.jenisPekerjaan = 'PNS';
    else if (PATTERNS.bumn.test(combinedText)) result.jenisPekerjaan = 'BUMN';
    else if (PATTERNS.wirausaha.test(combinedText)) result.jenisPekerjaan = 'Wirausaha';
    else if (/\b(freelance|remote worker|konsultan independen)\b/i.test(combinedText)) {
      result.jenisPekerjaan = 'Freelance';
    }
  }

  // ── Posisi ──
  if (!result.posisi) {
    for (const pat of PATTERNS.positions) {
      const m = text.match(pat);
      const candidate = m ? (m[1] || '').trim() : null;
      if (candidate && candidate.length >= 3 && candidate.length <= 50 && /[A-Za-z]/.test(candidate)) {
        result.posisi = candidate;
        break;
      }
    }
  }

  // ── Perusahaan ──
  if (!result.tempatKerja) {
    for (const pat of PATTERNS.companies) {
      const m = combinedText.match(pat);
      const raw = m ? (m[1] || m[0] || '').trim() : null;
      if (raw && raw.length >= 3 && raw.length <= 80) {
        result.tempatKerja = raw.replace(/\s+/g, ' ');
        break;
      }
    }
  }

  // ── Lokasi ──
  if (!result.alamatKerja) {
    for (const pat of PATTERNS.locations) {
      const m = combinedText.match(pat);
      if (m && m[1]) {
        result.alamatKerja = m[1].trim();
        break;
      }
    }
  }

  // ── Sosmed Tempat Kerja ──
  if (!result.sosmedTempatKerja) {
    // Prioritas: LinkedIn Company > Instagram @toko > Facebook Page
    const lc = combinedText.match(PATTERNS.companyLinkedIn);
    if (lc) {
      result.sosmedTempatKerja = `https://linkedin.com/company/${lc[1]}`;
    } else {
      // Ambil URL Instagram/Facebook yang bukan profil pribadi
      if (result.tempatKerja) {
        // Jika kita sudah tahu nama perusahaan, buat URL slug-nya
        const companySlug = result.tempatKerja
          .toLowerCase()
          .replace(/\bpt\b|\bcv\b|\brsud\b|\bkementerian\b|\bdinas\b/gi, '')
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 30);
        if (companySlug.length >= 3) {
          result.sosmedTempatKerja = `https://instagram.com/${companySlug}`;
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL SCRAPER — DuckDuckGo Lite
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lakukan scraping nyata ke DuckDuckGo Lite.
 * Mencoba satu-per-satu query, berhenti setelah cukup data ditemukan.
 *
 * @param {object} alumni   — Data alumni dari DB sebagai kunci pencarian
 * @returns {Promise<object>} Hasil 8 titik data
 */
async function realScrapeOSINT(alumni) {
  const result  = emptyResult();
  const queries = buildSearchQueries(alumni);

  console.log(`[OSINT] Memulai scraping untuk: "${alumni.namaLengkap}" (${queries.length} queries)`);

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];

    // Rate-limit: jeda 1.5 – 3 detik antar query
    if (i > 0) {
      await delay(1500 + Math.random() * 1500);
    }

    try {
      const formData = new URLSearchParams({ q: query, b: '', kl: 'id-id' });

      const response = await axios.post(DDG_URL, formData.toString(), {
        headers: BASE_HEADERS,
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 3,
      });

      const $ = cheerio.load(response.data);

      // DDG Lite: <a class="result-link"> + <td class="result-snippet">
      $('tr').each((_, row) => {
        const $row   = $(row);
        const link   = $row.find('a.result-link');
        const snippet = $row.find('.result-snippet, td.result-snippet');
        if (!link.length) return;

        const rawUrl   = link.attr('href') || '';
        const rawText  = (link.text() + ' ' + snippet.text()).replace(/\s+/g, ' ').trim();

        // Buang URL iklan DDG (/y.js?...) — ambil URL asli dari parameter
        let cleanUrl = rawUrl;
        if (rawUrl.startsWith('/y.js') || rawUrl.startsWith('//duckduckgo.com/y.js')) {
          try {
            const u = new URL('https://duckduckgo.com' + rawUrl);
            cleanUrl = decodeURIComponent(u.searchParams.get('ad_domain') || u.searchParams.get('u') || rawUrl);
          } catch (_) { /* ignore */ }
        }

        extractFromText(rawText, cleanUrl, result);
      });

      // Cek sinyal yang sudah cukup untuk berhenti lebih awal
      const signalCount = countSignals(result);
      if (signalCount >= 4) {
        console.log(`[OSINT] Cukup sinyal (${signalCount}/8) setelah ${i + 1} query — berhenti awal`);
        break;
      }
    } catch (err) {
      // Lanjut ke query berikutnya — TIDAK crash
      const errMsg = err.code === 'ECONNABORTED' ? 'TIMEOUT' : (err.response?.status || err.message);
      console.warn(`[OSINT] Query #${i + 1} gagal (${errMsg}): "${query.slice(0, 60)}..."`);
    }
  }

  const total = countSignals(result);
  console.log(`[OSINT] Selesai — ${total}/8 sinyal ditemukan untuk "${alumni.namaLengkap}"`);
  return result;
}

/** Hitung jumlah field terisi (bukan null/kosong) */
function countSignals(result) {
  return Object.values(result).filter((v) => v !== null && v !== '').length;
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMULASI — Untuk mode development / demo
// Menghasilkan data realistis berdasarkan prodi alumni.
// TIDAK digunakan untuk produksi nyata.
// ─────────────────────────────────────────────────────────────────────────────

function simulateScrape(alumni) {
  const name  = alumni.namaLengkap || 'alumni';
  const prodi = (alumni.prodi || '').toLowerCase();
  const tahun = parseInt(alumni.tahunLulus) || 2020;
  const slug  = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  const rng   = () => Math.random();

  const result = emptyResult();

  // Sosmed — tidak semua alumni punya semuanya
  result.linkedin  = `https://linkedin.com/in/${slug}-${Math.floor(rng() * 9000 + 1000)}`;
  if (rng() > 0.3) result.instagram = `https://instagram.com/${slug}_${tahun % 100}`;
  if (rng() > 0.55) result.facebook = `https://facebook.com/${slug}.id`;
  if (rng() > 0.72) result.tiktok   = `https://tiktok.com/@${slug}`;

  // Kontak
  const domains = ['gmail.com', 'yahoo.co.id', 'outlook.com', 'umm.ac.id'];
  result.email  = `${slug}@${domains[Math.floor(rng() * domains.length)]}`;

  // Pekerjaan berdasarkan prodi
  const jobData = generateJobByProdi(prodi, rng);
  Object.assign(result, jobData);

  // Lokasi
  result.alamatKerja = `${KOTA_ID[Math.floor(rng() * KOTA_ID.length)]}, Indonesia`;

  // Sosmed tempat kerja
  if (result.tempatKerja) {
    const cs = result.tempatKerja.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 25);
    result.sosmedTempatKerja = `https://instagram.com/${cs}_official`;
  }

  return result;
}

function generateJobByProdi(prodi, rng) {
  const isIT   = /informatika|sistem informasi|komputer|teknik elektro/.test(prodi);
  const isEkon = /ekonomi|manajemen|akuntansi|bisnis/.test(prodi);
  const isDok  = /kedokteran|keperawatan|farmasi|kesehatan/.test(prodi);
  const isHuk  = /hukum/.test(prodi);
  const isTek  = /teknik|sipil|mesin|industri/.test(prodi);

  const pools = {
    IT:   { types: ['Swasta','BUMN','Wirausaha'], companies: ['PT Telkom Indonesia','Tokopedia','Gojek','Traveloka','PT Astra Infra'], positions: ['Software Engineer','Data Analyst','IT Consultant','DevOps Engineer','Full-Stack Developer'] },
    Ekon: { types: ['Swasta','PNS','BUMN'], companies: ['Bank BRI','Bank Mandiri','Deloitte Indonesia','PwC Indonesia','Pemkab Malang'], positions: ['Financial Analyst','Accountant','Marketing Manager','Business Analyst','Auditor'] },
    Dok:  { types: ['PNS','Swasta'], companies: ['RSUD dr. Saiful Anwar','RS UMM','Puskesmas Kota Malang','Klinik Pratama'], positions: ['Dokter Umum','Apoteker','Perawat Senior','Dokter Spesialis'] },
    Huk:  { types: ['PNS','Swasta'], companies: ['Kejaksaan RI','Pengadilan Negeri Malang','Kantor Notaris & PPAT','Law Firm Jakarta'], positions: ['Jaksa','Hakim Pratama','Legal Officer','Notaris'] },
    Tek:  { types: ['BUMN','Swasta','PNS'], companies: ['PT PLN (Persero)','PT Semen Indonesia','Bappeda Kota Malang','PT Wijaya Karya'], positions: ['Project Engineer','Civil Engineer','Site Manager','Quality Control Engineer'] },
    Default: { types: ['Swasta','PNS','Wirausaha'], companies: ['CV Mitra Utama','Dinas Kota Malang','PT Nusantara Group','Koperasi Jaya Abadi'], positions: ['Staff','Analis','Konsultan','Supervisor'] },
  };

  const pool = isIT ? pools.IT : isEkon ? pools.Ekon : isDok ? pools.Dok : isHuk ? pools.Huk : isTek ? pools.Tek : pools.Default;

  return {
    jenisPekerjaan: pool.types[Math.floor(rng() * pool.types.length)],
    tempatKerja:    pool.companies[Math.floor(rng() * pool.companies.length)],
    posisi:         pool.positions[Math.floor(rng() * pool.positions.length)],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cari jejak digital alumni dari sumber publik.
 *
 * @param {object} alumni  — Record alumni: { namaLengkap, kampus, prodi, tahunLulus, fakultas }
 * @returns {Promise<object>} — 8 titik data digital footprint
 */
async function scrapeOSINT(alumni) {
  const mode = (process.env.OSINT_MODE || 'simulation').toLowerCase();

  if (mode === 'real') {
    try {
      const real = await realScrapeOSINT(alumni);
      const signalCount = countSignals(real);

      if (signalCount >= 1) {
        return real;
      }

      // Jika tidak satu pun sinyal ditemukan → kembalikan objek kosong
      console.log(`[OSINT] Tidak ada sinyal ditemukan untuk "${alumni.namaLengkap}" — kembalikan kosong`);
      return emptyResult();
    } catch (err) {
      console.error(`[OSINT] Scraping nyata error untuk "${alumni.namaLengkap}": ${err.message}`);
      return emptyResult();
    }
  }

  // Mode simulasi (default untuk dev/demo)
  await delay(300 + Math.random() * 300);
  const sim = simulateScrape(alumni);
  console.log(`[OSINT] Simulation — "${alumni.namaLengkap}"`);
  return sim;
}

module.exports = {
  scrapeOSINT,
  buildSearchQueries,
  extractFromText,
  emptyResult,
  countSignals,
};
