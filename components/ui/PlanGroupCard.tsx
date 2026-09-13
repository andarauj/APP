import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Badge } from '@/components/ui/Badge';
import type { WorkoutPlan } from '@/types';
import { PLAN_TYPE_PT, SPLIT_TYPE_PT } from '@/types';
import type { PlanGroup } from '@/utils/planGrouping';
import { formatDate } from '@/utils/format';
import { Copy, Trash2, ChevronRight, Play, Layers } from 'lucide-react-native';

/**
 * One plan (or, when a name has more than one saved version, one GROUP of
 * plans) as a card — name, type badges, quick-start, duplicate, delete.
 * Shared by the standalone Planos screen and the "Meus Planos" sub-tab
 * inside Treino, via hooks/usePlansManager, so both present and act on
 * plans identically.
 */
export function PlanGroupCard({
  group, dayCounts, onOpenGroup, onDuplicate, onDelete, onQuickStart,
}: {
  group: PlanGroup;
  dayCounts: Record<number, number>;
  onOpenGroup: (group: PlanGroup) => void;
  onDuplicate: (plan: WorkoutPlan) => void;
  onDelete: (plan: WorkoutPlan) => void;
  onQuickStart: (plan: WorkoutPlan) => void;
}) {
  const { colors } = useTheme();
  const latest = group.plans[0];
  const hasMultiple = group.plans.length > 1;

  return (
    <TouchableOpacity
      className="flex-row overflow-hidden rounded-2xl border"
      style={{ backgroundColor: colors.surface, borderColor: colors.border }}
      onPress={() => onOpenGroup(group)}
      activeOpacity={0.7}
    >
      <View className="w-1 self-stretch" style={{ backgroundColor: colors.primary }} />
      <View className="flex-1 gap-2 p-3.5">
        <View className="flex-row items-start justify-between">
          <Text className="mr-2 flex-1 font-sans-bold text-[17px]" style={{ color: colors.text }} numberOfLines={1}>{group.name}</Text>
          {!hasMultiple && (
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => onDuplicate(latest)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Duplicar plano ${group.name}`}>
                <Copy size={18} color={colors.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(latest)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Eliminar plano ${group.name}`}>
                <Trash2 size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          )}
        </View>
        {latest.description ? (
          <Text className="font-sans text-[13px] leading-[18px]" style={{ color: colors.textSecondary }} numberOfLines={2}>{latest.description}</Text>
        ) : null}
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Badge label={PLAN_TYPE_PT[latest.plan_type]} color={colors.primaryContainer} textColor={colors.primary} />
          <Badge label={SPLIT_TYPE_PT[latest.split_type]} color={colors.surfaceVariant} textColor={colors.textSecondary} />
          {hasMultiple && (
            <Badge label={`${group.plans.length} versões`} color={colors.accentContainer} textColor={colors.accent} />
          )}
          <Text className="font-sans text-xs leading-4" style={{ color: colors.textTertiary }}>{formatDate(latest.updated_at)}</Text>
        </View>
        {!hasMultiple && (
          <TouchableOpacity
            className="mt-1 flex-row items-center justify-center gap-1.5 rounded-[10px] py-2.5"
            style={{ backgroundColor: colors.primary }}
            onPress={() => onQuickStart(latest)}
            accessibilityRole="button"
            accessibilityLabel={`Iniciar treino ${group.name}`}
          >
            <Play size={16} color="#fff" />
            <Text className="font-sans-semibold text-sm text-white">{(dayCounts[latest.id] ?? 1) > 1 ? 'Escolher Dia' : 'Iniciar Treino'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {hasMultiple
        ? <Layers size={18} color={colors.textTertiary} style={{ alignSelf: 'center', marginRight: 8 }} />
        : <ChevronRight size={18} color={colors.textTertiary} style={{ alignSelf: 'center', marginRight: 8 }} />}
    </TouchableOpacity>
  );
}
