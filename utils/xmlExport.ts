import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { getPlanById, getPlanExercisesWithDetails } from '@/db/planDao';
import { getSessionById, getSessionSetsWithExercise, getStreakData, getPersonalRecords, getWeeklyVolumeByMuscle, getMostTrainedExercises, getMostUsedPlans, getTrainingTips, getAllSessions } from '@/db/workoutDao';
import { getDatabase } from '@/db/database';
import { documentDirectory, writeAsStringAsync, readAsStringAsync, EncodingType, makeDirectoryAsync } from 'expo-file-system/legacy';
import { summarizeWorkoutPace, rateSetPace } from './setPace';

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function exportPlanAsXml(planId: number): Promise<string> {
  const plan = await getPlanById(planId);
  if (!plan) throw new Error('Plano nao encontrado');

  const exercises = await getPlanExercisesWithDetails(planId);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<changes tipo="plano" versao="1.1">\n';
  xml += `  <plano nome="${escapeXml(plan.name)}" tipo="${plan.plan_type}" divisao="${plan.split_type}">\n`;
  xml += `    <descricao>${escapeXml(plan.description)}</descricao>\n`;

  // Plans are organised in training days (Push / Pull / Pernas...). Version 1.1
  // of the format wraps exercises in <dia> elements so sharing a plan preserves
  // its split; the 1.0 importer ignored days entirely.
  const dayMap = new Map<number, { label: string; items: any[] }>();
  for (const ex of exercises) {
    const idx: number = ex.day_index ?? 0;
    if (!dayMap.has(idx)) {
      dayMap.set(idx, { label: ex.day_label || 'Treino', items: [] });
    }
    dayMap.get(idx)!.items.push(ex);
  }
  const orderedDays = [...dayMap.entries()].sort((a, b) => a[0] - b[0]);

  for (const [dayIndex, day] of orderedDays) {
    xml += `    <dia indice="${dayIndex}" nome="${escapeXml(day.label)}">\n`;

    let currentSuperset = -1;
    for (let i = 0; i < day.items.length; i++) {
      const ex = day.items[i];
      const next = day.items[i + 1];
      const supersetOpen = ex.superset_group !== null && ex.superset_group !== currentSuperset;
      const supersetClose = ex.superset_group !== null && (!next || next.superset_group !== ex.superset_group);

      if (supersetOpen) {
        xml += `      <superserie grupo="${ex.superset_group}">\n`;
        currentSuperset = ex.superset_group;
      }

      xml += `        <exercicio nome="${escapeXml(ex.exercise_name)}" musculo="${ex.primary_muscle}" equipamento="${ex.equipment}">\n`;
      xml += `          <configuracao series="${ex.sets}" reps="${escapeXml(ex.reps_target)}" peso="${ex.weight_target}" descanso="${ex.rest_seconds}" tipo_serie="${ex.set_type}" cadencia="${escapeXml(ex.tempo || '')}" />\n`;
      if (ex.notes) {
        xml += `          <notas>${escapeXml(ex.notes)}</notas>\n`;
      }
      xml += `        </exercicio>\n`;

      if (supersetClose) {
        xml += `      </superserie>\n`;
        currentSuperset = -1;
      }
    }

    xml += `    </dia>\n`;
  }

  xml += `  </plano>\n`;
  xml += '</changes>\n';
  return xml;
}

export async function exportWorkoutAsXml(sessionId: number): Promise<string> {
  const session = await getSessionById(sessionId);
  if (!session) throw new Error('Treino nao encontrado');

  const sets = await getSessionSetsWithExercise(sessionId);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<changes tipo="treino" versao="1.0">\n';
  xml += `  <treino nome="${escapeXml(session.name)}" data="${session.started_at}" duracao="${session.total_duration}" volume="${session.total_volume}" series="${session.total_sets}">\n`;
  if (session.notes) {
    xml += `    <notas>${escapeXml(session.notes)}</notas>\n`;
  }

  let currentExercise = -1;
  for (const set of sets) {
    if (set.exercise_id !== currentExercise) {
      if (currentExercise !== -1) {
        xml += `    </exercicio>\n`;
      }
      xml += `    <exercicio nome="${escapeXml(set.exercise_name)}" musculo="${set.primary_muscle}" equipamento="${set.equipment}">\n`;
      currentExercise = set.exercise_id;
    }
    xml += `      <serie indice="${set.set_index}" reps="${set.reps}" peso="${set.weight}" rpe="${set.rpe || ''}" descanso="${set.rest_seconds}" duracao="${set.set_duration}" tipo="${set.set_type}" data="${set.completed_at}" pr="${set.is_pr}" />\n`;
  }
  if (currentExercise !== -1) {
    xml += `    </exercicio>\n`;
  }

  xml += `  </treino>\n`;
  xml += '</changes>\n';
  return xml;
}

/**
 * A short, human-readable summary of ONE workout — for sending to yourself
 * (the OS share sheet includes Gmail/Mail among the targets) right after
 * finishing, distinct from exportWorkoutAsXml (data-restore format) and
 * exportTrainingReport (a rolling report across the last 10 sessions).
 * Includes the set-pace read (see utils/setPace.ts) when at least one set
 * was timed with the "Tempo de série" stopwatch.
 */
