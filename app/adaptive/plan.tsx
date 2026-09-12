/**
 * Plan overview — "here is your whole adaptive program", not a list of
 * exercises. Shown right after turning the engine on (see
 * app/adaptive/start.tsx's finish()) and reachable anytime from the
 * "Plano Adaptativo" entry card. Distinct from app/adaptive/recap.tsx,
 * which stays the ongoing "what changed this week" screen — this one
 * explains the program as a whole, once, so the person understands the
 * shape of what they just turned on.
 */

import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import { ArrowLeft, Sparkles, RefreshCw, Compass, Lock, ChevronRight, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAdaptiveStatus } from '@/hooks/useAdaptiveStatus';
import { getAdaptivePlanById, getAllWeeksForPlan, deleteAdaptivePlanData, type AdaptiveWeekWithCycle } from '@/db/adaptiveDao';
import { clearPlannerForPlan } from '@/db/plannerDao';
import { PHASE_ORDER, PHASE_LABEL_PT, PHASE_COLOR, CYCLE_RATIONALE_PT, phaseSpec } from '@/utils/adaptivePlan';
import type { AdaptivePhase, AdaptiveGoal, AdaptiveExperience } from '@/utils/nspi';
import { Card } from '@/components/ui/Card';

const GOAL_LABEL_PT: Record<AdaptiveGoal, string> = {
  bulking: 'Ganhar músculo',
  strength: 'Ficar mais forte',
  cutting: 'Perder gordura',
  general: 'Manter / geral',
};

/** Out of 5 — a relative indicator, not a literal count of anything. */
const EXPERIENCE_BARS: Record<AdaptiveExperience, number> = { beginner: 2, intermediate: 3, advanced: 5 };

interface ChartPoint { x: number; y: number; real: boolean; phase: AdaptivePhase; cycleIndex: number }

