import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { useWorkoutHub } from '@/hooks/useWorkoutHub';
import { useUpcomingSchedule } from '@/hooks/useUpcomingSchedule';
import { useTodayWorkoutStatus } from '@/hooks/useTodayWorkoutStatus';
import { useAdaptiveStatus } from '@/hooks/useAdaptiveStatus';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlanSettingsSheet } from '@/components/workout/PlanSettingsSheet';
import { getSetting, setSetting } from '@/db/settingsDao';
import { getStreakData, getAllSessions, getUnfinishedSessionWithProgress } from '@/db/workoutDao';
import { deletePlan, deletePlanDay, getPlanById } from '@/db/planDao';
import { clearPlannerForPlan } from '@/db/plannerDao';
import {
  addNextPlanDay,
  buildDayForMe,
  createBlankWeeklyPlan,
  PlanMissingError,
  WEEKDAY_SHORT,
} from '@/utils/workoutHub';
import { getScheduledDayExercises, type ScheduledExerciseRow } from '@/utils/scheduledWorkout';
import { pushPlannedWorkout } from '@/utils/startScheduledWorkout';
import { resolveWeekStartDow } from '@/utils/weekStart';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/utils/haptics';
import { formatMinutes } from '@/utils/workoutTime';
import { RADIUS, TOUCH_TARGET_MIN } from '@/constants/tokens';
import {
  Compass, Dumbbell, Sparkles, MoreHorizontal, Plus, Play, Zap, Home, ListChecks, ChevronRight, Settings,
} from 'lucide-react-native';

type HubMode = 'find' | 'planned' | 'instant';

