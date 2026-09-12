import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ArrowLeft, Dumbbell, ChevronDown, ChevronUp, Check } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { setSetting } from '@/db/settingsDao';
import { hapticSelect, hapticSuccess } from '@/utils/haptics';
import { generatePlan, suggestedDaysPerWeek, type EquipmentPreference } from '@/utils/planGenerator';
import { startAdaptivePlan, goalFromOnboarding } from '@/utils/adaptiveService';
import type { PlanType, MuscleGroup, Equipment } from '@/types';
import { MUSCLE_GROUPS_PT, EQUIPMENT_PT } from '@/types';

/**
 * Goal-based onboarding: a short welcome, then a run of questions whose
 * answers seed a starter plan (utils/planGenerator.ts) AND immediately turn
 * on the NSPI adaptive engine (utils/adaptiveService.ts) on that same plan
 * — every answer here has to change either which exercises get picked
 * (focusAreas / allowedEquipment / excludedMuscles) or how the engine paces
 * them (goal / experience / daysPerWeek / sessionMinutes), never just sit
 * there decoratively.
 */
type Opt = { key: string; label: string; sub?: string };

const GOALS: (Opt & { planType: PlanType })[] = [
  { key: 'muscle', label: 'Ganhar músculo', sub: 'Aumentar massa e tamanho', planType: 'hypertrophy' },
  { key: 'strength', label: 'Ficar mais forte', sub: 'Levantar mais peso', planType: 'strength' },
  { key: 'fatloss', label: 'Perder gordura', sub: 'Reduzir gordura mantendo músculo', planType: 'hypertrophy' },
  { key: 'maintain', label: 'Manter', sub: 'Manter a forma atual', planType: 'hypertrophy' },
];
const LEVELS: Opt[] = [
  { key: 'beginner', label: 'Principiante', sub: 'Treino ocasionalmente e sei o básico' },
  { key: 'intermediate', label: 'Intermédio', sub: 'Treino com regularidade e conheço a maioria dos exercícios' },
  { key: 'advanced', label: 'Avançado', sub: 'Tenho um plano estruturado e treino com intensidade' },
];
const DAYS: Opt[] = [
  ...[1, 2, 3, 4, 5, 6].map(d => ({ key: String(d), label: `${d} dia${d > 1 ? 's' : ''}` })),
  // SPLIT_TEMPLATES has no distinct 7-day template — "Todos os dias" reuses
  // the 6-day split (the densest one the generator actually has) rather
  // than silently falling back to a 3-day plan nobody chose.
  { key: '6', label: 'Todos os dias', sub: 'repete o plano de 6 dias' },
];
const MINUTES: Opt[] = [30, 45, 60, 75].map(m => ({ key: String(m), label: `${m} min` }));

const TARGET_ZONES: { key: MuscleGroup; label: string }[] = [
  { key: 'abs', label: MUSCLE_GROUPS_PT.abs },
  { key: 'back', label: MUSCLE_GROUPS_PT.back },
  { key: 'biceps', label: MUSCLE_GROUPS_PT.biceps },
  { key: 'chest', label: MUSCLE_GROUPS_PT.chest },
  { key: 'forearms', label: MUSCLE_GROUPS_PT.forearms },
  { key: 'glutes', label: MUSCLE_GROUPS_PT.glutes },
  { key: 'calves', label: MUSCLE_GROUPS_PT.calves },
  { key: 'shoulders', label: MUSCLE_GROUPS_PT.shoulders },
  { key: 'triceps', label: MUSCLE_GROUPS_PT.triceps },
  { key: 'quads', label: MUSCLE_GROUPS_PT.quads },
  { key: 'hamstrings', label: MUSCLE_GROUPS_PT.hamstrings },
  { key: 'cardio', label: MUSCLE_GROUPS_PT.cardio },
];