export default function AdaptivePlanScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { status, loaded } = useAdaptiveStatus();

  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [weeks, setWeeks] = useState<AdaptiveWeekWithCycle[]>([]);
  const [creatingNew, setCreatingNew] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!status) return;
    let mounted = true;
    Promise.all([
      getAdaptivePlanById(status.adaptivePlanId),
      getAllWeeksForPlan(status.adaptivePlanId),
    ]).then(([plan, w]) => {
      if (!mounted) return;
      if (plan) setDaysPerWeek(plan.days_per_week);
      setWeeks(w);
    }).catch(() => {});
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.adaptivePlanId, status?.weekIndex, status?.cycleIndex]));

  const currentCycleWeeks = useMemo(
    () => (status ? weeks.filter(w => w.cycle_index === status.cycleIndex) : []),
    [weeks, status],
  );

  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (!status) return [];
    const prevCycleWeeks = status.cycleIndex > 1 ? weeks.filter(w => w.cycle_index === status.cycleIndex - 1) : [];
    const points: ChartPoint[] = [];
    let x = 0;
    const pushReal = (w: AdaptiveWeekWithCycle) => {
      const isCurrent = status.phase === w.phase && status.weekIndex === w.week_index && w.cycle_index === status.cycleIndex;
      const score = w.status === 'done' ? (w.nspi_score ?? 50) : (isCurrent ? (status.latestNspi?.score ?? 50) : 50);
      points.push({ x: x++, y: score, real: true, phase: w.phase, cycleIndex: w.cycle_index });
    };
    prevCycleWeeks.forEach(pushReal);
    currentCycleWeeks.forEach(pushReal);

    // Illustrative continuation, never a forecast: the remaining phases of
    // this cycle, then one more full cycle, standing in each phase's own
    // intensityPct (the real number the engine assigns that phase) as a
    // shape for "expected relative demand". Each future cycle nudges the
    // curve up a little — illustrating that closeWeekIfDue really does
    // raise the baseline after a deload — but the exact bump is a visual
    // choice, not a measured prediction, which is why it's never labelled
    // with a number on screen.
    const reached = new Set(currentCycleWeeks.map(w => w.phase));
    const remaining = PHASE_ORDER.filter(p => !reached.has(p));
    const illustrate = (phase: AdaptivePhase, cycleIndex: number) => {
      const pct = phaseSpec(phase, status.goal, status.experience).intensityPct;
      const bump = Math.max(0, cycleIndex - status.cycleIndex) * 6;
      points.push({ x: x++, y: Math.min(96, pct * 100 + bump), real: false, phase, cycleIndex });
    };
    remaining.forEach(p => illustrate(p, status.cycleIndex));
    PHASE_ORDER.forEach(p => illustrate(p, status.cycleIndex + 1));
    return points;
  }, [status, weeks, currentCycleWeeks]);

  const phaseBars = useMemo(() => {
    const goal = status?.goal ?? 'general';
    const experience = status?.experience ?? 'intermediate';
    const specs = PHASE_ORDER.map(p => ({ phase: p, pct: phaseSpec(p, goal, experience).intensityPct }));
    const max = Math.max(...specs.map(s => s.pct));
    return specs.map(s => ({ ...s, ratio: s.pct / max }));
  }, [status]);

  if (!loaded) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.center, { flex: 1 }]}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!status) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ width: 24 }} />
        </View>
        <View style={[styles.center, { flex: 1, paddingHorizontal: 32 }]}>
          <Sparkles size={40} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 16 }]}>Sem plano adaptativo ativo</Text>
        </View>
      </SafeAreaView>
    );
  }

  const remainingPhases = PHASE_ORDER.filter(p => !currentCycleWeeks.some(w => w.phase === p));

  /**
   * There was no way back into app/adaptive/start.tsx once a plan had ever
   * been created — the entry card on app/(tabs)/start.tsx always routes an
   * existing/paused plan back to viewing it, never to the wizard again (see
   * that screen's adaptiveStatus/hasAdaptivePlanEver branching). This clears
   * this plan's own progression state (cycles/weeks/exercise state — not the
   * underlying exercises themselves) via deleteAdaptivePlanData, previously
   * written but never called anywhere, then drops straight into the
   * generation wizard, matching startAdaptivePlan's own
   * deactivateAllAdaptivePlans() behavior for what "starting over" means.
   */
  const createNewPlan = () => {
    if (!status) return;
    Alert.alert(
      'Criar plano novo?',
      'Isto apaga o progresso do plano adaptativo atual (ciclos e semanas registadas). Os treinos já registados no histórico não são afetados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Criar novo',
          style: 'destructive',
          onPress: async () => {
            setCreatingNew(true);
            try {
              await deleteAdaptivePlanData(status.adaptivePlanId);
              // BUGFIX: startAdaptivePlan's own stale-slot cleanup looks up
              // "the previous active adaptive plan" to know which weekday
              // slots to clear — but deleteAdaptivePlanData just deleted
              // that row, so it finds nothing, and this plan's old weekday
              // assignments linger in the planner forever. Clear them here,
              // while the plan_id is still known.
              await clearPlannerForPlan(status.planId);
              router.replace('/adaptive/start');
            } catch (err) {
              console.error('[adaptive] deleteAdaptivePlanData failed:', err);
              setCreatingNew(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={[styles.hero, { backgroundColor: colors.accent }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.heroBack} accessibilityRole="button" accessibilityLabel="Voltar">
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.eliteBadge}><Text style={styles.eliteBadgeText}>PLANO ADAPTATIVO</Text></View>
          <Text style={styles.heroTitle}>O teu ciclo de treino</Text>
          <Text style={styles.heroSub}>
            Constrói, força, atinge o pico e recupera — cada ronda mais exigente, cada semana
            ajustada ao que registares.
          </Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryValue} numberOfLines={1}>{GOAL_LABEL_PT[status.goal]}</Text>
              <Text style={styles.summaryLabel}>Objetivo</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <View style={styles.expBars}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <View key={i} style={[styles.expBar, { opacity: i < EXPERIENCE_BARS[status.experience] ? 1 : 0.3 }]} />
                ))}
              </View>
              <Text style={styles.summaryLabel}>Experiência</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text style={styles.summaryValue}>{status.cycleIndex}</Text>
              <Text style={styles.summaryLabel}>Ciclo atual</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <Card>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Progressão do treino</Text>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>Real</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.surface, borderColor: colors.textTertiary, borderWidth: 1.5 }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>Projeção</Text>
              </View>
            </View>
            <Chart points={chartPoints} colors={colors} />
            <Text style={[styles.body, { color: colors.textSecondary, marginTop: 8 }]}>
              A intensidade sobe e desce de propósito dentro de cada ciclo — o plano força, depois
              recupera. Cada ciclo novo arranca de um patamar mais alto que o anterior.
            </Text>
          </Card>

          <Card>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Quatro fases, um objetivo cada</Text>
            <Text style={[styles.body, { color: colors.textSecondary, marginTop: 4, marginBottom: 16 }]}>{CYCLE_RATIONALE_PT}</Text>
            <View style={styles.barsRow}>
              {phaseBars.map(({ phase, ratio }) => (
                <View key={phase} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: `${Math.max(8, ratio * 100)}%`, backgroundColor: PHASE_COLOR[phase] }]} />
                  </View>
                  <Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>{PHASE_LABEL_PT[phase]}</Text>
                </View>
              ))}
            </View>
          </Card>

          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>CICLO {status.cycleIndex}</Text>

          {currentCycleWeeks.map(w => (
            <WeekCard
              key={w.id}
              weekIndex={w.week_index}
              phase={w.phase}
              isBridge={!!w.is_bridge}
              isCurrent={w.status === 'active'}
              isFirstEver={w.cycle_index === 1 && w.week_index === 1}
              daysPerWeek={daysPerWeek}
              filledDays={w.status === 'done' ? daysPerWeek : (w.status === 'active' ? Math.min(daysPerWeek, Math.max(0, Math.round((Date.now() / 1000 - w.week_start) / ((w.week_end - w.week_start) / daysPerWeek)))) : 0)}
              goal={status.goal}
              experience={status.experience}
              colors={colors}
            />
          ))}
          {remainingPhases.map((phase, i) => (
            <WeekCard
              key={phase}
              weekIndex={currentCycleWeeks.length + i + 1}
              phase={phase}
              isBridge={false}
              isCurrent={false}
              isFirstEver={false}
              daysPerWeek={daysPerWeek}
              filledDays={0}
              goal={status.goal}
              experience={status.experience}
              colors={colors}
              preview
            />
          ))}

          <TouchableOpacity onPress={() => router.push('/adaptive/recap')} activeOpacity={0.8}>
            <Card style={styles.lockedCard}>
              <View style={[styles.lockIcon, { backgroundColor: colors.surfaceVariant }]}>
                <Lock size={18} color={colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Ciclo {status.cycleIndex + 1}</Text>
                <Text style={[styles.body, { color: colors.textSecondary, marginTop: 2 }]}>
                  As mesmas quatro fases, ponto de partida mais alto — metas definidas a partir do
                  teu pico neste ciclo.
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textTertiary} />
            </Card>
          </TouchableOpacity>

          <View style={{ gap: 10, marginTop: 4 }}>
            <BenefitRow icon={RefreshCw} colors={colors} text="O plano reconfigura-se sempre que precisares — muda de dias, equipamento ou plano base sem perder o ciclo." />
            <BenefitRow icon={Compass} colors={colors} text="As fases estão estruturadas para saberes quando forçar e quando recuperar — nunca as duas ao mesmo tempo." />
            <BenefitRow icon={Sparkles} colors={colors} text="Pesos, repetições e exercícios ajustam-se sozinhos ao que registares — não precisas de decidir nada à mão." />
          </View>

          <TouchableOpacity
            style={styles.newPlanLink}
            onPress={createNewPlan}
            disabled={creatingNew}
            accessibilityRole="button"
            accessibilityLabel="Criar plano novo"
          >
            {creatingNew
              ? <ActivityIndicator size="small" color={colors.error} />
              : <Trash2 size={16} color={colors.error} />}
            <Text style={[styles.newPlanLinkText, { color: colors.error }]}>Criar plano novo</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.navigate('/(tabs)/start')}>
          <Text style={styles.primaryBtnText}>Começar a treinar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Chart({ points, colors }: { points: ChartPoint[]; colors: any }) {
  if (points.length < 2) return null;
  const W = 320;
  const H = 120;
  const padX = 8;
  const padY = 14;
  const n = points.length;
  const xStep = (W - padX * 2) / (n - 1);
  const yFor = (v: number) => H - padY - (Math.max(0, Math.min(100, v)) / 100) * (H - padY * 2);
  const xFor = (i: number) => padX + i * xStep;

  let splitIdx = 0;
  points.forEach((p, i) => { if (p.real) splitIdx = i; });

  const toPath = (from: number, to: number) => {
    let d = '';
    for (let i = from; i <= to; i++) d += (i === from ? 'M' : 'L') + xFor(i) + ',' + yFor(points[i].y);
    return d;
  };
  const solidD = toPath(0, splitIdx);
  const dashedD = splitIdx < n - 1 ? toPath(splitIdx, n - 1) : '';
  const areaD = `${solidD} L${xFor(splitIdx)},${H - padY} L${xFor(0)},${H - padY} Z`;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Path d={areaD} fill={colors.primary} fillOpacity={0.12} stroke="none" />
      <Path d={solidD} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {dashedD !== '' && (
        <Path d={dashedD} fill="none" stroke={colors.textTertiary} strokeWidth={2} strokeDasharray="5,5" strokeLinecap="round" />
      )}
      {splitIdx < n - 1 && (
        <Line x1={xFor(splitIdx)} y1={padY} x2={xFor(splitIdx)} y2={H - padY} stroke={colors.border} strokeWidth={1} strokeDasharray="3,3" />
      )}
      {points.map((p, i) => (
        <Circle
          key={i}
          cx={xFor(i)}
          cy={yFor(p.y)}
          r={i === splitIdx ? 4.5 : 3}
          fill={p.real ? PHASE_COLOR[p.phase] : colors.surface}
          stroke={PHASE_COLOR[p.phase]}
          strokeWidth={1.5}
        />
      ))}
    </Svg>
  );
}

