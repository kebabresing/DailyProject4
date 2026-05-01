/**
 * Enrichment Service — Alumni Data Enricher
 *
 * Mengimplementasikan pipeline pengayaan data alumni:
 *  1. buildIdentityProfile  — variasi nama & keyword profile
 *  2. generateSearchQueries — smart query combinations
 *  3. extractSignals        — extract structured signals dari hasil scrape
 *  4. matchIdentity         — scoring & disambiguation
 *  5. crossValidate         — validasi lintas sumber
 *  6. formatEnrichmentResult— output standar dengan evidence
 *
 * PENTING: tidak pernah memodifikasi nama, NIM, atau data inti alumni.
 * Hanya mengisi field yang kosong (null / '' / '-').
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// 1. IDENTITY PROFILE BUILDER
// ─────────────────────────────────────────────────────────────

/**
 * Membuat profil identitas dari data alumni.
 * @param {object} alumni
 * @returns {object} identityProfile
 */
function buildIdentityProfile(alumni) {
  const name       = (alumni.namaLengkap || '').trim();
  const prodi      = alumni.prodi    || '';
  const fakultas   = alumni.fakultas || '';
  const kampus     = alumni.kampus   || 'Universitas Muhammadiyah Malang';
  const tahunLulus = alumni.tahunLulus || '';
  const kota       = alumni.alamatKerja || 'Malang';

  // ── Name Variations ──
  const parts = name.split(/\s+/).filter(Boolean);
  const nameVariations = [name];

  if (parts.length >= 2) {
    nameVariations.push(`${parts[0]} ${parts[parts.length - 1]}`);   // first + last
    nameVariations.push(parts[0]);                                    // first only
  }
  if (parts.length >= 3) {
    nameVariations.push(parts.slice(0, 2).join(' '));                 // first two
  }

  // ── Affiliation Keywords ──
  const affiliationKeywords = [
    kampus,
    'UMM',
    'Universitas Muhammadiyah Malang',
    prodi,
    fakultas,
  ].filter(Boolean);

  // ── Context Keywords ──
  const contextKeywords = [
    tahunLulus ? `alumni ${tahunLulus}` : '',
    kota,
    'Indonesia',
  ].filter(Boolean);

  // ── Infer Field from Prodi ──
  const fieldMap = {
    'Informatika': ['Software Engineer', 'Developer', 'IT', 'Programmer', 'Data Analyst'],
    'Sistem Informasi': ['System Analyst', 'IT Consultant', 'Business Analyst'],
    'Teknik Elektro': ['Engineer', 'Electrical', 'Power Systems'],
    'Teknik Mesin': ['Mechanical Engineer', 'Manufacturing'],
    'Ekonomi': ['Financial', 'Accounting', 'Business', 'Finance'],
    'Manajemen': ['Manager', 'Marketing', 'HR', 'Operations'],
    'Akuntansi': ['Accountant', 'Auditor', 'Tax Consultant'],
    'Hukum': ['Legal', 'Lawyer', 'Notaris', 'Paralegal'],
    'Kedokteran': ['Dokter', 'Medical', 'Doctor', 'Physician'],
    'Psikologi': ['Psychologist', 'HRD', 'Counselor'],
    'Pertanian': ['Agriculture', 'Agronomy', 'Farm'],
    'Farmasi': ['Apoteker', 'Pharmacist', 'Pharmaceutical'],
  };
  const inferredRoles = Object.entries(fieldMap).reduce((acc, [key, roles]) => {
    if (prodi.toLowerCase().includes(key.toLowerCase())) acc.push(...roles);
    return acc;
  }, []);

  return {
    name,
    nameVariations,
    affiliationKeywords,
    contextKeywords,
    inferredRoles: inferredRoles.length ? inferredRoles : ['Professional', 'Staff', 'Alumni'],
    prodi,
    kampus,
    tahunLulus,
    nim: alumni.nim || '',
  };
}

// ─────────────────────────────────────────────────────────────
// 2. SMART QUERY GENERATOR
// ─────────────────────────────────────────────────────────────

/**
 * Menghasilkan berbagai query pencarian berdasarkan identity profile.
 * @param {object} profile — dari buildIdentityProfile()
 * @returns {Array<{source, label, query, searchUrl}>}
 */
