/**
 * Phase 4 — Media matching + enrichment against free-exercise-db.
 *
 *   node scripts/enrich_exercise_media.cjs --dry-run
 *   node scripts/enrich_exercise_media.cjs --write-matches
 *   node scripts/enrich_exercise_media.cjs --validate-urls   (HEAD-check HTTPS)
 *   node scripts/enrich_exercise_media.cjs --write-matches --validate-urls
 *
 * Never invents URLs. Only associates curated PT seed names → existing
 * free-exercise-db image_url entries above the confidence threshold.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const SEED = path.join(ROOT, 'db', 'exerciseSeedData.ts');
const FEDB = path.join(ROOT, 'assets', 'data', 'exercise-db.json');
const OUT = path.join(ROOT, 'assets', 'data', 'exercise-media-matches.json');
const REPORT = path.join(ROOT, 'scripts', 'reports', 'media-enrichment-report.json');

const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--write-matches');
const writeMatches = process.argv.includes('--write-matches');
const validateUrls = process.argv.includes('--validate-urls');
const AUTO_THRESHOLD = 75;
const REVIEW_THRESHOLD = 60;

function normalizeExerciseKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Variant tokens that must agree between seed and donor (or be absent on both). */
const VARIANT_GROUPS = [
  ['inclinad', 'incline'],
  ['declinad', 'decline'],
  ['diamante', 'diamond'],
  ['fechad', 'close grip', 'close-grip', 'close'],
  ['larg', 'wide'],
  ['invers', 'reverse', 'underhand', 'chin'],
  ['unilateral', 'single leg', 'one arm', 'single arm'],
  ['sentad', 'seated'],
  ['em pe', 'standing'],
  ['smith'],
  ['cabo', 'cable', 'polia'],
  ['halter', 'dumbbell'],
  ['barra', 'barbell'],
  ['maquina', 'machine'],
  ['elastico', 'band', 'resistance band'],
  ['sumo'],
  ['rumano', 'romanian', 'rdl'],
  ['bulgariano', 'bulgarian'],
  ['frontal', 'front'],
  ['lateral', 'side'],
  ['milit', 'overhead press', 'military'],
];

const MEDIA_BRIDGES = require('./media_bridges.cjs');

/** Same-movement PT aliases that may share a verified still (not biomechanical variants). */
const PT_MEDIA_ALIASES = {
  'Face Pull no Cabo': 'Face Pull',
  'Ponte de Glúteos com Barra': 'Ponte de Glúteos',
  'Hip Thrust com Halter': 'Hip Thrust com Barra',
  'Flexões Diamante (Tríceps)': 'Flexões Diamante',
  'Supino Apertado': 'Supino Apertado com Barra',
};

const EQUIP_SYNONYMS = {
  bodyweight: ['bodyweight', 'none', ''],
  barbell: ['barbell', 'ez_bar', 'smith'],
  dumbbell: ['dumbbell'],
  cable: ['cable'],
  machine: ['machine', 'gymleco'],
  kettlebell: ['kettlebell'],
  band: ['bands', 'band', 'resistance band'],
};

function equipCompatible(seedEq, donorEq) {
  const a = String(seedEq || '').toLowerCase();
  const b = String(donorEq || '').toLowerCase();
  if (!a || !b) return true;
  if (a === b) return true;
  for (const [canon, syns] of Object.entries(EQUIP_SYNONYMS)) {
    const inA = a === canon || syns.includes(a) || a.includes(canon);
    const inB = b === canon || syns.includes(b) || b.includes(canon);
    if (inA && inB) return true;
  }
  // barbell vs smith often ok for media demo
  if ((a === 'barbell' && b === 'smith') || (a === 'smith' && b === 'barbell')) return true;
  return false;
}

function muscleCompatible(seedM, donorM) {
  const a = String(seedM || '').toLowerCase();
  const b = String(donorM || '').toLowerCase();
  if (!a || !b) return true;
  if (a === b) return true;
  const aliases = {
    abs: ['abs', 'core'],
    glutes: ['glutes', 'gluteus'],
    calves: ['calves', 'calf'],
    lats: ['lats', 'back'],
    middle_back: ['middle_back', 'back'],
    lower_back: ['lower_back', 'back'],
  };
  for (const syns of Object.values(aliases)) {
    if (syns.includes(a) && syns.includes(b)) return true;
  }
  // back family
  if ((a === 'back' || a.includes('back') || a === 'lats') &&
      (b === 'back' || b.includes('back') || b === 'lats' || b === 'middle_back' || b === 'lower_back')) {
    return true;
  }
  return false;
}