function WeekCard({
  weekIndex, phase, isBridge, isCurrent, isFirstEver, daysPerWeek, filledDays, goal, experience, colors, preview,
}: {
  weekIndex: number; phase: AdaptivePhase; isBridge: boolean; isCurrent: boolean; isFirstEver: boolean;
  daysPerWeek: number; filledDays: number; goal: AdaptiveGoal; experience: AdaptiveExperience; colors: any; preview?: boolean;
}) {
  const spec = phaseSpec(phase, goal, experience);
  return (
    <Card style={preview ? { opacity: 0.6 } : undefined}>
      <View style={styles.weekRow}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Semana {weekIndex}</Text>
        <View style={[styles.phasePill, { backgroundColor: PHASE_COLOR[phase] + '22' }]}>
          <Text style={[styles.phasePillText, { color: PHASE_COLOR[phase] }]}>
            {PHASE_LABEL_PT[phase]}{isBridge ? ' · consolidação' : ''}
          </Text>
        </View>
      </View>
      <Text style={[styles.body, { color: colors.textSecondary, marginTop: 6 }]}>{spec.expect}</Text>
      {isFirstEver && (
        <Text style={[styles.body, { color: colors.primary, marginTop: 4 }]}>
          Volume calibrado a partir das tuas primeiras sessões.
        </Text>
      )}
      <View style={styles.dotsRow}>
        {Array.from({ length: daysPerWeek }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < filledDays
                ? { backgroundColor: PHASE_COLOR[phase] }
                : { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1.5, borderStyle: 'dashed' as const },
            ]}
          />
        ))}
      </View>
      {isCurrent && <Text style={[styles.currentTag, { color: colors.primary }]}>Semana atual</Text>}
    </Card>
  );
}

