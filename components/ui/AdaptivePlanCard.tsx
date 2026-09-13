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
    <View
      className="mb-3 gap-3 rounded-xl border p-3.5"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
      }}
    >
      <TouchableOpacity
        className="flex-row items-center gap-3"
        onPress={() => router.push('/adaptive/plan')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Abrir plano adaptativo"
      >
        <View
          className="h-10 w-10 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: phaseColor + '22' }}
        >
          <Sparkles size={20} color={phaseColor} />
        </View>
        <View className="flex-1">
          <Text className="font-sans-semibold text-base" style={{ color: colors.text }}>Plano Adaptativo</Text>
          <Text className="mt-0.5 font-sans-semibold text-[13px]" style={{ color: colors.textSecondary }}>
            Ciclo {status.cycleIndex} · {PHASE_LABEL_PT[status.phase]}
            {status.isBridge ? ' (consolidação)' : ''}
          </Text>
          <Text className="mt-0.5 font-sans text-xs" style={{ color: colors.textTertiary }}>
            {GOAL_LABEL_PT[status.goal] || status.goal} · Semana {status.weekIndex}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textTertiary} />
      </TouchableOpacity>

      {onStartToday && todayLabel ? (
        <TouchableOpacity
          className="flex-row items-center justify-center gap-2 rounded-[10px] py-3"
          style={{ backgroundColor: colors.accent }}
          onPress={onStartToday}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Começar ${todayLabel}`}
        >
          <Play size={16} color={colors.onAccent} fill={colors.onAccent} />
          <Text className="font-sans-semibold text-[15px]" style={{ color: colors.onAccent }}>
            Começar · {todayLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