function variantFingerprint(key) {
  const hits = [];
  for (let i = 0; i < VARIANT_GROUPS.length; i++) {
    const group = VARIANT_GROUPS[i];
    if (group.some((t) => key.includes(t))) hits.push(i);
  }
  return hits;
}

function variantsConflict(keyA, keyB) {
  const a = new Set(variantFingerprint(keyA));
  const b = new Set(variantFingerprint(keyB));
  // conflicting if one has incline and other has decline, etc.
  const exclusivePairs = [
    [0, 1], // incline vs decline
  ];
  for (const [x, y] of exclusivePairs) {
    if ((a.has(x) && b.has(y)) || (a.has(y) && b.has(x))) return true;
  }
  // if A has a variant group and B doesn't for differentiating groups, soft penalty handled in score
  return false;
}

function tokenSet(key) {
  const stop = new Set(['com', 'de', 'da', 'do', 'na', 'no', 'em', 'the', 'a', 'an', 'and', 'with', 'for', 'to', 'of']);
  return new Set(key.split(' ').filter((t) => t.length > 1 && !stop.has(t)));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}

function extractParenEn(name) {
  const m = String(name).match(/\(([^)]+)\)/);
  return m ? m[1].trim() : null;
}

function parseSeed() {
  const src = fs.readFileSync(SEED, 'utf8');
  const rows = [];
  const re = /\{\s*name:\s*'((?:\\'|[^'])*)'\s*,\s*primary_muscle:\s*'([^']*)'\s*,\s*secondary_muscles:\s*'([^']*)'\s*,\s*equipment:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(src))) {
    rows.push({
      name: m[1].replace(/\\'/g, "'"),
      primary_muscle: m[2],
      secondary_muscles: m[3],
      equipment: m[4],
    });
  }
  return rows;
}

function scoreMatch(seed, donor) {
  const sk = normalizeExerciseKey(seed.name);
  const dk = normalizeExerciseKey(donor.name);
  let score = 0;
  const reasons = [];

  if (sk === dk) {
    score = 100;
    reasons.push('exact_key');
  } else {
    const paren = extractParenEn(seed.name);
    if (paren && normalizeExerciseKey(paren) === dk) {
      score = 96;
      reasons.push('paren_en');
    } else {
      const jac = jaccard(tokenSet(sk), tokenSet(dk));
      score = Math.round(jac * 70);
      reasons.push(`jaccard:${jac.toFixed(2)}`);
    }
  }

  if (variantsConflict(sk, dk)) {
    score = Math.min(score, 40);
    reasons.push('variant_conflict');
  } else {
    const va = variantFingerprint(sk);
    const vb = variantFingerprint(dk);
    const shared = va.filter((i) => vb.includes(i));
    if (shared.length) {
      score = Math.min(100, score + 8 * shared.length);
      reasons.push('variant_agree');
    } else if (va.length && !vb.length) {
      score -= 15;
      reasons.push('variant_missing_on_donor');
    }
  }

  if (muscleCompatible(seed.primary_muscle, donor.primary_muscle)) {
    score = Math.min(100, score + 5);
    reasons.push('muscle_ok');
  } else {
    score -= 25;
    reasons.push('muscle_mismatch');
  }

  if (equipCompatible(seed.equipment, donor.equipment)) {
    score = Math.min(100, score + 5);
    reasons.push('equip_ok');
  } else {
    score -= 20;
    reasons.push('equip_mismatch');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function headOk(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!url || !/^https:\/\//i.test(url)) {
      resolve({ ok: false, status: 0, error: 'not_https' });
      return;
    }
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method: 'HEAD', timeout: timeoutMs }, (res) => {
      const status = res.statusCode || 0;
      const type = String(res.headers['content-type'] || '');
      const ok = status >= 200 && status < 400 && (/image\//i.test(type) || type === '' || /octet-stream/i.test(type));
      res.resume();
      resolve({ ok, status, contentType: type });
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: 'timeout' });
    });
    req.end();
  });
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function buildBridgeIndex(donors) {
  const byKey = new Map();
  for (const d of donors) byKey.set(normalizeExerciseKey(d.name), d);
  const bridges = [];
  for (const [en, pt] of Object.entries(MEDIA_BRIDGES)) {
    const donor = byKey.get(normalizeExerciseKey(en));
    if (!donor || !donor.image_url) continue;
    bridges.push({ pt, donor, score: 95, reasons: ['explicit_bridge'] });
  }
  return bridges;
}

