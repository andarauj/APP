import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { useAdaptiveStatus } from '@/hooks/useAdaptiveStatus';
import { usePlansManager } from '@/hooks/usePlansManager';
import { getAllPlans, getPlanDays } from '@/db/planDao';
import { getLatestAdaptivePlanAny, deleteAdaptivePlanData, type AdaptivePlanRow } from '@/db/adaptiveDao';
import { getWeeklyPlanner, setPlannerDay, clearPlannerForPlan, type WeeklyPlanner, type PlannerEntry } from '@/db/plannerDao';
import { getUnfinishedSession, discardSession, getAllSessions } from '@/db/workoutDao';
import type { WorkoutPlan } from '@/types';
import { PLAN_TYPE_PT } from '@/types';
import { useRouter, useFocusEffect } from 'expo-router';
import { Play, Zap, Plus, AlertCircle, RotateCcw, RefreshCw, Calendar, Check as CheckIcon, X as XIcon, Sparkles, ListChecks, ChevronRight, Home as HomeIcon } from 'lucide-react-native';
import { WEEKDAY_LABELS } from '@/utils/reminders';
import { PHASE_LABEL_PT, PHASE_COLOR, PHASE_RPE_PT } from '@/utils/adaptivePlan';
import { getRollingScheduleForPlan, type RollingScheduleEntry } from '@/utils/adaptiveService';
import { PlanGroupCard } from '@/components/ui/PlanGroupCard';
import { PlanVersionModal } from '@/components/ui/PlanVersionModal';

const WEEKDAY_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
// Planner state stays keyed 0=Sun..6=Sat everywhere (matches every other
// weekday convention in the app); this only reorders how the row is drawn,
// Monday-first, which reads more naturally as "the training week".
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const GOAL_LABEL_PT: Record<string, string> = {
  bulking: 'Ganhar músculo',
  strength: 'Ficar mais forte',
  cutting: 'Perder gordura',
  general: 'Manter / geral',
};
const EQUIP_PREF_LABEL_PT: Record<string, string> = {
  any: 'Qualquer',
  gymleco: 'Gymleco',
  free_weights: 'Pesos Livres',
  home_dumbbell: 'Halteres',
};

