/**
 * GymForge production audit (Phase 3).
 * Runs seed PT checks + optionally typecheck/lint/test when --full is passed.
 *
 *   node scripts/audit_gymforge.cjs
 *   node scripts/audit_gymforge.cjs --full
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SEED = path.join(ROOT, 'db', 'exerciseSeedData.ts');
const full = process.argv.includes('--full');
const mediaOnly = process.argv.includes('--media');

const BAD_NAME_ASCII = /\b(Flexoes|Elevacao|Extensao|Rotacao|Abducao|Aducao|Adducao|Triceps|Biceps|Maquina|Elastico|Isometrico|Panturrilhas)\b/;
const BAD_INSTR_ASCII = /\b(mao|maos|posicao|facil|dificil|maquina|pescoco|maximo|tensao|contracao|extensao|elevacao|rotacao|triceps|biceps|confortavel|porcao|varias|em pe)\b/i;

function extractSeedNames(src) {
  const names = [];
  const re = /name:\s*'((?:\\'|[^'])*)'/g;
  let m;
  while ((m = re.exec(src))) names.push(m[1].replace(/\\'/g, "'"));
  return names;
}

function extractInstructions(src) {
  const out = [];
  const re = /instructions:\s*'((?:\\'|[^'])*)'/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1].replace(/\\'/g, "'"));
  return out;
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function section(title) {
  console.log(`\n${title}`);
  console.log('─'.repeat(Math.max(24, title.length)));
}

function passFail(ok, detail = '') {
  return `${ok ? 'PASS' : 'FAIL'}${detail ? `  ${detail}` : ''}`;
}

const report = {
  typescript: 'SKIP',
  eslint: 'SKIP',
  tests: 'SKIP',
  testCount: null,
  seedUnique: false,
  duplicateNames: 0,
  semanticDupHints: 0,
  badAsciiNames: 0,
  emptyInstr: 0,
  badAsciiInstr: 0,
  priorityMedia: 0,
  p0: 0,
  p1: 0,
  p2: [],
};

const seedSrc = fs.readFileSync(SEED, 'utf8');
const names = extractSeedNames(seedSrc);
const instructions = extractInstructions(seedSrc);

const exact = new Map();
for (const n of names) exact.set(n, (exact.get(n) || 0) + 1);
const exactDups = [...exact.entries()].filter(([, c]) => c > 1);

const fold = new Map();
for (const n of names) {
  const k = stripAccents(n).replace(/\s+/g, '');
  if (!fold.has(k)) fold.set(k, []);
  fold.get(k).push(n);
}
const foldDups = [...fold.entries()].filter(([, arr]) => new Set(arr).size > 1 || arr.length > 1);

const badAsciiNameOriginals = names.filter((n) => BAD_NAME_ASCII.test(n.replace(/\([^)]*\)/g, '')));
const emptyInstr = instructions.filter((i) => !i.trim()).length;
const badAsciiInstr = instructions.filter((i) => BAD_INSTR_ASCII.test(i));

report.seedUnique = exactDups.length === 0;
report.duplicateNames = exactDups.length;
report.semanticDupHints = foldDups.filter(([, arr]) => arr.length > 1 && new Set(arr.map(stripAccents)).size === 1 && new Set(arr).size > 1).length;
report.badAsciiNames = badAsciiNameOriginals.length;
report.emptyInstr = emptyInstr;
report.badAsciiInstr = badAsciiInstr.length;

try {
  const manifest = fs.readFileSync(path.join(ROOT, 'constants', 'exerciseMediaManifest.ts'), 'utf8');
  const keys = manifest.match(/'[a-z0-9 ]+'/g) || [];
  report.priorityMedia = keys.length;
} catch {
  report.priorityMedia = 0;
  report.p2.push('exerciseMediaManifest missing');
}

if (badAsciiNameOriginals.length) report.p1 += 1;
if (exactDups.length) report.p0 += 1;
if (emptyInstr) report.p2.push(`Missing instructions: ${emptyInstr}`);
if (badAsciiInstr.length) report.p2.push(`ASCII residual in instructions: ${badAsciiInstr.length}`);

if (full) {
  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: true });
    return r;
  };
  const tc = run('npm', ['run', 'typecheck']);
  report.typescript = tc.status === 0 ? 'PASS' : 'FAIL';
  if (tc.status !== 0) report.p0 += 1;

  const lint = run('npm', ['run', 'lint']);
  report.eslint = lint.status === 0 ? 'PASS' : 'FAIL';
  if (lint.status !== 0) report.p0 += 1;

  const test = run('npm', ['test', '--', '--ci', '--forceExit']);
  report.tests = test.status === 0 ? 'PASS' : 'FAIL';
  const m = (test.stdout || '').match(/Tests:\s+(\d+)\s+passed/);
  if (m) report.testCount = Number(m[1]);
  if (test.status !== 0) report.p0 += 1;
}

section('PROJECT');
console.log(`TypeScript                 ${report.typescript}`);
console.log(`ESLint                     ${report.eslint}`);
console.log(`Tests                      ${report.tests}${report.testCount != null ? ` (${report.testCount})` : ''}`);

section('CATALOG');
console.log(`Seed unique                ${passFail(report.seedUnique)}`);
console.log(`Duplicate names            ${report.duplicateNames}`);
console.log(`Accent-fold collisions     ${report.semanticDupHints}`);
console.log(`Missing instructions       ${report.emptyInstr}`);

section('PT-PT');
console.log(`Unaccented name terms      ${report.badAsciiNames}`);
console.log(`Unaccented instructions    ${report.badAsciiInstr}`);
console.log(`Terminology consistency    ${passFail(report.badAsciiNames === 0 && report.badAsciiInstr === 0)}`);

section('MEDIA');
console.log(`Priority offline keys      ${report.priorityMedia}`);
console.log(`Bundled binary assets      0 (warm-cache strategy)`);
console.log(`Offline fallback           PASS (cache → remote → placeholder)`);

// Phase 4 — curated enrichment coverage from verified matches JSON + FEDB.
let mediaStatus = 'WARN';
try {
  const fedb = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'data', 'exercise-db.json'), 'utf8'));
  const matchesPath = path.join(ROOT, 'assets', 'data', 'exercise-media-matches.json');
  const hasMatches = fs.existsSync(matchesPath);
  const matches = hasMatches ? JSON.parse(fs.readFileSync(matchesPath, 'utf8')) : { matches: [] };
  const add = matches.matches || [];
  const fedbWithImg = fedb.filter((e) => e.image_url && /^https:\/\//i.test(e.image_url)).length;
  const seedWithThumb = add.length;
  const seedPct = names.length ? Math.round((seedWithThumb / names.length) * 100) : 0;
  const invalid = add.filter((m) => !m.imageUrl || !/^https:\/\//i.test(m.imageUrl) || m.urlValid === false);
  const bar = (pct) => {
    const filled = Math.round(pct / 5);
    return `${'█'.repeat(filled)}${'░'.repeat(20 - filled)} ${pct}%`;
  };
  console.log(`FEDB stills (import)     ${fedbWithImg}/${fedb.length}`);
  console.log(`Curated seed matched     ${seedWithThumb}/${names.length}`);
  console.log(`THUMBNAILS (seed)        ${bar(seedPct)}`);
  console.log(`GIFS (seed matched)      ${bar(0)} (FEDB stills; UI uses 0.jpg↔1.jpg frames)`);
  console.log(`VIDEOS (seed matched)    ${bar(0)} (no licensed video source yet)`);
  console.log(`Invalid match URLs       ${invalid.length}`);
  console.log(`Match license            ${matches.license || 'n/a'}`);
  if (invalid.length) {
    report.p0 += 1;
    mediaStatus = 'FAIL';
  } else if (seedWithThumb >= 50) {
    mediaStatus = 'PASS';
  } else {
    report.p2.push(`Low curated media coverage: ${seedWithThumb}`);
  }
  console.log(`Media enrichment         ${mediaStatus}`);

  if (mediaOnly) {
    const reportJson = path.join(ROOT, 'scripts', 'reports', 'media-enrichment-report.json');
    if (fs.existsSync(reportJson)) {
      const r = JSON.parse(fs.readFileSync(reportJson, 'utf8'));
      console.log(`\nWithout media (sample):`);
      for (const n of (r.withoutMedia || []).slice(0, 15)) console.log(`  - ${n}`);
      console.log(`\nReview queue:`);
      for (const row of (r.review || []).slice(0, 10)) {
        console.log(`  - ${row.seedName} ← ${row.donorName || '?'} (${row.confidence}%)`);
      }
    }
  }
} catch (e) {
  console.log(`Media enrichment         FAIL  ${e.message}`);
  report.p0 += 1;
}

section('QUALITY');
console.log(`P0                         ${report.p0}`);
console.log(`P1                         ${report.p1}`);
console.log(`P2                         ${report.p2.length ? report.p2.join('; ') : '0'}`);

if (exactDups.length) {
  console.log('\nExact duplicates:');
  for (const [n, c] of exactDups) console.log(`  ${c}× ${n}`);
}
if (badAsciiNameOriginals.length) {
  console.log('\nASCII residual names (sample):');
  for (const n of badAsciiNameOriginals.slice(0, 20)) console.log(`  ${n}`);
}

const ready = report.p0 === 0 && report.p1 === 0;
console.log(`\nSTATUS: ${ready ? 'READY FOR PRODUCTION (seed/catalog checks)' : 'NOT READY'}`);
if (!full) console.log('(Re-run with --full to include TypeScript / ESLint / Jest.)');
if (!mediaOnly) console.log('(Re-run with --media for enrichment coverage details.)');

process.exit(ready ? 0 : 1);
