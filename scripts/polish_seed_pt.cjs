/**
 * Phase 3 — full PT-PT polish for exerciseSeedData.ts names + instructions.
 * Idempotent: safe to re-run.
 *
 *   node scripts/polish_seed_pt.cjs
 */
const fs = require('fs');
const path = require('path');

const SEED = path.join(__dirname, '..', 'db', 'exerciseSeedData.ts');
let src = fs.readFileSync(SEED, 'utf8');

/** Longer keys first. Applied only inside name: '...' values via callback. */
const NAME_REPLACEMENTS = [
  ['Elevacao de Panturrilhas em Pe', 'Elevação de Gémeos em Pé'],
  ['Elevacao de Panturrilhas com Halteres', 'Elevação de Gémeos com Halteres'],
  ['Elevacao de Panturrilhas com Barra', 'Elevação de Gémeos com Barra'],
  ['Elevacao de Panturrilhas Sentado', 'Elevação de Gémeos Sentado'],
  ['Elevacao de Panturrilhas no Leg Press', 'Elevação de Gémeos no Leg Press'],
  ['Elevacao de Panturrilhas Unilateral', 'Elevação de Gémeos Unilateral'],
  ['Elevacao de Panturrilhas no Cabo', 'Elevação de Gémeos no Cabo'],
  ['Gymleco Elevacao Lateral Máquina (Lateral Raise)', 'Gymleco Elevação Lateral Máquina (Lateral Raise)'],
  ['Gymleco Elevacao Frontal Maquina', 'Gymleco Elevação Frontal Máquina'],
  ['Gymleco Abdominais Rotacao Maquina', 'Gymleco Abdominais Rotação Máquina'],
  ['Gymleco Abducao Anca Máquina (Hip Abduction)', 'Gymleco Abdução Anca Máquina (Hip Abduction)'],
  ['Gymleco Aducao Anca Máquina (Hip Adduction)', 'Gymleco Adução Anca Máquina (Hip Adduction)'],
  ['Gymleco Panturrilhas Sentado Maquina', 'Gymleco Gémeos Sentado Máquina'],
  ['Gymleco Panturrilhas em Pe Máquina (Calf Raise)', 'Gymleco Gémeos em Pé Máquina (Calf Raise)'],
  ['Extensao de Triceps na Polia', 'Extensão de Tríceps na Polia'],
  ['Extensao Unilateral de Pernas', 'Extensão Unilateral de Pernas'],
  ['Extensao de Pernas (Leg Extension)', 'Extensão de Pernas (Leg Extension)'],
  ['Extensao com Halter Unilateral', 'Extensão com Halter Unilateral'],
  ['Extensao com Halter por Cima', 'Extensão com Halter por Cima'],
  ['Extensao por Cima com Corda', 'Extensão por Cima com Corda'],
  ['Extensao Inversa na Polia', 'Extensão Inversa na Polia'],
  ['Extensao com Barra Reta', 'Extensão com Barra Reta'],
  ['Extensao com Barra V', 'Extensão com Barra V'],
  ['Extensao na Maquina', 'Extensão na Máquina'],
  ['Extensao no Banco', 'Extensão no Banco'],
  ['Crucifixo Inverso na Maquina', 'Crucifixo Inverso na Máquina'],
  ['Preacher Curl na Maquina', 'Preacher Curl na Máquina'],
  ['Crunch na Maquina', 'Crunch na Máquina'],
  ['Curl com Elastico', 'Curl com Elástico'],
  ['Shoulder Dislocates com Elastico', 'Shoulder Dislocates com Elástico'],
  ['Press de Ombros em Pe', 'Press de Ombros em Pé'],
  ['Leg Curl em Pe', 'Leg Curl em Pé'],
  ['Deadlift Sumo', 'Levantamento Terra Sumo'],
  ['Puxada Atras', 'Puxada Atrás'],
];

// Generic trailing/token name fixes (order matters)
const NAME_TOKEN_FIXES = [
  [/ Isometrico\b/g, ' Isométrico'],
  [/ Maquina\b/g, ' Máquina'],
  [/ Elastico\b/g, ' Elástico'],
  [/ Extensao\b/g, ' Extensão'],
  [/ Elevacao\b/g, ' Elevação'],
  [/ Rotacao\b/g, ' Rotação'],
  [/ Abducao\b/g, ' Abdução'],
  [/ Aducao\b/g, ' Adução'],
  [/ Eccentrico\b/g, ' Excêntrico'],
  [/ Contracao\b/g, ' Contração'],
  [/ Triceps\b/g, ' Tríceps'],
  [/ Biceps\b/g, ' Bíceps'],
  [/ em Pe\b/g, ' em Pé'],
  [/ Atras\b/g, ' Atrás'],
];

