import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
      style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => onOpenGroup(group)}
      activeOpacity={0.7}
    >
      <View style={[styles.planAccent, { backgroundColor: colors.primary }]} />
      <View style={styles.planBody}>
        <View style={styles.planTop}>
          <Text style={[styles.planName, { color: colors.text }]} numberOfLines={1}>{group.name}</Text>
          {!hasMultiple && (
            <View style={styles.planActions}>
              <TouchableOpacity onPress={() => onDuplicate(latest)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Duplicar plano ${group.name}`}>
                <Copy size={18} color={colors.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(latest)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Eliminar plano ${group.name}`}>
                <Trash2 size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          )}
        </View>
        {latest.description ? <Text style={[styles.planDesc, { color: colors.textSecondary }]} numberOfLines={2}>{latest.description}</Text> : null}
        <View style={styles.planMeta}>
          <Badge label={PLAN_TYPE_PT[latest.plan_type]} color={colors.primaryContainer} textColor={colors.primary} />
          <Badge label={SPLIT_TYPE_PT[latest.split_type]} color={colors.surfaceVariant} textColor={colors.textSecondary} />
          {hasMultiple && (
            <Badge label={`${group.plans.length} versões`} color={colors.accentContainer} textColor={colors.accent} />
          )}
          <Text style={[styles.planDate, { color: colors.textTertiary }]}>{formatDate(latest.updated_at)}</Text>
        </View>
        {!hasMultiple && (
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: colors.primary }]}
            onPress={() => onQuickStart(latest)}
            accessibilityRole="button"
            accessibilityLabel={`Iniciar treino ${group.name}`}
          >
            <Play size={16} color="#fff" />
            <Text style={styles.startBtnText}>{(dayCounts[latest.id] ?? 1) > 1 ? 'Escolher Dia' : 'Iniciar Treino'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {hasMultiple ? <Layers size={18} color={colors.textTertiary} style={styles.chevron} /> : <ChevronRight size={18} color={colors.textTertiary} style={styles.chevron} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  planCard: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  planAccent: { width: 4, alignSelf: 'stretch' },
  planBody: { flex: 1, padding: 14, gap: 8 },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  planActions: { flexDirection: 'row', gap: 12 },
  planName: { fontFamily: 'Inter-Bold', fontSize: 17, flex: 1, marginRight: 8 },
  planDesc: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 18 },
  planMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  planDate: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16 },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, marginTop: 4 },
  startBtnText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 14 },
  chevron: { alignSelf: 'center', marginRight: 8 },
});
