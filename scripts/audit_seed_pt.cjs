/**
 * One-shot seed audit for Phase 3 planning.
 *   node scripts/audit_seed_pt.cjs
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'db', 'exerciseSeedData.ts'), 'utf8');
const rows = [...src.matchAll(/\{\s*name:\s*'((?:\\'|[^'])*)'[\s\S]*?instructions:\s*'((?:\\'|[^'])*)'/g)].map((m) => ({
  name: m[1].replace(/\\'/g, "'"),
  instructions: m[2].replace(/\\'/g, "'"),
}));

const ASCII_NAME = /\b(Flexoes|Elevacao|Extensao|Rotacao|Abducao|Ad(d)?ucao|Hyperextensao|Pliometricas|Isometrico|Maquina|Panturrilha|Elastico)\b/i;
const ASCII_WORD = /\b(maos|posicao|facil|dificil|maquina|pescoco|atras|maximo|tensao|contracao|extensao|flexao|flexoes|superficie|cabeca|bracos|gluteos|isquios|panturrilha|elastico|ate)\b/i;
const EN_PHRASE = /\b(keep your|lower your|push your|pull your|lie down|stand with|bend your|raise your|return to|starting position)\b/i;

const badNames = rows.filter((r) => ASCII_NAME.test(r.name));
const badInstrAscii = rows.filter((r) => ASCII_WORD.test(r.instructions) || ASCII_NAME.test(r.instructions));
const badInstrEn = rows.filter((r) => EN_PHRASE.test(r.instructions));
const empty = rows.filter((r) => !r.instructions.trim());

// English-leaning exercise names still in curated seed
const EN_NAME = /\b(Push-up|Pull-up|Deadlift|Squat|Crunch|Plank|Bridge|Raise|Curl|Fly|Shrug|Lunge|Dip|Hang|Kick|Jack|Burpee|Climber|Stretch|Pose|Dog|Cow|Superman|Thrust|Row|Press|Arnold|Meadows|Pendlay|Nordic|Cossack|Pistol|Sissy|Goblet|Hack|Rack|Snatch|Face Pull|Hip Thrust|Dead Hang|Fire Hydrant|Donkey Kick|Bird Dog|Dead Bug|Flutter|Scissor|Bear Crawl|Crab Walk|Mountain Climbers|High Knees|Jumping Jacks|Russian Twist|Hollow Body|Toes to Bar|Wall Sit|Pike|Chin-up)\b/i;
const enNames = rows.filter((r) => EN_NAME.test(r.name));

console.log(JSON.stringify({
  total: rows.length,
  badNames: badNames.map((r) => r.name),
  emptyInstr: empty.length,
  badInstrAsciiCount: badInstrAscii.length,
  badInstrAsciiSample: badInstrAscii.slice(0, 15).map((r) => r.name),
  badInstrEnCount: badInstrEn.length,
  enNamesCount: enNames.length,
  enNamesSample: enNames.map((r) => r.name).slice(0, 50),
}, null, 2));
