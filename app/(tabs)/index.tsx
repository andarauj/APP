import { useCallback, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Modal } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeIn, FadeOut, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useAppMode } from '@/hooks/useAppMode';
import { useDatabase } from '@/hooks/useDatabase';
import { useAdaptiveStatus } from '@/hooks/useAdaptiveStatus';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ExerciseTile , muscleColor } from '@/components/ui/ExerciseTile';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { BodyMetricsInput } from '@/components/ui/BodyMetricsInput';
import { hapticSelect, hapticSuccess } from '@/utils/haptics';
import { getLatestBodyMetric, getWeightChange } from '@/db/bodyMetricsDao';
import {
  getStreakData, getAllSessions, getMostTrainedExercises, getMostUsedPlans,
  getTrainingTips, getProgressIndexData, getWeeklyVolumeByMuscle, getAchievementStats, getTrainingHeatmapData, getThisWeekCompletedDays,
  type MostTrainedExercise, type MostUsedPlan, type TrainingTip,
} from '@/db/workoutDao';
import { getWeeklyPlanner } from '@/db/plannerDao';
import { getAllPlans } from '@/db/planDao';
import { getSetting, setSetting } from '@/db/settingsDao';
import { computeProgressIndex, type ProgressIndexResult } from '@/utils/progressIndex';
import { PHASE_LABEL_PT, PHASE_COLOR } from '@/utils/adaptivePlan';
import { getNewlyUnlocked, getUnlockedAchievementIds, type Achievement } from '@/utils/achievements';
import { getQuoteForDate } from '@/utils/motivationalQuotes';
import { scheduleMotivationalNotification } from '@/utils/reminders';
import { DonutChart } from '@/components/ui/DonutChart';
import { TrainingHeatmap } from '@/components/ui/TrainingHeatmap';
import { WeeklyCommitmentStrip } from '@/components/ui/WeeklyCommitmentStrip';
import { computeHeatmapIntensities, type HeatmapDay } from '@/utils/trainingHeatmap';
import { computeWeeklyCommitment, type WeeklyCommitment } from '@/utils/weeklyCommitment';
import type { WorkoutSession, MuscleGroup, Equipment } from '@/types';
import { MUSCLE_GROUPS_PT } from '@/types';
import { formatDateTime, formatTime, formatVolume } from '@/utils/format';
import {
  Flame, TrendingUp, TrendingDown, Minus, Play, ChevronRight, AlertTriangle, Info, CheckCircle2,
  Dumbbell, Repeat, ListChecks, Gauge, Sparkles, Calendar, Trophy, Activity, Settings as SettingsIcon,
  Ruler, Camera, Radar, Star, Zap, History as HistoryIcon,
} from 'lucide-react-native';

const TIP_ICON = { warning: AlertTriangle, info: Info, positive: CheckCircle2 };

/** Green for a healthy score, amber in the middle, red only when several
 *  components are genuinely low — deliberately not harsh, since this index
 *  reflects a pattern to notice, not a grade to be punished for. */
function progressColor(score: number, colors: any): string {
  if (score >= 70) return colors.success;
  if (score >= 40) return colors.warning;
  return colors.error;
}

/** Its own small component (not inlined in a .map()) so each bar can safely
 *  own its animated shared value — hooks can't be called conditionally or
 *  inside a loop, which a shared value per array item would otherwise be. */
