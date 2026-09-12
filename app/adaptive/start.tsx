/**
 * "Plano Adaptativo" wizard — turns on the NSPI periodization engine for a
 * plan (see NSPI_ENGINE.md §7, §9 N5). Same question-flow shape as
 * app/onboarding.tsx on purpose (goal → level → plan → week-start-day), but
 * ends in startAdaptivePlan() instead of just generating a plan.
 */

import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Sparkles } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { hapticSelect, hapticSuccess } from '@/utils/haptics';
import { getAllPlans, getPlanDays } from '@/db/planDao';
import { generatePlan, suggestedDaysPerWeek, type EquipmentPreference } from '@/utils/planGenerator';
import { startAdaptivePlan } from '@/utils/adaptiveService';
import type { AdaptiveGoal } from '@/utils/nspi';
import type { PlanType, WorkoutPlan } from '@/types';
import { WEEKDAY_LABELS } from '@/utils/reminders';

type Opt = { key: string; label: string; sub?: string };

const GOALS: (Opt & { goal: AdaptiveGoal; planType: PlanType })[] = [
  { key: 'bulking', label: 'Ganhar músculo', sub: 'Mais volume de treino', goal: 'bulking', planType: 'hypertrophy' },
  { key: 'strength', label: 'Ficar mais forte', sub: 'Mais carga, menos reps', goal: 'strength', planType: 'strength' },
  { key: 'cutting', label: 'Perder gordura', sub: 'Volume + carga, atento à fadiga', goal: 'cutting', planType: 'hypertrophy' },
  { key: 'general', label: 'Manter / geral', sub: 'Equilíbrio entre tudo', goal: 'general', planType: 'hypertrophy' },
];
const LEVELS: Opt[] = [
  { key: 'beginner', label: 'Iniciante' },
  { key: 'intermediate', label: 'Intermédio' },
  { key: 'advanced', label: 'Avançado' },
];
const DAYS: Opt[] = [2, 3, 4, 5, 6].map(d => ({ key: String(d), label: `${d} dias/semana` }));
const LOCATIONS: (Opt & { equip: EquipmentPreference })[] = [
  { key: 'biggym', label: 'Ginásio grande', equip: 'any' },
  { key: 'smallgym', label: 'Ginásio pequeno', equip: 'any' },
  { key: 'home', label: 'Casa', equip: 'free_weights' },
];
const MINUTES: Opt[] = [30, 45, 60, 75].map(m => ({ key: String(m), label: `${m} min` }));

type Step = 'goal' | 'level' | 'plan' | 'newplan_days' | 'newplan_where' | 'newplan_minutes' | 'suggest_days' | 'weekday' | 'confirm';