export default function StartScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const { status: adaptiveStatus, loaded: adaptiveLoaded } = useAdaptiveStatus();
  const router = useRouter();

  // Top tabs: Explorar (criar/gerar planos), Plano (o planeador semanal),
  // Instantâneo (começar já, sem plano fixo), Meus Planos (gerir os planos
  // já criados — editar, duplicar, apagar).
  const [activeTab, setActiveTab] = useState<'explorar' | 'plano' | 'instantaneo' | 'planos'>('plano');
  const plansManager = usePlansManager();

  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [unfinished, setUnfinished] = useState<{ id: number; name: string; started_at: number } | null>(null);
  const [lastSession, setLastSession] = useState<{ id: number; name: string; total_sets: number } | null>(null);
  const [planner, setPlanner] = useState<WeeklyPlanner>({});
  const [planNames, setPlanNames] = useState<Record<number, string>>({});
  const [planDayLabels, setPlanDayLabels] = useState<Record<string, string>>({});
  const [planDayExerciseCounts, setPlanDayExerciseCounts] = useState<Record<string, number>>({});
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [pickerPlanId, setPickerPlanId] = useState<number | null>(null);
  const [pickerDays, setPickerDays] = useState<{ day_index: number; day_label: string }[]>([]);
  const today = new Date().getDay(); // 0=Sun..6=Sat, matches planner keys
  const [refreshing, setRefreshing] = useState(false);
  // Distinct from adaptiveStatus (active=1 only): true once a Plano
  // Adaptativo has ever been started, even if currently paused, so the
  // Explorar card routes to the Weekly Recap (which explains how to
  // reactivate it) instead of re-running the wizard and creating a second
  // adaptive plan on top of the paused one.
  const [hasAdaptivePlanEver, setHasAdaptivePlanEver] = useState(false);
  const [adaptivePlanRow, setAdaptivePlanRow] = useState<AdaptivePlanRow | null>(null);
  const [creatingNewPlan, setCreatingNewPlan] = useState(false);
  // Distinguishes "still loading" from "genuinely nothing scheduled" — without
  // this, the very first render after a cold launch (or right after finishing
  // onboarding) briefly shows the planner as if no plan existed at all, before
  // the async loads below resolve, which reads as "nothing happened".
  const [plannerLoaded, setPlannerLoaded] = useState(false);

  const loadStart = useCallback(async () => {
    getUnfinishedSession().then(s => setUnfinished(s as any)).catch(() => setUnfinished(null));
    getAllSessions(1, 0).then(s => setLastSession((s[0] as any) || null)).catch(() => setLastSession(null));
    getLatestAdaptivePlanAny().then(p => { setHasAdaptivePlanEver(!!p); setAdaptivePlanRow(p); }).catch(() => { setHasAdaptivePlanEver(false); setAdaptivePlanRow(null); });

    try {
      const [allPlans, p] = await Promise.all([getAllPlans(), getWeeklyPlanner()]);
      setPlans(allPlans);
      setPlanner(p);

      // Resolve each assigned plan's name and that specific day's label, so
      // the strip can show "Push" under Monday without a join query.
      //
      // PERF: these getPlanDays() calls used to run one at a time in a
      // sequential for-await loop — each planId waited on the full previous
      // SQLite round-trip before starting its own, even though none of them
      // depend on each other. Firing them together and awaiting once turns
      // N sequential round-trips into 1.
      const planIds = Array.from(new Set(Object.values(p).map(e => e!.planId)));
      const names: Record<number, string> = {};
      const dayLabels: Record<string, string> = {};
      const dayExerciseCounts: Record<string, number> = {};
      const daysByPlan = await Promise.all(planIds.map(planId => getPlanDays(planId)));
      planIds.forEach((planId, i) => {
        const found = allPlans.find(pl => pl.id === planId);
        if (found) names[planId] = found.name;
        for (const d of daysByPlan[i]) {
          dayLabels[`${planId}:${d.day_index}`] = d.day_label;
          dayExerciseCounts[`${planId}:${d.day_index}`] = d.exercise_count;
        }
      });
      setPlanNames(names);
      setPlanDayLabels(dayLabels);
      setPlanDayExerciseCounts(dayExerciseCounts);
    } catch {
      setPlans([]); setPlanner({}); setPlanNames({}); setPlanDayLabels({}); setPlanDayExerciseCounts({});
    } finally {
      setPlannerLoaded(true);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!isReady) return;
    loadStart();
    plansManager.load();
  }, [isReady, loadStart, plansManager.load]));

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadStart(), plansManager.load()]);
    setRefreshing(false);
  };

  const openDayPicker = (weekday: number) => {
    setEditingDay(weekday);
    setPickerPlanId(null);
    setPickerDays([]);
  };

  const choosePlanForDay = async (planId: number) => {
    setPickerPlanId(planId);
    const days = await getPlanDays(planId);
    setPickerDays(days);
    // Single-day plans (or plans with no explicit day split) assign directly
    // without an extra tap.
    if (days.length <= 1) {
      await confirmDayAssignment(planId, days[0]?.day_index ?? 0);
    }
  };

  const confirmDayAssignment = async (planId: number, dayIndex: number) => {
    if (editingDay === null) return;
    await setPlannerDay(editingDay, { planId, dayIndex });
    setPlanner(prev => ({ ...prev, [editingDay]: { planId, dayIndex } }));
    const plan = plans.find(p => p.id === planId);
    if (plan) setPlanNames(prev => ({ ...prev, [planId]: plan.name }));
    const days = await getPlanDays(planId);
    setPlanDayLabels(prev => {
      const next = { ...prev };
      for (const d of days) next[`${planId}:${d.day_index}`] = d.day_label;
      return next;
    });
    setEditingDay(null);
  };

  const clearDayAssignment = async () => {
    if (editingDay === null) return;
    await setPlannerDay(editingDay, null);
    setPlanner(prev => {
      const next = { ...prev };
      delete next[editingDay];
      return next;
    });
    setEditingDay(null);
  };

  const startPlannerDay = (entry: PlannerEntry) => {
    const planName = planNames[entry.planId] || 'Treino';
    const dayLabel = planDayLabels[`${entry.planId}:${entry.dayIndex}`];
    router.push({
      pathname: '/workout/active',
      params: {
        planId: entry.planId,
        planName: dayLabel ? `${planName} · ${dayLabel}` : planName,
        dayIndex: String(entry.dayIndex),
      },
    });
  };

  // Rolling workouts ("zero treinos perdidos"): the raw planner is a fixed
  // recurring template with no idea whether Wednesday's session actually
  // happened, so a missed day would otherwise just be silently skipped once
  // its weekday passed. This recomputes, purely for display/start — never
  // persisted, so it's always driven by real completions — which weekday
  // should show which of the adaptive plan's days once a backlog exists.
  // Only applies to the plan the NSPI engine is actively running; a
  // manually-assigned non-adaptive day is left exactly as scheduled.
  const [rollingSchedule, setRollingSchedule] = useState<RollingScheduleEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!adaptiveStatus) { setRollingSchedule(null); return; }
    const weekStartDow = new Date(adaptiveStatus.weekStart * 1000).getDay();
    getRollingScheduleForPlan(adaptiveStatus.planId, weekStartDow)
      .then(s => { if (!cancelled) setRollingSchedule(s); })
      .catch(() => { if (!cancelled) setRollingSchedule(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adaptiveStatus?.planId, adaptiveStatus?.weekStart, planner]);

  const rollingByWeekday = useMemo(() => {
    const map: Record<number, RollingScheduleEntry> = {};
    for (const entry of rollingSchedule ?? []) map[entry.weekday] = entry;
    return map;
  }, [rollingSchedule]);

  // Same shape as `planner`, but with the active adaptive plan's days
  // swapped for whatever the rolling schedule says they should be this
  // week — including days it forces onto a weekday that was never natively
  // scheduled (a missed day pulled forward onto today). Everything that
  // only needs to DISPLAY or START a day reads this instead of `planner`
  // directly; the day-assignment picker still reads/writes the raw
  // `planner`, since reassigning a day by hand should edit the actual
  // template, not today's computed view of it.
  const effectivePlanner = useMemo(() => {
    if (!adaptiveStatus || Object.keys(rollingByWeekday).length === 0) return planner;
    const merged: WeeklyPlanner = { ...planner };
    for (const [wdStr, entry] of Object.entries(rollingByWeekday)) {
      merged[Number(wdStr)] = { planId: adaptiveStatus.planId, dayIndex: entry.dayIndex };
    }
    return merged;
  }, [planner, rollingByWeekday, adaptiveStatus]);

  const todayEntry = effectivePlanner[today];
  const todayIsBacklog = rollingByWeekday[today]?.isBacklog ?? false;

  // The next scheduled day after today, wrapping the week — feeds the rest-day
  // card below so "sem treino hoje" still tells the person when to come back,
  // instead of just going quiet.
  const nextPlannedEntry = useMemo(() => {
    for (let offset = 1; offset <= 7; offset++) {
      const weekday = (today + offset) % 7;
      const entry = effectivePlanner[weekday];
      if (entry) return { weekday, entry };
    }
    return null;
  }, [effectivePlanner, today]);

  const handleDiscardUnfinished = () => {
    if (!unfinished) return;
    Alert.alert('Descartar treino', `Descartar "${unfinished.name}" e as series registadas?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar', style: 'destructive',
        onPress: async () => { await discardSession(unfinished.id); setUnfinished(null); },
      },
    ]);
  };

  /**
   * The rich hero card's own action, not just its "Ver o meu plano" button
   * — this is what "the Plano Adaptativo card" means when someone wants a
   * fresh cycle without first opening the plan detail screen. Clears this
   * plan's own progression state (deleteAdaptivePlanData — cycles/weeks/
   * exercise state, not the underlying workout exercises) then drops
   * straight into the generation wizard, same as app/adaptive/plan.tsx's
   * equivalent action.
   */
  const createNewAdaptivePlan = () => {
    if (!adaptiveStatus) return;
    Alert.alert(
      'Criar plano novo?',
      'Isto apaga o progresso do plano adaptativo atual (ciclos e semanas registadas). Os treinos já registados no histórico não são afetados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Criar novo',
          style: 'destructive',
          onPress: async () => {
            setCreatingNewPlan(true);
            try {
              await deleteAdaptivePlanData(adaptiveStatus.adaptivePlanId);
              // BUGFIX: startAdaptivePlan's own stale-slot cleanup only finds
              // "the previous active adaptive plan" — but deleteAdaptivePlanData
              // just deleted that row, so by the time the wizard finishes,
              // there's nothing left for it to find, and this plan's old
              // weekday assignments (e.g. Mon/Wed from a 3-day split) linger
              // in the planner forever, pointing at a plan no longer running
              // any cycle. Clear them here instead, while the plan_id is
              // still known.
              await clearPlannerForPlan(adaptiveStatus.planId);
              router.push('/adaptive/start');
            } catch (err) {
              console.error('[adaptive] deleteAdaptivePlanData failed:', err);
            } finally {
              setCreatingNewPlan(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header com Título */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Treino</Text>
      </View>

      {/* Top tabs: Explorar · Plano · Instantâneo · Meus Planos */}
      <View style={[styles.topTabs, { borderBottomColor: colors.border }]}>
        {([
          ['explorar', 'Explorar'],
          ['plano', 'Plano'],
          ['instantaneo', 'Instantâneo'],
          ['planos', 'Meus Planos'],
        ] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setActiveTab(key)}
            style={[styles.topTab, activeTab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.topTabLabel, { color: activeTab === key ? colors.primary : colors.textSecondary }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Phase badge — NSPI_ENGINE.md §7: cor da fase + ‹ Ciclo N · Fase M ›.
          Gated on adaptiveLoaded too (not just adaptiveStatus truthy) — this
          comes from a separate hook than the planner load below, and without
          waiting for both, the hero card/planner could render a beat before
          this badge, or the "exercícios · RPE" line on the hero, making an
          already-correct state look broken for that one frame. */}
      {activeTab === 'plano' && adaptiveLoaded && adaptiveStatus && (
        <TouchableOpacity
          style={[styles.phaseBadgeRow, { borderBottomColor: colors.border }]}
          onPress={() => router.push('/adaptive/recap')}
          activeOpacity={0.75}
        >
          <View style={[styles.phaseDot, { backgroundColor: PHASE_COLOR[adaptiveStatus.phase] }]} />
          <Text style={[styles.phaseBadgeText, { color: colors.text }]}>
            Ciclo {adaptiveStatus.cycleIndex} · {PHASE_LABEL_PT[adaptiveStatus.phase]}
            {adaptiveStatus.isBridge ? ' (consolidação)' : ''}
          </Text>
          <ChevronRight size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* TAB: MEU PLANO */}
        {activeTab === 'plano' && (!plannerLoaded || !adaptiveLoaded) && (
          <View style={[styles.center, { paddingVertical: 60 }]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        {activeTab === 'plano' && plannerLoaded && adaptiveLoaded && (
          <>
            {/* Ação Principal — sempre uma e só uma: o treino de hoje (se
                estiver agendado) ou o aviso de descanso com o próximo
                treino. Vem primeiro porque é a única coisa que a pessoa
                precisa de decidir agora. */}
            {todayEntry ? (
              <TouchableOpacity
                style={[styles.todayCard, { backgroundColor: todayIsBacklog ? colors.error : colors.secondary }]}
                onPress={() => startPlannerDay(todayEntry)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${todayIsBacklog ? 'Treino em atraso' : 'Iniciar treino de hoje'}: ${planNames[todayEntry.planId] || 'Treino'}`}
              >
                <View style={styles.quickIcon}>
                  {todayIsBacklog ? <AlertCircle size={28} color="#fff" /> : <Play size={28} color="#fff" />}
                </View>
                <View style={styles.quickInfo}>
                  <Text style={styles.quickTitle}>{todayIsBacklog ? 'Treino em Atraso' : 'Iniciar Treino de Hoje'}</Text>
                  <Text style={styles.quickDesc} numberOfLines={1}>
                    {planDayLabels[`${todayEntry.planId}:${todayEntry.dayIndex}`] || planNames[todayEntry.planId] || 'Treino'}
                  </Text>
                  {/* Real NSPI output for this specific day — exercise count
                      the equipment/injury filter actually left in the plan,
                      plus the active phase's RPE window (see PHASE_RPE_PT) —
                      not shown for a day pointing at a non-adaptive plan. */}
                  {adaptiveStatus && todayEntry.planId === adaptiveStatus.planId && (
                    <Text style={styles.quickDesc} numberOfLines={1}>
                      {planDayExerciseCounts[`${todayEntry.planId}:${todayEntry.dayIndex}`] ?? '—'} exercícios
                      {PHASE_RPE_PT[adaptiveStatus.phase] ? ` · RPE ${PHASE_RPE_PT[adaptiveStatus.phase]}` : ''}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ) : adaptiveStatus && (
              <View style={[styles.todayCard, { backgroundColor: colors.surfaceVariant }]}>
                <View style={[styles.quickIcon, { backgroundColor: colors.surface }]}>
                  <Calendar size={28} color={colors.textSecondary} />
                </View>
                <View style={styles.quickInfo}>
                  <Text style={[styles.quickTitle, { color: colors.text }]}>Dia de Descanso</Text>
                  <Text style={[styles.quickDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                    {nextPlannedEntry
                      ? `Próximo: ${nextPlannedEntry.weekday === (today + 1) % 7 ? 'Amanhã' : WEEKDAY_FULL[nextPlannedEntry.weekday]} · ${planDayLabels[`${nextPlannedEntry.entry.planId}:${nextPlannedEntry.entry.dayIndex}`] || planNames[nextPlannedEntry.entry.planId] || 'Treino'}`
                      : 'Sem treinos agendados esta semana'}
                  </Text>
                </View>
              </View>
            )}

            {/* Planeador Semanal — toca num dia atribuído para o iniciar,
                mantém premido (ou toca num dia vazio) para atribuir/editar. */}
            <View style={[styles.plannerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.plannerHeader}>
                <Calendar size={16} color={colors.textSecondary} />
                <Text style={[styles.plannerTitle, { color: colors.textSecondary }]}>PLANEADOR SEMANAL</Text>
              </View>
              <View style={styles.plannerRow}>
                {WEEKDAY_DISPLAY_ORDER.map(weekday => {
                  const label = WEEKDAY_LABELS[weekday];
                  const entry = effectivePlanner[weekday];
                  const isToday = weekday === today;
                  const isBacklog = rollingByWeekday[weekday]?.isBacklog ?? false;
                  return (
                    <TouchableOpacity
                      key={weekday}
                      style={[
                        styles.plannerDay,
                        { backgroundColor: isBacklog ? colors.errorContainer : entry ? colors.primaryContainer : colors.surfaceVariant },
                        isToday && { borderWidth: 2, borderColor: isBacklog ? colors.error : colors.primary },
                      ]}
                      onPress={() => entry ? startPlannerDay(entry) : openDayPicker(weekday)}
                      onLongPress={() => openDayPicker(weekday)}
                      delayLongPress={400}
                      accessibilityRole="button"
                      accessibilityLabel={
                        entry
                          ? `${WEEKDAY_FULL[weekday]}: ${planNames[entry.planId] || 'Treino'}, toca para iniciar, mantém para editar`
                          : `${WEEKDAY_FULL[weekday]}: sem treino atribuído, toca para atribuir`
                      }
                    >
                      <Text style={[styles.plannerDayLabel, { color: isToday ? colors.primary : colors.textSecondary }]}>{label}</Text>
                      {entry ? (
                        <Text style={[styles.plannerDayPlan, { color: colors.primary }]} numberOfLines={1}>
                          {(planDayLabels[`${entry.planId}:${entry.dayIndex}`] || planNames[entry.planId] || 'Treino').slice(0, 4)}
                        </Text>
                      ) : (
                        <Plus size={14} color={colors.textTertiary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {/* TAB: INSTANTÂNEO — começar já, sem plano fixo */}
        {activeTab === 'instantaneo' && (
          <>
            {/* Unfinished workout recovery. A session row is created the
                moment a workout starts, so closing the app mid-workout used
                to leave it stranded with no way to resume or clear it. Lives
                here (not on the Plano tab) so an active adaptive cycle's
                screen stays exactly the 3 blocks it's meant to be — this is
                about an ad-hoc interrupted session, the same family as
                Treino Livre/Repetir below, not about which plan is running. */}
            {unfinished && (
              <View style={[styles.resumeCard, { backgroundColor: colors.accentContainer, borderColor: colors.accent }]}>
                <View style={styles.resumeTop}>
                  <AlertCircle size={20} color={colors.accent} />
                  <Text style={[styles.resumeTitle, { color: colors.accent }]}>Treino por terminar</Text>
                </View>
                <Text style={[styles.resumeName, { color: colors.text }]} numberOfLines={1}>{unfinished.name}</Text>
                <View style={styles.resumeActions}>
                  <TouchableOpacity
                    style={[styles.resumeBtn, { backgroundColor: colors.accent }]}
                    onPress={() => router.push({ pathname: '/workout/summary', params: { sessionId: unfinished.id } })}
                    accessibilityRole="button"
                    accessibilityLabel="Ver resumo do treino por terminar"
                  >
                    <Text style={styles.resumeBtnText}>Ver resumo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.resumeBtnOutline, { borderColor: colors.accent }]}
                    onPress={handleDiscardUnfinished}
                    accessibilityRole="button"
                    accessibilityLabel="Descartar treino por terminar"
                  >
                    <Text style={[styles.resumeBtnOutlineText, { color: colors.accent }]}>Descartar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>COMEÇAR AGORA</Text>

            <TouchableOpacity
              style={[styles.quickCard, { backgroundColor: colors.primary }]}
              onPress={() => router.push({ pathname: '/workout/active', params: { planId: 0, planName: 'Treino Livre' } })}
              activeOpacity={0.85}
            >
              <View style={styles.quickIcon}><Zap size={32} color="#fff" /></View>
              <View style={styles.quickInfo}>
                <Text style={styles.quickTitle}>Treino Livre</Text>
                <Text style={styles.quickDesc}>Começa sem plano e adiciona exercícios à medida que treinas</Text>
              </View>
              <Play size={28} color="#fff" />
            </TouchableOpacity>

            {lastSession && (
              <TouchableOpacity
                style={[styles.repeatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push({
                  pathname: '/workout/active',
                  params: { planId: 0, planName: lastSession.name, repeatSessionId: String(lastSession.id) },
                })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Repetir treino ${lastSession.name}`}
              >
                <View style={[styles.repeatIcon, { backgroundColor: colors.secondaryContainer }]}>
                  <RotateCcw size={22} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.repeatTitle, { color: colors.text }]}>Repetir último treino</Text>
                  <Text style={[styles.repeatSub, { color: colors.textSecondary }]} numberOfLines={1}>
                    {lastSession.name} · {lastSession.total_sets} séries
                  </Text>
                </View>
                <Play size={22} color={colors.secondary} />
              </TouchableOpacity>
            )}
          </>
        )}

        {/* TAB: EXPLORAR — criar/gerar planos + a biblioteca. Absorve o
            antigo separador "Planos"; a gestão (editar/duplicar/apagar)
            fica no ecrã de detalhe e no link "Gerir". */}
        {activeTab === 'explorar' && (
          <>
            {/* Plano Adaptativo — motor NSPI, sempre acessível a todos. Rich
                variant (phase pill, subtitle, 3-value row) once a plan
                exists — matches the plan overview screen's hero language
                (app/adaptive/plan.tsx) so it reads as the same feature
                rather than two different cards. Before that, a plain
                "get started" card, since there's no goal/duration/
                equipment yet to show. */}
            {adaptiveStatus ? (
              <View style={[styles.adaptiveHero, { backgroundColor: colors.accent }]}>
                <TouchableOpacity onPress={() => router.push('/adaptive/plan')} activeOpacity={0.9}>
                  <View style={[styles.adaptivePhasePill, { backgroundColor: PHASE_COLOR[adaptiveStatus.phase] }]}>
                    <Text style={styles.adaptivePhasePillText}>
                      Ciclo {adaptiveStatus.cycleIndex} · {PHASE_LABEL_PT[adaptiveStatus.phase]}
                    </Text>
                  </View>
                  <Text style={styles.adaptiveHeroTitle}>Plano Adaptativo</Text>
                  <Text style={styles.adaptiveHeroSub}>O teu programa atualiza-se todas as semanas</Text>
                  <View style={styles.adaptiveHeroRow}>
                    <View style={styles.adaptiveHeroCol}>
                      <Text style={styles.adaptiveHeroValue} numberOfLines={1}>{GOAL_LABEL_PT[adaptiveStatus.goal] ?? adaptiveStatus.goal}</Text>
                      <Text style={styles.adaptiveHeroLabel}>Objetivo</Text>
                    </View>
                    <View style={styles.adaptiveHeroDivider} />
                    <View style={styles.adaptiveHeroCol}>
                      <Text style={styles.adaptiveHeroValue}>{adaptivePlanRow ? `${adaptivePlanRow.session_minutes} min` : '—'}</Text>
                      <Text style={styles.adaptiveHeroLabel}>Duração</Text>
                    </View>
                    <View style={styles.adaptiveHeroDivider} />
                    <View style={styles.adaptiveHeroCol}>
                      <Text style={styles.adaptiveHeroValue} numberOfLines={1}>{adaptivePlanRow ? (EQUIP_PREF_LABEL_PT[adaptivePlanRow.equipment_pref] ?? adaptivePlanRow.equipment_pref) : '—'}</Text>
                      <Text style={styles.adaptiveHeroLabel}>Equipamento</Text>
                    </View>
                  </View>
                </TouchableOpacity>
                <View style={styles.adaptiveHeroActionRow}>
                  <TouchableOpacity
                    style={[styles.adaptiveHeroBtn, { flex: 1 }]}
                    onPress={() => router.push('/adaptive/plan')}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.adaptiveHeroBtnText, { color: colors.accent }]}>Ver o meu plano</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.adaptiveHeroNewPlanBtn}
                    onPress={createNewAdaptivePlan}
                    disabled={creatingNewPlan}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Criar plano novo"
                  >
                    <RefreshCw size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.adaptiveCard, { backgroundColor: colors.accent }]}
                onPress={() => router.push(hasAdaptivePlanEver ? '/adaptive/plan' : '/adaptive/start')}
                activeOpacity={0.88}
              >
                <View style={styles.quickIcon}><Sparkles size={28} color="#fff" /></View>
                <View style={styles.quickInfo}>
                  <Text style={styles.quickTitle}>Plano Adaptativo</Text>
                  <Text style={styles.quickDesc} numberOfLines={2}>
                    {hasAdaptivePlanEver
                      ? 'Plano em pausa — toca para reativar'
                      : 'Periodização automática: NSPI ajusta a tua semana sozinho'}
                  </Text>
                </View>
                <ChevronRight size={24} color="#fff" />
              </TouchableOpacity>
            )}

            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CRIAR NOVO PLANO</Text>

            <View style={styles.compactRow}>
              <TouchableOpacity
                style={[styles.compactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push('/plan/create')}
                activeOpacity={0.8}
              >
                <View style={[styles.compactIcon, { backgroundColor: colors.surfaceVariant }]}>
                  <Plus size={20} color={colors.primary} />
                </View>
                <Text style={[styles.compactTitle, { color: colors.text }]}>Novo Plano</Text>
                <Text style={[styles.compactDesc, { color: colors.textSecondary }]} numberOfLines={2}>Escolhes tu os exercícios</Text>
              </TouchableOpacity>

              {/* "Discrição" (sic, pedido do dono): estes dois eram só ícone +
                  nome — Gerar Divisão e 5/3/1 são jargão de treino que não
                  se explica sozinho, por isso ganharam uma frase curta. */}
              <TouchableOpacity
                style={[styles.compactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push('/plan/auto')}
                activeOpacity={0.8}
              >
                <View style={[styles.compactIcon, { backgroundColor: colors.surfaceVariant }]}>
                  <Calendar size={20} color={colors.primary} />
                </View>
                <Text style={[styles.compactTitle, { color: colors.text }]}>Gerar Divisão</Text>
                <Text style={[styles.compactDesc, { color: colors.textSecondary }]} numberOfLines={2}>Plano automático por dias (Push/Pull/Pernas...)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.compactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push('/plan/531')}
                activeOpacity={0.8}
              >
                <View style={[styles.compactIcon, { backgroundColor: colors.surfaceVariant }]}>
                  <Zap size={20} color={colors.primary} />
                </View>
                <Text style={[styles.compactTitle, { color: colors.text }]}>5/3/1</Text>
                <Text style={[styles.compactDesc, { color: colors.textSecondary }]} numberOfLines={2}>Programa de força clássico, 4 semanas</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.planRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push('/plan/home')}
              activeOpacity={0.8}
            >
              <View style={[styles.compactIcon, { backgroundColor: colors.surfaceVariant }]}>
                <HomeIcon size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.repeatTitle, { color: colors.text }]}>Treino em Casa</Text>
                <Text style={[styles.repeatSub, { color: colors.textSecondary }]}>Só halteres, banco e tapete</Text>
              </View>
              <ChevronRight size={20} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.planRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setActiveTab('planos')}
              activeOpacity={0.8}
            >
              <View style={[styles.compactIcon, { backgroundColor: colors.surfaceVariant }]}>
                <ListChecks size={18} color={colors.primary} />
              </View>
              <Text style={[styles.repeatTitle, { color: colors.text, flex: 1 }]}>Os meus planos</Text>
              <ChevronRight size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </>
        )}

        {/* TAB: MEUS PLANOS — planos que a pessoa construiu, para gerir:
            abrir, duplicar, apagar. Partilha estado/ações com o ecrã Planos
            standalone via usePlansManager, para não haver duas ideias
            diferentes do que "apagar um plano" faz. */}
        {activeTab === 'planos' && (
          <>
            <TouchableOpacity
              style={[styles.newPlanLink, { borderColor: colors.primary }]}
              onPress={() => router.push('/plan/create')}
              activeOpacity={0.8}
            >
              <Plus size={18} color={colors.primary} />
              <Text style={[styles.newPlanLinkText, { color: colors.primary }]}>Novo Plano</Text>
            </TouchableOpacity>

            {plansManager.groups.length === 0 ? (
              <Text style={{ fontFamily: 'Inter-Regular', fontSize: 14, color: colors.textSecondary, paddingVertical: 8 }}>
                Ainda não tens planos. Cria um em cima ou no separador Explorar.
              </Text>
            ) : (
              plansManager.groups.map(g => (
                <PlanGroupCard
                  key={g.name}
                  group={g}
                  dayCounts={plansManager.dayCounts}
                  onOpenGroup={plansManager.handleOpenGroup}
                  onDuplicate={plansManager.handleDuplicate}
                  onDelete={plansManager.handleDelete}
                  onQuickStart={plansManager.handleQuickStart}
                />
              ))
            )}
          </>
        )}
      </ScrollView>

      <PlanVersionModal
        group={plansManager.openGroup}
        onClose={() => plansManager.setOpenGroup(null)}
        onDuplicate={plansManager.handleDuplicate}
        onDelete={plansManager.handleDelete}
        onQuickStart={plansManager.handleQuickStart}
      />

      {/* Weekly planner assignment: pick a plan, then (if it has more than
          one training day) which specific day. */}
      <Modal visible={editingDay !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingDay(null)}>
        <View style={[styles.picker, { backgroundColor: colors.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>
                {pickerPlanId && pickerDays.length > 1 ? 'Escolher dia' : editingDay !== null ? WEEKDAY_FULL[editingDay] : ''}
              </Text>
              <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>
                {pickerPlanId && pickerDays.length > 1 ? 'Qual dia do plano treinas hoje?' : 'Que plano treinas neste dia?'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setEditingDay(null)} accessibilityRole="button" accessibilityLabel="Fechar">
              <XIcon size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {pickerPlanId && pickerDays.length > 1 ? (
            <FlatList
              data={pickerDays}
              keyExtractor={d => String(d.day_index)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                  onPress={() => confirmDayAssignment(pickerPlanId, item.day_index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Atribuir ${item.day_label}`}
                >
                  <Text style={[styles.pickerName, { color: colors.text }]}>{item.day_label}</Text>
                  <CheckIcon size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          ) : (
            <FlatList
              data={plans}
              keyExtractor={p => String(p.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                  onPress={() => choosePlanForDay(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Atribuir plano ${item.name}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerName, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>{PLAN_TYPE_PT[item.plan_type]}</Text>
                  </View>
                  <Play size={18} color={colors.primary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center' }}>
                    Ainda não tens planos. Cria um primeiro para o poderes agendar.
                  </Text>
                </View>
              }
              ListFooterComponent={
                planner[editingDay ?? -1] ? (
                  <TouchableOpacity
                    style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                    onPress={clearDayAssignment}
                    accessibilityRole="button"
                    accessibilityLabel="Remover treino deste dia"
                  >
                    <Text style={[styles.pickerName, { color: colors.error }]}>Remover deste dia</Text>
                  </TouchableOpacity>
                ) : null
              }
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontFamily: 'Inter-ExtraBold', fontSize: 28 },
  headerAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerActionText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  topTabs: { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1 },
  topTab: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  topTabLabel: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
  content: { padding: 16, gap: 12 },
  resumeCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  resumeTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resumeTitle: { fontFamily: 'Inter-Bold', fontSize: 14 },
  resumeName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  resumeActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  resumeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  resumeBtnText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 14 },
  resumeBtnOutline: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  resumeBtnOutlineText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  repeatCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  repeatIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  repeatTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  repeatSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  quickCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 20, gap: 14 },
  adaptiveCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 18, gap: 14 },
  adaptiveHero: { borderRadius: 20, padding: 20 },
  adaptivePhasePill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  adaptivePhasePillText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 11 },
  adaptiveHeroTitle: { color: '#fff', fontFamily: 'Inter-ExtraBold', fontSize: 21, marginBottom: 2 },
  adaptiveHeroSub: { color: 'rgba(255,255,255,0.8)', fontFamily: 'Inter-Regular', fontSize: 13 },
  adaptiveHeroRow: { flexDirection: 'row', marginTop: 16, marginBottom: 16 },
  adaptiveHeroCol: { flex: 1, alignItems: 'center', gap: 2 },
  adaptiveHeroDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.3)' },
  adaptiveHeroValue: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 14 },
  adaptiveHeroLabel: { color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter-Regular', fontSize: 11 },
  adaptiveHeroActionRow: { flexDirection: 'row', gap: 10 },
  adaptiveHeroBtn: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  adaptiveHeroBtnText: { fontFamily: 'Inter-Bold', fontSize: 15 },
  adaptiveHeroNewPlanBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  phaseBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  phaseDot: { width: 8, height: 8, borderRadius: 4 },
  phaseBadgeText: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 13 },
  quickIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  quickInfo: { flex: 1 },
  explorarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  newPlanLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', paddingVertical: 12 },
  newPlanLinkText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  compactRow: { flexDirection: 'row', gap: 10 },
  compactCard: { flex: 1, alignItems: 'center', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, gap: 8, borderWidth: 1 },
  compactIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  compactTitle: { fontFamily: 'Inter-SemiBold', fontSize: 13, textAlign: 'center' },
  compactDesc: { fontFamily: 'Inter-Regular', fontSize: 10.5, lineHeight: 13, textAlign: 'center', marginTop: -2 },
  quickTitle: { fontFamily: 'Inter-Bold', fontSize: 20, color: '#fff' },
  quickDesc: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17, color: 'rgba(255,255,255,0.8)', marginTop: 3 },
  sectionTitle: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16, letterSpacing: 1, marginTop: 8 },
  plannerCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  plannerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  plannerTitle: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1 },
  plannerRow: { flexDirection: 'row', gap: 6 },
  plannerDay: { flex: 1, aspectRatio: 0.72, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  plannerDayLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14 },
  plannerDayPlan: { fontFamily: 'Inter-Bold', fontSize: 10, lineHeight: 13 },
  todayCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 18, gap: 14 },
  center: { alignItems: 'center', justifyContent: 'center' },
  picker: { flex: 1 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 12 },
  pickerTitle: { fontFamily: 'Inter-Bold', fontSize: 18 },
  pickerSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  pickerName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
});
