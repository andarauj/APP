import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import type { WeeklyConsistency } from '@/utils/trainingHeatmap';

const BAR_MAX_HEIGHT = 84;

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
}

function formatWeekShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
}

/**
 * A bar chart, one bar per week — height is the real total séries that
 * week, colour graded to the person's own range. Replaces the old
 * day-by-day square grid, which read as an unexplained wall of squares
 * (reported: "aqueles quadrados não me dizem nada, não percebo nada do
 * gráfico de progressão"). A bar's height says "how much" at a glance
 * without needing to be decoded; tapping one shows the exact numbers.
 */
export function TrainingConsistencyChart({ weeks }: { weeks: WeeklyConsistency[] }) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<WeeklyConsistency | null>(null);

  if (weeks.length === 0) return null;

  const maxSets = Math.max(1, ...weeks.map(w => w.totalSets));
  const latest = weeks[weeks.length - 1];
  const shown = selected ?? latest;

  const barColor = (intensity: number): string => {
    if (intensity === 0) return colors.surfaceVariant;
    // Opacity step per level, same base hue throughout — the chart reads
    // as "one color, four strengths" rather than an arbitrary rainbow.
    const opacities = ['4D', '80', 'B3', 'FF'];
    return colors.primary + opacities[intensity - 1];
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.caption, { color: colors.textSecondary }]}>
        Séries totais por semana — quanto mais alta a barra, mais treinaste essa semana. Toca numa barra para ver o detalhe.
      </Text>

      <View style={styles.chartRow}>
        {weeks.map(w => {
          const height = w.totalSets > 0 ? Math.max(4, Math.round((w.totalSets / maxSets) * BAR_MAX_HEIGHT)) : 4;
          const isShown = shown.weekStart === w.weekStart;
          return (
            <TouchableOpacity
              key={w.weekStart}
              style={styles.barSlot}
              onPress={() => setSelected(w)}
              accessibilityRole="button"
              accessibilityLabel={`Semana de ${formatWeekLabel(w.weekStart)}: ${w.totalSets} séries em ${w.daysTrained} dias`}
            >
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height, backgroundColor: barColor(w.intensity) },
                    isShown && w.totalSets > 0 && { borderWidth: 1.5, borderColor: colors.text },
                  ]}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.rangeRow}>
        <Text style={[styles.rangeText, { color: colors.textTertiary }]}>{formatWeekShort(weeks[0].weekStart)}</Text>
        <Text style={[styles.rangeText, { color: colors.textTertiary }]}>{formatWeekShort(latest.weekStart)}</Text>
      </View>

      <Text style={[styles.detail, { color: colors.text }]}>
        Semana de {formatWeekLabel(shown.weekStart)}: {shown.totalSets === 0
          ? 'sem séries registadas'
          : `${shown.totalSets} série${shown.totalSets === 1 ? '' : 's'} em ${shown.daysTrained} dia${shown.daysTrained === 1 ? '' : 's'}`}
      </Text>

      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: colors.textTertiary }]}>Menos consistente</Text>
        {[0, 1, 2, 3, 4].map(i => (
          <View key={i} style={[styles.legendCell, { backgroundColor: barColor(i) }]} />
        ))}
        <Text style={[styles.legendText, { color: colors.textTertiary }]}>Mais consistente</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, width: '100%' },
  caption: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: BAR_MAX_HEIGHT },
  barSlot: { flex: 1, alignItems: 'center' },
  barTrack: { height: BAR_MAX_HEIGHT, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '70%', borderRadius: 3, minHeight: 4 },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rangeText: { fontFamily: 'Inter-Regular', fontSize: 10 },
  detail: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  legendText: { fontFamily: 'Inter-Regular', fontSize: 11 },
  legendCell: { width: 11, height: 11, borderRadius: 3 },
});
