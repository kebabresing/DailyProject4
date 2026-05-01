'use strict';

/**
 * enrichmentService.js — Alumni Data Enrichment Pipeline (v2)
 *
 * Pipeline:
 *  1. buildIdentityProfile  — variasi nama & keyword dari data mahasiswa
 *  2. generateSearchQueries — kombinasi query pencarian
 *  3. extractSignals        — signal terstruktur dari hasil scrape
 *  4. matchIdentity         — confidence scoring & disambiguasi
 *  5. formatEnrichmentResult— output standar
 *  6. autoUpdateToSupabase  — update 8 titik data jika score >= 70%
 *
 * PENTING: HANYA mengisi field yang KOSONG — tidak pernah menimpa data yang sudah ada.
 */

const { scrapeOSINT } = require('./osintScraper');

// ─────────────────────────────────────────────────────────────
// 1. IDENTITY PROFILE BUILDER
// ─────────────────────────────────────────────────────────────

function buildIdentityProfile(alumni) {
  const name       = (alumni.namaLengkap || '').trim();
  const prodi      = alumni.prodi    || '';
  const kampus     = alumni.kampus   || 'Universitas Muhammadiyah Malang';
  const tahunLulus = alumni.tahunLulus || '';
  const fakultas   = alumni.fakultas || '';

  const parts = name.split(/\s+/).filter(Boolean);
  const nameVariations = [name];
  if (parts.length >= 2) {
    nameVariations.push(`${parts[0]} ${parts[parts.length - 1]}`);
    nameVariations.push(parts[0]);
  }
  if (parts.length >= 3) nameVariations.push(parts.slice(0, 2).join(' '));

  const FIELD_MAP = {
    'Informatika':     ['Software Engineer', 'Developer', 'IT', 'Data Analyst'],
    'Sistem Informasi':['System Analyst', 'IT Consultant', 'Business Analyst'],
    'Teknik Elektro':  ['Engineer', 'Electrical', 'Power Systems'],
    'Teknik Mesin':    ['Mechanical Engineer', 'Manufacturing'],
    'Ekonomi':         ['Financial', 'Accounting', 'Business'],
    'Manajemen':       ['Manager', 'Marketing', 'HR', 'Operations'],
    'Akuntansi':       ['Accountant', 'Auditor', 'Tax Consultant'],
    'Hukum':           ['Legal', 'Lawyer', 'Paralegal'],
    'Kedokteran':      ['Dokter', 'Medical', 'Doctor'],
    'Psikologi':       ['Psychologist', 'HRD', 'Counselor'],
    'Farmasi':         ['Apoteker', 'Pharmacist'],
  };
  const inferredRoles = Object.entries(FIELD_MAP).reduce((acc, [key, roles]) => {
    if (prodi.toLowerCase().includes(key.toLowerCase())) acc.push(...roles);
    return acc;
  }, []);

  return {
    name, nameVariations, kampus, prodi, fakultas, tahunLulus,
    inferredRoles: inferredRoles.length ? inferredRoles : ['Professional', 'Alumni'],
    nim: alumni.nim || '',
  };
}

// ─────────────────────────────────────────────────────────────
// 2. SMART QUERY GENERATOR
// ─────────────────────────────────────────────────────────────

function generateSearchQueries(profile) {
  const { name, nameVariations, kampus, prodi, tahunLulus } = profile;
  const shortName = nameVariations[1] || name;
  const queries   = [];

  queries.push({
    source: 'linkedin', label: 'LinkedIn Profile',
    query: `"${name}" "${kampus}"`,
    searchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name + ' ' + kampus)}`,
  });
  queries.push({
    source: 'web', label: 'Web Search Umum',
    query: `"${name}" "${kampus}"`,
    searchUrl: `https://www.google.com/search?q=${encodeURIComponent('"' + name + '" "' + kampus + '"')}`,
  });
  if (tahunLulus) {
    queries.push({
      source: 'web', label: 'Web Search Alumni',
      query: `"${name}" alumni ${tahunLulus} UMM`,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent('"' + shortName + '" alumni ' + tahunLulus)}`,
    });
  }
  if (prodi) {
    queries.push({
      source: 'web', label: 'LinkedIn + Prodi',
      query: `"${name}" "${prodi}" linkedin`,
      searchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name + ' ' + prodi)}`,
    });
  }

  return queries;
}

// ─────────────────────────────────────────────────────────────
// 3. SIGNAL EXTRACTION
// ─────────────────────────────────────────────────────────────