export async function exportWorkoutSummaryText(sessionId: number): Promise<string> {
  const session = await getSessionById(sessionId);
  if (!session) throw new Error('Treino nao encontrado');
  const sets = await getSessionSetsWithExercise(sessionId);

  const grouped = new Map<number, { name: string; sets: typeof sets }>();
  for (const set of sets) {
    if (!grouped.has(set.exercise_id)) grouped.set(set.exercise_id, { name: set.exercise_name, sets: [] });
    grouped.get(set.exercise_id)!.sets.push(set);
  }

  const totalVolume = sets.reduce((sum, s: any) => sum + s.reps * s.weight, 0);
  const prCount = sets.filter((s: any) => s.is_pr).length;
  const date = new Date(session.started_at * 1000).toLocaleString('pt-PT');

  let text = `Changes — Resumo do treino\n`;
  text += `${session.name}\n${date}\n\n`;
  text += `Duração: ${Math.round((session.total_duration || 0) / 60)} min · Séries: ${sets.length} · Volume: ${Math.round(totalVolume)} kg`;
  if (prCount > 0) text += ` · ${prCount} PR${prCount > 1 ? 's' : ''}`;
  text += `\n\n`;

  const pace = summarizeWorkoutPace(sets.map((s: any) => ({ reps: s.reps, actualSeconds: s.set_duration || 0 })));
  if (pace.measuredSets > 0) {
    const verdictText: Record<string, string> = {
      fast: 'Ritmo: sets mais rápidos do que o ideal — vale a pena controlar melhor o movimento.',
      slow: 'Ritmo: sets mais lentos do que o ideal — pode ser pausa a mais entre repetições.',
      good: 'Ritmo: dentro do esperado.',
      mixed: 'Ritmo: inconsistente esta sessão (sets rápidos e lentos misturados).',
    };
    text += `${verdictText[pace.verdict] ?? ''}\n`;
    text += `Média ${Math.round(pace.avgActualSeconds)}s por série (ideal ≈ ${Math.round(pace.avgIdealSeconds)}s), ${pace.measuredSets}/${pace.totalSets} séries cronometradas.\n\n`;
  }

  for (const { name, sets: exSets } of grouped.values()) {
    text += `${name}\n`;
    for (const s of exSets as any[]) {
      let line = `  ${s.reps} x ${s.weight}kg`;
      if (s.rpe) line += ` · RPE ${s.rpe}`;
      if (s.set_duration > 0) {
        const rating = rateSetPace(s.reps, s.set_duration);
        line += ` · ${s.set_duration}s`;
        if (rating === 'fast') line += ' (rápido)';
        else if (rating === 'slow') line += ' (lento)';
      }
      if (s.is_pr) line += ' · PR';
      text += `${line}\n`;
    }
    text += `\n`;
  }

  return text;
}

export async function shareXmlFile(content: string, filename: string): Promise<void> {
  const filePath = `${documentDirectory}${filename}`;
  await writeAsStringAsync(filePath, content);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/xml',
      dialogTitle: 'Partilhar treino',
      UTI: 'public.xml',
    });
  }
}

export interface ImportResult {
  type: 'plano' | 'treino';
  success: boolean;
  message: string;
  importedId?: number;
}

export async function importXml(content: string): Promise<ImportResult> {
  try {
    // Simple XML parser for our schema
    // Reads both the new <changes> root tag and the <gymforge> tag used by
    // files exported before the app was renamed, so old shares still import.
    const typeMatch = content.match(/<(?:changes|gymforge)\s+tipo="([^"]+)"/);
    if (!typeMatch) {
      return { type: 'plano', success: false, message: 'Formato XML invalido' };
    }
    const type = typeMatch[1] as 'plano' | 'treino';

    if (type === 'plano') {
      return await importPlanXml(content);
    } else {
      return await importWorkoutXml(content);
    }
  } catch (e) {
    return { type: 'plano', success: false, message: `Erro ao importar: ${e}` };
  }
}