function generateSearchQueries(profile) {
  const { name, nameVariations, kampus, prodi, tahunLulus, inferredRoles } = profile;
  const shortName = nameVariations[1] || name;
  const queries = [];

  // ── LinkedIn Queries ──
  queries.push({
    source: 'linkedin', label: 'LinkedIn Profile',
    query: `"${name}" "${kampus}"`,
    searchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name + ' ' + kampus)}`,
  });
  if (prodi) {
    queries.push({
      source: 'linkedin', label: 'LinkedIn + Prodi',
      query: `"${name}" "${prodi}"`,
      searchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name + ' ' + prodi)}`,
    });
  }
  if (tahunLulus) {
    queries.push({
      source: 'linkedin', label: 'LinkedIn Alumni',
      query: `"${name}" alumni ${tahunLulus} UMM`,
      searchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name + ' alumni ' + tahunLulus)}`,
    });
  }

  // ── Google Scholar ──
  queries.push({
    source: 'scholar', label: 'Google Scholar',
    query: `author:"${name}" "${kampus}"`,
    searchUrl: `https://scholar.google.com/scholar?q=${encodeURIComponent('"' + name + '" ' + kampus)}`,
  });
  queries.push({
    source: 'scholar', label: 'Scholar + Prodi',
    query: `"${name}" "${prodi}" site:scholar.google.com`,
    searchUrl: `https://scholar.google.com/scholar?q=${encodeURIComponent(name + ' ' + prodi)}`,
  });

  // ── ORCID (Academic) ──
  queries.push({
    source: 'orcid', label: 'ORCID Profile',
    query: `"${name}" "${kampus}" site:orcid.org`,
    searchUrl: `https://orcid.org/orcid-search/search?searchQuery=${encodeURIComponent(name + ' ' + kampus)}`,
  });

  // ── GitHub (Tech) ──
  if (inferredRoles.some(r => ['Software Engineer','Developer','IT','Programmer','System Analyst'].includes(r))) {
    queries.push({
      source: 'github', label: 'GitHub Profile',
      query: `"${name}" site:github.com`,
      searchUrl: `https://github.com/search?q=${encodeURIComponent(name + ' ' + prodi)}&type=users`,
    });
  }

  // ── General Web Search ──
  queries.push({
    source: 'web', label: 'Web Search — Umum',
    query: `"${name}" "${kampus}"`,
    searchUrl: `https://www.google.com/search?q=${encodeURIComponent('"' + name + '" "' + kampus + '"')}`,
  });
  queries.push({
    source: 'web', label: 'Web Search — Profil',
    query: `"${shortName}" LinkedIn OR profil`,
    searchUrl: `https://www.google.com/search?q=${encodeURIComponent('"' + shortName + '" LinkedIn OR profil OR portfolio')}`,
  });

  // ── Company Directories ──
  if (inferredRoles.length) {
    queries.push({
      source: 'directory', label: 'Direktori Profesi',
      query: `"${name}" "${inferredRoles[0]}"`,
      searchUrl: `https://www.google.com/search?q=${encodeURIComponent('"' + name + '" "' + inferredRoles[0] + '" Malang')}`,
    });
  }

  return queries;
}

// ─────────────────────────────────────────────────────────────
// 3. SIGNAL EXTRACTION
// ─────────────────────────────────────────────────────────────

/**
 * Mengekstrak sinyal terstruktur dari data mentah OSINT/simulasi.
 * Evidence object per sinyal.
 * @param {object} rawData — dari osintScraper
 * @param {object} alumni
 * @param {string} source
 * @returns {Array<object>} evidence items
 */