function extractSignals(rawData, alumni, source) {
  const timestamp = new Date().toISOString().split('T')[0];
  const evidences = [];

  if (rawData.posisi || rawData.tempatKerja) {
    evidences.push({
      type: 'job', field: 'posisi', value: rawData.posisi,
      company: rawData.tempatKerja, source, confidence: 75,
      snippet: `${rawData.posisi || '-'} at ${rawData.tempatKerja || '-'}`, date: timestamp,
    });
  }
  [
    { field: 'linkedin',  platform: 'LinkedIn',  value: rawData.linkedin  },
    { field: 'instagram', platform: 'Instagram', value: rawData.instagram },
    { field: 'facebook',  platform: 'Facebook',  value: rawData.facebook  },
    { field: 'tiktok',    platform: 'TikTok',    value: rawData.tiktok    },
  ].forEach(({ field, platform, value }) => {
    if (value) evidences.push({ type: 'social_media', field, platform, value, source, confidence: 60, snippet: `${platform}: ${value}`, date: timestamp });
  });
  if (rawData.email) {
    evidences.push({ type: 'contact', field: 'email', value: rawData.email, source, confidence: 55, snippet: `Email: ${rawData.email}`, date: timestamp });
  }
  return evidences;
}

// ─────────────────────────────────────────────────────────────
// 4. IDENTITY MATCHING
// ─────────────────────────────────────────────────────────────

function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (x === y) return 1.0;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const tokX = new Set(x.split(/\s+/));
  const tokY = new Set(y.split(/\s+/));
  const inter = [...tokX].filter(t => tokY.has(t)).length;
  return inter / Math.max(tokX.size, tokY.size);
}

function textSimilarity(a, b) {
  if (!a || !b) return 0;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 1.0;
  if (x.includes(y) || y.includes(x)) return 0.7;
  const tokX = new Set(x.split(/\s+/));
  const tokY = new Set(y.split(/\s+/));
  const inter = [...tokX].filter(t => tokY.has(t)).length;
  return inter / Math.max(tokX.size, tokY.size);
}

function matchIdentity(alumni, extractedData) {
  const breakdown = [];
  let score = 0;

  // Factor 1: Name (max 40)
  const ns = nameSimilarity(alumni.namaLengkap, extractedData.name || alumni.namaLengkap);
  const np = Math.round(ns * 40);
  score += np;
  breakdown.push({ factor: 'Kesamaan Nama', score: np, max: 40, detail: `${Math.round(ns * 100)}%` });

  // Factor 2: Affiliation (max 20)
  const affText = [extractedData.company, extractedData.activity].join(' ');
  const as = textSimilarity(alumni.kampus || 'UMM', affText);
  const ap = Math.round(as * 20);
  score += ap;
  breakdown.push({ factor: 'Afiliasi Kampus', score: ap, max: 20, detail: as > 0.5 ? 'Match' : 'Tidak ada bukti' });

  // Factor 3: Field/Prodi (max 15)
  const fieldText = [extractedData.title, extractedData.activity].join(' ');
  const fs = textSimilarity(alumni.prodi || '', fieldText);
  const fp = Math.round(fs * 15);
  score += fp;
  breakdown.push({ factor: 'Bidang / Prodi', score: fp, max: 15, detail: fs > 0.5 ? 'Relevan' : 'Kurang relevan' });

  // Factor 4: Location (max 15)
  const locKeywords = ['malang', 'jawa timur', 'east java', 'indonesia'];
  const locText = (extractedData.location || '').toLowerCase();
  const locMatch = locKeywords.some(k => locText.includes(k));
  const lp = locMatch ? 15 : 0;
  score += lp;
  breakdown.push({ factor: 'Lokasi', score: lp, max: 15, detail: locMatch ? 'Indonesia/Jawa Timur' : 'Tidak cocok' });

  // Factor 5: Timeline (max 10)
  const yearsWorking = new Date().getFullYear() - (parseInt(alumni.tahunLulus) || 2020);
  const tp = (yearsWorking >= 0 && yearsWorking <= 30) ? 10 : 0;
  score += tp;
  breakdown.push({ factor: 'Timeline (Lulus→Kerja)', score: tp, max: 10, detail: `${yearsWorking} tahun sejak lulus` });

  const finalScore = Math.min(Math.round(score), 100);
  const classification = finalScore >= 70 ? 'strong_match' : finalScore >= 40 ? 'needs_verification' : 'no_match';

  return { score: finalScore, classification, breakdown };
}

// ─────────────────────────────────────────────────────────────
// 5. STATUS HELPERS
// ─────────────────────────────────────────────────────────────

function statusFromScore(score) {
  if (score >= 70) return 'Teridentifikasi dari Sumber Publik';
  if (score >= 40) return 'Perlu Verifikasi Manual';
  return 'Belum Ditemukan di Sumber Publik';
}

function classificationLabel(c) {
  return c === 'strong_match' ? 'Kemungkinan Kuat'
       : c === 'needs_verification' ? 'Perlu Verifikasi Manual'
       : 'Tidak Cocok';
}