const ZONE_COLOR: Record<string, string> = {
  abs: '#BB8FCE', back: '#4ECDC4', biceps: '#FFA07A', chest: '#FF6B6B',
  forearms: '#F7DC6F', glutes: '#A8D5BA', calves: '#FFD93D', shoulders: '#45B7D1',
  triceps: '#98D8C8', quads: '#85C1E2', hamstrings: '#F8B4B8', cardio: '#FF6B9D',
};

const INJURY_MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'quads', 'hamstrings', 'glutes', 'calves'];

/**
 * The exercise database has no joint-level tagging (only primary_muscle),
 * so "an injured joint" is translated into the muscle groups whose exercises
 * most directly load that joint — a coarse, common-sense mapping, not a
 * clinical one. It only ever removes exercises from the plan, never adds
 * anything, so an over-broad mapping errs toward being over-cautious rather
 * than missing something.
 */
const JOINTS: { key: string; label: string; muscles: MuscleGroup[] }[] = [
  { key: 'shoulders_joint', label: 'Ombros', muscles: ['shoulders'] },
  { key: 'elbows', label: 'Cotovelos', muscles: ['triceps', 'biceps'] },
  { key: 'wrists', label: 'Pulsos', muscles: ['forearms'] },
  { key: 'lower_back', label: 'Lombar', muscles: ['back'] },
  { key: 'hips', label: 'Anca', muscles: ['glutes', 'hamstrings'] },
  { key: 'knees', label: 'Joelhos', muscles: ['quads', 'hamstrings'] },
  { key: 'ankles', label: 'Tornozelos', muscles: ['calves'] },
];

const LOCATIONS: (Opt & { equip: EquipmentPreference; tags: Equipment[] })[] = [
  { key: 'biggym', label: 'Ginásio grande', equip: 'any', tags: ['barbell', 'dumbbell', 'ez_bar', 'kettlebell', 'gymleco', 'machine', 'cable', 'bodyweight', 'band', 'medicine_ball'] },
  { key: 'smallgym', label: 'Ginásio pequeno', equip: 'any', tags: ['dumbbell', 'kettlebell', 'machine', 'cable', 'bodyweight', 'band'] },
  { key: 'home', label: 'Casa', equip: 'free_weights', tags: ['dumbbell', 'kettlebell', 'bodyweight', 'band'] },
];

interface EquipCategory { key: string; label: string; items: Equipment[] }
const EQUIPMENT_CATEGORIES: EquipCategory[] = [
  { key: 'free', label: 'Peso Livre', items: ['barbell', 'dumbbell', 'ez_bar', 'kettlebell'] },
  { key: 'gymleco', label: 'Máquinas Gymleco', items: ['gymleco'] },
  { key: 'machines', label: 'Máquinas e Cabos', items: ['machine', 'cable'] },
  { key: 'bodyweight', label: 'Peso do Corpo', items: ['bodyweight'] },
  { key: 'accessories', label: 'Acessórios', items: ['band', 'medicine_ball', 'foam_roller'] },
  { key: 'other', label: 'Outro', items: ['other'] },
];