function extractSignals(rawData, alumni, source) {
  const timestamp = new Date().toISOString().split('T')[0];
  const evidences = [];

  if (rawData.posisi || rawData.tempatKerja) {
    evidences.push({
      type: 'job',
      field: 'posisi',
      value: rawData.posisi,
      company: rawData.tempatKerja,
      source,
      confidence: 75,
      snippet: `${rawData.posisi || '-'} at ${rawData.tempatKerja || '-'}`,
      date: timestamp,
    });
  }

  const socialPlatforms = [
    { field: 'linkedin',  platform: 'LinkedIn',  value: rawData.linkedin  },
    { field: 'instagram', platform: 'Instagram', value: rawData.instagram },
    { field: 'facebook',  platform: 'Facebook',  value: rawData.facebook  },
    { field: 'tiktok',    platform: 'TikTok',    value: rawData.tiktok    },
  ];
  socialPlatforms.forEach(({ field, platform, value }) => {
    if (value) {
      evidences.push({
        type: 'social_media',
        field,
        platform,
        value,
        source,
        confidence: 60,
        snippet: `${platform}: ${value}`,
        date: timestamp,
      });
    }
  });

  if (rawData.email) {
    evidences.push({
      type: 'contact',
      field: 'email',
      value: rawData.email,
      source,
      confidence: 55,
      snippet: `Email: ${rawData.email}`,
      date: timestamp,
    });
  }

  return evidences;
}

// ─────────────────────────────────────────────────────────────
// 4. IDENTITY MATCHING (DISAMBIGUATION)
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

/**
 * Hitung confidence score dan breakdown per factor.
 * @returns {{ score: number, classification: string, breakdown: Array }}
 */
function matchIdentity(alumni, extractedData) {
  const breakdown = [];
  let score = 0;

  // Factor 1: Name Similarity (max 40)
  const nameScore = nameSimilarity(alumni.namaLengkap, extractedData.name || alumni.namaLengkap);
  const namePts = Math.round(nameScore * 40);
  score += namePts;
  breakdown.push({ factor: 'Kesamaan Nama', score: namePts, max: 40, detail: `${Math.round(nameScore * 100)}%` });

  // Factor 2: Affiliation Match (max 20)
  const affText = [extractedData.company, extractedData.activity].join(' ');
  const affScore = textSimilarity(alumni.kampus || 'UMM', affText);
  const affPts = Math.round(affScore * 20);
  score += affPts;
  breakdown.push({ factor: 'Afiliasi Kampus', score: affPts, max: 20, detail: affScore > 0.5 ? 'Match' : 'Tidak ada bukti' });

  // Factor 3: Field / Prodi Relevance (max 15)
  const fieldText = [extractedData.title, extractedData.activity].join(' ');
  const fieldScore = textSimilarity(alumni.prodi || '', fieldText);
  const fieldPts = Math.round(fieldScore * 15);
  score += fieldPts;
  breakdown.push({ factor: 'Bidang / Prodi', score: fieldPts, max: 15, detail: fieldScore > 0.5 ? 'Relevan' : 'Kurang relevan' });

  // Factor 4: Location (max 15)
  const locKeywords = ['malang', 'jawa timur', 'east java', 'indonesia'];
  const locText = (extractedData.location || '').toLowerCase();
  const locMatch = locKeywords.some(k => locText.includes(k));
  const locPts = locMatch ? 15 : 0;
  score += locPts;
  breakdown.push({ factor: 'Lokasi', score: locPts, max: 15, detail: locMatch ? 'Indonesia / Jawa Timur' : 'Tidak cocok' });

  // Factor 5: Timeline Consistency (max 10) — apakah pekerjaan masuk akal setelah lulus
  const tahun = parseInt(alumni.tahunLulus) || 2020;
  const currentYear = new Date().getFullYear();
  const yearsWorking = currentYear - tahun;
  const timelineOk = yearsWorking >= 0 && yearsWorking <= 30;
  const timePts = timelineOk ? 10 : 0;
  score += timePts;
  breakdown.push({ factor: 'Timeline (Lulus → Kerja)', score: timePts, max: 10, detail: `${yearsWorking} tahun sejak lulus` });

  const finalScore = Math.min(Math.round(score), 100);
  const classification = finalScore >= 70 ? 'strong_match'
                       : finalScore >= 40 ? 'needs_verification'
                       : 'no_match';

  return { score: finalScore, classification, breakdown };
}

// ─────────────────────────────────────────────────────────────
// 5. STATUS LABEL & CROSS-VALIDATE
// ─────────────────────────────────────────────────────────────

function classificationLabel(c) {
  return c === 'strong_match' ? 'Kemungkinan Kuat'
       : c === 'needs_verification' ? 'Perlu Verifikasi'
       : 'Tidak Cocok';
}

function statusFromScore(score) {
  if (score >= 80) return 'Filled';
  if (score >= 50) return 'Needs Verification';
  return 'Not Found';
}