let nameHits = 0;
src = src.replace(/name: '((?:\\'|[^'])*)'/g, (full, name) => {
  let n = name;
  for (const [from, to] of NAME_REPLACEMENTS) {
    if (n.includes(from)) {
      n = n.split(from).join(to);
      nameHits++;
    }
  }
  for (const [re, to] of NAME_TOKEN_FIXES) {
    const next = n.replace(re, to);
    if (next !== n) {
      nameHits++;
      n = next;
    }
  }
  return `name: '${n}'`;
});

/** Instruction polish — whole-file safe Portuguese tokens. */
const INSTR = [
  [/\bmaos\b/gi, (m) => (m[0] === 'M' ? 'Mãos' : 'mãos')],
  [/\bmao\b/gi, (m) => (m[0] === 'M' ? 'Mão' : 'mão')],
  [/\bposicao\b/gi, (m) => (m[0] === 'P' ? 'Posição' : 'posição')],
  [/\bfacil\b/gi, (m) => (m[0] === 'F' ? 'Fácil' : 'fácil')],
  [/\bdificil\b/gi, (m) => (m[0] === 'D' ? 'Difícil' : 'difícil')],
  [/\bmaquina\b/gi, (m) => (m[0] === 'M' ? 'Máquina' : 'máquina')],
  [/\bpescoco\b/gi, (m) => (m[0] === 'P' ? 'Pescoço' : 'pescoço')],
  [/\batras\b/gi, (m) => (m[0] === 'A' ? 'Atrás' : 'atrás')],
  [/\bmaximo\b/gi, (m) => (m[0] === 'M' ? 'Máximo' : 'máximo')],
  [/\btensao\b/gi, (m) => (m[0] === 'T' ? 'Tensão' : 'tensão')],
  [/\bcontracao\b/gi, (m) => (m[0] === 'C' ? 'Contração' : 'contração')],
  [/\bextensao\b/gi, (m) => (m[0] === 'E' ? 'Extensão' : 'extensão')],
  [/\bflexao\b/gi, (m) => (m[0] === 'F' ? 'Flexão' : 'flexão')],
  [/\bflexoes\b/gi, (m) => (m[0] === 'F' ? 'Flexões' : 'flexões')],
  [/\bsuperficie\b/gi, (m) => (m[0] === 'S' ? 'Superfície' : 'superfície')],
  [/\bcabeca\b/gi, (m) => (m[0] === 'C' ? 'Cabeça' : 'cabeça')],
  [/\bbracos\b/gi, (m) => (m[0] === 'B' ? 'Braços' : 'braços')],
  [/\bgluteos\b/gi, (m) => (m[0] === 'G' ? 'Glúteos' : 'glúteos')],
  [/\bisquios\b/gi, (m) => (m[0] === 'I' ? 'Ísquios' : 'ísquios')],
  [/\bpanturrilha(s)?\b/gi, (m) => (m[0] === 'P' ? 'Gémeos' : 'gémeos')],
  [/\belastico\b/gi, (m) => (m[0] === 'E' ? 'Elástico' : 'elástico')],
  [/\bisometrico\b/gi, (m) => (m[0] === 'I' ? 'Isométrico' : 'isométrico')],
  [/\beccentrico\b/gi, (m) => (m[0] === 'E' ? 'Excêntrico' : 'excêntrico')],
  [/\brotacao\b/gi, (m) => (m[0] === 'R' ? 'Rotação' : 'rotação')],
  [/\babducao\b/gi, (m) => (m[0] === 'A' ? 'Abdução' : 'abdução')],
  [/\baducao\b/gi, (m) => (m[0] === 'A' ? 'Adução' : 'adução')],
  [/\btriceps\b/gi, (m) => (m[0] === 'T' ? 'Tríceps' : 'tríceps')],
  [/\bbiceps\b/gi, (m) => (m[0] === 'B' ? 'Bíceps' : 'bíceps')],
  [/\bpes\b/gi, (m) => (m[0] === 'P' ? 'Pés' : 'pés')],
  [/\bem pe\b/gi, (m) => (m[0] === 'E' ? 'Em pé' : 'em pé')],
  [/\bconfortavel\b/gi, (m) => (m[0] === 'C' ? 'Confortável' : 'confortável')],
  [/\bporcao\b/gi, (m) => (m[0] === 'P' ? 'Porção' : 'porção')],
  [/\bvarias\b/gi, (m) => (m[0] === 'V' ? 'Várias' : 'várias')],
  // "ate" only when used as até (avoid matching "bater")
  [/ ate /g, ' até '],
  [/ Ate /g, ' Até '],
  [/ ate\./g, ' até.'],
  [/ ate,/g, ' até,'],
  [/\bchao\b/gi, (m) => (m[0] === 'C' ? 'Chão' : 'chão')],
  [/\bmantem\b/gi, (m) => (m[0] === 'M' ? 'Mantém' : 'mantém')],
  [/\bantibracos\b/gi, (m) => (m[0] === 'A' ? 'Antebraços' : 'antebraços')],
  [/\bresistencia\b/gi, (m) => (m[0] === 'R' ? 'Resistência' : 'resistência')],
];

let instrHits = 0;
src = src.replace(/instructions:\s*'((?:\\'|[^'])*)'/g, (full, text) => {
  let t = text;
  for (const [re, to] of INSTR) {
    const next = typeof to === 'function' ? t.replace(re, to) : t.replace(re, to);
    if (next !== t) {
      instrHits++;
      t = next;
    }
  }
  return `instructions: '${t}'`;
});

fs.writeFileSync(SEED, src);
console.log(JSON.stringify({ nameHits, instrPatternHits: instrHits }, null, 2));
