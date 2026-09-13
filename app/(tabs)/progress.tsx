import { useCallback, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Modal } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { useAdaptiveStatus } from '@/hooks/useAdaptiveStatus';
import { Card } from '@/components/ui/Card';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { DonutChart } from '@/components/ui/DonutChart';
import { muscleColor } from '@/components/ui/ExerciseTile';
import { BodyTrackingSection } from '@/components/body/BodyTrackingSection';
import { AgendaCalendar } from '@/components/progress/AgendaCalendar';
import { JeffAssessmentCard } from '@/components/progress/JeffAssessmentCard';
import { hapticSelect, hapticSuccess } from '@/utils/haptics';
import {
  getStreakData, getProgressIndexData, getWeeklyVolumeByMuscle, getAchievementStats,
  getThisWeekTrainingDuration,
} from '@/db/workoutDao';
import { getWeeklyPlanner } from '@/db/plannerDao';
import { getAllPlans } from '@/db/planDao';
import { getRollingScheduleForPlan } from '@/utils/adaptiveService';
import { buildEffectivePlanner } from '@/utils/scheduleResolve';
import { getSetting, setSetting } from '@/db/settingsDao';
import { computeProgressIndex, type ProgressIndexResult } from '@/utils/progressIndex';
import { PHASE_LABEL_PT } from '@/utils/adaptivePlan';
import { getNewlyUnlocked, getUnlockedAchievementIds, type Achievement } from '@/utils/achievements';
import { computeJeffAssessment, type JeffAssessmentResult } from '@/utils/jeffAssessment';
import { resolveWeekStartDow } from '@/utils/weekStart';
import { getDaysInMonth } from '@/utils/format';
import { MUSCLE_GROUPS_PT, type MuscleGroup } from '@/types';
import { formatVolume, formatTime } from '@/utils/format';
import {
  TrendingUp, TrendingDown, Minus, ChevronRight, Dumbbell, Sparkles, Clock,
  Trophy, Settings as SettingsIcon,
} from 'lucide-react-native';

function progressColor(score: number, colors: { success: string; warning: string; error: string }): string {
  if (score >= 70) return colors.success;
  if (score >= 40) return colors.warning;
  return colors.error;
}

function ProgressBarFill({ ratio, color }: { ratio: number; color: string }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(ratio * 100, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [ratio, width]);
  const animatedStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return <Animated.View style={[styles.progressBarFill, { backgroundColor: color }, animatedStyle]} />;
}