function ProgressBarFill({ ratio, color }: { ratio: number; color: string }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(ratio * 100, { duration: 600, easing: Easing.out(Easing.cubic) });
    // `width` is a shared value with a stable identity; listing it satisfies
    // the rule without causing the effect to re-run.
  }, [ratio, width]);
  const animatedStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return <Animated.View style={[styles.progressBarFill, { backgroundColor: color }, animatedStyle]} />;
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const { isSimple } = useAppMode();
  const { isReady } = useDatabase();
  const { status: adaptiveStatus } = useAdaptiveStatus();
  const router = useRouter();

  const [streak, setStreak] = useState({ currentStreak: 0, longestStreak: 0, totalWorkouts: 0 });
  const [recentSessions, setRecentSessions] = useState<WorkoutSession[]>([]);
  const [topExercises, setTopExercises] = useState<MostTrainedExercise[]>([]);
  const [muscleDistribution, setMuscleDistribution] = useState<{ muscle: string; sets: number }[]>([]);
  const [heatmapDays, setHeatmapDays] = useState<HeatmapDay[]>([]);
  const [weeklyCommitment, setWeeklyCommitment] = useState<WeeklyCommitment | null>(null);
  const [newAchievement, setNewAchievement] = useState<Achievement | null>(null);
  const [topPlans, setTopPlans] = useState<MostUsedPlan[]>([]);
  const [tips, setTips] = useState<TrainingTip[]>([]);
  const [progressIndex, setProgressIndex] = useState<ProgressIndexResult | null>(null);
  const [progressExpanded, setProgressExpanded] = useState(false);
  const chevronRotation = useSharedValue(0);
  useEffect(() => {
    chevronRotation.value = withTiming(progressExpanded ? 90 : 0, { duration: 200 });
  }, [progressExpanded, chevronRotation]);
  const chevronAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${chevronRotation.value}deg` }] }));
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // JeFit "Progress" sub-tabs (see JEFIT_PARIDADE.md Fase 1c). Resumo is the
  // old dashboard; Corpo and Atividade gather what used to live in the
  // Perfil › Corpo tab and the /progress hub.
  const [progTab, setProgTab] = useState<'resumo' | 'corpo' | 'atividade'>('resumo');
  const [bodyMetricsModalVisible, setBodyMetricsModalVisible] = useState(false);
  const [latestBodyMetric, setLatestBodyMetric] = useState<any>(null);
  const [weightChange, setWeightChange] = useState<any>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const [s, sessions, exs, plans, t, progressData, previousScoreRaw, muscleVol, achievementStats, achievementsSeenRaw, heatmapRaw, planner, allPlans, completedWeekdays, latestMetric, weightDelta] = await Promise.all([
        getStreakData(),
        getAllSessions(4, 0),
        getMostTrainedExercises(5, 60),
        getMostUsedPlans(3),
        getTrainingTips(),
        getProgressIndexData(),
        getSetting('progressIndexLastScore'),
        getWeeklyVolumeByMuscle(30), // named "weekly" but takes any window — 30 days gives a representative picture, not just the current week
        getAchievementStats(),
        getSetting('achievementsSeen'),
        getTrainingHeatmapData(91), // 13 weeks — a full GitHub-style year would be too wide for a phone screen
        getWeeklyPlanner(),
        getAllPlans(),
        getThisWeekCompletedDays(),
        getLatestBodyMetric(),
        getWeightChange(7),
      ]);
      setStreak(s);
      setRecentSessions(sessions);
      setTopExercises(exs);
      setTopPlans(plans);
      setTips(t);
      setMuscleDistribution(muscleVol);
      setLatestBodyMetric(latestMetric);
      setWeightChange(weightDelta);
      setHeatmapDays(computeHeatmapIntensities(heatmapRaw));

      const planLabels = Object.fromEntries(allPlans.map(p => [p.id, p.name]));
      setWeeklyCommitment(computeWeeklyCommitment(planner, planLabels, completedWeekdays, new Date().getDay()));

      // Celebrate newly-crossed achievement thresholds since the last time
      // this screen loaded — same "compare against last seen" pattern as
      // the Progress Index trend above, so a fresh install doesn't need a
      // separate first-run migration to seed a baseline.
      const previouslySeen: string[] = achievementsSeenRaw ? JSON.parse(achievementsSeenRaw) : [];
      const freshlyUnlocked = getNewlyUnlocked(previouslySeen, achievementStats);
      if (freshlyUnlocked.length > 0) {
        setNewAchievement(freshlyUnlocked[0]);
        hapticSuccess();
      }
      setSetting('achievementsSeen', JSON.stringify(getUnlockedAchievementIds(achievementStats))).catch(() => {});

      // The trend arrow compares against whatever score was last computed
      // (i.e. the last time this screen loaded), not a rigid calendar week —
      // simpler than reconstructing a full historical score, and arguably
      // more honest: it answers "since I last checked" rather than pretending
      // to know exactly what last Monday-to-Sunday looked like.
      const previousScore = previousScoreRaw ? parseInt(previousScoreRaw, 10) : null;
      const result = computeProgressIndex({ ...progressData, previousScore });
      setProgressIndex(result);
      setSetting('progressIndexLastScore', String(result.score)).catch(() => {});

      // Keeps the scheduled notification's wording matching today's quote —
      // see the BUGFIX note in utils/reminders.ts for why this happens here
      // instead of relying solely on the daily trigger.
      getSetting('motivationalNotifyEnabled').then(enabled => {
        if (enabled === '1') {
          getSetting('motivationalNotifyTime').then(time => {
            scheduleMotivationalNotification(time || '07:00').catch(() => {});
          });
        }
      }).catch(() => {});

      setLoaded(true);
    } catch (err) {
      console.error('Failed to load home dashboard:', err);
      setLoaded(true);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!isReady) return;
    loadDashboard();
  }, [isReady, loadDashboard]));

  // Runs once per app launch (not on every focus, unlike the effect above)
  // — checks whether the first-run intro has been completed. Only
  // redirects there if BOTH the flag is unset AND the person has no
  // existing workout history: without that second check, everyone who was
  // already using the app before this setting existed (its key simply
  // never existed in their settings table) would get sent to a "welcome"
  // screen despite having trained dozens of times already.
  useEffect(() => {
    if (!isReady || !loaded) return;
    getSetting('onboardingComplete').then(value => {
      if (value === '1') return;
      if (streak.totalWorkouts > 0) {
        // Grandfather them in silently — no point showing "welcome" to
        // someone who's already a real user.
        setSetting('onboardingComplete', '1').catch(() => {});
        return;
      }
      router.replace('/onboarding');
    }).catch(() => {});
  }, [isReady, loaded, streak.totalWorkouts, router]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const isNewUser = loaded && streak.totalWorkouts === 0;
  // A pure, cheap function — called directly on render rather than memoized,
  // so it's always correct even if the app is left open across midnight.
  const todaysQuote = getQuoteForDate();

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Progresso</Text>
        {/* JeFit-parity: settings live behind a gear in the Progress header
            (see JEFIT_PARIDADE.md Fase 1c). Points at the Perfil tab, whose
            "Definições" sub-tab holds them until Perfil is dissolved. */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/profile')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Definições e perfil"
        >
          <SettingsIcon size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Sub-tabs — JeFit "Progress": Resumo · Corpo · Atividade */}
      <View style={[styles.progTabs, { borderBottomColor: colors.border }]}>
        {([
          ['resumo', 'Resumo'],
          ['corpo', 'Corpo'],
          ['atividade', 'Atividade'],
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
        {progTab === 'corpo' && (
          <>
            <TouchableOpacity
              style={[styles.smartCard, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setBodyMetricsModalVisible(true)}
              activeOpacity={0.85}
            >
              <View style={[styles.statIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Ruler size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.smartTitle, { color: '#fff' }]}>Registar medidas</Text>
                <Text style={[styles.smartDesc, { color: 'rgba(255,255,255,0.85)' }]}>
                  {latestBodyMetric?.date ? `Último: ${formatDateTime(latestBodyMetric.date)}` : 'Peso, gordura, perímetros'}
                </Text>
              </View>
            </TouchableOpacity>
            {([
              ['Medidas e fotos', 'Histórico completo do corpo', '/(tabs)/profile', Ruler],
              ['Comparar fotos', 'Antes e depois lado a lado', '/photo-compare', Camera],
              ['Equilíbrio muscular', 'Distribuição do volume por grupo', '/progress/balance', Radar],
            ] as const).map(([label, sub, route, Icon]) => (
              <TouchableOpacity
                key={route}
                style={[styles.linkRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(route as never)}
                activeOpacity={0.7}
              >
                <View style={[styles.linkIcon, { backgroundColor: colors.primaryContainer }]}><Icon size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.linkTitle, { color: colors.text }]}>{label}</Text>
                  <Text style={[styles.linkDesc, { color: colors.textSecondary }]} numberOfLines={1}>{sub}</Text>
                </View>
                <ChevronRight size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {progTab === 'atividade' && (
          <>
            <TouchableOpacity
              style={[styles.smartCard, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => router.push('/(tabs)/history')}
              activeOpacity={0.85}
            >
              <View style={[styles.statIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <HistoryIcon size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.smartTitle, { color: '#fff' }]}>Histórico completo</Text>
                <Text style={[styles.smartDesc, { color: 'rgba(255,255,255,0.85)' }]}>Calendário, estatísticas e sessões</Text>
              </View>
            </TouchableOpacity>
            {recentSessions.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ÚLTIMOS TREINOS</Text>
                {recentSessions.map(session => (
                  <TouchableOpacity
                    key={session.id}
                    style={[styles.sessionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => router.push({ pathname: '/workout/summary', params: { sessionId: session.id } })}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sessionName, { color: colors.text }]} numberOfLines={1}>{session.name}</Text>
                      <Text style={[styles.sessionDate, { color: colors.textTertiary }]}>{formatDateTime(session.started_at)}</Text>
                    </View>
                    <View style={styles.sessionStats}>
                      <Text style={[styles.sessionStat, { color: colors.textSecondary }]}>⏱ {formatTime(session.total_duration)}</Text>
                      <Text style={[styles.sessionStat, { color: colors.textSecondary }]}>{formatVolume(session.total_volume)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ANÁLISE</Text>
            {([
              ['Máximo estimado (1RM)', 'Progressão de força por exercício', '/progress/onerm', Zap],
              ['Sinais de fadiga', 'Indicadores de acumulação de fadiga', '/fatigue-radar', Activity],
              ['O teu mês', 'Resumo mensal com comparação', '/monthly-recap', Calendar],
              ['Conquistas', 'Marcos atingidos', '/achievements', Trophy],
              ['Exercícios favoritos', 'Os que marcaste com estrela', '/progress/favorites', Star],
            ] as const).map(([label, sub, route, Icon]) => (
              <TouchableOpacity
                key={route}
                style={[styles.linkRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(route as never)}
                activeOpacity={0.7}
              >
                <View style={[styles.linkIcon, { backgroundColor: colors.primaryContainer }]}><Icon size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.linkTitle, { color: colors.text }]}>{label}</Text>
                  <Text style={[styles.linkDesc, { color: colors.textSecondary }]} numberOfLines={1}>{sub}</Text>
                </View>
                <ChevronRight size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {progTab === 'resumo' && (<>
        {/* Motivational quote — the first thing on the screen, deliberately:
            this is meant to spark "let's go", not be buried under stats. */}
        <View style={[styles.quoteCard, { backgroundColor: colors.primaryContainer }]}>
          <Sparkles size={16} color={colors.primary} />
          <Text style={[styles.quoteText, { color: colors.text }]}>{todaysQuote}</Text>
        </View>

        {/* Weekly commitment — "what are we doing this week, and how's it
            gone" — distinct from Progress Index (which compares to your
            own rolling average, not an explicit plan you set). Only shows
            once the weekly planner has been used at least once; an empty
            strip with nothing ever assigned isn't useful to show by
            default. */}
        {weeklyCommitment && weeklyCommitment.plannedCount > 0 && (
          <Card>
            <WeeklyCommitmentStrip commitment={weeklyCommitment} />
          </Card>
        )}

        {/* Quick stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.accentContainer }]}>
              <Flame size={20} color={colors.accent} />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>{streak.currentStreak}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Streak</Text>
          </Card>
          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.primaryContainer }]}>
              <TrendingUp size={20} color={colors.primary} />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>{streak.longestStreak}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Recorde</Text>
          </Card>
          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.secondaryContainer }]}>
              <Dumbbell size={20} color={colors.secondary} />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>{streak.totalWorkouts}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Treinos</Text>
          </Card>
        </View>

        {isNewUser && (
          <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
            <Dumbbell size={40} color={colors.textTertiary} />
            <Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 18 }}>Bem-vindo à Changes</Text>
            <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center' }}>
              Faz o teu primeiro treino para começares a ver o teu resumo, histórico e dicas aqui.
            </Text>
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/(tabs)/start')}
              accessibilityRole="button"
              accessibilityLabel="Ir para Treinar"
            >
              <Play size={16} color="#fff" />
              <Text style={styles.ctaBtnText}>Começar a treinar</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Body Weight Tracking */}
        {!isNewUser && latestBodyMetric && (
          <TouchableOpacity
            style={[styles.weightCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setBodyMetricsModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.weightLabel, { color: colors.textSecondary }]}>Peso Atual</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text style={[styles.weightValue, { color: colors.text }]}>
                  {latestBodyMetric.weight?.toFixed(1) || '—'}
                </Text>
                <Text style={[styles.weightUnit, { color: colors.textSecondary }]}>kg</Text>
              </View>
              {weightChange?.delta !== null && (
                <Text
                  style={[
                    styles.weightDelta,
                    { color: weightChange.delta > 0 ? colors.error : colors.success },
                  ]}
                >
                  {weightChange.delta > 0 ? '+' : ''}{weightChange.delta?.toFixed(1)} vs semana passada
                </Text>
              )}
            </View>
            <View style={[styles.weightIcon, { backgroundColor: colors.secondaryContainer }]}>
            <TrendingUp size={18} color={colors.secondary} />
            </View>
          </TouchableOpacity>
        )}

        {/* Doorway to the progress hub, which lists every analysis screen.
            Without it these were scattered across three different places and
            most of them were only findable by digging through the history
            tab. The two shortcuts beside it are the ones worth one tap. */}
        {!isNewUser && (
          <TouchableOpacity
            style={[styles.recapBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push('/progress')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Ver progresso"
            accessibilityHint="Histórico, força, equilíbrio muscular, fadiga, fotos e conquistas"
          >
            <View style={[styles.recapBannerIcon, { backgroundColor: colors.primaryContainer }]}>
              <TrendingUp size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.recapBannerText, { color: colors.text }]} numberOfLines={1}>Progresso</Text>
              <Text style={[styles.recapBannerSub, { color: colors.textSecondary }]} numberOfLines={1}>
                Força, equilíbrio, fadiga e fotos
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}

        {!isNewUser && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[styles.recapBanner, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}
              onPress={() => router.push('/monthly-recap')}
              activeOpacity={0.8}
            >
              <View style={[styles.recapBannerIcon, { backgroundColor: colors.secondaryContainer }]}>
                <Calendar size={18} color={colors.secondary} />
              </View>
              <Text style={[styles.recapBannerText, { color: colors.text }]} numberOfLines={1}>O Teu Mês</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.recapBanner, { backgroundColor: colors.surface, borderColor: colors.border, flex: 1 }]}
              onPress={() => router.push('/achievements')}
              activeOpacity={0.8}
            >
              <View style={[styles.recapBannerIcon, { backgroundColor: colors.accentContainer }]}>
                <Trophy size={18} color={colors.accent} />
              </View>
              <Text style={[styles.recapBannerText, { color: colors.text }]} numberOfLines={1}>Conquistas</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Fatigue signals — deliberately its own full-width banner, not
            squeezed into a third slot alongside the two above. This one
            touches on injury-adjacent territory, so it earns a bit more
            visual weight than a routine stats shortcut. */}
        {!isNewUser && !isSimple && (
          <TouchableOpacity
            style={[styles.recapBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push('/fatigue-radar')}
            activeOpacity={0.8}
          >
            <View style={[styles.recapBannerIcon, { backgroundColor: colors.accentContainer }]}>
              <Activity size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.recapBannerText, { color: colors.text }]} numberOfLines={1}>Sinais de Fadiga</Text>
              <Text style={[styles.recapBannerSub, { color: colors.textSecondary }]} numberOfLines={1}>Padrões de sobrecarga nos teus próprios números</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Progress Index — one weekly number combining consistency, volume,
            muscle balance and progression, similar in spirit to the unified
            scores some 2026 workout apps offer (e.g. Jefit's NSPI) — but
            computed transparently from data already tracked here, fully
            offline, with every point explained below instead of a
            subscription-gated black-box AI score. */}
        {/* NSPI — the adaptive engine's own score, shown instead of the
            generic Índice de Progresso once a plano adaptativo is active
            (NSPI_ENGINE.md §7). Same visual language (ring + trend arrow)
            so switching between the two doesn't feel like a different app. */}
        {adaptiveStatus?.latestNspi && (
          <Card>
            <TouchableOpacity
              style={styles.progressHeader}
              onPress={() => { hapticSelect(); router.push('/adaptive/recap'); }}
              accessibilityRole="button"
              accessibilityLabel={`NSPI: ${Math.round(adaptiveStatus.latestNspi.score)} de 100. Toca para ver o Weekly Recap`}
            >
              <View style={[styles.progressRing, { borderColor: progressColor(adaptiveStatus.latestNspi.score, colors) }]}>
                <AnimatedNumber value={adaptiveStatus.latestNspi.score} style={[styles.progressRingText, { color: progressColor(adaptiveStatus.latestNspi.score, colors) }]} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} color={colors.accent} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>NSPI</Text>
                  {adaptiveStatus.latestNspi.trend === 'up' && <TrendingUp size={16} color={colors.success} />}
                  {adaptiveStatus.latestNspi.trend === 'down' && <TrendingDown size={16} color={colors.warning} />}
                  {adaptiveStatus.latestNspi.trend === 'stable' && <Minus size={16} color={colors.textTertiary} />}
                </View>
                <Text style={[styles.progressSub, { color: colors.textSecondary }]} numberOfLines={1}>
                  Ciclo {adaptiveStatus.cycleIndex} · {PHASE_LABEL_PT[adaptiveStatus.phase]} · ver Weekly Recap
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </Card>
        )}

        {!adaptiveStatus?.latestNspi && !isNewUser && progressIndex && (
          <Card>
            <TouchableOpacity
              style={styles.progressHeader}
              onPress={() => { hapticSelect(); setProgressExpanded(e => !e); }}
              accessibilityRole="button"
              accessibilityLabel={`Índice de Progresso: ${progressIndex.score} de 100. Toca para ${progressExpanded ? 'esconder' : 'ver'} detalhe`}
            >
              <View style={[styles.progressRing, { borderColor: progressColor(progressIndex.score, colors) }]}>
                <AnimatedNumber value={progressIndex.score} style={[styles.progressRingText, { color: progressColor(progressIndex.score, colors) }]} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} color={colors.accent} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Índice de Progresso</Text>
                  {progressIndex.trend === 'up' && <TrendingUp size={16} color={colors.success} />}
                  {progressIndex.trend === 'down' && <TrendingDown size={16} color={colors.warning} />}
                  {progressIndex.trend === 'stable' && <Minus size={16} color={colors.textTertiary} />}
                </View>
                <Text style={[styles.progressSub, { color: colors.textSecondary }]}>
                  {progressExpanded ? 'Toca para esconder o detalhe' : 'Toca para ver o detalhe'}
                </Text>
              </View>
              <Animated.View style={chevronAnimatedStyle}>
                <ChevronRight size={18} color={colors.textTertiary} />
              </Animated.View>
            </TouchableOpacity>

            {progressExpanded && (
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
                <Text style={[styles.progressFootnote, { color: colors.textTertiary }]}>
                  Reflete o teu padrão de treino — não sabe nada sobre sono, alimentação ou recuperação.
                </Text>
              </Animated.View>
            )}
          </Card>
        )}

        {/* Training tips — rule-based insights from recent history, not a
            network/AI call (the app is fully offline). */}
        {tips.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DICAS DE TREINO</Text>
            {tips.map((tip, i) => {
              const Icon = TIP_ICON[tip.type];
              const tint = tip.type === 'warning' ? colors.warning : tip.type === 'positive' ? colors.success : colors.primary;
              return (
                <Card key={i} style={[styles.tipCard, { borderLeftWidth: 3, borderLeftColor: tint }]}>
                  <View style={styles.tipHeader}>
                    <Icon size={16} color={tint} />
                    <Text style={[styles.tipTitle, { color: colors.text }]}>{tip.title}</Text>
                  </View>
                  <Text style={[styles.tipDetail, { color: colors.textSecondary }]}>{tip.detail}</Text>
                </Card>
              );
            })}
          </View>
        )}

        {/* Recent history */}
        {recentSessions.length > 0 && (
          <View style={{ gap: 8 }}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ÚLTIMOS TREINOS</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/history')} accessibilityRole="button" accessibilityLabel="Ver histórico completo">
                <View style={styles.seeAllRow}>
                  <Text style={[styles.seeAllText, { color: colors.primary }]}>Ver tudo</Text>
                  <ChevronRight size={14} color={colors.primary} />
                </View>
              </TouchableOpacity>
            </View>
            {recentSessions.map((session, index) => (
              <Animated.View key={session.id} entering={FadeInDown.delay(index * 60).duration(300)}>
                <TouchableOpacity
                  style={[styles.sessionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => router.push({ pathname: '/workout/summary', params: { sessionId: session.id } })}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sessionName, { color: colors.text }]} numberOfLines={1}>{session.name}</Text>
                    <Text style={[styles.sessionDate, { color: colors.textTertiary }]}>{formatDateTime(session.started_at)}</Text>
                  </View>
                  <View style={styles.sessionStats}>
                    <Text style={[styles.sessionStat, { color: colors.textSecondary }]}>⏱ {formatTime(session.total_duration)}</Text>
                    <Text style={[styles.sessionStat, { color: colors.textSecondary }]}>{formatVolume(session.total_volume)}</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        )}

        {/* Most trained exercises */}
        {topExercises.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>MAIS TREINADOS (60 DIAS)</Text>
            <Card style={{ gap: 2 }}>
              {topExercises.map((ex, i) => {
                const maxCount = topExercises[0].set_count || 1;
                return (
                  <TouchableOpacity
                    key={ex.exercise_id}
                    style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                    onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.exercise_id } })}
                    activeOpacity={0.7}
                  >
                    <ExerciseTile muscle={ex.primary_muscle as MuscleGroup} equipment={ex.equipment as Equipment} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rankName, { color: colors.text }]} numberOfLines={1}>{ex.name}</Text>
                      <View style={[styles.rankBarTrack, { backgroundColor: colors.surfaceVariant }]}>
                        <View style={[styles.rankBarFill, { width: `${(ex.set_count / maxCount) * 100}%`, backgroundColor: muscleColor(ex.primary_muscle as MuscleGroup) }]} />
                      </View>
                    </View>
                    <Badge label={`${ex.set_count}×`} color={colors.surfaceVariant} textColor={colors.textSecondary} />
                  </TouchableOpacity>
                );
              })}
            </Card>
          </View>
        )}

        {/* Training consistency heatmap — the "did I show up" picture at a
            glance, in the same spirit as GitHub's contribution graph.
            Intensity is scaled to the person's OWN typical volume (see
            computeHeatmapIntensities), not a fixed number that wouldn't
            fit everyone's training style equally. */}
        {heatmapDays.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CONSISTÊNCIA (13 SEMANAS)</Text>
            <Card style={{ alignItems: 'center' }}>
              <TrainingHeatmap days={heatmapDays} />
            </Card>
          </View>
        )}

        {/* Muscle group distribution — the "what do I train most" picture
            many other tracking apps show, built from the same per-muscle
            set counts already used elsewhere (Progress Index, Records tab)
            rather than a new query. */}
        {muscleDistribution.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DISTRIBUIÇÃO MUSCULAR (30 DIAS)</Text>
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

        {/* Most used plans */}
        {topPlans.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PLANOS MAIS USADOS</Text>
            <Card style={{ gap: 2 }}>
              {topPlans.map((p, i) => (
                <TouchableOpacity
                  key={p.plan_id}
                  style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                  onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p.plan_id } })}
                  activeOpacity={0.7}
                >
                  <View style={[styles.planIcon, { backgroundColor: colors.primaryContainer }]}>
                    <ListChecks size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rankName, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
                  </View>
                  <Badge label={`${p.session_count}× feito`} color={colors.surfaceVariant} textColor={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </Card>
          </View>
        )}

        {/* Repeat last workout shortcut, when there's history but nothing
            urgent to show above (keeps the screen useful even once tips run
            dry). */}
        {recentSessions.length > 0 && (
          <TouchableOpacity
            style={[styles.repeatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push({
              pathname: '/workout/active',
              params: { planId: 0, planName: recentSessions[0].name, repeatSessionId: String(recentSessions[0].id) },
            })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Repetir o último treino"
          >
            <View style={[styles.repeatIcon, { backgroundColor: colors.secondaryContainer }]}>
              <Repeat size={20} color={colors.secondary} />
            </View>
            <Text style={[styles.repeatText, { color: colors.text }]}>Repetir último treino</Text>
            <Play size={20} color={colors.secondary} />
          </TouchableOpacity>
        )}
        </>)}
      </ScrollView>

      {/* Achievement celebration — only for genuinely NEW unlocks since last
          time (see getNewlyUnlocked), never re-shown for ones already seen. */}
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

      {/* Body Metrics Input Modal */}
      <BodyMetricsInput
        visible={bodyMetricsModalVisible}
        onClose={() => setBodyMetricsModalVisible(false)}
        onSave={() => {
          loadDashboard();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Inter-ExtraBold', fontSize: 28 },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  progTabs: { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1 },
  progTab: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  progTabLabel: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
  smartCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 16, gap: 14, borderWidth: 1 },
  smartTitle: { fontFamily: 'Inter-Bold', fontSize: 17 },
  smartDesc: { fontFamily: 'Inter-Regular', fontSize: 13, marginTop: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  linkIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  linkDesc: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  quoteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, padding: 14 },
  recapBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  recapBannerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  recapBannerText: { flex: 1, fontFamily: 'Inter-Bold', fontSize: 15 },
  recapBannerSub: { fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 2 },
  achievementOverlay: { flex: 1, backgroundColor: '#000000aa', alignItems: 'center', justifyContent: 'center', padding: 32 },
  achievementCard: { width: '100%', borderRadius: 20, padding: 28, alignItems: 'center', gap: 8 },
  achievementIconRing: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  achievementUnlockedLabel: { fontFamily: 'Inter-Bold', fontSize: 12, letterSpacing: 1.5 },
  achievementTitle: { fontFamily: 'Inter-Bold', fontSize: 20, textAlign: 'center' },
  achievementDesc: { fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  quoteText: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 14, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14 },
  statIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontFamily: 'Inter-Black', fontSize: 26 },
  statLabel: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16 },
  weightCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginVertical: 8 },
  weightLabel: { fontFamily: 'Inter-Regular', fontSize: 12 },
  weightValue: { fontFamily: 'Inter-Bold', fontSize: 28 },
  weightUnit: { fontFamily: 'Inter-Regular', fontSize: 14 },
  weightDelta: { fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 4 },
  weightIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
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
  progressFootnote: { fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 14, fontStyle: 'italic', marginTop: 4 },
  ctaBtnText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 15 },
  sectionTitle: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17 },
  tipCard: { gap: 4, paddingVertical: 12 },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14, flex: 1 },
  tipDetail: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 18 },
  sessionCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  sessionName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  sessionDate: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  sessionStats: { alignItems: 'flex-end', gap: 2 },
  sessionStat: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rankName: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  rankSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 1 },
  rankBarTrack: { height: 5, borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  rankBarFill: { height: 5, borderRadius: 3 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: '40%' },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: 'Inter-Regular', fontSize: 12, flexShrink: 1 },
  planIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  repeatCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  repeatIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  repeatText: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 15 },
});