async function importPlanXml(content: string): Promise<ImportResult> {
  const db = await getDatabase();

  const planMatch = content.match(/<plano\s+nome="([^"]+)"\s+tipo="([^"]+)"\s+divisao="([^"]+)"/);
  if (!planMatch) return { type: 'plano', success: false, message: 'Dados do plano invalidos' };

  const [, name, planType, splitType] = planMatch;
  const descMatch = content.match(/<descricao>([\s\S]*?)<\/descricao>/);
  const description = descMatch ? unescapeXml(descMatch[1].trim()) : '';

  // BUGFIX: creating the plan record and inserting every day's exercises
  // used to be separate, un-transacted statements — an interruption partway
  // through importing a multi-day plan (a malformed fragment further down
  // the file, the app being killed) left a plan with only some of its days
  // present, with nothing to indicate it was incomplete. Wrapping the whole
  // import in one transaction makes it all-or-nothing.
  let planId!: number;
  let total = 0;
  let dayCount = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      'INSERT INTO workout_plans (name, description, plan_type, split_type) VALUES (?, ?, ?, ?)',
      [unescapeXml(name), description, planType, splitType]
    );
    planId = result.lastInsertRowId as number;

    // Resolves an exercise by name, creating a custom one if this device doesn't
    // have it (e.g. a plan shared from a gym with different machines).
    const resolveExerciseId = async (rawName: string): Promise<number> => {
      const name = unescapeXml(rawName);
      const found = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM exercises WHERE name = ? COLLATE NOCASE LIMIT 1',
        [name]
      );
      if (found) return found.id;
      const created = await db.runAsync(
        'INSERT INTO exercises (name, primary_muscle, equipment, type, is_custom) VALUES (?, ?, ?, ?, 1)',
        [name, 'fullbody', 'other', 'strength']
      );
      return created.lastInsertRowId as number;
    };

    const EXERCISE_RE = /<exercicio\s+nome="([^"]+)"\s+musculo="([^"]+)"\s+equipamento="([^"]+)">([\s\S]*?)<\/exercicio>/g;
    // cadencia is optional so plans exported before tempo support still import.
    const CONFIG_RE = /<configuracao\s+series="(\d+)"\s+reps="([^"]+)"\s+peso="([\d.]+)"\s+descanso="(\d+)"\s+tipo_serie="([^"]+)"(?:\s+cadencia="([^"]*)")?/;

    // Imports one day's exercises. Supersets are detected by locating each
    // exercise inside an enclosing <superserie grupo="N"> block.
    const importDay = async (dayContent: string, dayLabel: string, dayIndex: number): Promise<number> => {
      const supersetRanges: { group: number; start: number; end: number }[] = [];
      for (const ss of dayContent.matchAll(/<superserie\s+grupo="(\d+)">([\s\S]*?)<\/superserie>/g)) {
        supersetRanges.push({
          group: parseInt(ss[1]),
          start: ss.index!,
          end: ss.index! + ss[0].length,
        });
      }

      let order = 0;
      for (const match of dayContent.matchAll(EXERCISE_RE)) {
        const [, exName, , , exContent] = match;
        const configMatch = exContent.match(CONFIG_RE);
        if (!configMatch) continue;
        const [, sets, reps, weight, rest, setType, cadencia] = configMatch;

        const exerciseId = await resolveExerciseId(exName);
        const notesMatch = exContent.match(/<notas>([\s\S]*?)<\/notas>/);
        const notes = notesMatch ? unescapeXml(notesMatch[1].trim()) : '';

        const pos = match.index!;
        const superset = supersetRanges.find(r => pos >= r.start && pos < r.end);

        await db.runAsync(
          `INSERT INTO plan_exercises (plan_id, exercise_id, order_index, sets, reps_target, weight_target, rest_seconds, set_type, superset_group, notes, day_label, day_index, tempo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [planId, exerciseId, order++, parseInt(sets), reps, parseFloat(weight), parseInt(rest), setType, superset ? superset.group : null, notes, dayLabel, dayIndex, cadencia ? unescapeXml(cadencia) : '']
        );
      }
      return order;
    };

    // Format 1.1 wraps exercises in <dia> blocks. Files exported by 1.0 have no
    // days, so everything falls back into a single implicit day.
    const dayMatches = [...content.matchAll(/<dia\s+indice="(\d+)"\s+nome="([^"]+)">([\s\S]*?)<\/dia>/g)];

    if (dayMatches.length > 0) {
      for (const dm of dayMatches) {
        const [, indice, nome, dayContent] = dm;
        total += await importDay(dayContent, unescapeXml(nome), parseInt(indice));
        dayCount++;
      }
    } else {
      total = await importDay(content, 'Treino', 0);
      dayCount = 1;
    }
  });

  const daysLabel = dayCount > 1 ? `${dayCount} dias, ` : '';
  return {
    type: 'plano',
    success: true,
    message: `Plano "${unescapeXml(name)}" importado (${daysLabel}${total} exercicios)`,
    importedId: planId,
  };
}

async function importWorkoutXml(content: string): Promise<ImportResult> {
  const db = await getDatabase();

  const workoutMatch = content.match(/<treino\s+nome="([^"]+)"\s+data="(\d+)"/);
  if (!workoutMatch) return { type: 'treino', success: false, message: 'Dados do treino invalidos' };

  const [, name, startedAt] = workoutMatch;

  // BUGFIX: creating the session and inserting each exercise's sets used to
  // be separate, un-transacted statements — an interruption partway through
  // (a malformed fragment, the app being killed) left a session with only
  // some of its sets imported, silently under-counting the workout. One
  // transaction makes the whole import all-or-nothing.
  let sessionId!: number;
  let totalVolume = 0;
  let totalSets = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      'INSERT INTO workout_sessions (plan_id, name, started_at, ended_at, total_duration, total_volume, total_sets) VALUES (NULL, ?, ?, ?, 0, 0, 0)',
      [unescapeXml(name), parseInt(startedAt)]
    );
    sessionId = result.lastInsertRowId as number;

    const exerciseMatches = content.matchAll(/<exercicio\s+nome="([^"]+)"[\s\S]*?>([\s\S]*?)<\/exercicio>/g);

    for (const match of exerciseMatches) {
      const [, exName, exContent] = match;
      // BUGFIX: exportWorkoutAsXml now writes a per-set "data" (timestamp)
      // attribute; this regex accepts it optionally so both old and new XML
      // files still import correctly, falling back to the session start time.
      const setMatches = exContent.matchAll(/<serie\s+indice="(\d+)"\s+reps="(\d+)"\s+peso="([\d.]+)"\s+rpe="([^"]*)"\s+descanso="(\d+)"\s+duracao="(\d+)"\s+tipo="([^"]+)"(?:\s+data="(\d+)")?\s+pr="(\d+)"/g);

      let exercise = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM exercises WHERE name = ? COLLATE NOCASE LIMIT 1',
        [unescapeXml(exName)]
      );

      if (!exercise) {
        const exResult = await db.runAsync(
          'INSERT INTO exercises (name, primary_muscle, equipment, type, is_custom) VALUES (?, ?, ?, ?, 1)',
          [unescapeXml(exName), 'fullbody', 'other', 'strength']
        );
        exercise = { id: exResult.lastInsertRowId as number };
      }

      for (const setMatch of setMatches) {
        const [, setIndex, reps, weight, rpe, rest, duration, setType, setData, isPr] = setMatch;
        const r = parseInt(reps);
        const w = parseFloat(weight);
        totalVolume += r * w;
        totalSets++;

        await db.runAsync(
          `INSERT INTO workout_sets (session_id, exercise_id, set_index, reps, weight, rpe, rest_seconds, set_duration, set_type, completed_at, is_pr)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sessionId, exercise.id, parseInt(setIndex), r, w, rpe ? parseInt(rpe) : null, parseInt(rest), parseInt(duration), setType, setData ? parseInt(setData) : parseInt(startedAt), parseInt(isPr)]
        );
      }
    }

    await db.runAsync(
      'UPDATE workout_sessions SET total_volume = ?, total_sets = ? WHERE id = ?',
      [totalVolume, totalSets, sessionId]
    );
  });

  return { type: 'treino', success: true, message: `Treino "${unescapeXml(name)}" importado com ${totalSets} series`, importedId: sessionId };
}