export default function AdaptiveStartScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();

  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('goal');
  const [history, setHistory] = useState<Step[]>([]);

  const [goalKey, setGoalKey] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [planId, setPlanId] = useState<number | null>(null);
  // planId alone can't tell "haven't chosen yet" apart from "chose Criar
  // plano novo" — both leave planId null. Without this, tapping "Criar
  // plano novo" while existing plans are present never shows as selected
  // and Continuar stays permanently disabled (see the plan step's value
  // computation below) — a dead end the wizard's own "new" option could
  // never actually complete.
  const [planStepTouched, setPlanStepTouched] = useState(false);
  const [days, setDays] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<string | null>(null);
  const [weekStartDow, setWeekStartDow] = useState(1); // Monday default

  useFocusEffect(useCallback(() => {
    if (!isReady) return;
    let mounted = true;
    setLoadingPlans(true);
    getAllPlans().then(p => { if (mounted) setPlans(p); }).catch(() => { if (mounted) setPlans([]); }).finally(() => { if (mounted) setLoadingPlans(false); });
    return () => { mounted = false; };
  }, [isReady]));

  const goTo = (next: Step) => { hapticSelect(); setHistory(h => [...h, step]); setStep(next); };
  const back = () => {
    hapticSelect();
    if (history.length === 0) { router.back(); return; }
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setStep(prev);
  };

  const goalDef = GOALS.find(g => g.key === goalKey);

  const afterPlanChoice = () => {
    if (planId !== null) { goTo('weekday'); return; }
    goTo('newplan_days');
  };

  /**
   * Once both days/week and minutes/session are known for a NEW plan,
   * checks whether that combination leaves any of the split's days too
   * short to cover their own muscle groups (see planGenerator's
   * suggestedDaysPerWeek) — if so, offers to bump days/week up before
   * moving on, instead of silently generating a thin session.
   */
  const afterMinutesChoice = () => {
    const suggestion = suggestedDaysPerWeek(Number(days), Number(minutes));
    if (suggestion !== null) { goTo('suggest_days'); return; }
    goTo('weekday');
  };

  const finish = async () => {
    if (!goalDef || !level) return;
    hapticSuccess();
    setBuilding(true);
    setError(null);
    try {
      let finalPlanId = planId;
      if (finalPlanId === null) {
        const locDef = LOCATIONS.find(l => l.key === location);
        finalPlanId = await generatePlan(Number(days), Number(minutes), goalDef.planType, {
          equipmentPref: locDef?.equip ?? 'any',
          customName: 'Plano Adaptativo',
          ignoreUsageHistory: true,
        });
      }
      const planDays = await getPlanDays(finalPlanId);
      const daysPerWeek = Number(days) || Math.max(1, planDays.length);

      await startAdaptivePlan({
        planId: finalPlanId,
        goal: goalDef.goal,
        experience: level,
        daysPerWeek,
        sessionMinutes: Number(minutes) || 45,
        equipmentPref: LOCATIONS.find(l => l.key === location)?.equip ?? 'any',
        weekStartDow,
      });

      router.replace('/adaptive/plan');
    } catch (err) {
      console.error('[adaptive] startAdaptivePlan failed:', err);
      setError('Não foi possível ligar o plano adaptativo. Tenta novamente.');
      setBuilding(false);
    }
  };

  const Question = ({ title, options, value, onSelect, onContinue }: {
    title: string; options: Opt[]; value: string | null;
    onSelect: (k: string) => void; onContinue: () => void;
  }) => (
    <>
      <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <View style={{ gap: 12, marginTop: 20 }}>
          {options.map(opt => {
            const selected = value === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => onSelect(opt.key)}
                activeOpacity={0.8}
                style={[styles.optCard, { backgroundColor: selected ? colors.primaryContainer : colors.surfaceVariant }]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.optTitle, { color: selected ? colors.text : colors.textSecondary }]}>{opt.label}</Text>
                {opt.sub && <Text style={[styles.optSub, { color: colors.textSecondary }]}>{opt.sub}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: value ? colors.primary : colors.surfaceVariant }]}
          onPress={onContinue}
          disabled={!value}
        >
          <Text style={[styles.primaryBtnText, { color: value ? '#fff' : colors.textTertiary }]}>Continuar</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  let body: React.ReactNode = null;

  if (building) {
    body = (
      <View style={[styles.center, { flex: 1 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.body, { color: colors.textSecondary, marginTop: 16, textAlign: 'center', paddingHorizontal: 32 }]}>
          A montar o teu ciclo adaptativo…
        </Text>
        {error && <Text style={{ color: colors.error, marginTop: 12, textAlign: 'center', paddingHorizontal: 32 }}>{error}</Text>}
      </View>
    );
  } else if (step === 'goal') {
    body = (
      <Question title="Qual é o teu objetivo?" options={GOALS} value={goalKey}
        onSelect={setGoalKey} onContinue={() => goTo('level')} />
    );
  } else if (step === 'level') {
    body = (
      <Question title="Qual é o teu nível?" options={LEVELS} value={level}
        onSelect={setLevel} onContinue={() => goTo('plan')} />
    );
  } else if (step === 'plan') {
    const planOpts: Opt[] = [
      ...plans.map(p => ({ key: String(p.id), label: p.name, sub: 'Aplicar periodização a este plano' })),
      { key: 'new', label: 'Criar plano novo', sub: 'Gerado à tua medida' },
    ];
    body = loadingPlans ? (
      <View style={[styles.center, { flex: 1 }]}><ActivityIndicator color={colors.primary} /></View>
    ) : (
      <Question
        title="A que plano aplicamos a periodização?"
        options={planOpts}
        value={planId !== null ? String(planId) : (planStepTouched || planOpts.length === 1 ? 'new' : null)}
        onSelect={(k) => { setPlanStepTouched(true); setPlanId(k === 'new' ? null : Number(k)); }}
        onContinue={afterPlanChoice}
      />
    );
  } else if (step === 'newplan_days') {
    body = <Question title="Quantos dias por semana treinas?" options={DAYS} value={days} onSelect={setDays} onContinue={() => goTo('newplan_where')} />;
  } else if (step === 'newplan_where') {
    body = <Question title="Onde treinas?" options={LOCATIONS} value={location} onSelect={setLocation} onContinue={() => goTo('newplan_minutes')} />;
  } else if (step === 'newplan_minutes') {
    body = <Question title="Quanto tempo por sessão?" options={MINUTES} value={minutes} onSelect={setMinutes} onContinue={afterMinutesChoice} />;
  } else if (step === 'suggest_days') {
    const suggestion = suggestedDaysPerWeek(Number(days), Number(minutes));
    if (suggestion === null) {
      // Shouldn't happen (this step is only reached right after
      // afterMinutesChoice confirmed a suggestion exists), but fail safe
      // with a plain continue rather than calling goTo() mid-render.
      body = (
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => goTo('weekday')}>
            <Text style={styles.primaryBtnText}>Continuar</Text>
          </TouchableOpacity>
        </View>
      );
    } else {
      body = (
        <>
          <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: colors.text }]}>Talvez precises de mais dias</Text>
            <Text style={[styles.body, { color: colors.textSecondary, marginTop: 12 }]}>
              Com {days} dia{days === '1' ? '' : 's'}/semana e {minutes} min por sessão, alguns
              grupos musculares desse treino podem ficar sem exercício suficiente — não há tempo
              para cobrir tudo o que esse dia precisa.{'\n\n'}
              Com {suggestion} dias/semana, cada sessão cobre menos grupos musculares e {minutes} min chegam bem.
            </Text>
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => { hapticSelect(); setDays(String(suggestion)); goTo('weekday'); }}
            >
              <Text style={styles.primaryBtnText}>Aumentar para {suggestion} dias</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={() => goTo('weekday')}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Manter {days} dias</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }
  } else if (step === 'weekday') {
    body = (
      <>
        <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: colors.text }]}>Que dia começa a tua semana de treino?</Text>
          <Text style={[styles.body, { color: colors.textSecondary, marginTop: 8 }]}>
            É quando o motor revê a semana e ajusta a próxima.
          </Text>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, idx) => {
              const selected = weekStartDow === idx;
              return (
                <TouchableOpacity
                  key={idx}
                  onPress={() => { hapticSelect(); setWeekStartDow(idx); }}
                  style={[styles.weekdayPill, { backgroundColor: selected ? colors.primary : colors.surfaceVariant }]}
                >
                  <Text style={[styles.weekdayPillText, { color: selected ? '#fff' : colors.textSecondary }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => goTo('confirm')}>
            <Text style={styles.primaryBtnText}>Continuar</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  } else if (step === 'confirm') {
    const planLabel = planId !== null ? plans.find(p => p.id === planId)?.name : 'um plano novo';
    body = (
      <>
        <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.iconRing, { backgroundColor: colors.primaryContainer }]}>
            <Sparkles size={40} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Pronto para ligar</Text>
          <Text style={[styles.body, { color: colors.textSecondary, marginTop: 12 }]}>
            Objetivo: {goalDef?.label}{'\n'}
            Plano: {planLabel}{'\n'}
            Começamos numa semana de Adaptação (reps altas, cargas leves) e ajustamos a fase
            todas as semanas consoante o que registares.
          </Text>
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={finish}>
            <Text style={styles.primaryBtnText}>Ligar Plano Adaptativo</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      {!building && (
        <View style={styles.topRow}>
          <TouchableOpacity onPress={back} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textSecondary }]}>Plano Adaptativo</Text>
          <View style={{ width: 24 }} />
        </View>
      )}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  qContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  title: { fontFamily: 'Inter-ExtraBold', fontSize: 26, lineHeight: 32 },
  body: { fontFamily: 'Inter-Regular', fontSize: 15, lineHeight: 22 },
  iconRing: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  optCard: { borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, gap: 4 },
  optTitle: { fontFamily: 'Inter-Bold', fontSize: 16 },
  optSub: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 18 },
  footer: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8 },
  primaryBtn: { height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 17 },
  secondaryBtn: { height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, marginTop: 10 },
  secondaryBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  weekdayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24 },
  weekdayPill: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  weekdayPillText: { fontFamily: 'Inter-Bold', fontSize: 14 },
});
