import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { PHASE_LABEL_PT, PHASE_COLOR } from '@/utils/adaptivePlan';
import type { AdaptiveStatus } from '@/utils/adaptiveService';
import { ChevronRight, Sparkles, Play } from 'lucide-react-native';

const GOAL_LABEL_PT: Record<string, string> = {
  bulking: 'Ganhar músculo',
  strength: 'Ficar mais forte',
  cutting: 'Perder gordura',
  general: 'Manter / geral',
};

interface Props {
  status: AdaptiveStatus;
  /** Optional: start today's scheduled day directly. */
  onStartToday?: () => void;
  todayLabel?: string | null;
}

/**
 * Unified “Plano Adaptativo” card for Meus Planos / Planos list.
 * Always shown above manual plans when an adaptive plan is active so the
 * empty-state “Ainda não tens planos” never lies.
 */
export function AdaptivePlanCard({ status, onStartToday, todayLabel }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const phaseColor = PHASE_COLOR[status.phase] || colors.accent;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => router.push('/adaptive/plan')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Abrir plano adaptativo"
      >
        <View style={[styles.iconWrap, { backgroundColor: phaseColor + '22' }]}>
          <Sparkles size={20} color={phaseColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Plano Adaptativo</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Ciclo {status.cycleIndex} · {PHASE_LABEL_PT[status.phase]}
            {status.isBridge ? ' (consolidação)' : ''}
          </Text>
          <Text style={[styles.meta, { color: colors.textTertiary }]}>
            {GOAL_LABEL_PT[status.goal] || status.goal} · Semana {status.weekIndex}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textTertiary} />
      </TouchableOpacity>

      {onStartToday && todayLabel ? (
        <TouchableOpacity
          style={[styles.startBtn, { backgroundColor: colors.accent }]}
          onPress={onStartToday}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Começar ${todayLabel}`}
        >
          <Play size={16} color={colors.onAccent} fill={colors.onAccent} />
          <Text style={[styles.startBtnText, { color: colors.onAccent }]}>
            Começar · {todayLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: 'Inter-SemiBold', fontSize: 16 },
  subtitle: { fontFamily: 'Inter-Medium', fontSize: 13, marginTop: 2 },
  meta: { fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 2 },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
  },
  startBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
});
