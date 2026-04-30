/**
 * Alumni Data Completeness Scoring System
 *
 * Bobot Penilaian:
 *   email         → 20%
 *   noHp          → 20%
 *   tempatKerja   → 20%
 *   alamatKerja   → 20%
 *   posisi        → 10%
 *   sosialMedia   → 10%  (LinkedIn/IG/FB/TikTok — salah satu sudah cukup)
 *
 * Klasifikasi Otomatis:
 *   ≥ 70  → Teridentifikasi dari Sumber Publik
 *   40–69 → Perlu Verifikasi Manual
 *   < 40  → Belum Ditemukan di Sumber Publik
 */

const WEIGHTS = {
  email:       20,
  noHp:        20,
  tempatKerja: 20,
  alamatKerja: 20,
  posisi:      10,
  sosialMedia: 10,  // any of linkedin/instagram/facebook/tiktok
};

/**
 * Hitung completeness score (0–100) dari objek alumni (camelCase).
 * @param {object} alumni
 * @returns {{ score: number, breakdown: object, classification: string, statusLabel: string }}
 */
function calcCompletenessScore(alumni) {
  const has = (v) => v && String(v).trim() !== '' && v !== '-';

  const hasSosmed = has(alumni.linkedin) || has(alumni.instagram) ||
                    has(alumni.facebook) || has(alumni.tiktok);

  const breakdown = {
    email:       has(alumni.email)       ? WEIGHTS.email       : 0,
    noHp:        has(alumni.noHp)        ? WEIGHTS.noHp        : 0,
    tempatKerja: has(alumni.tempatKerja) ? WEIGHTS.tempatKerja : 0,
    alamatKerja: has(alumni.alamatKerja) ? WEIGHTS.alamatKerja : 0,
    posisi:      has(alumni.posisi)      ? WEIGHTS.posisi      : 0,
    sosialMedia: hasSosmed               ? WEIGHTS.sosialMedia : 0,
  };

  const score = Object.values(breakdown).reduce((s, v) => s + v, 0);
  const classification = classifyByScore(score);

  return { score, breakdown, classification, statusLabel: statusLabelOf(classification) };
}

function classifyByScore(score) {
  if (score >= 70) return 'Teridentifikasi dari Sumber Publik';
  if (score >= 40) return 'Perlu Verifikasi Manual';
  return 'Belum Ditemukan di Sumber Publik';
}

function statusLabelOf(classification) {
  switch (classification) {
    case 'Teridentifikasi dari Sumber Publik': return 'Teridentifikasi';
    case 'Perlu Verifikasi Manual':            return 'Perlu Verifikasi';
    default:                                   return 'Belum Ditemukan';
  }
}

/**
 * Auto-suggest data alumni berdasarkan pola prodi + kampus yang sudah ada di dataset.
 * @param {object} alumni – alumni yang akan diisi data (harus ada prodi)
 * @param {Array}  allAlumni – seluruh alumni untuk pola referensi
 * @returns {object} suggestions
 */
function autoSuggest(alumni, allAlumni) {
  const prodi = (alumni.prodi || '').toLowerCase();

  // Cari alumni dengan prodi yang sama dan data pekerjaan lengkap
  const peers = allAlumni.filter(a =>
    a.id !== alumni.id &&
    (a.prodi || '').toLowerCase() === prodi &&
    (a.tempatKerja || a.posisi || a.jenisPekerjaan)
  );

  if (peers.length === 0) return {};

  // Hitung frekuensi jenis pekerjaan
  const jenisCounts = {};
  peers.forEach(a => {
    if (a.jenisPekerjaan) jenisCounts[a.jenisPekerjaan] = (jenisCounts[a.jenisPekerjaan] || 0) + 1;
  });
  const topJenis = Object.entries(jenisCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Top tempat kerja
  const companyCounts = {};
  peers.forEach(a => {
    if (a.tempatKerja) companyCounts[a.tempatKerja] = (companyCounts[a.tempatKerja] || 0) + 1;
  });
  const topCompanies = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

  // Top posisi
  const posisiCounts = {};
  peers.forEach(a => {
    if (a.posisi) posisiCounts[a.posisi] = (posisiCounts[a.posisi] || 0) + 1;
  });
  const topPosisi = Object.entries(posisiCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

  return {
    suggestedJenis:     topJenis,
    suggestedCompanies: topCompanies,
    suggestedPosisi:    topPosisi,
    basedOn:            peers.length,
  };
}

/**
 * Mask data sensitif untuk role Viewer.
 * email: c****@gmail.com  |  noHp: +62****5678
 */
function maskSensitiveData(alumni) {
  const masked = { ...alumni };
  if (masked.email && masked.email !== '-') {
    const [local, domain] = masked.email.split('@');
    masked.email = local.slice(0, 1) + '****' + (domain ? '@' + domain : '');
  }
  if (masked.noHp && masked.noHp !== '-') {
    masked.noHp = masked.noHp.slice(0, 4) + '****' + masked.noHp.slice(-4);
  }
  return masked;
}

module.exports = { calcCompletenessScore, classifyByScore, autoSuggest, maskSensitiveData, WEIGHTS };