export function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// === FULL BACKUP / RESTORE ===

export async function exportFullBackup(): Promise<string> {
  const db = await getDatabase();

  const exercises = await db.getAllAsync<any>('SELECT * FROM exercises');
  const plans = await db.getAllAsync<any>('SELECT * FROM workout_plans');
  const planExercises = await db.getAllAsync<any>('SELECT * FROM plan_exercises');
  const sessions = await db.getAllAsync<any>('SELECT * FROM workout_sessions');
  const sets = await db.getAllAsync<any>('SELECT * FROM workout_sets');
  const bodyMetrics = await db.getAllAsync<any>('SELECT * FROM body_metrics');
  const settings = await db.getAllAsync<any>('SELECT * FROM settings');
  // BUGFIX: these two were missing from the backup entirely — restoring an
  // "everything" backup silently dropped every exercise's sticky notes and
  // attached photo/video, and every 5/3/1 Training Max + cycle week.
  const trainingMaxes = await db.getAllAsync<any>('SELECT * FROM training_maxes').catch(() => []);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<changes tipo="backup" versao="1.1" data="' + Math.floor(Date.now() / 1000) + '">\n';

  xml += '  <exercicios>\n';
  for (const ex of exercises) {
    xml += `    <exercicio id="${ex.id}" nome="${escapeXml(ex.name)}" musculo="${ex.primary_muscle}" secundarios="${escapeXml(ex.secondary_muscles || '')}" equipamento="${ex.equipment}" tipo="${ex.type}" instrucoes="${escapeXml(ex.instructions || '')}" notas_pessoais="${escapeXml(ex.user_notes || '')}" media="${escapeXml(ex.media_uri || '')}" sinonimos="${escapeXml(ex.alt_names || '')}" personalizado="${ex.is_custom}" />\n`;
  }
  xml += '  </exercicios>\n';

  xml += '  <planos>\n';
  for (const p of plans) {
    xml += `    <plano id="${p.id}" nome="${escapeXml(p.name)}" descricao="${escapeXml(p.description || '')}" tipo="${p.plan_type}" divisao="${p.split_type}" auto="${p.is_auto_generated ?? 0}" criado="${p.created_at}" />\n`;
  }
  xml += '  </planos>\n';

  xml += '  <exercicios_plano>\n';
  for (const pe of planExercises) {
    xml += `    <item plano_id="${pe.plan_id}" exercicio_id="${pe.exercise_id}" ordem="${pe.order_index}" series="${pe.sets}" reps="${escapeXml(pe.reps_target)}" peso="${pe.weight_target}" descanso="${pe.rest_seconds}" tipo_serie="${pe.set_type}" superserie="${pe.superset_group || ''}" dia_indice="${pe.day_index ?? 0}" dia_nome="${escapeXml(pe.day_label || '')}" cadencia="${escapeXml(pe.tempo || '')}" notas="${escapeXml(pe.notes || '')}" />\n`;
  }
  xml += '  </exercicios_plano>\n';

  xml += '  <sessoes>\n';
  for (const s of sessions) {
    xml += `    <sessao id="${s.id}" nome="${escapeXml(s.name)}" plano_id="${s.plan_id || ''}" inicio="${s.started_at}" fim="${s.ended_at || ''}" duracao="${s.total_duration}" volume="${s.total_volume}" series="${s.total_sets}" notas="${escapeXml(s.notes || '')}" />\n`;
  }
  xml += '  </sessoes>\n';

  xml += '  <series>\n';
  for (const st of sets) {
    xml += `    <serie sessao_id="${st.session_id}" exercicio_id="${st.exercise_id}" indice="${st.set_index}" reps="${st.reps}" peso="${st.weight}" rpe="${st.rpe || ''}" descanso="${st.rest_seconds}" duracao="${st.set_duration}" tipo="${st.set_type}" data="${st.completed_at}" pr="${st.is_pr}" />\n`;
  }
  xml += '  </series>\n';

  xml += '  <metricas_corporais>\n';
  for (const m of bodyMetrics) {
    xml += `    <metrica data="${m.date}" peso="${m.weight || ''}" gordura="${m.body_fat || ''}" peito="${m.chest || ''}" costas="${m.back || ''}" cintura="${m.waist || ''}" ancas="${m.hips || ''}" braco="${m.arm || ''}" coxa="${m.thigh || ''}" foto="${escapeXml(m.photo_uri || '')}" />\n`;
  }
  xml += '  </metricas_corporais>\n';

  xml += '  <pesos_referencia>\n';
  for (const tm of trainingMaxes) {
    xml += `    <peso_ref levantamento="${tm.lift}" peso="${tm.weight}" semana_ciclo="${tm.cycle_week}" />\n`;
  }
  xml += '  </pesos_referencia>\n';

  xml += '  <definicoes>\n';
  for (const s of settings) {
    xml += `    <definicao chave="${escapeXml(s.key)}" valor="${escapeXml(s.value)}" />\n`;
  }
  xml += '  </definicoes>\n';

  xml += '</changes>\n';
  return xml;
}