type Step = 'welcome' | 'goal' | 'level' | 'days' | 'duration' | 'zones' | 'injuries' | 'equipment';
const STEP_ORDER: Step[] = ['goal', 'level', 'days', 'duration', 'zones', 'injuries', 'equipment'];

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [step, setStep] = useState<Step>('welcome');
  const [building, setBuilding] = useState(false);

  const [goal, setGoal] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [days, setDays] = useState<string | null>(null);
  // "Todos os dias" reuses days='6' (the densest split the generator has)
  // but reads as a distinct card from the plain "6 dias" one, so its
  // selected/highlighted state needs its own flag rather than being
  // inferred from the shared days value.
  const [everyday, setEveryday] = useState(false);
  const [minutes, setMinutes] = useState<string | null>(null);
  const [zones, setZones] = useState<Set<MuscleGroup>>(new Set());

  const [injuryMode, setInjuryMode] = useState<'muscles' | 'joints'>('muscles');
  const [noInjuries, setNoInjuries] = useState(false);
  const [injuredMuscles, setInjuredMuscles] = useState<Set<MuscleGroup>>(new Set());
  const [injuredJoints, setInjuredJoints] = useState<Set<string>>(new Set());

  const [locationKey, setLocationKey] = useState('biggym');
  const [equipmentTags, setEquipmentTags] = useState<Set<Equipment>>(new Set(LOCATIONS[0].tags));
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const idealMinutes = useMemo(() => {
    if (!days) return '45';
    let ideal = MINUTES[MINUTES.length - 1].key;
    for (const m of MINUTES) {
      if (suggestedDaysPerWeek(Number(days), Number(m.key)) === null) { ideal = m.key; break; }
    }
    // Advanced lifters rest longer between heavy sets (180s vs. 30-45s for
    // hypertrophy/endurance work — see setsRepsForPlanType) than the
    // generator's simple per-set-time budget accounts for, so their session
    // genuinely needs more real time for the same exercise count.
    if (level === 'advanced') {
      const idx = MINUTES.findIndex(m => m.key === ideal);
      if (idx >= 0 && idx < MINUTES.length - 1) ideal = MINUTES[idx + 1].key;
    }
    return ideal;
  }, [days, level]);

  const excludedMuscles = useMemo<MuscleGroup[]>(() => {
    if (noInjuries) return [];
    const fromJoints = [...injuredJoints].flatMap(k => JOINTS.find(j => j.key === k)?.muscles ?? []);
    return [...new Set([...injuredMuscles, ...fromJoints])];
  }, [noInjuries, injuredMuscles, injuredJoints]);

  const goIndex = (delta: number) => {
    hapticSelect();
    const i = STEP_ORDER.indexOf(step);
    const next = i + delta;
    if (next < 0) { setStep('welcome'); return; }
    if (next >= STEP_ORDER.length) { finish(); return; }
    setStep(STEP_ORDER[next]);
  };
  const next = () => goIndex(1);
  const back = () => goIndex(-1);

  const applyLocation = (key: string) => {
    hapticSelect();
    setLocationKey(key);
    const loc = LOCATIONS.find(l => l.key === key);
    setEquipmentTags(new Set(loc?.tags ?? []));
  };

  const toggleEquip = (tag: Equipment) => {
    hapticSelect();
    setEquipmentTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  };

  const skip = async () => {
    await setSetting('onboardingComplete', '1').catch(() => {});
    router.replace('/(tabs)');
  };

  const finish = async () => {
    hapticSuccess();
    setBuilding(true);
    const goalDef = GOALS.find(g => g.key === goal);
    const locDef = LOCATIONS.find(l => l.key === locationKey);
    try {
      await setSetting('onboardingComplete', '1');
      await setSetting('onboardingGoal', goal || '');
      await setSetting('onboardingLevel', level || '');
      await setSetting('onboardingDays', days || '');
      await setSetting('onboardingLocation', locationKey || '');
      await setSetting('onboardingMinutes', minutes || '');
      await setSetting('onboardingTargetZones', JSON.stringify([...zones]));
      await setSetting('onboardingInjuredMuscles', JSON.stringify(excludedMuscles));
      await setSetting('onboardingEquipment', JSON.stringify([...equipmentTags]));
      if (goalDef && level && days && minutes) {
        const planId = await generatePlan(Number(days), Number(minutes), goalDef.planType, {
          equipmentPref: locDef?.equip ?? 'any',
          allowedEquipment: [...equipmentTags],
          focusAreas: [...zones].filter((z): z is MuscleGroup => z !== 'cardio'),
          excludedMuscles,
          customName: 'O meu plano',
        });
        // Every answer above only decides WHICH exercises go in; this is
        // what makes them also decide HOW the plan progresses week to week
        // — without it the NSPI engine never turns on and the plan generated
        // here would stay static forever. No weekStartDow question exists
        // in this flow, so default to Monday like the adaptive wizard does.
        await startAdaptivePlan({
          planId,
          goal: goalFromOnboarding(goalDef.key),
          experience: level,
          daysPerWeek: Number(days),
          sessionMinutes: Number(minutes),
          equipmentPref: locDef?.equip ?? 'any',
          weekStartDow: 1,
        });
      }
    } catch (err) {
      console.error('Onboarding finish failed:', err);
    }
    router.replace('/(tabs)');
  };

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

  if (step === 'welcome') {
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
            Algumas perguntas rápidas e montamos-te um plano de treino à tua medida.
          </Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => { hapticSelect(); setStep('goal'); }}>
            <Text style={styles.primaryBtnText}>Começar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const progress = (stepIndex + 1) / (STEP_ORDER.length + 1);

  let canContinue = true;
  let content: React.ReactNode = null;

  if (step === 'goal') {
    canContinue = goal !== null;
    content = <OptionList title="Qual é o teu objetivo?" options={GOALS} value={goal} onSelect={setGoal} colors={colors} />;
  } else if (step === 'level') {
    canContinue = level !== null;
    content = <OptionList title="Qual é o teu nível?" options={LEVELS} value={level} onSelect={setLevel} colors={colors} />;
  } else if (step === 'days') {
    canContinue = days !== null;
    content = (
      <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Quantos dias por semana queres treinar?</Text>
        <View style={styles.grid2}>
          {DAYS.map(opt => {
            const isEverydayCard = opt.sub !== undefined;
            const active = days === opt.key && everyday === isEverydayCard;
            return (
              <TouchableOpacity
                key={opt.label}
                onPress={() => { hapticSelect(); setDays(opt.key); setEveryday(isEverydayCard); }}
                activeOpacity={0.8}
                style={[styles.gridCard, { backgroundColor: active ? colors.primaryContainer : colors.surfaceVariant }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.optTitle, { color: active ? colors.text : colors.textSecondary, textAlign: 'center' }]}>{opt.label}</Text>
                {opt.sub && <Text style={[styles.optSub, { color: colors.textSecondary, textAlign: 'center' }]}>{opt.sub}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  } else if (step === 'duration') {
    canContinue = minutes !== null;
    content = (
      <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Quanto tempo por sessão?</Text>
        <View style={{ gap: 12, marginTop: 20 }}>
          {MINUTES.map(opt => {
            const selected = minutes === opt.key;
            const isIdeal = opt.key === idealMinutes;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => { hapticSelect(); setMinutes(opt.key); }}
                activeOpacity={0.8}
                style={[styles.optCard, styles.durationCard, { backgroundColor: selected ? colors.primaryContainer : colors.surfaceVariant }]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.optTitle, { color: selected ? colors.text : colors.textSecondary }]}>{opt.label}</Text>
                {isIdeal && (
                  <View style={[styles.idealBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.idealBadgeText}>IDEAL</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  } else if (step === 'zones') {
    content = (
      <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Quais são as tuas zonas alvo?</Text>
        <Text style={[styles.body, { color: colors.textSecondary, marginTop: 8 }]}>
          Equilibrámos o teu treino de corpo inteiro e acrescentámos intensidade nas zonas que escolheres.
        </Text>
        <View style={styles.zoneGrid}>
          {TARGET_ZONES.map(z => {
            const selected = zones.has(z.key);
            return (
              <TouchableOpacity
                key={z.key}
                onPress={() => {
                  hapticSelect();
                  setZones(prev => {
                    const next = new Set(prev);
                    if (next.has(z.key)) next.delete(z.key); else next.add(z.key);
                    return next;
                  });
                }}
                style={styles.zoneItem}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View style={[
                  styles.zoneCircle,
                  { backgroundColor: selected ? ZONE_COLOR[z.key] : colors.surfaceVariant, borderColor: ZONE_COLOR[z.key], borderWidth: selected ? 0 : 2 },
                ]}>
                  {selected && <Check size={20} color="#fff" />}
                </View>
                <Text style={[styles.zoneLabel, { color: colors.text }]} numberOfLines={1}>{z.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  } else if (step === 'injuries') {
    const list = injuryMode === 'muscles'
      ? INJURY_MUSCLES.map(m => ({ key: m, label: MUSCLE_GROUPS_PT[m] }))
      : JOINTS.map(j => ({ key: j.key, label: j.label }));
    const selectedSet = injuryMode === 'muscles' ? injuredMuscles : injuredJoints;
    content = (
      <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Tens alguma lesão?</Text>
        <View style={[styles.toggleRow, { backgroundColor: colors.surfaceVariant }]}>
          {(['muscles', 'joints'] as const).map(m => (
            <TouchableOpacity
              key={m}
              onPress={() => { hapticSelect(); setInjuryMode(m); }}
              style={[styles.toggleBtn, { backgroundColor: injuryMode === m ? colors.surface : 'transparent' }]}
            >
              <Text style={[styles.toggleText, { color: injuryMode === m ? colors.text : colors.textSecondary }]}>
                {m === 'muscles' ? 'Músculos' : 'Articulações'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ marginTop: 16 }}>
          <TouchableOpacity
            onPress={() => {
              hapticSelect();
              setNoInjuries(v => !v);
              setInjuredMuscles(new Set());
              setInjuredJoints(new Set());
            }}
            style={[styles.injuryRow, { backgroundColor: noInjuries ? colors.primaryContainer : colors.surfaceVariant }]}
          >
            <Text style={[styles.injuryLabel, { color: colors.text }]}>Não tenho lesões</Text>
            <View style={[styles.checkbox, { borderColor: colors.textTertiary, backgroundColor: noInjuries ? colors.primary : 'transparent' }]}>
              {noInjuries && <Check size={14} color="#fff" />}
            </View>
          </TouchableOpacity>

          {list.map(item => {
            const selected = selectedSet.has(item.key as any);
            return (
              <TouchableOpacity
                key={item.key}
                disabled={noInjuries}
                onPress={() => {
                  hapticSelect();
                  setNoInjuries(false);
                  const setFn = injuryMode === 'muscles' ? setInjuredMuscles : setInjuredJoints;
                  (setFn as any)((prev: Set<string>) => {
                    const nextSet = new Set(prev);
                    if (nextSet.has(item.key)) nextSet.delete(item.key); else nextSet.add(item.key);
                    return nextSet;
                  });
                }}
                style={[styles.injuryRow, { opacity: noInjuries ? 0.4 : 1 }]}
              >
                <Text style={[styles.injuryLabel, { color: colors.text }]}>{item.label}</Text>
                <View style={[styles.checkbox, { borderColor: colors.textTertiary, backgroundColor: selected ? colors.primary : 'transparent' }]}>
                  {selected && <Check size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  } else if (step === 'equipment') {
    const locLabel = LOCATIONS.find(l => l.key === locationKey)?.label ?? 'Ginásio grande';
    content = (
      <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          onPress={() => {
            const i = LOCATIONS.findIndex(l => l.key === locationKey);
            applyLocation(LOCATIONS[(i + 1) % LOCATIONS.length].key);
          }}
          style={styles.locationRow}
          accessibilityRole="button"
          accessibilityLabel="Mudar local de treino"
        >
          <Text style={[styles.title, { color: colors.text }]}>{locLabel}</Text>
          <ChevronDown size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.body, { color: colors.textSecondary, marginTop: 4 }]}>
          Pré-selecionado com base no teu local de treino. Toca no título para mudar.
        </Text>

        <View style={styles.equipHeaderRow}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>EQUIPAMENTO</Text>
          <TouchableOpacity onPress={() => { hapticSelect(); setEquipmentTags(new Set()); }}>
            <Text style={[styles.deselectLink, { color: colors.primary }]}>Desmarcar tudo</Text>
          </TouchableOpacity>
        </View>

        {EQUIPMENT_CATEGORIES.map(cat => {
          const collapsed = collapsedCategories.has(cat.key);
          const allOn = cat.items.every(i => equipmentTags.has(i));
          return (
            <View key={cat.key} style={[styles.categoryBlock, { borderColor: colors.border }]}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => {
                  hapticSelect();
                  setCollapsedCategories(prev => {
                    const next = new Set(prev);
                    if (next.has(cat.key)) next.delete(cat.key); else next.add(cat.key);
                    return next;
                  });
                }}
              >
                <Text style={[styles.categoryTitle, { color: colors.text }]}>{cat.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => {
                      hapticSelect();
                      setEquipmentTags(prev => {
                        const nextSet = new Set(prev);
                        cat.items.forEach(i => (allOn ? nextSet.delete(i) : nextSet.add(i)));
                        return nextSet;
                      });
                    }}
                    style={[styles.checkbox, { borderColor: colors.textTertiary, backgroundColor: allOn ? colors.primary : 'transparent' }]}
                  >
                    {allOn && <Check size={14} color="#fff" />}
                  </TouchableOpacity>
                  {collapsed ? <ChevronDown size={18} color={colors.textSecondary} /> : <ChevronUp size={18} color={colors.textSecondary} />}
                </View>
              </TouchableOpacity>
              {!collapsed && (
                <View style={{ gap: 2 }}>
                  {cat.items.map(item => {
                    const on = equipmentTags.has(item);
                    return (
                      <TouchableOpacity key={item} onPress={() => toggleEquip(item)} style={styles.equipItemRow}>
                        <Text style={[styles.equipItemLabel, { color: colors.textSecondary }]}>{EQUIPMENT_PT[item]}</Text>
                        <View style={[styles.checkbox, { borderColor: colors.textTertiary, backgroundColor: on ? colors.primary : 'transparent' }]}>
                          {on && <Check size={14} color="#fff" />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  }

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

      {content}

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
            {step === 'equipment' ? 'Concluir' : 'Continuar'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function OptionList({ title, options, value, onSelect, colors }: {
  title: string; options: Opt[]; value: string | null; onSelect: (k: string) => void; colors: any;
}) {
  return (
    <ScrollView contentContainerStyle={styles.qContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <View style={{ gap: 14, marginTop: 24 }}>
        {options.map(opt => {
          const selected = value === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => { hapticSelect(); onSelect(opt.key); }}
              activeOpacity={0.8}
              style={[styles.optCard, { backgroundColor: selected ? colors.primaryContainer : colors.surfaceVariant }]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={opt.label}
            >
              <Text style={[styles.optTitle, { color: selected ? colors.text : colors.textSecondary }]}>{opt.label}</Text>
              {opt.sub && <Text style={[styles.optSub, { color: colors.textSecondary }]}>{opt.sub}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
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

  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 24 },
  gridCard: { width: '47%', borderRadius: 16, paddingVertical: 20, alignItems: 'center', justifyContent: 'center', gap: 2 },

  durationCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  idealBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  idealBadgeText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 11, letterSpacing: 0.5 },

  zoneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 24 },
  zoneItem: { width: '28%', alignItems: 'center', gap: 8 },
  zoneCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  zoneLabel: { fontFamily: 'Inter-SemiBold', fontSize: 12, textAlign: 'center' },

  toggleRow: { flexDirection: 'row', borderRadius: 12, padding: 4, marginTop: 20 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  toggleText: { fontFamily: 'Inter-Bold', fontSize: 14 },

  injuryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 16, borderRadius: 12, marginBottom: 2 },
  injuryLabel: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  equipHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 8 },
  sectionLabel: { fontFamily: 'Inter-Bold', fontSize: 12, letterSpacing: 0.5 },
  deselectLink: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
  categoryBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryTitle: { fontFamily: 'Inter-Bold', fontSize: 15 },
  equipItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingLeft: 8 },
  equipItemLabel: { fontFamily: 'Inter-Regular', fontSize: 14 },
});
