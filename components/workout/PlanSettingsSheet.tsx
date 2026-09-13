import { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { Chip } from '@/components/ui/Chip';
import { getLatestAdaptivePlanAny, updateAdaptivePlanExperience, updateAdaptivePlanGoal, updateAdaptivePlanWeekStart } from '@/db/adaptiveDao';
import { updatePlan } from '@/db/planDao';
import { setSetting } from '@/db/settingsDao';
import { WEEKDAY_LABELS } from '@/utils/reminders';
import {
  TRAINING_GOAL_OPTIONS,
  adaptiveGoalFromUi,
  planTypeFromUi,
  uiGoalFromStored,
  type TrainingGoalUi,
} from '@/utils/planGoalSettings';
import { WEEK_START_SETTING_KEY } from '@/utils/weekStart';
import { hapticSelect } from '@/utils/haptics';
import type { WorkoutPlan } from '@/types';
import type { AdaptiveExperience } from '@/utils/nspi';
import { X } from 'lucide-react-native';

const EXPERIENCE_LEVELS: { key: AdaptiveExperience; label: string }[] = [
  { key: 'beginner', label: 'Iniciante' },
  { key: 'intermediate', label: 'Intermédio' },
  { key: 'advanced', label: 'Avançado' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  plan: WorkoutPlan | null;
  weekStartDow: number;
  onChanged?: () => void;
};

export function PlanSettingsSheet({ visible, onClose, plan, weekStartDow, onChanged }: Props) {
  const { colors } = useTheme();
  const [adaptiveId, setAdaptiveId] = useState<number | null>(null);
  const [goal, setGoal] = useState<TrainingGoalUi>('hypertrophy');
  const [experience, setExperience] = useState<AdaptiveExperience>('intermediate');
  const [startDow, setStartDow] = useState(weekStartDow);

  useEffect(() => {
    if (!visible) return;
    setStartDow(weekStartDow);
    getLatestAdaptivePlanAny()
      .then(row => {
        setAdaptiveId(row?.id ?? null);
        setGoal(uiGoalFromStored(row?.goal, plan?.plan_type));
        setExperience((row?.experience as AdaptiveExperience) || 'intermediate');
      })
      .catch(() => {
        setAdaptiveId(null);
        setGoal(uiGoalFromStored(undefined, plan?.plan_type));
      });
  }, [visible, weekStartDow, plan?.plan_type]);

  const persistWeekStart = async (dow: number) => {
    hapticSelect();
    setStartDow(dow);
    await setSetting(WEEK_START_SETTING_KEY, String(dow)).catch(() => {});
    if (adaptiveId) await updateAdaptivePlanWeekStart(adaptiveId, dow).catch(() => {});
    onChanged?.();
  };

  const persistGoal = async (next: TrainingGoalUi) => {
    hapticSelect();
    setGoal(next);
    if (adaptiveId) await updateAdaptivePlanGoal(adaptiveId, adaptiveGoalFromUi(next)).catch(() => {});
    if (plan) {
      await updatePlan({ ...plan, plan_type: planTypeFromUi(next) }).catch(() => {});
    }
    onChanged?.();
  };

  const persistExperience = async (level: AdaptiveExperience) => {
    hapticSelect();
    setExperience(level);
    if (adaptiveId) await updateAdaptivePlanExperience(adaptiveId, level).catch(() => {});
    onChanged?.();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Definições do plano</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fechar">
            <X size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>DIA DE INÍCIO DA SEMANA</Text>
          <View style={styles.chips}>
            {WEEKDAY_LABELS.map((label, day) => (
              <Chip key={day} label={label} selected={startDow === day} onPress={() => persistWeekStart(day)} />
            ))}
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>OBJETIVO DO TREINO</Text>
          <View style={styles.chips}>
            {TRAINING_GOAL_OPTIONS.map(opt => (
              <Chip key={opt.key} label={opt.label} selected={goal === opt.key} onPress={() => persistGoal(opt.key)} />
            ))}
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>DIFICULDADE</Text>
          <View style={styles.chips}>
            {EXPERIENCE_LEVELS.map(opt => (
              <Chip key={opt.key} label={opt.label} selected={experience === opt.key} onPress={() => persistExperience(opt.key)} />
            ))}
          </View>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Objetivo e dificuldade aplicam-se à frente — a semana já materializada não é reescrita.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  title: { fontFamily: 'Inter-Bold', fontSize: 20 },
  body: { padding: 20, gap: 12 },
  label: { fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 1, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17, marginTop: 8 },
});
