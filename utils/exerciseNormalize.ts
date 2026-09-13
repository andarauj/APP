/**
 * Canonicalisation helpers for the exercise catalogue.
 * Used by migrations (runtime merge) and unit tests — keep free of SQLite
 * so pure alias rules stay easy to lock down.
 */

/** Strip diacritics / case / extra spaces for fuzzy name comparison. */
export function normalizeExerciseKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Display-name renames applied on upgrade (ASCII seed → PT-PT accented).
 * Key = exact current DB name; value = canonical PT name.
 */
export const EXERCISE_DISPLAY_RENAMES: Record<string, string> = {
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
  'Elevacoes Inclinadas com Halteres': 'Elevações Inclinadas com Halteres',
  'Elevacoes Laterais com Elastico': 'Elevações Laterais com Elástico',
  'Diamond Push-up': 'Flexões Diamante',
  // Keep the triceps-focused duplicate distinct after seed rename
  'Flexões Diamante (Tríceps)': 'Flexões Diamante (Tríceps)',
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
  // Phase 3 — residual ASCII → PT-PT (installed DBs that still have pre-polish names)
  'Elevacao de Panturrilhas em Pe': 'Elevação de Gémeos em Pé',
  'Elevacao de Panturrilhas com Halteres': 'Elevação de Gémeos com Halteres',
  'Elevacao de Panturrilhas com Barra': 'Elevação de Gémeos com Barra',
  'Elevacao de Panturrilhas Sentado': 'Elevação de Gémeos Sentado',
  'Elevacao de Panturrilhas no Leg Press': 'Elevação de Gémeos no Leg Press',
  'Elevacao de Panturrilhas Unilateral': 'Elevação de Gémeos Unilateral',
  'Elevacao de Panturrilhas no Cabo': 'Elevação de Gémeos no Cabo',
  'Gymleco Elevacao Lateral Máquina (Lateral Raise)': 'Gymleco Elevação Lateral Máquina (Lateral Raise)',
  'Gymleco Elevacao Frontal Maquina': 'Gymleco Elevação Frontal Máquina',
  'Gymleco Abdominais Rotacao Maquina': 'Gymleco Abdominais Rotação Máquina',
  'Gymleco Abducao Anca Máquina (Hip Abduction)': 'Gymleco Abdução Anca Máquina (Hip Abduction)',
  'Gymleco Aducao Anca Máquina (Hip Adduction)': 'Gymleco Adução Anca Máquina (Hip Adduction)',
  'Gymleco Panturrilhas Sentado Maquina': 'Gymleco Gémeos Sentado Máquina',
  'Gymleco Panturrilhas em Pe Máquina (Calf Raise)': 'Gymleco Gémeos em Pé Máquina (Calf Raise)',
  'Extensao de Triceps na Polia': 'Extensão de Tríceps na Polia',
  'Extensao Unilateral de Pernas': 'Extensão Unilateral de Pernas',
  'Extensao de Pernas (Leg Extension)': 'Extensão de Pernas (Leg Extension)',
  'Extensao com Halter Unilateral': 'Extensão com Halter Unilateral',
  'Extensao com Halter por Cima': 'Extensão com Halter por Cima',
  'Extensao por Cima com Corda': 'Extensão por Cima com Corda',
  'Extensao Inversa na Polia': 'Extensão Inversa na Polia',
  'Extensao com Barra Reta': 'Extensão com Barra Reta',
  'Extensao com Barra V': 'Extensão com Barra V',
  'Extensao na Maquina': 'Extensão na Máquina',
  'Extensao no Banco': 'Extensão no Banco',
  'Crucifixo Inverso na Maquina': 'Crucifixo Inverso na Máquina',
  'Preacher Curl na Maquina': 'Preacher Curl na Máquina',
  'Crunch na Maquina': 'Crunch na Máquina',
  'Curl com Elastico': 'Curl com Elástico',
  'Shoulder Dislocates com Elastico': 'Shoulder Dislocates com Elástico',
  'Press de Ombros em Pe': 'Press de Ombros em Pé',
  'Leg Curl em Pe': 'Leg Curl em Pé',
  'Fundos de Triceps': 'Fundos de Tríceps',
  'Extensão de Triceps na Polia': 'Extensão de Tríceps na Polia',
  'Triceps no Cabo com Corda': 'Tríceps no Cabo com Corda',
};

/**
 * Semantic merges: duplicate (often EN import) → preferred canonical key.
 * Keys and values are normalizeExerciseKey() results.
 */
