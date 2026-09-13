import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { CalendarClock, ChevronDown, ChevronUp, Play, Pencil, X } from 'lucide-react-native';
import type { Theme } from '@/constants/colors';
import { getWeeklyPlanner, type WeeklyPlanner, type PlannerEntry } from '@/db/plannerDao';
import { getPlanById, getPlanExercisesWithDetails, getPlanDays } from '@/db/planDao';
import { getExerciseStates, type AdaptiveWeekWithCycle } from '@/db/adaptiveDao';
import { getRecentSessions } from '@/db/workoutDao';
import { buildRollingThreeWeeks, weekSectionLabel } from '@/utils/rollingCalendar';
import { WEEKDAY_LABELS, WEEKDAY_FULL_LABELS } from '@/utils/reminders';
import { movePlannerEntry, previewMovePlanner, ensurePlannerForPlan } from '@/utils/plannerAssign';
import { getRollingScheduleForPlan } from '@/utils/adaptiveService';
import {
  exercisesForDay,
  isDateInActiveWeek,
  phaseForDate,
  type AgendaExerciseRow,
  type AgendaRollingEntry,
} from '@/utils/mesocycleAgenda';
import { parsePlannedDays, weekForDate } from '@/utils/mesocycleMaterialize';
import { plannedWorkoutRouteParams } from '@/utils/plannedWorkout';
import { buildEffectivePlanner, resolveDaySlot } from '@/utils/scheduleResolve';
import { PHASE_LABEL_PT } from '@/utils/adaptivePlan';
import type { AdaptivePhase, AdaptiveGoal, AdaptiveExperience } from '@/utils/nspi';
import { Card } from '@/components/ui/Card';
import { PlannerWeekDnD } from '@/components/ui/PlannerWeekDnD';
import { hapticSelect } from '@/utils/haptics';

export type AdaptiveAgendaContext = {
  adaptivePlanId: number;
  phase: AdaptivePhase;
  goal: AdaptiveGoal;
  experience: AdaptiveExperience;
  weekStart: number;
  weekEnd: number;
  weekStartDow: number;
};

type Props = {
  colors: Theme;
  /** When set, days pointing at other plans are still shown but de-emphasized. */
  preferredPlanId?: number | null;
  /** Parent ScrollView should disable scrolling while a weekday drag is active. */
  onDragActiveChange?: (active: boolean) => void;
  /** When set, future weeks project the next phases' sets/reps/load. */
  adaptive?: AdaptiveAgendaContext | null;
  /** Persisted adaptive_week rows — preferred source for future prescriptions. */
  weeks?: AdaptiveWeekWithCycle[];
};