// ─────────────────────────────────────────────────────────────
// 6. OUTPUT FORMATTER
// ─────────────────────────────────────────────────────────────

function formatEnrichmentResult(alumni, scrapedData, matchResult, queries, evidences) {
  const { score, classification, breakdown } = matchResult;
  const status    = statusFromScore(score);
  const timestamp = new Date().toISOString();

  const socialMedia = [];
  if (scrapedData.linkedin)  socialMedia.push({ platform: 'LinkedIn',  url: scrapedData.linkedin });
  if (scrapedData.instagram) socialMedia.push({ platform: 'Instagram', url: scrapedData.instagram });
  if (scrapedData.facebook)  socialMedia.push({ platform: 'Facebook',  url: scrapedData.facebook });
  if (scrapedData.tiktok)    socialMedia.push({ platform: 'TikTok',    url: scrapedData.tiktok });

  return {
    alumni_id:    alumni.id,
    name:         alumni.namaLengkap,
    nim:          alumni.nim || '-',
    prodi:        alumni.prodi || '-',
    tahun_lulus:  alumni.tahunLulus || '-',
    kampus:       alumni.kampus || 'UMM',

    // 8 titik data
    job_title:         scrapedData.posisi           || null,
    company:           scrapedData.tempatKerja      || null,
    work_address:      scrapedData.alamatKerja      || null,
    work_type:         scrapedData.jenisPekerjaan   || null,
    email:             scrapedData.email            || null,
    phone:             scrapedData.noHp             || null,
    social_media:      socialMedia,
    company_social:    scrapedData.sosmedTempatKerja || null,

    activity: scrapedData.posisi && scrapedData.tempatKerja
      ? `${scrapedData.posisi} di ${scrapedData.tempatKerja}`
      : `Alumni ${alumni.kampus || 'UMM'} — ${alumni.prodi || ''}`,

    confidence_score:     score,
    classification,
    classification_label: classificationLabel(classification),
    status,
    score_breakdown:      breakdown,
    evidences,
    sources:              queries.slice(0, 4).map(q => ({ title: q.label, url: q.searchUrl, snippet: q.query })),
    queries_generated:    queries.length,
    enriched_at:          timestamp,
    only_fills_empty:     true,
  };
}

// ─────────────────────────────────────────────────────────────
// 7. AUTO-UPDATE KE SUPABASE (score >= 70%)
// ─────────────────────────────────────────────────────────────

/**
 * Update 8 titik data ke Supabase untuk alumni dengan confidence >= 70%.
 * HANYA mengisi field yang kosong (null/''/'-').
 *
 * @param {object} alumni      — Record alumni dari DB (camelCase)
 * @param {object} enrichment  — Hasil formatEnrichmentResult()
 * @returns {Promise<boolean>} — true jika ada data yang di-update
 */
async function autoUpdateToSupabase(alumni, enrichment) {
  if (enrichment.confidence_score < 70) return false;

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  const isEmpty = (v) => !v || String(v).trim() === '' || v === '-';

  // Mapping: enrichment field → kolom Supabase (snake_case)
  const fieldMap = [
    ['posisi',            enrichment.job_title,       'posisi'],
    ['tempatKerja',       enrichment.company,         'tempat_kerja'],
    ['alamatKerja',       enrichment.work_address,    'alamat_kerja'],
    ['jenisPekerjaan',    enrichment.work_type,       'jenis_pekerjaan'],
    ['email',             enrichment.email,           'email'],
    ['noHp',             enrichment.phone,            'no_hp'],
    ['sosmedTempatKerja', enrichment.company_social,  'sosmed_tempat_kerja'],
    ['linkedin',  enrichment.social_media.find(s => s.platform === 'LinkedIn')?.url,  'linkedin'],
    ['instagram', enrichment.social_media.find(s => s.platform === 'Instagram')?.url, 'instagram'],
    ['facebook',  enrichment.social_media.find(s => s.platform === 'Facebook')?.url,  'facebook'],
    ['tiktok',    enrichment.social_media.find(s => s.platform === 'TikTok')?.url,    'tiktok'],
  ];

  const updatePayload = {};
  for (const [appField, newValue, dbCol] of fieldMap) {
    if (newValue && isEmpty(alumni[appField])) {
      updatePayload[dbCol] = newValue;
    }
  }

  // Selalu update status & confidence
  updatePayload.status           = 'Teridentifikasi dari Sumber Publik';
  updatePayload.confidence_score = enrichment.confidence_score;

  // Append jejak evidence
  const ts      = new Date().toISOString().split('T')[0];
  const snippet = `[AUTO-ENRICHED ${ts}] Score:${enrichment.confidence_score}% — ${enrichment.job_title || '?'} @ ${enrichment.company || '?'}`;
  updatePayload.jejak = alumni.jejak ? `${alumni.jejak} | ${snippet}` : snippet;

  if (Object.keys(updatePayload).length === 0) return false;

  const { error } = await sb.from('alumniv2').update(updatePayload).eq('id', alumni.id);
  if (error) {
    console.error(`[Enrichment] Gagal update alumni ${alumni.id}: ${error.message}`);
    return false;
  }

  const fieldsUpdated = Object.keys(updatePayload).filter(k => !['status','confidence_score','jejak'].includes(k));
  console.log(`[Enrichment] AUTO-UPDATE alumni ${alumni.id} "${alumni.namaLengkap}" — ${fieldsUpdated.length} field baru (score: ${enrichment.confidence_score}%)`);
  return true;
}