export const EXERCISE_MERGE_ALIASES: Record<string, string> = {
  // Push-ups / flexões
  [normalizeExerciseKey('Diamond Push-up')]: normalizeExerciseKey('Flexões Diamante'),
  [normalizeExerciseKey('Diamond Pushup')]: normalizeExerciseKey('Flexões Diamante'),
  [normalizeExerciseKey('Close-Grip Push-up')]: normalizeExerciseKey('Flexões Pegada Fechada'),
  [normalizeExerciseKey('Close Grip Push Up')]: normalizeExerciseKey('Flexões Pegada Fechada'),
  [normalizeExerciseKey('Push-up')]: normalizeExerciseKey('Flexões'),
  [normalizeExerciseKey('Push Up')]: normalizeExerciseKey('Flexões'),
  [normalizeExerciseKey('Pushups')]: normalizeExerciseKey('Flexões'),
  [normalizeExerciseKey('Push-ups')]: normalizeExerciseKey('Flexões'),
  [normalizeExerciseKey('Incline Push-up')]: normalizeExerciseKey('Flexões Inclinadas'),
  [normalizeExerciseKey('Decline Push-up')]: normalizeExerciseKey('Flexões Declinadas'),
  [normalizeExerciseKey('Pike Push-up')]: normalizeExerciseKey('Flexões Pike'),
  [normalizeExerciseKey('Handstand Push-up')]: normalizeExerciseKey('Flexões em Apoio de Pinheiro'),
  [normalizeExerciseKey('Plyometric Push-up')]: normalizeExerciseKey('Flexões Pliométricas'),
  // Pull-ups / barra fixa
  [normalizeExerciseKey('Pull-up')]: normalizeExerciseKey('Barra Fixa (Pull-up)'),
  [normalizeExerciseKey('Pull Up')]: normalizeExerciseKey('Barra Fixa (Pull-up)'),
  [normalizeExerciseKey('Pullups')]: normalizeExerciseKey('Barra Fixa (Pull-up)'),
  [normalizeExerciseKey('Chin Up')]: normalizeExerciseKey('Barra Fixa Pegada Inversa (Chin-up)'),
  [normalizeExerciseKey('Chin-up')]: normalizeExerciseKey('Barra Fixa Pegada Inversa (Chin-up)'),
  [normalizeExerciseKey('Neutral Grip Pull-up')]: normalizeExerciseKey('Barra Fixa Pegada Neutra'),
  [normalizeExerciseKey('Wide Grip Pull-up')]: normalizeExerciseKey('Barra Fixa Pegada Larga'),
  [normalizeExerciseKey('Assisted Pull-up')]: normalizeExerciseKey('Barra Fixa Assistida'),
  // Bridges / lunges / dips
  [normalizeExerciseKey('Glute Bridge')]: normalizeExerciseKey('Ponte de Glúteos'),
  [normalizeExerciseKey('Single Leg Glute Bridge')]: normalizeExerciseKey('Ponte de Glúteos Unilateral'),
  [normalizeExerciseKey('Bodyweight Walking Lunge')]: normalizeExerciseKey('Afundadas em Pé'),
  [normalizeExerciseKey('Lunge')]: normalizeExerciseKey('Afundadas em Pé'),
  [normalizeExerciseKey('Walking Lunge')]: normalizeExerciseKey('Afundadas em Pé'),
  [normalizeExerciseKey('Triceps Dip')]: normalizeExerciseKey('Fundos de Tríceps'),
  [normalizeExerciseKey('Tricep Dips')]: normalizeExerciseKey('Fundos de Tríceps'),
  [normalizeExerciseKey('Bench Dip')]: normalizeExerciseKey('Fundos no Banco'),
  [normalizeExerciseKey('Inverted Row')]: normalizeExerciseKey('Remada Invertida'),
  [normalizeExerciseKey('Bodyweight Inverted Row')]: normalizeExerciseKey('Remada Invertida'),
  // Laterals / shrugs / deadlifts
  [normalizeExerciseKey('Dumbbell Lateral Raise')]: normalizeExerciseKey('Elevação Lateral com Halteres'),
  [normalizeExerciseKey('Lateral Raise')]: normalizeExerciseKey('Elevação Lateral com Halteres'),
  [normalizeExerciseKey('Front Raise')]: normalizeExerciseKey('Elevação Frontal com Halteres'),
  [normalizeExerciseKey('Dumbbell Front Raise')]: normalizeExerciseKey('Elevação Frontal com Halteres'),
  [normalizeExerciseKey('Dumbbell Shrug')]: normalizeExerciseKey('Encolhimento com Halteres'),
  [normalizeExerciseKey('Barbell Shrug')]: normalizeExerciseKey('Encolhimento com Barra'),
  [normalizeExerciseKey('Sumo Deadlift')]: normalizeExerciseKey('Levantamento Terra Sumo'),
  [normalizeExerciseKey('Romanian Deadlift')]: normalizeExerciseKey('Levantamento Terra Rumano'),
  [normalizeExerciseKey('Deadlift')]: normalizeExerciseKey('Levantamento Terra'),
  [normalizeExerciseKey('Barbell Bench Press')]: normalizeExerciseKey('Supino com Barra'),
  [normalizeExerciseKey('Bench Press')]: normalizeExerciseKey('Supino com Barra'),
  [normalizeExerciseKey('Incline Bench Press')]: normalizeExerciseKey('Supino Inclinado com Barra'),
  [normalizeExerciseKey('Dumbbell Bench Press')]: normalizeExerciseKey('Supino com Halteres'),
  [normalizeExerciseKey('Barbell Squats')]: normalizeExerciseKey('Agachamento com Barra'),
  [normalizeExerciseKey('Barbell Squat')]: normalizeExerciseKey('Agachamento com Barra'),
  [normalizeExerciseKey('Squat')]: normalizeExerciseKey('Agachamento com Barra'),
  [normalizeExerciseKey('Plank')]: normalizeExerciseKey('Prancha'),
  [normalizeExerciseKey('Side Plank')]: normalizeExerciseKey('Prancha Lateral'),
  [normalizeExerciseKey('Crunch')]: normalizeExerciseKey('Crunch'),
  [normalizeExerciseKey('Hyperextension')]: normalizeExerciseKey('Hiperextensão'),
  [normalizeExerciseKey('Back Extension')]: normalizeExerciseKey('Hiperextensão'),
  // Chest isolation / press EN imports → curated PT names
  [normalizeExerciseKey('Cable Crossover')]: normalizeExerciseKey('Crossover no Cabo'),
  [normalizeExerciseKey('Cable Cross Over')]: normalizeExerciseKey('Crossover no Cabo'),
  [normalizeExerciseKey('Low Cable Crossover')]: normalizeExerciseKey('Crucifixo Declinado com Cabo'),
  [normalizeExerciseKey('Flat Bench Cable Flyes')]: normalizeExerciseKey('Crossover no Cabo'),
  [normalizeExerciseKey('Cable Fly')]: normalizeExerciseKey('Crucifixo no Cabo Alto'),
  [normalizeExerciseKey('Cable Flyes')]: normalizeExerciseKey('Crucifixo no Cabo Alto'),
  [normalizeExerciseKey('Dumbbell Flyes')]: normalizeExerciseKey('Crucifixo com Halteres'),
  [normalizeExerciseKey('Dumbbell Fly')]: normalizeExerciseKey('Crucifixo com Halteres'),
  [normalizeExerciseKey('Pec Deck')]: normalizeExerciseKey('Crucifixo na Máquina (Peck Deck)'),
  [normalizeExerciseKey('Peck Deck')]: normalizeExerciseKey('Crucifixo na Máquina (Peck Deck)'),
  [normalizeExerciseKey('Decline Barbell Bench Press')]: normalizeExerciseKey('Supino Declinado com Barra'),
  [normalizeExerciseKey('Incline Dumbbell Press')]: normalizeExerciseKey('Supino Inclinado com Halteres'),
  [normalizeExerciseKey('Incline Dumbbell Bench Press')]: normalizeExerciseKey('Supino Inclinado com Halteres'),
  [normalizeExerciseKey('Overhead Press')]: normalizeExerciseKey('Press de Ombros em Pé'),
  [normalizeExerciseKey('Military Press')]: normalizeExerciseKey('Press de Ombros em Pé'),
  [normalizeExerciseKey('Shoulder Press')]: normalizeExerciseKey('Press de Ombros em Pé'),
  [normalizeExerciseKey('Tricep Pushdown')]: normalizeExerciseKey('Extensão de Tríceps na Polia'),
  [normalizeExerciseKey('Triceps Pushdown')]: normalizeExerciseKey('Extensão de Tríceps na Polia'),
  [normalizeExerciseKey('Cable Pushdown')]: normalizeExerciseKey('Extensão de Tríceps na Polia'),
  [normalizeExerciseKey('Cable Tricep Pushdown')]: normalizeExerciseKey('Extensão de Tríceps na Polia'),
  [normalizeExerciseKey('Lat Pulldown')]: normalizeExerciseKey('Puxada Frontal (Lat Pulldown)'),
  [normalizeExerciseKey('Wide-Grip Lat Pulldown')]: normalizeExerciseKey('Puxada Frontal (Lat Pulldown)'),
  [normalizeExerciseKey('Wide Grip Lat Pulldown')]: normalizeExerciseKey('Puxada Frontal (Lat Pulldown)'),
  [normalizeExerciseKey('Seated Cable Row')]: normalizeExerciseKey('Remada no Cabo Baixo'),
  [normalizeExerciseKey('Barbell Row')]: normalizeExerciseKey('Remada Curvada com Barra'),
  [normalizeExerciseKey('Bent Over Barbell Row')]: normalizeExerciseKey('Remada Curvada com Barra'),
};

/** Resolve a name to its merge canonical key, if any. */
export function resolveCanonicalKey(name: string): string {
  const key = normalizeExerciseKey(name);
  return EXERCISE_MERGE_ALIASES[key] || key;
}

/**
 * Preferred media donor keys for curated PT rows that still lack artwork.
 * Maps canonical key → list of EN free-exercise-db name keys to try.
 */
export function mediaDonorKeysFor(canonicalKey: string): string[] {
  const donors: string[] = [canonicalKey];
  for (const [alias, target] of Object.entries(EXERCISE_MERGE_ALIASES)) {
    if (target === canonicalKey) donors.push(alias);
  }
  return donors;
}