export default function WorkoutHubScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isReady } = useDatabase();
  const router = useRouter();
  const hub = useWorkoutHub();
  const upcoming = useUpcomingSchedule(5);
  const todayStatus = useTodayWorkoutStatus();
  const { status: adaptiveStatus } = useAdaptiveStatus();

  const [mode, setMode] = useState<HubMode>('planned');
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [dayExercises, setDayExercises] = useState<ScheduledExerciseRow[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [weekStartDow, setWeekStartDow] = useState(1);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSession, setLastSession] = useState<{ id: number; name: string } | null>(null);

  const onboardingRedirected = useRef(false);
  useEffect(() => {
    if (!isReady || onboardingRedirected.current) return;
    Promise.all([getSetting('onboardingComplete'), getStreakData()])
      .then(([value, streak]) => {
        if (value === '1') return;
        if (streak.totalWorkouts > 0) {
          setSetting('onboardingComplete', '1').catch(() => {});
          return;
        }
        onboardingRedirected.current = true;
        router.replace('/onboarding');
      })
      .catch(() => {});
  }, [isReady, router]);

  const selectedUpcoming = upcoming.days[selectedOffset] ?? upcoming.days[0];
  const selectedScheduled = selectedUpcoming?.scheduled ?? null;
  const headerTitle = selectedScheduled?.dayLabel || hub.plan?.name || 'Workout';

  useEffect(() => {
    resolveWeekStartDow(adaptiveStatus?.weekStart ?? null).then(setWeekStartDow).catch(() => {});
  }, [adaptiveStatus?.weekStart]);

  useEffect(() => {
    if (!selectedScheduled) {
      setDayExercises([]);
      return;
    }
    getScheduledDayExercises(selectedScheduled.planId, selectedScheduled.dayIndex, selectedScheduled.weekId)
      .then(setDayExercises)
      .catch(() => setDayExercises([]));
  }, [selectedScheduled?.planId, selectedScheduled?.dayIndex, selectedScheduled?.weekId]);

  const loadInstantMeta = useCallback(async () => {
    const [last] = await getAllSessions(1, 0).catch(() => []);
    setLastSession(last ? { id: last.id, name: last.name } : null);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([hub.reload(), upcoming.refresh(), todayStatus.refresh(), loadInstantMeta()]);
    setRefreshing(false);
  };

  const setHubMode = (next: HubMode) => {
    hapticSelect();
    setMode(next);
    if (next === 'instant') loadInstantMeta();
  };

  const startPlannedDay = async (scheduled = selectedScheduled) => {
    if (!scheduled) return;
    const unfinished = await getUnfinishedSessionWithProgress().catch(() => null);
    if (unfinished && unfinished.completedSets > 0) {
      Alert.alert('Treino em curso', 'Já tens um treino a decorrer. Queres continuá-lo?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: () => router.push({
            pathname: '/workout/active',
            params: {
              planId: String(unfinished.session.plan_id ?? 0),
              planName: unfinished.session.name,
              resumeSessionId: String(unfinished.session.id),
            },
          }),
        },
      ]);
      return;
    }
    pushPlannedWorkout(router, scheduled);
  };

  const startInstant = (repeatId?: number) => {
    if (repeatId) {
      router.push({
        pathname: '/workout/active',
        params: { planId: '0', planName: lastSession?.name ?? 'Treino Livre', repeatSessionId: String(repeatId) },
      });
      return;
    }
    router.push({
      pathname: '/workout/active',
      params: { planId: '0', planName: 'Treino Livre' },
    });
  };

  const openAddExercise = () => {
    const planId = selectedScheduled?.planId ?? hub.plan?.id;
    const dayIndex = selectedScheduled?.dayIndex ?? hub.days[0]?.day_index;
    const dayLabel = selectedScheduled?.dayLabel ?? hub.days[0]?.day_label;
    if (planId == null || dayIndex == null) return;
    router.push({
      pathname: '/(tabs)/exercises',
      params: {
        pick: '1',
        planId: String(planId),
        dayIndex: String(dayIndex),
        dayLabel: dayLabel ?? '',
      },
    });
  };

  const onBuildForMe = async () => {
    const candidate = selectedScheduled?.planId ?? hub.plan?.id;
    const dayIndex = selectedScheduled?.dayIndex ?? hub.days[0]?.day_index;
    const dayLabel = selectedScheduled?.dayLabel ?? hub.days[0]?.day_label ?? 'Treino';
    const weekId = selectedScheduled?.weekId;

    const live = candidate != null ? await getPlanById(candidate).catch(() => null) : null;
    if (!live || dayIndex == null) {
      // Deleted / missing plan — recreate via the adaptive wizard (4-week mesocycle).
      router.push('/adaptive/start');
      return;
    }

    setBusy(true);
    try {
      const n = await buildDayForMe(live.id, dayIndex, dayLabel);
      hapticSuccess();
      if (n === 0) Alert.alert('Sem exercícios', 'Não encontrei exercícios para este dia no catálogo.');
      await Promise.all([hub.reload(), upcoming.refresh(), todayStatus.refresh()]);
      // Keys (planId/dayIndex/weekId) often stay the same after a fill — force
      // the detail list to reload so the UI does not stay on "0 exercícios".
      const rows = await getScheduledDayExercises(live.id, dayIndex, weekId).catch(() => [] as ScheduledExerciseRow[]);
      setDayExercises(rows);
    } catch (err) {
      console.error('Build for Me failed:', err);
      if (err instanceof PlanMissingError) {
        router.push('/adaptive/start');
        return;
      }
      Alert.alert('Erro', 'Não foi possível gerar o treino. Tenta novamente.');
    } finally {
      setBusy(false);
    }
  };

  const onCreatePlan = async () => {
    setBusy(true);
    try {
      await createBlankWeeklyPlan();
      hapticSuccess();
      setMode('planned');
      await hub.reload();
    } catch (err) {
      console.error('Create plan failed:', err);
      Alert.alert('Erro', 'Não foi possível criar o plano.');
    } finally {
      setBusy(false);
    }
  };

  const onAddDay = async () => {
    if (!hub.plan) return;
    if (hub.days.length >= hub.dayLimit) {
      Alert.alert('Day Limit', `Este plano admite no máximo ${hub.dayLimit} dias.`);
      return;
    }
    setBusy(true);
    try {
      await addNextPlanDay(hub.plan.id);
      await Promise.all([hub.reload(), upcoming.refresh()]);
    } catch (err) {
      console.error('Add day failed:', err);
      Alert.alert('Erro', 'Não foi possível adicionar o dia.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteDay = () => {
    if (!hub.plan || !selectedScheduled) return;
    Alert.alert(
      'Eliminar workout',
      `Eliminar "${selectedScheduled.dayLabel}" do plano?\nO histórico de sessões e PRs mantém-se.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            hapticWarning();
            await deletePlanDay(hub.plan!.id, selectedScheduled.dayIndex);
            await Promise.all([hub.reload(), upcoming.refresh()]);
          },
        },
      ],
    );
  };

  const confirmDeletePlan = () => {
    if (!hub.plan) return;
    Alert.alert(
      'Eliminar plano',
      `Eliminar "${hub.plan.name}"?\nIsto não elimina o histórico de treinos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            hapticWarning();
            const id = hub.plan!.id;
            await deletePlan(id);
            await clearPlannerForPlan(id);
            setDayExercises([]);
            await Promise.all([hub.reload(), upcoming.refresh(), todayStatus.refresh()]);
          },
        },
      ],
    );
  };

  const openMenu = () => {
    if (!hub.plan) return;
    Alert.alert(headerTitle, undefined, [
      { text: 'Edit', onPress: () => router.push({ pathname: '/plan/[id]', params: { id: hub.plan!.id } }) },
      { text: 'Delete workout', style: 'destructive', onPress: confirmDeleteDay },
      { text: 'Delete plan', style: 'destructive', onPress: confirmDeletePlan },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const modeSwitcher = (
    <View style={[styles.modeRow, { backgroundColor: colors.surfaceVariant }]}>
      {([
        ['find', 'Geral', Compass],
        ['planned', 'Planeador', ListChecks],
        ['instant', 'Treino Rápido', Sparkles],
      ] as const).map(([key, label, Icon]) => {
        const on = mode === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.modeBtn, on && { backgroundColor: colors.surface }]}
            onPress={() => setHubMode(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
          >
            <Icon size={14} color={on ? colors.primary : colors.textSecondary} />
            <Text
              style={[styles.modeLabel, { color: on ? colors.text : colors.textSecondary }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderEmptyHub = () => (
    <View style={styles.emptyWrap}>
      <EmptyState
        icon={<Dumbbell size={40} color={colors.primary} />}
        title="Ainda sem plano"
        description="Cria um plano, pede ao motor para construir um, ou começa já um Treino Rápido."
      />
      <View style={styles.emptyActions}>
        <Button title="Criar plano" onPress={onCreatePlan} loading={busy} />
        <Button title="Build for Me" variant="secondary" onPress={() => router.push('/adaptive/start')} icon={<Sparkles size={18} color={colors.onSecondary} />} />
        <Button title="Encontrar treino" variant="outline" onPress={() => setHubMode('find')} />
        <Button title="Treino Rápido" variant="ghost" onPress={() => setHubMode('instant')} />
      </View>
    </View>
  );

  const renderPlanned = () => {
    const today = upcoming.days[0];
    const todayScheduled = today?.scheduled ?? todayStatus.scheduled;

    return (
      <View style={styles.section}>
        <Card>
          {todayStatus.priority === 'active' && todayStatus.active ? (
            <>
              <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>Em curso</Text>
              <Text style={[styles.detailsTitle, { color: colors.text }]}>{todayStatus.active.name}</Text>
              <Button
                title="Retomar Treino"
                onPress={() => router.push({
                  pathname: '/workout/active',
                  params: {
                    planId: String(todayStatus.active!.planId ?? 0),
                    planName: todayStatus.active!.name,
                    resumeSessionId: String(todayStatus.active!.sessionId),
                  },
                })}
                icon={<Play size={18} color={colors.onPrimary} />}
              />
            </>
          ) : todayScheduled ? (
            <>
              <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>Treino de hoje</Text>
              <Text style={[styles.detailsTitle, { color: colors.text }]}>{todayScheduled.dayLabel}</Text>
              <Text style={[styles.dayMeta, { color: colors.textSecondary, marginBottom: 12 }]}>
                Est. {formatMinutes(todayScheduled.estimatedMinutes)} · {todayScheduled.exerciseCount} exercícios
                {todayScheduled.muscles.length ? ` · ${todayScheduled.muscles.join(', ')}` : ''}
              </Text>
              {today?.completed || todayStatus.priority === 'completed' ? (
                <Text style={[styles.dayState, { color: colors.secondary }]}>Concluído</Text>
              ) : (
                <Button title="Iniciar Treino" onPress={() => startPlannedDay(todayScheduled)} icon={<Play size={18} color={colors.onPrimary} />} />
              )}
            </>
          ) : (
            <>
              <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>Hoje</Text>
              <Text style={[styles.detailsTitle, { color: colors.text }]}>Dia de descanso</Text>
              <Text style={[styles.dayMeta, { color: colors.textSecondary }]}>Nada programado para hoje.</Text>
            </>
          )}
        </Card>

        <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>Próximos 5 dias</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekChips}>
          {upcoming.days.map((day, i) => {
            const on = selectedOffset === i;
            return (
              <TouchableOpacity
                key={`${day.date.toISOString()}-${i}`}
                style={[
                  styles.fiveDayChip,
                  { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primaryContainer : colors.surface },
                ]}
                onPress={() => { hapticSelect(); setSelectedOffset(i); }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${WEEKDAY_SHORT[day.weekday]} ${day.dayOfMonth}`}
              >
                <Text style={[styles.dowText, { color: colors.primary }]}>{WEEKDAY_SHORT[day.weekday]}</Text>
                <Text style={[styles.fiveDayNum, { color: colors.text }]}>{day.dayOfMonth}</Text>
                <Text style={[styles.fiveDaySub, { color: colors.textSecondary }]} numberOfLines={1}>
                  {day.completed ? 'Feito' : day.scheduled ? day.scheduled.dayLabel : 'Descanso'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {selectedUpcoming && (
          <View style={styles.section}>
            <Text style={[styles.dowLarge, { color: colors.primary }]}>
              {WEEKDAY_SHORT[selectedUpcoming.weekday]} · {selectedUpcoming.dayOfMonth}
            </Text>
            {selectedScheduled ? (
              <>
                <Text style={[styles.detailsTitle, { color: colors.text }]}>{selectedScheduled.dayLabel}</Text>
                <Text style={[styles.dayMeta, { color: colors.textSecondary }]}>
                  Est. {formatMinutes(selectedScheduled.estimatedMinutes)} · {dayExercises.length} exercícios
                </Text>
                {dayExercises.length === 0 ? (
                  <View style={styles.emptyDay}>
                    <TouchableOpacity
                      style={[styles.emptyCta, { borderColor: colors.primary, backgroundColor: colors.surface }]}
                      onPress={openAddExercise}
                      accessibilityRole="button"
                      accessibilityLabel="Add Exercise"
                    >
                      <Plus size={28} color={colors.primary} />
                      <Text style={[styles.emptyCtaTitle, { color: colors.text }]}>Add Exercise</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.emptyCta, { borderColor: colors.border, backgroundColor: colors.surface }]}
                      onPress={onBuildForMe}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel="Build for Me"
                    >
                      <Sparkles size={28} color={colors.primary} />
                      <Text style={[styles.emptyCtaTitle, { color: colors.text }]}>Build for Me</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {dayExercises.map(ex => (
                      <View key={ex.id} style={[styles.exRow, { borderBottomColor: colors.border }]}>
                        <View style={styles.exBody}>
                          <Text style={[styles.exName, { color: colors.text }]}>{ex.exercise_name}</Text>
                          <Text style={[styles.exMeta, { color: colors.textSecondary }]}>
                            {ex.sets} × {ex.reps_target}
                            {ex.weight_target > 0 ? ` · ${ex.weight_target} kg` : ''}
                            {ex.target_rir != null ? ` · RIR ${ex.target_rir}` : ''}
                            {ex.rest_seconds ? ` · ${ex.rest_seconds}s` : ''}
                          </Text>
                        </View>
                      </View>
                    ))}
                    <View style={styles.detailActions}>
                      <Button title="Add Exercise" variant="outline" onPress={openAddExercise} icon={<Plus size={18} color={colors.primary} />} />
                      {!selectedUpcoming.isToday && (
                        <Button title="Iniciar Treino" onPress={() => startPlannedDay(selectedScheduled)} icon={<Play size={18} color={colors.onPrimary} />} />
                      )}
                    </View>
                  </>
                )}
              </>
            ) : (
              <Text style={[styles.dayMeta, { color: colors.textSecondary }]}>Dia de descanso — sem treino programado.</Text>
            )}
          </View>
        )}

        {hub.plan && (
          <View style={styles.dayLimitRow}>
            <Text style={[styles.dayLimit, { color: colors.textSecondary }]}>
              Day Limit · {hub.days.length}/{hub.dayLimit} days
            </Text>
            <TouchableOpacity
              onPress={onAddDay}
              disabled={hub.days.length >= hub.dayLimit || busy}
              style={[styles.addDayBtn, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Add a day"
            >
              <Plus size={16} color={colors.onPrimary} />
              <Text style={[styles.addDayText, { color: colors.onPrimary }]}>Add a day</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderFind = () => (
    <View style={styles.section}>
      <Text style={[styles.sectionEyebrow, { color: colors.textSecondary }]}>Encontrar um treino</Text>
      {[
        { title: 'Build for Me', sub: 'Motor principal — adapts week by week', route: '/adaptive/start', icon: Sparkles },
        { title: 'Gerar plano', sub: 'Dias, duração e objetivo', route: '/plan/auto', icon: ListChecks },
        { title: 'Treino em casa', sub: 'Halteres e peso corporal', route: '/plan/home', icon: Home },
        { title: '5/3/1', sub: 'Força nos lifts principais', route: '/plan/531', icon: Dumbbell },
      ].map(item => (
        <TouchableOpacity
          key={item.route}
          style={[styles.findRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.push(item.route as never)}
          accessibilityRole="button"
          accessibilityLabel={item.title}
        >
          <item.icon size={22} color={colors.primary} />
          <View style={styles.findBody}>
            <Text style={[styles.dayTitle, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.dayMeta, { color: colors.textSecondary }]}>{item.sub}</Text>
          </View>
          <ChevronRight size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderInstant = () => (
    <View style={styles.section}>
      <Card>
        <Text style={[styles.detailsTitle, { color: colors.text }]}>Treino Rápido</Text>
        <Text style={[styles.dayMeta, { color: colors.textSecondary, marginBottom: 16 }]}>
          Começa agora sem alterar o plano. A sessão entra no histórico quando a terminares.
        </Text>
        <Button title="Começar Treino Livre" onPress={() => startInstant()} icon={<Zap size={18} color={colors.onPrimary} />} />
        {lastSession && (
          <View style={{ marginTop: 12 }}>
            <Button
              title={`Repetir ${lastSession.name}`}
              variant="outline"
              onPress={() => startInstant(lastSession.id)}
            />
          </View>
        )}
      </Card>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={mode === 'planned' ? headerTitle : 'Workout'}
        subtitle={mode === 'planned' && hub.plan ? hub.plan.name : undefined}
        right={
          mode === 'planned' && hub.plan ? (
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[styles.planBtn, { backgroundColor: colors.surfaceVariant }]}
                onPress={() => router.push({ pathname: '/plan/[id]', params: { id: hub.plan!.id } })}
                accessibilityRole="button"
                accessibilityLabel="Editar plano"
              >
                <Text style={[styles.planBtnText, { color: colors.text }]}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.planBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push({ pathname: '/plan/[id]', params: { id: hub.plan!.id } })}
                accessibilityRole="button"
                accessibilityLabel="Plan"
              >
                <Text style={[styles.planBtnText, { color: colors.onPrimary }]}>Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSettingsOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Definições do plano"
                style={styles.menuBtn}
              >
                <Settings size={22} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openMenu}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Menu do workout"
                style={styles.menuBtn}
              >
                <MoreHorizontal size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 88 + Math.max(insets.bottom, 16) + 56 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {modeSwitcher}

        {!hub.loaded ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
        ) : mode === 'find' ? renderFind()
          : mode === 'instant' ? renderInstant()
            : !hub.plan ? renderEmptyHub()
              : renderPlanned()}
      </ScrollView>
      <PlanSettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        plan={hub.plan}
        weekStartDow={weekStartDow}
        onChanged={() => {
          resolveWeekStartDow(adaptiveStatus?.weekStart ?? null).then(setWeekStartDow).catch(() => {});
          upcoming.refresh();
          hub.reload();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill },
  planBtnText: { fontFamily: 'Inter-Bold', fontSize: 13 },
  menuBtn: { minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN, alignItems: 'center', justifyContent: 'center' },
  modeRow: { flexDirection: 'row', borderRadius: RADIUS.pill, padding: 4, marginBottom: 16, gap: 4 },
  modeBtn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: RADIUS.pill,
  },
  modeLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, textAlign: 'center', lineHeight: 14 },
  subTabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 16 },
  subTab: { flex: 1, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent', alignItems: 'center' },
  subTabText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  section: { gap: 10 },
  sectionEyebrow: { fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  weekChips: { gap: 8, paddingBottom: 4 },
  weekChip: { borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 6 },
  weekChipText: { fontFamily: 'Inter-SemiBold', fontSize: 12 },
  fiveDayChip: { width: 88, borderWidth: 1, borderRadius: RADIUS.card, paddingHorizontal: 10, paddingVertical: 10, gap: 2 },
  fiveDayNum: { fontFamily: 'Inter-Bold', fontSize: 20 },
  fiveDaySub: { fontFamily: 'Inter-Regular', fontSize: 11 },
  dayCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.card, padding: 14 },
  dowBadge: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dowText: { fontFamily: 'Inter-Bold', fontSize: 12 },
  dayBody: { flex: 1, gap: 2 },
  dayTitle: { fontFamily: 'Inter-Bold', fontSize: 16 },
  dayMeta: { fontFamily: 'Inter-Regular', fontSize: 13 },
  dayState: { fontFamily: 'Inter-SemiBold', fontSize: 12, marginTop: 2 },
  dayLimitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  dayLimit: { fontFamily: 'Inter-Medium', fontSize: 13 },
  addDayBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill },
  addDayText: { fontFamily: 'Inter-Bold', fontSize: 13 },
  dowLarge: { fontFamily: 'Inter-Bold', fontSize: 13, letterSpacing: 1 },
  detailsTitle: { fontFamily: 'Inter-Bold', fontSize: 24 },
  emptyDay: { gap: 12, marginTop: 16 },
  emptyCta: { borderWidth: 1, borderRadius: RADIUS.card, padding: 22, alignItems: 'center', gap: 6 },
  emptyCtaTitle: { fontFamily: 'Inter-Bold', fontSize: 18 },
  emptyCtaSub: { fontFamily: 'Inter-Regular', fontSize: 13 },
  exRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  exBody: { gap: 4 },
  exName: { fontFamily: 'Inter-SemiBold', fontSize: 16 },
  exMeta: { fontFamily: 'Inter-Regular', fontSize: 13 },
  detailActions: { gap: 10, marginTop: 16 },
  findRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.card, padding: 16 },
  findBody: { flex: 1 },
  emptyWrap: { paddingBottom: 24 },
  emptyActions: { gap: 10, paddingHorizontal: 8 },
});