// ─────────────────────────────────────────────────────────────
// 8. MAIN PIPELINE — Satu alumni
// ─────────────────────────────────────────────────────────────

async function enrichAlumni(alumni) {
  const profile    = buildIdentityProfile(alumni);
  const queries    = generateSearchQueries(profile);

  // Scrape dengan data alumni sebagai kunci pencarian
  const rawData    = await scrapeOSINT(alumni);
  const evidences  = extractSignals(rawData, alumni, 'osint');

  const extractedData = {
    name:     alumni.namaLengkap,
    title:    rawData.posisi       || '',
    company:  rawData.tempatKerja  || '',
    location: rawData.alamatKerja  || 'Malang, Indonesia',
    activity: rawData.jenisPekerjaan || '',
  };
  const matchResult = matchIdentity(alumni, extractedData);
  return formatEnrichmentResult(alumni, rawData, matchResult, queries, evidences);
}

// ─────────────────────────────────────────────────────────────
// 9. BATCH PIPELINE — Banyak alumni, concurrency-limited
// ─────────────────────────────────────────────────────────────

async function enrichBatch(alumniList) {
  const pLimit = (await import('p-limit')).default;
  const limit  = pLimit(3); // max 3 concurrent
  const EMPTY  = (v) => !v || String(v).trim() === '' || v === '-';

  const tasks = alumniList.map((alumni, idx) => limit(async () => {
    try {
      // Stagger start-time antar worker untuk menghindari burst
      await new Promise(r => setTimeout(r, (idx % 3) * 800));

      const enrichment  = await enrichAlumni(alumni);
      const updatePayload = { ...alumni };
      let hasNewData    = false;

      // Field map: camelCase app → enrichment field
      const fMap = [
        ['posisi',           enrichment.job_title],
        ['tempatKerja',      enrichment.company],
        ['jenisPekerjaan',   enrichment.work_type],
        ['alamatKerja',      enrichment.work_address],
        ['email',            enrichment.email],
        ['noHp',            enrichment.phone],
        ['sosmedTempatKerja', enrichment.company_social],
        ['linkedin',  enrichment.social_media.find(s => s.platform === 'LinkedIn')?.url],
        ['instagram', enrichment.social_media.find(s => s.platform === 'Instagram')?.url],
        ['facebook',  enrichment.social_media.find(s => s.platform === 'Facebook')?.url],
        ['tiktok',    enrichment.social_media.find(s => s.platform === 'TikTok')?.url],
      ];
      fMap.forEach(([field, value]) => {
        if (value && EMPTY(updatePayload[field])) {
          updatePayload[field] = value;
          hasNewData = true;
        }
      });

      // Update status
      if (enrichment.confidence_score >= 70) {
        updatePayload.status          = 'Teridentifikasi dari Sumber Publik';
        updatePayload.confidenceScore = enrichment.confidence_score;
        hasNewData = true;
      } else if (enrichment.confidence_score >= 40 && EMPTY(updatePayload.status)) {
        updatePayload.status = 'Perlu Verifikasi Manual';
        hasNewData = true;
      }

      if (hasNewData) {
        const snip = enrichment.job_title && enrichment.company
          ? `[ENRICHED] ${enrichment.job_title} @ ${enrichment.company} (${enrichment.confidence_score}%)`
          : `[ENRICHED] Data dilengkapi (${enrichment.confidence_score}%)`;
        updatePayload.jejak = updatePayload.jejak ? `${updatePayload.jejak} | ${snip}` : snip;
      }

      return { alumni, enrichment, updatePayload, hasNewData, error: null };
    } catch (err) {
      console.error(`[EnrichBatch] Error "${alumni.namaLengkap}": ${err.message}`);
      return { alumni, enrichment: null, updatePayload: alumni, hasNewData: false, error: err.message };
    }
  }));

  return Promise.all(tasks);
}

module.exports = {
  buildIdentityProfile,
  generateSearchQueries,
  extractSignals,
  matchIdentity,
  formatEnrichmentResult,
  enrichAlumni,
  enrichBatch,
  autoUpdateToSupabase,
  classificationLabel,
  statusFromScore,
};