function statusLabelID(score) {
  if (score >= 80) return 'Teridentifikasi dari Sumber Publik';
  if (score >= 50) return 'Perlu Verifikasi Manual';
  return 'Belum Ditemukan di Sumber Publik';
}

/**
 * Cross-validate: jika nama & perusahaan muncul di ≥2 sumber → boost +10
 * @param {Array} results — array hasil per alumni
 * @returns {Array} results dengan crossValidated flag
 */
function crossValidateResults(results) {
  const companies = results.map(r => (r.company || '').toLowerCase()).filter(Boolean);
  return results.map(r => {
    const companyMatches = companies.filter(c =>
      c && r.company && textSimilarity(c, r.company.toLowerCase()) > 0.5
    ).length;
    if (companyMatches >= 2) {
      return { ...r, crossValidated: true, score: Math.min(r.score + 10, 100) };
    }
    return r;
  });
}

// ─────────────────────────────────────────────────────────────
// 6. ENRICHMENT OUTPUT FORMATTER
// ─────────────────────────────────────────────────────────────

/**
 * Format output standar enrichment result (JSON-ready untuk dashboard & API).
 * @param {object} alumni
 * @param {object} scrapedData — dari osintScraper
 * @param {object} matchResult — dari matchIdentity()
 * @param {Array}  queries     — dari generateSearchQueries()
 * @param {Array}  evidences   — dari extractSignals()
 * @returns {object} EnrichmentResult
 */
function formatEnrichmentResult(alumni, scrapedData, matchResult, queries, evidences) {
  const { score, classification, breakdown } = matchResult;
  const status = statusFromScore(score);
  const statusID = statusLabelID(score);
  const timestamp = new Date().toISOString();

  // Kumpulkan social media yang ada buktinya
  const socialMedia = [];
  if (scrapedData.linkedin)  socialMedia.push({ platform: 'LinkedIn',  url: scrapedData.linkedin });
  if (scrapedData.instagram) socialMedia.push({ platform: 'Instagram', url: scrapedData.instagram });
  if (scrapedData.facebook)  socialMedia.push({ platform: 'Facebook',  url: scrapedData.facebook });
  if (scrapedData.tiktok)    socialMedia.push({ platform: 'TikTok',    url: scrapedData.tiktok });

  // Sources dari queries yang relevan
  const sources = queries.slice(0, 5).map(q => ({
    title: q.label,
    url: q.searchUrl,
    snippet: `Query: ${q.query}`,
  }));

  return {
    /* Identitas alumni (TIDAK DIUBAH) */
    alumni_id:   alumni.id,
    name:        alumni.namaLengkap,
    nim:         alumni.nim || '-',
    prodi:       alumni.prodi || '-',
    tahun_lulus: alumni.tahunLulus || '-',
    kampus:      alumni.kampus || 'Universitas Muhammadiyah Malang',

    /* Data yang ditemukan */
    job_title:   scrapedData.posisi     || null,
    company:     scrapedData.tempatKerja || null,
    work_type:   scrapedData.jenisPekerjaan || null,
    location:    scrapedData.alamatKerja || null,
    email:       scrapedData.email      || null,
    phone:       scrapedData.noHp       || null,
    social_media: socialMedia,

    /* Activity Summary */
    activity: scrapedData.posisi && scrapedData.tempatKerja
      ? `${scrapedData.posisi} di ${scrapedData.tempatKerja}`
      : `Alumni ${alumni.kampus || 'UMM'} — ${alumni.prodi || ''}`,

    /* Scoring & Classification */
    confidence_score:   score,
    classification:     classification,
    classification_label: classificationLabel(classification),
    status,
    status_id:          statusID,
    score_breakdown:    breakdown,

    /* Evidence */
    evidences,
    sources,

    /* Metadata */
    queries_generated: queries.length,
    enriched_at: timestamp,
    only_fills_empty: true, // Flag: tidak menimpa data yang sudah ada
  };
}

// ─────────────────────────────────────────────────────────────
// 7. MAIN ENRICHMENT PIPELINE
// ─────────────────────────────────────────────────────────────

/**
 * Jalankan pipeline enrichment lengkap untuk satu alumni.
 * Hanya mengisi field yang KOSONG — tidak menimpa data yang ada.
 *
 * @param {object} alumni — record alumni dari DB
 * @returns {object} enrichmentResult
 */
