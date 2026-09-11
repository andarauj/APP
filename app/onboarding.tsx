import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { setSetting } from '@/db/settingsDao';
import { hapticSelect, hapticSuccess } from '@/utils/haptics';
import { generatePlan, type EquipmentPreference } from '@/utils/planGenerator';
import type { PlanType } from '@/types';
import { ArrowLeft, Dumbbell } from 'lucide-react-native';

// Goal-based onboarding: a short welcome, then a few questions whose
// answers seed a starter plan and the adaptive engine.
type Opt = { key: string; label: string; sub?: string };

const GOALS: (Opt & { planType: PlanType })[] = [
  { key: 'muscle', label: 'Ganhar músculo', sub: 'Aumentar massa e tamanho', planType: 'hypertrophy' },
  { key: 'strength', label: 'Ficar mais forte', sub: 'Levantar mais peso', planType: 'strength' },
  { key: 'fatloss', label: 'Perder gordura', sub: 'Reduzir gordura mantendo músculo', planType: 'hypertrophy' },
  { key: 'maintain', label: 'Manter', sub: 'Manter a forma atual', planType: 'hypertrophy' },
];
const LEVELS: Opt[] = [
  { key: 'beginner', label: 'Iniciante', sub: 'Treino ocasional, sei o básico' },
  { key: 'intermediate', label: 'Intermédio', sub: 'Treino com regularidade' },
  { key: 'advanced', label: 'Avançado', sub: 'Plano estruturado, treino intenso' },
];
const DAYS: Opt[] = [2, 3, 4, 5, 6].map(d => ({ key: String(d), label: `${d} dias`, sub: d <= 3 ? 'por semana' : undefined }));
const LOCATIONS: (Opt & { equip: EquipmentPreference })[] = [
  { key: 'biggym', label: 'Ginásio grande', sub: 'Barras, racks, halteres, máquinas', equip: 'any' },
  { key: 'smallgym', label: 'Ginásio pequeno', sub: 'Halteres, cabos, máquinas básicas', equip: 'any' },
  { key: 'home', label: 'Casa', sub: 'Halteres, peso do corpo, barra de elevações', equip: 'free_weights' },
];
const MINUTES: Opt[] = [30, 45, 60, 75].map(m => ({ key: String(m), label: `${m} min`, sub: m === 45 ? 'ideal' : undefined }));

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [step, setStep] = useState(0); // 0 = welcome, 1..5 = questions
  const [goal, setGoal] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [days, setDays] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const TOTAL_QUESTIONS = 5;

  const questions = useMemo(() => ([
    { title: 'Qual é o teu objetivo?', options: GOALS, value: goal, set: setGoal },
    { title: 'Qual é o teu nível?', options: LEVELS, value: level, set: setLevel },
    { title: 'Quantos dias por semana treinas?', options: DAYS, value: days, set: setDays },
    { title: 'Onde treinas?', options: LOCATIONS, value: location, set: setLocation },
    { title: 'Quanto tempo por sessão?', options: MINUTES, value: minutes, set: setMinutes },
  ]), [goal, level, days, location, minutes]);

  const skip = async () => {
    await setSetting('onboardingComplete', '1').catch(() => {});
    router.replace('/(tabs)');
  };

  const finish = async () => {
    hapticSuccess();
    setBuilding(true);
    const goalDef = GOALS.find(g => g.key === goal);
    const locDef = LOCATIONS.find(l => l.key === location);
    try {
      await setSetting('onboardingComplete', '1');
      await setSetting('onboardingGoal', goal || '');
      await setSetting('onboardingLevel', level || '');
      await setSetting('onboardingDays', days || '');
      await setSetting('onboardingLocation', location || '');
      await setSetting('onboardingMinutes', minutes || '');
      if (goalDef && days && minutes) {
        await generatePlan(Number(days), Number(minutes), goalDef.planType, {
          equipmentPref: locDef?.equip ?? 'any',
          customName: 'O meu plano',
        });
      }
    } catch (err) {
      console.error('Onboarding finish failed:', err);
    }
    router.replace('/(tabs)');
  };

  const next = () => {
    hapticSelect();
    if (step < TOTAL_QUESTIONS) setStep(step + 1);
    else finish();
  };
  const back = () => { hapticSelect(); setStep(s => Math.max(0, s - 1)); };

  if (building) {
    return (
      <SafeAreaView style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.title, { color: colors.text, marginTop: 24, textAlign: 'center' }]}>
          A preparar o teu plano…
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary, textAlign: 'center' }]}>
          A escolher exercícios para {days} dias de {minutes} min.
        </Text>
      </SafeAreaView>
    );
  }

  if (step === 0) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.skip} onPress={skip} accessibilityRole="button" accessibilityLabel="Saltar">
          <Text style={{ color: colors.textTertiary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>Saltar</Text>
        </TouchableOpacity>
        <View style={[styles.center, { flex: 1, paddingHorizontal: 32 }]}>
          <Animated.View entering={FadeIn.duration(400)} style={[styles.iconRing, { backgroundColor: colors.primaryContainer }]}>
            <Dumbbell size={44} color={colors.primary} />
          </Animated.View>
          <Text style={[styles.title, { color: colors.text, textAlign: 'center' }]}>Bem-vindo à Changes</Text>
          <Text style={[styles.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 12 }]}>
            Cinco perguntas rápidas e montamos-te um plano de treino à tua medida.
          </Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => setStep(1)}>
            <Text style={styles.primaryBtnText}>Começar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const q = questions[step - 1];
  const canContinue = q.value !== null;
  const progress = step / (TOTAL_QUESTIONS + 1);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={back} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceVariant }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>{q.title}</Text>
        <View style={{ gap: 14, marginTop: 24 }}>
          {q.options.map((opt) => {
            const selected = q.value === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => { hapticSelect(); q.set(opt.key); }}
                activeOpacity={0.8}
                style={[
                  styles.optCard,
                  { backgroundColor: selected ? colors.primaryContainer : colors.surfaceVariant },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={opt.label}
              >
                <Text style={[styles.optTitle, { color: selected ? colors.text : colors.textSecondary }]}>{opt.label}</Text>
                {opt.sub && (
                  <Text style={[styles.optSub, { color: colors.textSecondary }]}>{opt.sub}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { flexDirection: 'row', gap: 12 }]}>
        <TouchableOpacity style={[styles.outlineBtn, { borderColor: colors.primary }]} onPress={back}>
          <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Voltar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, { flex: 1, backgroundColor: canContinue ? colors.primary : colors.surfaceVariant }]}
          onPress={next}
          disabled={!canContinue}
        >
          <Text style={[styles.primaryBtnText, { color: canContinue ? '#fff' : colors.textTertiary }]}>
            {step === TOTAL_QUESTIONS ? 'Concluir' : 'Continuar'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  skip: { position: 'absolute', top: 12, right: 20, zIndex: 10, padding: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  progressTrack: { flex: 1, height: 6, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 999 },
  qContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  title: { fontFamily: 'Inter-ExtraBold', fontSize: 28, lineHeight: 34 },
  body: { fontFamily: 'Inter-Regular', fontSize: 15, lineHeight: 22 },
  iconRing: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  optCard: { borderRadius: 16, paddingHorizontal: 20, paddingVertical: 18, gap: 4 },
  optTitle: { fontFamily: 'Inter-Bold', fontSize: 17 },
  optSub: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 19 },
  footer: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8, gap: 12 },
  primaryBtn: { height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 17 },
  outlineBtn: { height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, paddingHorizontal: 28 },
  outlineBtnText: { fontFamily: 'Inter-Bold', fontSize: 17 },
});