export default function ProgressScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const { status: adaptiveStatus } = useAdaptiveStatus();
  const router = useRouter();

  const [streak, setStreak] = useState({ currentStreak: 0, longestStreak: 0, totalWorkouts: 0 });
  const [muscleDistribution, setMuscleDistribution] = useState<{ muscle: string; sets: number }[]>([]);
  const [newAchievement, setNewAchievement] = useState<Achievement | null>(null);
  const [progressIndex, setProgressIndex] = useState<ProgressIndexResult | null>(null);
  const [progressExpanded, setProgressExpanded] = useState(true);
  const chevronRotation = useSharedValue(0);
  useEffect(() => {
    chevronRotation.value = withTiming(progressExpanded ? 90 : 0, { duration: 200 });
  }, [progressExpanded, chevronRotation]);
  const chevronAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${chevronRotation.value}deg` }] }));
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [progTab, setProgTab] = useState<'overview' | 'body'>('overview');
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (tabParam === 'corpo' || tabParam === 'body') setProgTab('body');
    else if (tabParam === 'resumo' || tabParam === 'atividade' || tabParam === 'overview') setProgTab('overview');
  }, [tabParam]);

  const [weeklyVolume, setWeeklyVolume] = useState<number | null>(null);
  const [weeklyDuration, setWeeklyDuration] = useState<number | null>(null);
  const [prCountRecent, setPrCountRecent] = useState<number | null>(null);
  const [jeff, setJeff] = useState<JeffAssessmentResult | null>(null);
  const [weekStartDow, setWeekStartDow] = useState(1);
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [scheduledByDay, setScheduledByDay] = useState<Record<number, string>>({});

  const loadDashboard = useCallback(async () => {
    try {
      const [s, progressData, previousScoreRaw, muscleVol, weeklyVol, achievementStats, achievementsSeenRaw, duration, planner, allPlans] = await Promise.all([
        getStreakData(),
        getProgressIndexData(),
        getSetting('progressIndexLastScore'),
        getWeeklyVolumeByMuscle(30),
        getWeeklyVolumeByMuscle(7),
        getAchievementStats(),
        getSetting('achievementsSeen'),
        getThisWeekTrainingDuration(),
        getWeeklyPlanner(),
        getAllPlans(),
      ]);
      setStreak(s);
      setMuscleDistribution(muscleVol);
      setWeeklyVolume(weeklyVol.reduce((sum, m) => sum + m.volume, 0));
      setWeeklyDuration(duration);
      setPrCountRecent(progressData.prCountRecent);

      const dow = await resolveWeekStartDow(adaptiveStatus?.weekStart ?? null);
      setWeekStartDow(dow);
      const todayWeekday = new Date().getDay();
      const rolling = adaptiveStatus
        ? await getRollingScheduleForPlan(adaptiveStatus.planId, dow).catch(() => null)
        : null;
      const effective = buildEffectivePlanner(
        planner,
        rolling,
        adaptiveStatus?.planId ?? null,
        todayWeekday,
        dow,
      );
      const planLabels = Object.fromEntries(allPlans.map(p => [p.id, p.name]));
      const daysInMonth = getDaysInMonth(calYear, calMonth);
      const mapped: Record<number, string> = {};
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(calYear, calMonth, day);
        if (date < startOfToday) continue;
        const slot = effective[date.getDay()];
        if (slot) mapped[day] = planLabels[slot.planId] || 'Treino';
      }
      setScheduledByDay(mapped);

      const previouslySeen: string[] = achievementsSeenRaw ? JSON.parse(achievementsSeenRaw) : [];
      const freshlyUnlocked = getNewlyUnlocked(previouslySeen, achievementStats);
      if (freshlyUnlocked.length > 0) {
        setNewAchievement(freshlyUnlocked[0]);
        hapticSuccess();
      }
      setSetting('achievementsSeen', JSON.stringify(getUnlockedAchievementIds(achievementStats))).catch(() => {});

      const previousScore = previousScoreRaw ? parseInt(previousScoreRaw, 10) : null;
      const result = computeProgressIndex({ ...progressData, previousScore });
      setProgressIndex(result);
      setSetting('progressIndexLastScore', String(result.score)).catch(() => {});

      const balance = adaptiveStatus?.latestNspi
        ? adaptiveStatus.latestNspi.balance
        : (result.components.find(c => c.key === 'balance')?.score ?? 0) * 4;
      setJeff(computeJeffAssessment({
        balanceScore: balance,
        thisWeekVolume: progressData.volumeThisWeek,
        avgWeeklyVolume: progressData.avgWeeklyVolume,
      }));

      setLoaded(true);
    } catch (err) {
      console.error('Failed to load progress dashboard:', err);
      setLoaded(true);
    }
  }, [adaptiveStatus, calYear, calMonth]);

  useFocusEffect(useCallback(() => {
    if (!isReady) return;
    loadDashboard();
  }, [isReady, loadDashboard]));

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const isNewUser = loaded && streak.totalWorkouts === 0;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Progresso"
        right={
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Definições e perfil"
          >
            <SettingsIcon size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        }
      />

      <View style={[styles.progTabs, { borderBottomColor: colors.border }]}>
        {([
          ['overview', 'Overview'],
          ['body', 'Body'],
        ] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            onPress={() => setProgTab(key)}
            style={[styles.progTab, progTab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.progTabLabel, { color: progTab === key ? colors.primary : colors.textSecondary }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {progTab === 'body' && <BodyTrackingSection />}

        {progTab === 'overview' && (
          <>
            {isNewUser && (
              <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
                <Dumbbell size={40} color={colors.textTertiary} />
                <Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 18 }}>Bem-vindo à Changes</Text>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center' }}>
                  Faz o teu primeiro treino para começares a ver o teu resumo aqui.
                </Text>
              </Card>
            )}

            <Card>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PROGRESSO INDEX</Text>
              {adaptiveStatus?.latestNspi && (
                <TouchableOpacity
                  style={[styles.progressHeader, { marginTop: 12 }]}
                  onPress={() => { hapticSelect(); router.push('/adaptive/recap'); }}
                  accessibilityRole="button"
                  accessibilityLabel={`NSPI: ${Math.round(adaptiveStatus.latestNspi.score)} de 100`}
                >
                  <View style={[styles.progressRing, { borderColor: progressColor(adaptiveStatus.latestNspi.score, colors) }]}>
                    <AnimatedNumber value={adaptiveStatus.latestNspi.score} style={[styles.progressRingText, { color: progressColor(adaptiveStatus.latestNspi.score, colors) }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={16} color={colors.accent} />
                      <Text style={[styles.cardTitle, { color: colors.text }]}>NSPI</Text>
                      {adaptiveStatus.latestNspi.trend === 'up' && <TrendingUp size={16} color={colors.success} />}
                      {adaptiveStatus.latestNspi.trend === 'down' && <TrendingDown size={16} color={colors.warning} />}
                      {adaptiveStatus.latestNspi.trend === 'stable' && <Minus size={16} color={colors.textTertiary} />}
                    </View>
                    <Text style={[styles.progressSub, { color: colors.textSecondary }]}>
                      Ciclo {adaptiveStatus.cycleIndex} · {PHASE_LABEL_PT[adaptiveStatus.phase]}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              )}

              {progressIndex && (
                <TouchableOpacity
                  style={[styles.progressHeader, { marginTop: 16 }]}
                  onPress={() => { hapticSelect(); setProgressExpanded(e => !e); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Índice de Progresso: ${progressIndex.score} de 100`}
                >
                  <View style={[styles.progressRing, { borderColor: progressColor(progressIndex.score, colors) }]}>
                    <AnimatedNumber value={progressIndex.score} style={[styles.progressRingText, { color: progressColor(progressIndex.score, colors) }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>Índice de Progresso</Text>
                      {progressIndex.trend === 'up' && <TrendingUp size={16} color={colors.success} />}
                      {progressIndex.trend === 'down' && <TrendingDown size={16} color={colors.warning} />}
                      {progressIndex.trend === 'stable' && <Minus size={16} color={colors.textTertiary} />}
                    </View>
                    <Text style={[styles.progressSub, { color: colors.textSecondary }]}>
                      {prCountRecent != null ? `${prCountRecent} PRs nos últimos 30 dias` : 'Toca para ver o detalhe'}
                    </Text>
                  </View>
                  <Animated.View style={chevronAnimatedStyle}>
                    <ChevronRight size={18} color={colors.textTertiary} />
                  </Animated.View>
                </TouchableOpacity>
              )}

              {progressExpanded && progressIndex && (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ marginTop: 12, gap: 10 }}>
                  {progressIndex.components.map(c => (
                    <View key={c.key}>
                      <View style={styles.progressCompRow}>
                        <Text style={[styles.progressCompLabel, { color: colors.text }]}>{c.label}</Text>
                        <Text style={[styles.progressCompScore, { color: colors.textSecondary }]}>{c.score}/{c.maxScore}</Text>
                      </View>
                      <View style={[styles.progressBarTrack, { backgroundColor: colors.surfaceVariant }]}>
                        <ProgressBarFill ratio={c.score / c.maxScore} color={progressColor(c.score * 4, colors)} />
                      </View>
                      <Text style={[styles.progressCompExplain, { color: colors.textTertiary }]}>{c.explanation}</Text>
                    </View>
                  ))}
                </Animated.View>
              )}
            </Card>

            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: colors.primaryContainer }]}>
                  <Dumbbell size={20} color={colors.primary} />
                </View>
                {loaded && weeklyVolume !== null ? (
                  <Text style={[styles.statValue, styles.statValueCompact, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatVolume(weeklyVolume)}
                  </Text>
                ) : (
                  <View style={[styles.statSkeleton, { backgroundColor: colors.surfaceVariant }]} />
                )}
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Volume esta semana</Text>
              </Card>
              <Card style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: colors.secondaryContainer }]}>
                  <Clock size={20} color={colors.secondary} />
                </View>
                {loaded && weeklyDuration !== null ? (
                  <Text style={[styles.statValue, styles.statValueCompact, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatTime(weeklyDuration)}
                  </Text>
                ) : (
                  <View style={[styles.statSkeleton, { backgroundColor: colors.surfaceVariant }]} />
                )}
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Workout time</Text>
              </Card>
            </View>

            <AgendaCalendar
              currentStreak={streak.currentStreak}
              totalSessions={streak.totalWorkouts}
              weekStartDow={weekStartDow}
              scheduledByDay={scheduledByDay}
              year={calYear}
              month={calMonth}
              onMonthChange={(y, m) => { setCalYear(y); setCalMonth(m); }}
            />

            {muscleDistribution.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>MUSCLE BREAKDOWN</Text>
                <Card style={{ alignItems: 'center', gap: 14 }}>
                  <DonutChart
                    slices={muscleDistribution.map(m => ({
                      label: MUSCLE_GROUPS_PT[m.muscle as MuscleGroup] || m.muscle,
                      value: m.sets,
                      color: muscleColor(m.muscle as MuscleGroup),
                    }))}
                    centerValue={String(muscleDistribution.reduce((sum, m) => sum + m.sets, 0))}
                    centerLabel="séries"
                  />
                  <View style={styles.legendGrid}>
                    {muscleDistribution.map(m => {
                      const total = muscleDistribution.reduce((sum, x) => sum + x.sets, 0);
                      const pct = total > 0 ? Math.round((m.sets / total) * 100) : 0;
                      return (
                        <View key={m.muscle} style={styles.legendItem}>
                          <View style={[styles.legendDot, { backgroundColor: muscleColor(m.muscle as MuscleGroup) }]} />
                          <Text style={[styles.legendText, { color: colors.textSecondary }]} numberOfLines={1}>
                            {MUSCLE_GROUPS_PT[m.muscle as MuscleGroup] || m.muscle} · {pct}%
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              </View>
            )}

            {jeff && <JeffAssessmentCard assessment={jeff} />}
          </>
        )}
      </ScrollView>

      <Modal visible={newAchievement !== null} animationType="fade" transparent onRequestClose={() => setNewAchievement(null)}>
        <TouchableOpacity style={styles.achievementOverlay} activeOpacity={1} onPress={() => setNewAchievement(null)}>
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.achievementCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.achievementIconRing, { backgroundColor: colors.accentContainer }]}>
              <Trophy size={36} color={colors.accent} />
            </View>
            <Text style={[styles.achievementUnlockedLabel, { color: colors.accent }]}>CONQUISTA DESBLOQUEADA</Text>
            <Text style={[styles.achievementTitle, { color: colors.text }]}>{newAchievement?.title}</Text>
            <Text style={[styles.achievementDesc, { color: colors.textSecondary }]}>{newAchievement?.description}</Text>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  progTabs: { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1 },
  progTab: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  progTabLabel: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
  achievementOverlay: { flex: 1, backgroundColor: '#000000aa', alignItems: 'center', justifyContent: 'center', padding: 32 },
  achievementCard: { width: '100%', borderRadius: 20, padding: 28, alignItems: 'center', gap: 8 },
  achievementIconRing: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  achievementUnlockedLabel: { fontFamily: 'Inter-Bold', fontSize: 12, letterSpacing: 1.5 },
  achievementTitle: { fontFamily: 'Inter-Bold', fontSize: 20, textAlign: 'center' },
  achievementDesc: { fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14 },
  statIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontFamily: 'Inter-Black', fontSize: 26 },
  statValueCompact: { fontSize: 20 },
  statLabel: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, textAlign: 'center' },
  statSkeleton: { width: 40, height: 26, borderRadius: 6 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressRing: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  progressRingText: { fontFamily: 'Inter-Black', fontSize: 17 },
  progressSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  progressCompRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressCompLabel: { fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17 },
  progressCompScore: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16 },
  progressBarTrack: { height: 6, borderRadius: 3, marginTop: 4, overflow: 'hidden' },
  progressBarFill: { height: 6, borderRadius: 3 },
  progressCompExplain: { fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 14, marginTop: 3 },
  sectionTitle: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  cardTitle: { fontFamily: 'Inter-Bold', fontSize: 16 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: '40%' },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: 'Inter-Regular', fontSize: 12, flexShrink: 1 },
});
