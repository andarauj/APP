/**
 * Applies PT-PT display renames to db/exerciseSeedData.ts (source of truth).
 * Runtime migrations still cover upgrades; this keeps fresh installs correct.
 *
 *   node scripts/apply_seed_pt.cjs
 */

const fs = require('fs');
const path = require('path');

const SEED = path.join(__dirname, '..', 'db', 'exerciseSeedData.ts');

/** Exact name renames (ASCII / EN → PT-PT). */
const RENAMES = {
  Flexoes: 'Flexões',
  'Flexoes Inclinadas': 'Flexões Inclinadas',
  'Flexoes Declinadas': 'Flexões Declinadas',
  'Flexoes Diamante': 'Flexões Diamante',
  'Flexoes Arqueiras': 'Flexões Arqueiras',
  'Flexoes com Pernas Elevadas': 'Flexões com Pernas Elevadas',
  'Flexoes Pliometricas': 'Flexões Pliométricas',
  'Pull-up (Flexoes de Bracos)': 'Barra Fixa (Pull-up)',
  'Pull-up Pegada Inversa (Chin-up)': 'Barra Fixa Pegada Inversa (Chin-up)',
  'Pull-up Pegada Neutra': 'Barra Fixa Pegada Neutra',
  'Pull-up Largo': 'Barra Fixa Pegada Larga',
  'Pull-up Assisted': 'Barra Fixa Assistida',
  'Pull-up L-Sit': 'Barra Fixa L-Sit',
  'Elevacao de Panturrilhas na Escada': 'Elevação de Gémeos no Degrau',
  'Elevacao Lateral com Halteres': 'Elevação Lateral com Halteres',
  'Elevacao Lateral no Cabo': 'Elevação Lateral no Cabo',
  'Elevacao Frontal com Halteres': 'Elevação Frontal com Halteres',
  'Elevacao Frontal com Barra': 'Elevação Frontal com Barra',
  'Elevacao Frontal no Cabo': 'Elevação Frontal no Cabo',
  'Elevacao Frontal com Disco': 'Elevação Frontal com Disco',
  'Elevacao Lateral Unilateral no Cabo': 'Elevação Lateral Unilateral no Cabo',
  'Elevacao Lateral com Kettlebell': 'Elevação Lateral com Kettlebell',
  'Elevacao Frontal Unilateral': 'Elevação Frontal Unilateral',
  'Glute Bridge': 'Ponte de Glúteos',
  'Glute Bridge Unilateral': 'Ponte de Glúteos Unilateral',
  'Glute Bridge com Barra': 'Ponte de Glúteos com Barra',
  'Lunges em Pe': 'Afundadas em Pé',
  'Lunges com Halteres': 'Afundadas com Halteres',
  'Lunges com Barra': 'Afundadas com Barra',
  'Lunges Laterais': 'Afundadas Laterais',
  'Lunges Reversos': 'Afundadas Reversas',
  'Diamond Push-up': 'Flexões Diamante',
  'Close-Grip Push-up': 'Flexões Pegada Fechada',
  'Pike Push-up': 'Flexões Pike',
  'Handstand Push-up': 'Flexões em Apoio de Pinheiro',
  'Inverted Row': 'Remada Invertida',
  'Triceps Dips': 'Fundos de Tríceps',
  'Bench Dips': 'Fundos no Banco',
  'Chin-up Foco Biceps': 'Chin-up Foco Bíceps',
  Hyperextensao: 'Hiperextensão',
  'Deadlift Sumo': 'Levantamento Terra Sumo',
  'Snatch-Grip Deadlift': 'Levantamento Terra Pegada Snatch',
  'Puxada Atras': 'Puxada Atrás',
  'Supino na Maquina': 'Supino na Máquina',
  'Supino Inclinado na Maquina': 'Supino Inclinado na Máquina',
  'Remada na Maquina': 'Remada na Máquina',
  'Remada com Barra na Maquina T': 'Remada com Barra na Máquina T',
  'Shrug na Maquina': 'Encolhimento na Máquina',
  'Shrug com Halteres': 'Encolhimento com Halteres',
  'Shrug com Barra': 'Encolhimento com Barra',
  'Shrug com Cabo': 'Encolhimento com Cabo',
  'Press na Maquina': 'Press na Máquina',
  'Press de Peito Isometrico': 'Press de Peito Isométrico',
  'Wall Sit': 'Isométrico na Parede',
  'Pistol Squat': 'Agachamento Pistol',
  'Cossack Squat': 'Agachamento Cossack',
  'Sissy Squat': 'Agachamento Sissy',
  'Nordic Curl': 'Curl Nórdico',
  'Dead Hang': 'Suspensão na Barra',
  'Towel Pull-up': 'Barra Fixa com Toalha',
  'Prancha (Plank)': 'Prancha',
  "Child's Pose": 'Postura da Criança',
  'Downward Dog': 'Cão a Olhar para Baixo',
  'Cat-Cow Stretch': 'Gato-Vaca',
};

let src = fs.readFileSync(SEED, 'utf8');
let count = 0;

const keys = Object.keys(RENAMES).sort((a, b) => b.length - a.length);
for (const from of keys) {
  const to = RENAMES[from];
  const needle = `name: '${from}'`;
  const repl = `name: '${to}'`;
  if (src.includes(needle)) {
    const occurrences = src.split(needle).length - 1;
    src = src.split(needle).join(repl);
    count += occurrences;
  }
}

const instr = [
  [/ maos /g, ' mãos '],
  [/ Maos /g, ' Mãos '],
  [/maos\./g, 'mãos.'],
  [/maos,/g, 'mãos,'],
  [/ Posicao /g, ' Posição '],
  [/posicao /g, 'posição '],
  [/ ate /g, ' até '],
  [/ facil /g, ' fácil '],
  [/ dificil /g, ' difícil '],
  [/ maquina /g, ' máquina '],
  [/ Maquina /g, ' Máquina '],
  [/ pescoco/g, ' pescoço'],
  [/ atras /g, ' atrás '],
  [/ maximo /g, ' máximo '],
  [/ tensao /g, ' tensão '],
  [/ contracao /g, ' contração '],
  [/ Extensao /g, ' Extensão '],
  [/extensao /g, 'extensão '],
  [/ flexao /g, ' flexão '],
  [/ Flexao /g, ' Flexão '],
  [/ flexoes /g, ' flexões '],
  [/ superficie /g, ' superfície '],
  [/ cabeca /g, ' cabeça '],
  [/ bracos /g, ' braços '],
  [/ gluteos/g, ' glúteos'],
  [/ isquios/g, ' ísquios'],
];

for (const [re, to] of instr) {
  src = src.replace(re, to);
}

fs.writeFileSync(SEED, src);
console.log(`Updated ${count} exercise names in exerciseSeedData.ts`);