function formatLoad(weight: number): string {
  if (!weight || weight <= 0) return '';
  return Number.isInteger(weight) ? `${weight} kg` : `${weight.toFixed(1)} kg`;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Interactive multi-week schedule for "Ver o meu plano" — real SQLite planner
 * + plan_exercises, not a static image. Tap a day to expand exercises / start.
 * Weekday slots can be reordered via long-press drag; "Mudar dia" remains as
 * an accessibility fallback.
 */
export function InteractivePlanAgenda({ colors, preferredPlanId, onDragActiveChange, adaptive, weeks }: Props) {
  const [planner, setPlanner] = useState<WeeklyPlanner>({});
  const [planNames, setPlanNames] = useState<Record<number, string>>({});
  const [dayLabels, setDayLabels] = useState<Record<string, string>>({});
  const [rowsByPlan, setRowsByPlan] = useState<Record<number, AgendaExerciseRow[]>>({});
  const [rolling, setRolling] = useState<AgendaRollingEntry[] | null>(null);
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<{ fromWeekday: number; entry: PlannerEntry } | null>(null);

  const days = useMemo(() => buildRollingThreeWeeks(), []);
  const adaptivePlanId = adaptive?.adaptivePlanId;
  const adaptiveWeekStartDow = adaptive?.weekStartDow;
  const todayWeekday = new Date().getDay();
  const effectivePlanner = useMemo(
    () => buildEffectivePlanner(
      planner,
      rolling,
      preferredPlanId ?? adaptivePlanId ?? null,
      todayWeekday,
      adaptiveWeekStartDow ?? 1,
    ),
    [planner, rolling, preferredPlanId, adaptivePlanId, todayWeekday, adaptiveWeekStartDow],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = preferredPlanId
        ? await ensurePlannerForPlan(preferredPlanId)
        : await getWeeklyPlanner();
      setPlanner(p);
      const ids = [...new Set([
        ...Object.values(p).filter(Boolean).map(e => (e as PlannerEntry).planId),
        ...(preferredPlanId ? [preferredPlanId] : []),
      ])];
      const names: Record<number, string> = {};
      const labels: Record<string, string> = {};
      const rowsMap: Record<number, AgendaExerciseRow[]> = {};
      const states = adaptivePlanId
        ? await getExerciseStates(adaptivePlanId).catch(() => [])
        : [];
      const baseByEx = new Map(states.map(s => [s.exercise_id, s.base_sets]));
      const snapshotReady = (weeks ?? []).some(w => parsePlannedDays(w.planned_json).length > 0);

      await Promise.all(ids.map(async id => {
        const [plan, planDays, raw] = await Promise.all([
          getPlanById(id),
          getPlanDays(id),
          snapshotReady && preferredPlanId && id === preferredPlanId
            ? Promise.resolve([])
            : getPlanExercisesWithDetails(id),
        ]);
        if (plan) names[id] = plan.name;
        for (const d of planDays) labels[`${id}:${d.day_index}`] = d.day_label;
        rowsMap[id] = (raw as AgendaExerciseRow[]).map(r => ({
          ...r,
          day_index: Number(r.day_index),
          base_sets: baseByEx.get(r.exercise_id) ?? r.sets,
        }));
      }));
      setPlanNames(names);
      setDayLabels(labels);
      setRowsByPlan(rowsMap);

      if (preferredPlanId && adaptiveWeekStartDow != null) {
        const schedule = await getRollingScheduleForPlan(
          preferredPlanId,
          adaptiveWeekStartDow,
        ).catch(() => null);
        setRolling(schedule);
      } else {
        setRolling(null);
      }

      const sessions = await getRecentSessions(21).catch(() => []);
      const done = new Set<string>();
      for (const s of sessions) {
        if (!s.ended_at || (preferredPlanId && s.plan_id !== preferredPlanId)) continue;
        const d = new Date(s.started_at * 1000);
        done.add(dateKey(d));
      }
      setCompletedKeys(done);
    } finally {
      setLoading(false);
    }
  }, [preferredPlanId, adaptivePlanId, adaptiveWeekStartDow, weeks]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const detailKey = (entry: PlannerEntry) => `${entry.planId}:${entry.dayIndex}`;

  const exercisesOn = (entry: PlannerEntry, date: Date) => {
    const persisted = weeks && weeks.length > 0 ? weekForDate(weeks, date.getTime()) : null;
    const snapshotDays = persisted ? parsePlannedDays(persisted.planned_json) : [];
    const fromSnap = snapshotDays.find(d => Number(d.dayIndex) === Number(entry.dayIndex));
    if (fromSnap && fromSnap.exercises.length > 0) {
      return fromSnap.exercises.map(e => ({
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        weight: e.weight,
        muscle: e.muscle,
      }));
    }
    const rows = rowsByPlan[entry.planId] ?? [];
    const inActive = adaptive
      ? isDateInActiveWeek(date.getTime(), adaptive.weekStart, adaptive.weekEnd)
      : true;
    const phase = adaptive
      ? phaseForDate(date.getTime(), adaptive.weekStart, adaptive.weekEnd, adaptive.phase)
      : undefined;
    return exercisesForDay(rows, entry.dayIndex, {
      keepCurrentNumbers: inActive || !adaptive,
      projectPhase: phase,
      goal: adaptive?.goal,
      experience: adaptive?.experience,
    });
  };

  const startDay = (entry: PlannerEntry, date?: Date) => {
    const label = dayLabels[detailKey(entry)] || planNames[entry.planId] || 'Treino';
    const persisted = date && weeks && weeks.length > 0 ? weekForDate(weeks, date.getTime()) : null;
    router.push({
      pathname: '/workout/active',
      params: plannedWorkoutRouteParams({
        planId: entry.planId,
        planName: label,
        dayIndex: entry.dayIndex,
        weekId: persisted?.id ?? null,
        weekIndex: persisted?.week_index ?? null,
        phase: persisted?.phase ?? null,
      }),
    });
  };

  const openEditor = (entry: PlannerEntry) => {
    router.push(`/plan/${entry.planId}`);
  };

  const confirmMoveDay = async (toWeekday: number) => {
    if (!moving) return;
    const { fromWeekday, entry } = moving;
    if (toWeekday === fromWeekday) {
      setMoving(null);
      return;
    }
    const occupied = planner[toWeekday];
    const apply = async () => {
      hapticSelect();
      await movePlannerEntry(fromWeekday, toWeekday, entry);
      setPlanner(prev => previewMovePlanner(prev, fromWeekday, toWeekday, entry));
      setMoving(null);
      setExpandedKey(null);
      await load();
    };
    if (occupied) {
      const conflictLabel = dayLabels[detailKey(occupied)] || planNames[occupied.planId] || 'outro treino';
      Alert.alert(
        'Substituir dia?',
        `${WEEKDAY_FULL_LABELS[toWeekday]} já tem "${conflictLabel}". Queres substituir?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Substituir', style: 'destructive', onPress: () => { void apply(); } },
        ],
      );
      return;
    }
    await apply();
  };

  if (loading) {
    return (
      <Card>
        <ActivityIndicator color={colors.primary} />
      </Card>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Agenda interativa</Text>
      <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
        Próximas 3 semanas · toca num dia para ver exercícios, ou reorganiza a semana abaixo
      </Text>

      <PlannerWeekDnD
        colors={colors}
        planner={planner}
        labelFor={(entry) => dayLabels[detailKey(entry)] || planNames[entry.planId] || 'Treino'}
        onPlannerChange={setPlanner}
        onDragActiveChange={onDragActiveChange}
      />

      {[0, 1, 2].map(weekIndex => {
        const weekDays = days.filter(d => d.weekIndex === weekIndex);
        return (
          <View key={weekIndex} style={styles.weekBlock}>
            <Text style={[styles.weekLabel, { color: colors.textTertiary }]}>{weekSectionLabel(weekIndex)}</Text>
            {weekDays.map(day => {
              const useRolling = !!(adaptive && isDateInActiveWeek(day.date.getTime(), adaptive.weekStart, adaptive.weekEnd));
              const resolved = resolveDaySlot(
                day.weekday,
                useRolling ? effectivePlanner : planner,
                useRolling ? rolling : null,
              );
              const entry = resolved.entry && resolved.entry.planId ? resolved.entry : null;
              const key = `${weekIndex}-${day.dayOfMonth}`;
              const isExpanded = expandedKey === key;
              const offPreferred = entry && preferredPlanId && entry.planId !== preferredPlanId;
              const title = entry
                ? (dayLabels[detailKey(entry)] || planNames[entry.planId] || 'Treino')
                : 'Descanso';
              const dayPhase = adaptive
                ? phaseForDate(day.date.getTime(), adaptive.weekStart, adaptive.weekEnd, adaptive.phase)
                : null;
              const doneToday = completedKeys.has(dateKey(day.date));
              const status = !entry
                ? 'Descanso'
                : doneToday
                  ? 'Concluído'
                  : resolved.isSkipped
                    ? 'Em falta'
                    : resolved.isBacklog
                      ? 'Recuperar'
                      : day.offsetFromToday < 0
                        ? 'Passado'
                        : day.isToday
                          ? 'Hoje'
                          : 'Planeado';
              const listed = entry ? exercisesOn(entry, day.date) : [];

              return (
                <View
                  key={key}
                  style={[
                    styles.dayCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: day.isToday ? colors.primary : colors.border,
                      opacity: offPreferred ? 0.7 : 1,
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.dayHeader}
                    onPress={() => {
                      if (!entry) {
                        router.push('/(tabs)');
                        return;
                      }
                      setExpandedKey(isExpanded ? null : key);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${WEEKDAY_LABELS[day.weekday]} ${day.dayOfMonth}: ${title}`}
                  >
                    <View style={styles.dayMeta}>
                      <Text style={[styles.dayDow, { color: day.isToday ? colors.primary : colors.textSecondary }]}>
                        {WEEKDAY_LABELS[day.weekday]} · {day.dayOfMonth}
                      </Text>
                      <Text style={[styles.dayTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
                      <Text style={[styles.dayStatus, { color: entry ? colors.primary : colors.textTertiary }]}>
                        {status}
                        {entry && dayPhase ? ` · ${PHASE_LABEL_PT[dayPhase]}` : ''}
                        {entry && listed.length > 0 ? ` · ${listed.length} exercícios` : ''}
                      </Text>
                    </View>
                    {entry ? (isExpanded ? <ChevronUp size={20} color={colors.textSecondary} /> : <ChevronDown size={20} color={colors.textSecondary} />) : null}
                  </TouchableOpacity>

                  {isExpanded && entry && (
                    <View style={[styles.expand, { borderTopColor: colors.border }]}>
                      {listed.map((ex, i) => (
                        <View key={i} style={styles.exRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.exName, { color: colors.text }]} numberOfLines={1}>{ex.name}</Text>
                            {!!ex.muscle && (
                              <Text style={[styles.exMuscle, { color: colors.textTertiary }]}>{ex.muscle}</Text>
                            )}
                          </View>
                          <Text style={[styles.exSets, { color: colors.textSecondary }]}>
                            {ex.sets}×{ex.reps}{formatLoad(ex.weight) ? ` · ${formatLoad(ex.weight)}` : ''}
                          </Text>
                        </View>
                      ))}
                      {listed.length === 0 && (
                        <Text style={[styles.emptyEx, { color: colors.textTertiary }]}>Sem exercícios neste dia.</Text>
                      )}
                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: colors.surfaceVariant }]}
                          onPress={() => openEditor(entry)}
                          accessibilityRole="button"
                          accessibilityLabel="Editar dia no plano"
                        >
                          <Pencil size={16} color={colors.text} />
                          <Text style={[styles.actionText, { color: colors.text }]}>Ajustar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: colors.surfaceVariant }]}
                          onPress={() => {
                            hapticSelect();
                            setMoving({ fromWeekday: day.weekday, entry });
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Mudar dia da semana deste treino"
                        >
                          <CalendarClock size={16} color={colors.text} />
                          <Text style={[styles.actionText, { color: colors.text }]}>Mudar dia</Text>
                        </TouchableOpacity>
                        {day.offsetFromToday >= 0 && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: colors.primary, flex: 1 }]}
                            onPress={() => startDay(entry, day.date)}
                            accessibilityRole="button"
                            accessibilityLabel="Começar este treino"
                          >
                            <Play size={16} color="#fff" />
                            <Text style={[styles.actionText, { color: '#fff' }]}>
                              {day.isToday ? 'Começar hoje' : 'Começar'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}

      <TouchableOpacity onPress={() => router.push('/(tabs)')} accessibilityRole="button">
        <Text style={[styles.assignHint, { color: colors.primary }]}>
          Atribuir dias da semana no ecrã Hoje →
        </Text>
      </TouchableOpacity>

      <Modal
        visible={moving != null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setMoving(null)}
      >
        <View style={[styles.picker, { backgroundColor: colors.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Mudar dia</Text>
              <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>
                {moving
                  ? `Mover "${dayLabels[detailKey(moving.entry)] || planNames[moving.entry.planId] || 'Treino'}" de ${WEEKDAY_FULL_LABELS[moving.fromWeekday]}`
                  : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setMoving(null)} accessibilityRole="button" accessibilityLabel="Fechar">
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          {WEEKDAY_LABELS.map((label, weekday) => {
            const occupied = planner[weekday];
            const isCurrent = moving?.fromWeekday === weekday;
            return (
              <TouchableOpacity
                key={weekday}
                style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                onPress={() => { void confirmMoveDay(weekday); }}
                disabled={isCurrent}
                accessibilityRole="button"
                accessibilityLabel={`Mover para ${WEEKDAY_FULL_LABELS[weekday]}`}
                accessibilityState={{ disabled: isCurrent, selected: isCurrent }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerName, { color: isCurrent ? colors.textTertiary : colors.text }]}>
                    {WEEKDAY_FULL_LABELS[weekday]} ({label})
                  </Text>
                  <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>
                    {isCurrent
                      ? 'Dia atual'
                      : occupied
                        ? (dayLabels[detailKey(occupied)] || planNames[occupied.planId] || 'Ocupado')
                        : 'Livre'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 18, paddingHorizontal: 4 },
  sectionSub: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 18, paddingHorizontal: 4, marginBottom: 4 },
  weekBlock: { gap: 8, marginTop: 8 },
  weekLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 0.5, paddingHorizontal: 4 },
  dayCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  dayMeta: { flex: 1, gap: 2 },
  dayDow: { fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 0.3 },
  dayTitle: { fontFamily: 'Inter-Bold', fontSize: 15 },
  dayStatus: { fontFamily: 'Inter-Regular', fontSize: 12 },
  expand: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  exName: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  exMuscle: { fontFamily: 'Inter-Regular', fontSize: 11, marginTop: 1 },
  exSets: { fontFamily: 'Inter-Bold', fontSize: 13 },
  emptyEx: { fontFamily: 'Inter-Regular', fontSize: 13, paddingVertical: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  actionText: { fontFamily: 'Inter-Bold', fontSize: 13 },
  assignHint: { fontFamily: 'Inter-SemiBold', fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  picker: { flex: 1 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 12 },
  pickerTitle: { fontFamily: 'Inter-Bold', fontSize: 18 },
  pickerSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  pickerName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
});