async function main() {
  const seed = parseSeed();
  const donors = JSON.parse(fs.readFileSync(FEDB, 'utf8')).filter((d) => d.image_url && /^https:\/\//i.test(d.image_url));
  const donorsByKey = new Map();
  for (const d of donors) donorsByKey.set(normalizeExerciseKey(d.name), d);

  const bridgeByPt = new Map();
  for (const b of buildBridgeIndex(donors)) {
    bridgeByPt.set(normalizeExerciseKey(b.pt), b);
  }

  const results = [];
  for (const s of seed) {
    const sk = normalizeExerciseKey(s.name);
    let best = null;

    const bridge = bridgeByPt.get(sk);
    if (bridge) {
      best = {
        seedName: s.name,
        donorName: bridge.donor.name,
        apiId: bridge.donor.api_id || '',
        imageUrl: bridge.donor.image_url,
        thumbnailUrl: bridge.donor.image_url,
        gifUrl: '',
        videoUrl: '',
        score: bridge.score,
        reasons: bridge.reasons,
        source: 'free-exercise-db',
        license: 'Unlicense (yuhonas/free-exercise-db)',
      };
    }

    // Exact / paren / fuzzy against all donors with same muscle when possible
    const candidates = [];
    const exact = donorsByKey.get(sk);
    if (exact) candidates.push(exact);
    const paren = extractParenEn(s.name);
    if (paren) {
      const p = donorsByKey.get(normalizeExerciseKey(paren));
      if (p) candidates.push(p);
    }
    // Limited fuzzy: only donors sharing muscle group
    for (const d of donors) {
      if (!muscleCompatible(s.primary_muscle, d.primary_muscle)) continue;
      const { score } = scoreMatch(s, d);
      if (score >= REVIEW_THRESHOLD) candidates.push(d);
    }
    // Deduplicate candidates
    const seen = new Set();
    for (const d of candidates) {
      if (seen.has(d.api_id || d.name)) continue;
      seen.add(d.api_id || d.name);
      const scored = scoreMatch(s, d);
      if (!best || scored.score > best.score) {
        best = {
          seedName: s.name,
          donorName: d.name,
          apiId: d.api_id || '',
          imageUrl: d.image_url,
          thumbnailUrl: d.image_url,
          gifUrl: '',
          videoUrl: '',
          score: scored.score,
          reasons: scored.reasons,
          source: 'free-exercise-db',
          license: 'Unlicense (yuhonas/free-exercise-db)',
        };
      }
    }

    if (!best) {
      results.push({
        seedName: s.name,
        action: 'NONE',
        score: 0,
        reasons: ['no_candidate'],
      });
      continue;
    }

    let action = 'REJECT';
    if (best.score >= AUTO_THRESHOLD) action = 'ADD';
    else if (best.score >= REVIEW_THRESHOLD) action = 'REVIEW';

    results.push({ ...best, action });
  }

  // PT→PT aliases sharing an already-matched still (same movement, different label).
  const addByName = new Map(results.filter((r) => r.action === 'ADD').map((r) => [r.seedName, r]));
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.action === 'ADD') continue;
    const aliasOf = PT_MEDIA_ALIASES[r.seedName];
    if (!aliasOf) continue;
    const base = addByName.get(aliasOf);
    if (!base || !base.imageUrl) continue;
    results[i] = {
      ...base,
      seedName: r.seedName,
      score: Math.min(93, (base.score || 90) - 2),
      reasons: ['pt_alias', `alias_of:${aliasOf}`],
      action: 'ADD',
    };
    addByName.set(r.seedName, results[i]);
  }

  // Inherit media for tempo/intensity variants of an already-matched base name.
  // e.g. "Supino com Halteres Isométrico" ← same still as "Supino com Halteres".
  // Biomechanical variants (Inclinado/Declinado/Diamante) keep distinct matches.
  const VARIANT_SUFFIX =
    /\s+(Unilateral|Isométrico|Isometrico|Pausa no Ponto de Contração|Tempo Controlado \(3s descida\)|Excêntrico Acentuado|Eccentrico Acentuado|\s*com 1\.5 Reps)$/i;
  const bySeedName = new Map(results.filter((r) => r.action === 'ADD').map((r) => [r.seedName, r]));
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.action === 'ADD') continue;
    const m = r.seedName.match(VARIANT_SUFFIX);
    if (!m) continue;
    const baseName = r.seedName.slice(0, m.index).replace(/\s+$/, '');
    const base = bySeedName.get(baseName);
    if (!base || !base.imageUrl) continue;
    results[i] = {
      seedName: r.seedName,
      donorName: base.donorName,
      apiId: base.apiId,
      imageUrl: base.imageUrl,
      thumbnailUrl: base.thumbnailUrl || base.imageUrl,
      gifUrl: '',
      videoUrl: '',
      score: Math.min(92, (base.score || 90) - 3),
      reasons: ['variant_inherit', `base:${baseName}`],
      source: base.source,
      license: base.license,
      action: 'ADD',
    };
    bySeedName.set(r.seedName, results[i]);
  }

  // Optional URL validation for ADD rows
  if (validateUrls) {
    const toCheck = results.filter((r) => r.action === 'ADD' && r.imageUrl);
    console.log(`Validating ${toCheck.length} HTTPS URLs (HEAD)…`);
    await mapPool(toCheck, 8, async (r) => {
      const v = await headOk(r.imageUrl);
      r.urlValid = v.ok;
      r.urlStatus = v.status;
      r.urlContentType = v.contentType || '';
      if (!v.ok) {
        r.action = 'REJECT';
        r.reasons = [...(r.reasons || []), `url_invalid:${v.error || v.status}`];
      }
      return r;
    });
  }

  const auto = results.filter((r) => r.action === 'ADD');
  const review = results.filter((r) => r.action === 'REVIEW');
  const none = results.filter((r) => r.action === 'NONE' || r.action === 'REJECT');

  // Detect same URL assigned to many different seed names
  const urlUsers = new Map();
  for (const r of auto) {
    if (!r.imageUrl) continue;
    const list = urlUsers.get(r.imageUrl) || [];
    list.push(r.seedName);
    urlUsers.set(r.imageUrl, list);
  }
  const sharedUrls = [...urlUsers.entries()].filter(([, names]) => names.length > 3);

  console.log('\nGYMFORGE — MEDIA ENRICHMENT');
  console.log('─'.repeat(40));
  console.log(`Seed exercises:     ${seed.length}`);
  console.log(`FEDB donors w/ img: ${donors.length}`);
  console.log(`AUTO (ADD ≥${AUTO_THRESHOLD}): ${auto.length}`);
  console.log(`REVIEW (${REVIEW_THRESHOLD}-${AUTO_THRESHOLD - 1}): ${review.length}`);
  console.log(`NONE/REJECT:        ${none.length}`);
  console.log(`Shared URL (>3):    ${sharedUrls.length}`);
  console.log(`Mode:               ${writeMatches ? 'WRITE' : 'DRY-RUN'}${validateUrls ? ' +VALIDATE' : ''}`);

  console.log('\nExercise | Source | Type | Confidence | License | Action | URL');
  console.log('─'.repeat(100));
  for (const r of [...auto.slice(0, 25), ...review.slice(0, 8)]) {
    const url = (r.imageUrl || '').slice(0, 64);
    console.log(
      `${r.seedName} | ${r.source || '—'} | thumbnail | ${r.score}% | ${(r.license || '—').slice(0, 28)} | ${r.action} | ${url}`
    );
  }
  console.log('\nSample NONE:');
  for (const r of none.filter((x) => x.action === 'NONE').slice(0, 8)) {
    console.log(`  ${r.seedName}`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'free-exercise-db',
    license: 'Unlicense (https://github.com/yuhonas/free-exercise-db)',
    autoThreshold: AUTO_THRESHOLD,
    reviewThreshold: REVIEW_THRESHOLD,
    totals: {
      seed: seed.length,
      donors: donors.length,
      add: auto.length,
      review: review.length,
      none: none.filter((r) => r.action === 'NONE').length,
      reject: none.filter((r) => r.action === 'REJECT').length,
    },
    matches: auto.map((r) => ({
      seedName: r.seedName,
      donorName: r.donorName,
      apiId: r.apiId,
      imageUrl: r.imageUrl,
      thumbnailUrl: r.thumbnailUrl,
      gifUrl: r.gifUrl || '',
      videoUrl: r.videoUrl || '',
      confidence: r.score,
      reasons: r.reasons,
      source: r.source,
      license: r.license,
      urlValid: r.urlValid !== false,
      verifiedAt: validateUrls ? new Date().toISOString() : null,
    })),
    review: review.map((r) => ({
      seedName: r.seedName,
      donorName: r.donorName,
      confidence: r.score,
      reasons: r.reasons,
      imageUrl: r.imageUrl,
    })),
    withoutMedia: none.filter((r) => r.action === 'NONE').map((r) => r.seedName),
  };

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(payload, null, 2));
  console.log(`\nReport written: ${path.relative(ROOT, REPORT)}`);

  if (writeMatches) {
    const slim = {
      version: 1,
      generatedAt: payload.generatedAt,
      source: payload.source,
      license: payload.license,
      matches: payload.matches,
    };
    fs.writeFileSync(OUT, JSON.stringify(slim, null, 2));
    console.log(`Matches written: ${path.relative(ROOT, OUT)} (${slim.matches.length} rows)`);
  } else {
    console.log('\nDry-run only. Pass --write-matches to persist assets/data/exercise-media-matches.json');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