function BenefitRow({ icon: Icon, text, colors }: { icon: any; text: string; colors: any }) {
  return (
    <View style={styles.benefitRow}>
      <View style={[styles.benefitIcon, { backgroundColor: colors.primaryContainer }]}>
        <Icon size={18} color={colors.primary} />
      </View>
      <Text style={[styles.body, { color: colors.textSecondary, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'Inter-Bold', fontSize: 17 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  hero: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroBack: { marginBottom: 8 },
  eliteBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  eliteBadgeText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 11, letterSpacing: 0.5 },
  heroTitle: { color: '#fff', fontFamily: 'Inter-ExtraBold', fontSize: 26, marginBottom: 6 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20 },
  summaryRow: { flexDirection: 'row', marginTop: 20 },
  summaryCol: { flex: 1, alignItems: 'center', gap: 4 },
  summaryDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.3)' },
  summaryValue: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 15 },
  summaryLabel: { color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter-Regular', fontSize: 11 },
  expBars: { flexDirection: 'row', gap: 3, height: 15, alignItems: 'flex-end' },
  expBar: { width: 5, height: 15, borderRadius: 2, backgroundColor: '#fff' },
  content: { paddingHorizontal: 12, paddingTop: 16, gap: 12 },
  cardTitle: { fontFamily: 'Inter-Bold', fontSize: 15 },
  body: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19 },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 4, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: 'Inter-Regular', fontSize: 12 },
  barsRow: { flexDirection: 'row', gap: 10, height: 90, alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' },
  barTrack: { width: '100%', flex: 1, justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 6 },
  barLabel: { fontFamily: 'Inter-SemiBold', fontSize: 10, textAlign: 'center' },
  sectionHeading: { fontFamily: 'Inter-Bold', fontSize: 12, letterSpacing: 0.5, paddingHorizontal: 8, marginTop: 4 },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phasePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  phasePillText: { fontFamily: 'Inter-Bold', fontSize: 11 },
  dotsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  currentTag: { fontFamily: 'Inter-Bold', fontSize: 11, marginTop: 10 },
  lockedCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lockIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 4 },
  benefitIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  newPlanLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, paddingVertical: 10 },
  newPlanLinkText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth },
  primaryBtn: { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 16 },
});