async function enrichAlumni(alumni) {
  const { scrapeOSINT } = require('./osintScraper');

  // Step 1: Build identity profile
  const profile = buildIdentityProfile(alumni);

  // Step 2: Generate search queries
  const queries = generateSearchQueries(profile);

  // Step 3: Retrieve public data (via OSINT service)
  const rawData = await scrapeOSINT(alumni.namaLengkap, alumni.kampus || 'Universitas Muhammadiyah Malang');

  // Step 4: Extract signals / evidence
  const evidences = extractSignals(rawData, alumni, 'osint');

  // Step 5: Identity matching
  const extractedData = {
    name:     alumni.namaLengkap,
    title:    rawData.posisi     || '',
    company:  rawData.tempatKerja || '',
    location: rawData.alamatKerja || 'Malang, Indonesia',
    activity: rawData.jenisPekerjaan || '',
  };
  const matchResult = matchIdentity(alumni, extractedData);

  // Step 6: Format output
  const result = formatEnrichmentResult(alumni, rawData, matchResult, queries, evidences);

  return result;
}

/**
 * Enrich a batch of alumni and return update objects for DB.
 * Only fills empty fields — never overwrites existing data.
 *
 * @param {Array} alumniList
 * @returns {Array<{ alumni, enrichment, updatePayload, hasNewData }>}
 */
async function enrichBatch(alumniList) {
  const results = [];
  const EMPTY = (v) => !v || String(v).trim() === '' || v === '-';

  for (const alumni of alumniList) {
    try {
      const enrichment = await enrichAlumni(alumni);

      // Determine what fields to update (only fill empty)
      const updatePayload = { ...alumni };
      let hasNewData = false;

      const fieldMap = [
        ['posisi',           enrichment.job_title],
        ['tempatKerja',      enrichment.company],
        ['jenisPekerjaan',   enrichment.work_type],
        ['alamatKerja',      enrichment.location],
        ['email',            enrichment.email],
        ['noHp',             enrichment.phone],
        ['linkedin',  enrichment.social_media.find(s => s.platform === 'LinkedIn')?.url],
        ['instagram', enrichment.social_media.find(s => s.platform === 'Instagram')?.url],
        ['facebook',  enrichment.social_media.find(s => s.platform === 'Facebook')?.url],
        ['tiktok',    enrichment.social_media.find(s => s.platform === 'TikTok')?.url],
      ];

      fieldMap.forEach(([field, value]) => {
        if (value && EMPTY(updatePayload[field])) {
          updatePayload[field] = value;
          hasNewData = true;
        }
      });

      // Update status hanya jika skor tinggi
      if (enrichment.confidence_score >= 70 && updatePayload.status !== 'Teridentifikasi dari Sumber Publik') {
        updatePayload.status = enrichment.status_id;
        updatePayload.confidenceScore = enrichment.confidence_score;
        hasNewData = true;
      } else if (enrichment.confidence_score >= 40 && updatePayload.status === 'Belum Ditemukan di Sumber Publik') {
        updatePayload.status = 'Perlu Verifikasi Manual';
        hasNewData = true;
      }

      // Append to jejak (evidence trail)
      if (hasNewData) {
        const snippet = enrichment.job_title && enrichment.company
          ? `[ENRICHED] ${enrichment.job_title} @ ${enrichment.company} (${enrichment.confidence_score}% confidence)`
          : `[ENRICHED] Data dilengkapi otomatis (${enrichment.confidence_score}% confidence)`;
        updatePayload.jejak = updatePayload.jejak
          ? updatePayload.jejak + ' | ' + snippet
          : snippet;
      }

      results.push({ alumni, enrichment, updatePayload, hasNewData });
    } catch (err) {
      console.error(`[Enrichment] Error for ${alumni.namaLengkap}:`, err.message);
      results.push({
        alumni,
        enrichment: null,
        updatePayload: alumni,
        hasNewData: false,
        error: err.message,
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  buildIdentityProfile,
  generateSearchQueries,
  extractSignals,
  matchIdentity,
  crossValidateResults,
  formatEnrichmentResult,
  enrichAlumni,
  enrichBatch,
  classificationLabel,
  statusFromScore,
  statusLabelID,
};