export async function restoreFullBackup(content: string): Promise<ImportResult> {
  const db = await getDatabase();

  try {
    // Verify it's a backup
    if (!content.includes('<changes tipo="backup"') && !content.includes('<gymforge tipo="backup"')) {
      return { type: 'plano', success: false, message: 'Nao e um ficheiro de backup valido' };
    }

    // BUGFIX: this is the single most dangerous operation in the app — it
    // deletes every plan, session, set and body measurement before
    // re-inserting everything from the backup file. None of it was wrapped
    // in a transaction, so if parsing/insertion failed partway through
    // (a malformed fragment, the app being killed mid-restore...), the
    // person was left with their OLD data already deleted and the NEW data
    // only half-restored — an unrecoverable data loss. Wrapping the delete
    // and every restoration step in one transaction makes it atomic: on any
    // failure, nothing is deleted, nothing is inserted, and the person's
    // existing data is exactly as it was before they tapped "Restaurar".
    let planCount = 0;
    let restoredPlanExercises = 0;
    let sessionCount = 0;
    let restoredSets = 0;

    await db.withTransactionAsync(async () => {
      // Clear existing data (dangerous but it's a restore)
      await db.execAsync(`
        DELETE FROM workout_sets;
        DELETE FROM workout_sessions;
        DELETE FROM plan_exercises;
        DELETE FROM workout_plans;
        DELETE FROM body_metrics;
        DELETE FROM settings;
        DELETE FROM exercises WHERE is_custom = 1;
      `);

      // 1) Exercises: map old id -> new/existing id
      const exerciseIdMap = new Map<string, number>();
      // notas_pessoais/media/sinonimos are optional in the regex so backups
      // made before these fields existed still restore correctly.
      const exMatches = content.matchAll(/<exercicio\s+id="(\d+)"\s+nome="([^"]+)"\s+musculo="([^"]+)"\s+secundarios="([^"]*)"\s+equipamento="([^"]+)"\s+tipo="([^"]+)"\s+instrucoes="([^"]*)"(?:\s+notas_pessoais="([^"]*)")?(?:\s+media="([^"]*)")?(?:\s+sinonimos="([^"]*)")?\s+personalizado="(\d+)"/g);
      for (const m of exMatches) {
        const [, oldId, name, muscle, secondary, equip, type, instructions, userNotes, mediaUri, altNames, isCustom] = m;
        const cleanName = unescapeXml(name);
        const cleanUserNotes = userNotes ? unescapeXml(userNotes) : '';
        const cleanMediaUri = mediaUri ? unescapeXml(mediaUri) : '';
        const cleanAltNames = altNames ? unescapeXml(altNames) : '';
        if (isCustom === '1') {
          const res = await db.runAsync(
            'INSERT INTO exercises (name, primary_muscle, secondary_muscles, equipment, type, instructions, user_notes, media_uri, alt_names, is_custom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
            [cleanName, muscle, unescapeXml(secondary), equip, type, unescapeXml(instructions), cleanUserNotes, cleanMediaUri, cleanAltNames]
          );
          exerciseIdMap.set(oldId, res.lastInsertRowId as number);
        } else {
          // Built-in exercise: it wasn't deleted, so match it by name instead
          // of trusting the numeric id (ids can differ between installs).
          const found = await db.getFirstAsync<{ id: number }>(
            'SELECT id FROM exercises WHERE name = ? COLLATE NOCASE LIMIT 1',
            [cleanName]
          );
          if (found) {
            exerciseIdMap.set(oldId, found.id);
            // BUGFIX: the built-in exercise already exists (seeded on first
            // launch, before the person ever taps "Restaurar"), so matching
            // it by name alone left any personal notes/attached media from
            // the backup silently discarded — only custom exercises had
            // theirs written. A restore should bring these back too.
            if (cleanUserNotes || cleanMediaUri || cleanAltNames) {
              await db.runAsync(
                'UPDATE exercises SET user_notes = ?, media_uri = ?, alt_names = ? WHERE id = ?',
                [cleanUserNotes, cleanMediaUri, cleanAltNames, found.id]
              );
            }
          } else {
            const res = await db.runAsync(
              'INSERT INTO exercises (name, primary_muscle, secondary_muscles, equipment, type, instructions, user_notes, media_uri, alt_names, is_custom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
              [cleanName, muscle, unescapeXml(secondary), equip, type, unescapeXml(instructions), cleanUserNotes, cleanMediaUri, cleanAltNames]
            );
            exerciseIdMap.set(oldId, res.lastInsertRowId as number);
          }
        }
      }

      // 2) Plans: map old id -> new id
      const planIdMap = new Map<string, number>();
      // `auto` is optional so backups made before this field existed still
      // restore correctly (falls back to 0 — treated as manual, the safer
      // default: worst case an old auto-generated plan shows up under
      // "Meus Planos" until deleted, rather than a genuine manual plan
      // silently vanishing from that view).
      const planMatches = content.matchAll(/<plano\s+id="(\d+)"\s+nome="([^"]+)"\s+descricao="([^"]*)"\s+tipo="([^"]+)"\s+divisao="([^"]+)"(?:\s+auto="(\d)")?/g);
      for (const m of planMatches) {
        const [, oldId, name, desc, type, split, auto] = m;
        const res = await db.runAsync(
          'INSERT INTO workout_plans (name, description, plan_type, split_type, is_auto_generated) VALUES (?, ?, ?, ?, ?)',
          [unescapeXml(name), unescapeXml(desc), type, split, auto === '1' ? 1 : 0]
        );
        planIdMap.set(oldId, res.lastInsertRowId as number);
      }
      planCount = planIdMap.size;

      // 3) Plan exercises (the actual content of each plan)
      // dia_indice/dia_nome/cadencia are optional so backups taken before
      // those features existed still restore (they just come back without
      // day structure or tempo, same as they were saved at the time).
      const itemMatches = content.matchAll(/<item\s+plano_id="(\d+)"\s+exercicio_id="(\d+)"\s+ordem="(\d+)"\s+series="(\d+)"\s+reps="([^"]*)"\s+peso="([\d.]*)"\s+descanso="(\d+)"\s+tipo_serie="([^"]+)"\s+superserie="([^"]*)"(?:\s+dia_indice="(\d+)")?(?:\s+dia_nome="([^"]*)")?(?:\s+cadencia="([^"]*)")?\s+notas="([^"]*)"/g);
      for (const m of itemMatches) {
        const [, oldPlanId, oldExId, ordem, series, reps, peso, descanso, tipoSerie, superserie, diaIndice, diaNome, cadencia, notas] = m;
        const newPlanId = planIdMap.get(oldPlanId);
        const newExId = exerciseIdMap.get(oldExId);
        if (newPlanId === undefined || newExId === undefined) continue;
        await db.runAsync(
          'INSERT INTO plan_exercises (plan_id, exercise_id, order_index, sets, reps_target, weight_target, rest_seconds, set_type, superset_group, day_index, day_label, tempo, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newPlanId, newExId, parseInt(ordem), parseInt(series), unescapeXml(reps), parseFloat(peso) || 0, parseInt(descanso), tipoSerie, superserie ? parseInt(superserie) : null, diaIndice ? parseInt(diaIndice) : 0, diaNome ? unescapeXml(diaNome) : '', cadencia ? unescapeXml(cadencia) : '', unescapeXml(notas)]
        );
        restoredPlanExercises++;
      }

      // 4) Workout sessions: map old id -> new id
      const sessionIdMap = new Map<string, number>();
      const sessionMatches = content.matchAll(/<sessao\s+id="(\d+)"\s+nome="([^"]+)"\s+plano_id="([^"]*)"\s+inicio="(\d+)"\s+fim="([^"]*)"\s+duracao="(\d+)"\s+volume="([\d.]*)"\s+series="(\d+)"\s+notas="([^"]*)"/g);
      for (const m of sessionMatches) {
        const [, oldId, nome, planoId, inicio, fim, duracao, volume, series, notas] = m;
        const newPlanId = planoId ? planIdMap.get(planoId) ?? null : null;
        const res = await db.runAsync(
          'INSERT INTO workout_sessions (plan_id, name, started_at, ended_at, total_duration, total_volume, total_sets, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [newPlanId, unescapeXml(nome), parseInt(inicio), fim ? parseInt(fim) : null, parseInt(duracao), parseFloat(volume) || 0, parseInt(series), unescapeXml(notas)]
        );
        sessionIdMap.set(oldId, res.lastInsertRowId as number);
      }
      sessionCount = sessionIdMap.size;

      // 5) Workout sets (the individual logged sets, with original timestamps)
      const setMatches = content.matchAll(/<serie\s+sessao_id="(\d+)"\s+exercicio_id="(\d+)"\s+indice="(\d+)"\s+reps="(\d+)"\s+peso="([\d.]*)"\s+rpe="([^"]*)"\s+descanso="(\d+)"\s+duracao="(\d+)"\s+tipo="([^"]+)"\s+data="(\d+)"\s+pr="(\d+)"/g);
      for (const m of setMatches) {
        const [, oldSessionId, oldExId, indice, reps, peso, rpe, descanso, duracao, tipo, data, pr] = m;
        const newSessionId = sessionIdMap.get(oldSessionId);
        const newExId = exerciseIdMap.get(oldExId);
        if (newSessionId === undefined || newExId === undefined) continue;
        await db.runAsync(
          `INSERT INTO workout_sets (session_id, exercise_id, set_index, reps, weight, rpe, rest_seconds, set_duration, set_type, completed_at, is_pr)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newSessionId, newExId, parseInt(indice), parseInt(reps), parseFloat(peso) || 0, rpe ? parseInt(rpe) : null, parseInt(descanso), parseInt(duracao), tipo, parseInt(data), parseInt(pr)]
        );
        restoredSets++;
      }

      // 6) Body metrics
      // costas/foto are optional so backups made before this field existed
      // still restore correctly.
      const metricMatches = content.matchAll(/<metrica\s+data="(\d+)"\s+peso="([^"]*)"\s+gordura="([^"]*)"\s+peito="([^"]*)"(?:\s+costas="([^"]*)")?\s+cintura="([^"]*)"\s+ancas="([^"]*)"\s+braco="([^"]*)"\s+coxa="([^"]*)"(?:\s+foto="([^"]*)")?/g);
      for (const m of metricMatches) {
        const [, data, peso, gordura, peito, costas, cintura, ancas, braco, coxa, foto] = m;
        // The photo_uri restored here is whatever path the ORIGINAL device
        // used — see restoreFullBackupZip for the version that actually
        // re-links photos to real files after a reinstall. A plain-XML
        // restore (no zip) can't recover the image itself, only this
        // (likely now-invalid) path, same limitation as before.
        await db.runAsync(
          'INSERT INTO body_metrics (date, weight, body_fat, chest, back, waist, hips, arm, thigh, photo_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [parseInt(data), peso ? parseFloat(peso) : null, gordura ? parseFloat(gordura) : null, peito ? parseFloat(peito) : null, costas ? parseFloat(costas) : null, cintura ? parseFloat(cintura) : null, ancas ? parseFloat(ancas) : null, braco ? parseFloat(braco) : null, coxa ? parseFloat(coxa) : null, foto ? unescapeXml(foto) : null]
        );
      }

      // 7) 5/3/1 Training Maxes — missing from backups before this fix, so a
      // restore silently reset anyone using that program back to "not set up".
      const tmMatches = content.matchAll(/<peso_ref\s+levantamento="([^"]+)"\s+peso="([\d.]+)"\s+semana_ciclo="(\d+)"/g);
      for (const m of tmMatches) {
        const [, lift, peso, semana] = m;
        await db.runAsync(
          'INSERT INTO training_maxes (lift, weight, cycle_week) VALUES (?, ?, ?) ON CONFLICT(lift) DO UPDATE SET weight = excluded.weight, cycle_week = excluded.cycle_week',
          [lift, parseFloat(peso), parseInt(semana)]
        );
      }

      // 8) Settings
      const settingMatches = content.matchAll(/<definicao\s+chave="([^"]+)"\s+valor="([^"]*)"/g);
      for (const m of settingMatches) {
        const [, key, value] = m;
        await db.runAsync(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [unescapeXml(key), unescapeXml(value)]
        );
      }
    });

    return {
      type: 'plano',
      success: true,
      message: `Backup restaurado: ${planCount} planos, ${restoredPlanExercises} exercicios de plano, ${sessionCount} sessoes, ${restoredSets} series`,
    };
  } catch (e) {
    return { type: 'plano', success: false, message: `Erro ao restaurar: ${e}` };
  }
}

/**
 * The "everything" backup, as a .zip: exportFullBackup()'s XML plus an
 * actual copy of every referenced photo/media file.
 *
 * BUGFIX: exportFullBackup() alone only ever wrote the device FILE PATH for
 * a body-progress photo or an exercise's attached media (e.g.
 * "file:///data/.../body-photos/body_123.jpg") — never the image itself.
 * That path only means anything on the exact device/install that created
 * it; after reinstalling the app (a fresh app data directory) or restoring
 * onto a different phone, every photo silently vanished even though the
 * backup "succeeded" and every other field came back fine. Bundling the
 * actual files into a zip alongside the data is the only way a restore can
 * genuinely bring back everything that was there before.
 */
export async function exportFullBackupZip(): Promise<{ path: string; mediaCount: number }> {
  let xml = await exportFullBackup();
  const zip = new JSZip();
  const mediaFolder = zip.folder('media');

  // Every distinct photo_uri/media_uri path mentioned in the XML — read
  // once even if (in principle) the same file were referenced twice.
  const paths = new Set<string>();
  for (const m of xml.matchAll(/(?:media|foto)="([^"]+)"/g)) {
    if (m[1]) paths.add(unescapeXml(m[1]));
  }

  let mediaCount = 0;
  let mediaIndex = 0;
  for (const originalPath of paths) {
    try {
      const base64 = await readAsStringAsync(originalPath, { encoding: EncodingType.Base64 });
      const ext = originalPath.split('.').pop()?.split('?')[0] || 'jpg';
      const filename = `file_${mediaIndex}.${ext}`;
      mediaIndex++;
      mediaFolder?.file(filename, base64, { base64: true });
      // Replace every occurrence of this exact path in the XML with a
      // zip-relative reference — restoreFullBackupZip resolves these back
      // to real (new) file paths before the normal XML restore ever runs,
      // so restoreFullBackup itself needs no changes for this to work.
      xml = xml.split(escapeXml(originalPath)).join(escapeXml(`media/${filename}`));
      mediaCount++;
    } catch (err) {
      // A photo missing from disk (deleted outside the app, corrupted...)
      // shouldn't fail the whole backup — skip embedding it and leave
      // whatever path was already there, same graceful-degradation
      // approach as the training-report-with-photos export.
      console.error('Failed to include media file in backup:', originalPath, err);
    }
  }

  zip.file('backup.xml', xml);
  const zipBase64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  const filename = `Changes_Backup_${new Date().toISOString().split('T')[0]}.zip`;
  const filePath = `${documentDirectory}${filename}`;
  await writeAsStringAsync(filePath, zipBase64, { encoding: EncodingType.Base64 });

  return { path: filePath, mediaCount };
}

/**
 * Restores a .zip produced by exportFullBackupZip(): extracts every bundled
 * media file to a fresh real path first, patches the XML to point at those
 * new paths, then runs it through the exact same restoreFullBackup() used
 * for a plain-XML restore.
 */
export async function restoreFullBackupZip(zipBase64: string): Promise<ImportResult> {
  try {
    const zip = await JSZip.loadAsync(zipBase64, { base64: true });
    const xmlFile = zip.file('backup.xml');
    if (!xmlFile) {
      return { type: 'plano', success: false, message: 'Ficheiro de backup invalido (backup.xml em falta)' };
    }
    let xml = await xmlFile.async('text');

    const mediaDir = `${documentDirectory}restored-media/`;
    await makeDirectoryAsync(mediaDir, { intermediates: true }).catch(() => {});

    let restoredIndex = 0;
    for (const [zipPath, file] of Object.entries(zip.files)) {
      if (!zipPath.startsWith('media/') || file.dir) continue;
      try {
        const base64 = await file.async('base64');
        const ext = zipPath.split('.').pop() || 'jpg';
        const newPath = `${mediaDir}restored_${Date.now()}_${restoredIndex++}.${ext}`;
        await writeAsStringAsync(newPath, base64, { encoding: EncodingType.Base64 });
        // The export side wrote paths as "media/file_N.ext" (unescaped) but
        // XML-escapes them when substituting into the document, so match
        // against the escaped form here too.
        xml = xml.split(escapeXml(zipPath)).join(escapeXml(newPath));
      } catch (err) {
        console.error('Failed to extract media file from backup:', zipPath, err);
      }
    }

    return await restoreFullBackup(xml);
  } catch (e) {
    return { type: 'plano', success: false, message: `Erro ao restaurar: ${e}` };
  }
}

/**
 * Exports the full training log as CSV — one row per set — for analysis in
 * Excel or Google Sheets. XML is good for sharing plans between phones; CSV is
 * what you want when you'd rather pivot the numbers yourself.
 */
export async function exportHistoryAsCsv(): Promise<string> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT s.name AS sessao, s.started_at, e.name AS exercicio, e.primary_muscle AS musculo,
            ws.set_index, ws.reps, ws.weight, ws.rpe, ws.rest_seconds, ws.set_duration,
            ws.set_type, ws.is_pr
     FROM workout_sets ws
     JOIN workout_sessions s ON ws.session_id = s.id
     JOIN exercises e ON ws.exercise_id = e.id
     WHERE s.ended_at IS NOT NULL
     ORDER BY s.started_at DESC, ws.id`
  );

  const esc = (v: any): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    'Data', 'Hora', 'Treino', 'Exercicio', 'Musculo', 'Serie',
    'Reps', 'Peso_kg', 'Volume_kg', 'RPE', 'Descanso_s', 'Duracao_s', 'Tipo', 'PR',
  ];

  const lines = [header.join(',')];
  for (const r of rows) {
    const d = new Date(r.started_at * 1000);
    lines.push([
      d.toISOString().split('T')[0],
      d.toTimeString().slice(0, 5),
      esc(r.sessao),
      esc(r.exercicio),
      esc(r.musculo),
      r.set_index + 1,
      r.reps,
      r.weight,
      Math.round(r.reps * r.weight * 100) / 100,
      r.rpe ?? '',
      r.rest_seconds,
      r.set_duration,
      r.set_type,
      r.is_pr ? 'sim' : '',
    ].join(','));
  }
  return lines.join('\n');
}

/** Shares any text file (CSV etc.) using the native share sheet. */
export async function shareTextFile(content: string, filename: string, mimeType: string): Promise<void> {
  const fileUri = `${documentDirectory}${filename}`;
  await writeAsStringAsync(fileUri, content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: 'Partilhar' });
  }
}

/**
 * A compact, human- and AI-readable training report in Markdown — designed
 * to be shared (via the OS share sheet, same as everything else in this
 * file) with an assistant like Claude for analysis, rather than a giant
 * spreadsheet. The full XML backup and the row-per-set CSV already cover
 * "restore my data" and "crunch numbers in Excel"; this covers "here's my
 * training, what do you think" in one short, readable file.
 */

// BUGFIX: exercise/plan/session names are free text (especially custom
// exercises), and were interpolated directly into Markdown table rows and
// bold/heading syntax. A name containing "|" would silently break a
// table's column alignment, and "*"/"_"/backticks could prematurely
// open or close formatting further down the report.
export function escapeMd(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/`/g, '\\`').replace(/[\r\n]+/g, ' ');
}

export async function exportTrainingReport(): Promise<string> {
  const [streak, prs, weeklyVolume, topExercises, topPlans, tips, sessions] = await Promise.all([
    getStreakData(),
    getPersonalRecords(),
    getWeeklyVolumeByMuscle(7),
    getMostTrainedExercises(8, 60),
    getMostUsedPlans(5),
    getTrainingTips(),
    getAllSessions(10, 0),
  ]);

  const now = new Date();
  const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleDateString('pt-PT');
  const fmtDateTime = (ts: number) => new Date(ts * 1000).toLocaleString('pt-PT');

  let md = `# Relatório de Treino — Changes\n`;
  md += `Gerado em ${now.toLocaleString('pt-PT')}\n\n`;

  md += `## Resumo\n`;
  md += `- Treinos totais: ${streak.totalWorkouts}\n`;
  md += `- Streak atual: ${streak.currentStreak} dias\n`;
  md += `- Streak recorde: ${streak.longestStreak} dias\n\n`;

  if (tips.length > 0) {
    md += `## Observações automáticas\n`;
    for (const t of tips) {
      md += `- **${escapeMd(t.title)}** — ${escapeMd(t.detail)}\n`;
    }
    md += `\n`;
  }

  if (weeklyVolume.length > 0) {
    md += `## Volume dos últimos 7 dias (por músculo)\n`;
    md += `| Músculo | Séries | Volume (kg) |\n|---|---|---|\n`;
    for (const v of weeklyVolume) {
      md += `| ${v.muscle} | ${v.sets} | ${Math.round(v.volume)} |\n`;
    }
    md += `\n`;
  }

  if (prs.length > 0) {
    md += `## Recordes pessoais\n`;
    md += `| Exercício | Peso máx. | Reps máx. | 1RM estimado | Data |\n|---|---|---|---|---|\n`;
    for (const pr of prs.slice(0, 20)) {
      md += `| ${escapeMd(pr.exercise_name)} | ${pr.max_weight}kg | ${pr.max_reps} | ${Math.round(pr.estimated_1rm)}kg | ${fmtDate(pr.date_achieved)} |\n`;
    }
    md += `\n`;
  }

  if (topExercises.length > 0) {
    md += `## Exercícios mais treinados (últimos 60 dias)\n`;
    for (const ex of topExercises) {
      md += `- ${escapeMd(ex.name)} (${ex.primary_muscle}) — ${ex.set_count} séries, último treino em ${fmtDate(ex.last_trained)}\n`;
    }
    md += `\n`;
  }

  if (topPlans.length > 0) {
    md += `## Planos mais usados\n`;
    for (const p of topPlans) {
      md += `- ${escapeMd(p.name)} — usado ${p.session_count}×, última vez em ${fmtDate(p.last_used)}\n`;
    }
    md += `\n`;
  }

  if (sessions.length > 0) {
    md += `## Últimos ${sessions.length} treinos\n`;
    for (const s of sessions) {
      md += `\n### ${escapeMd(s.name)} — ${fmtDateTime(s.started_at)}\n`;
      md += `Duração: ${Math.round(s.total_duration / 60)}min · ${s.total_sets} séries · ${Math.round(s.total_volume)}kg volume\n\n`;
      try {
        const sets = await getSessionSetsWithExercise(s.id);
        const byExercise: Record<string, { reps: number; weight: number }[]> = {};
        for (const set of sets) {
          if (!byExercise[set.exercise_name]) byExercise[set.exercise_name] = [];
          byExercise[set.exercise_name].push({ reps: set.reps, weight: set.weight });
        }
        for (const [name, setsList] of Object.entries(byExercise)) {
          const setsStr = setsList.map(x => `${x.reps}x${x.weight}kg`).join(', ');
          md += `- **${escapeMd(name)}**: ${setsStr}\n`;
        }
      } catch {
        md += `_(detalhe das séries indisponível)_\n`;
      }
    }
  }

  return md;
}
