import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import type { HeatmapDay } from '@/utils/trainingHeatmap';

const CELL_SIZE = 11;
const CELL_GAP = 3;

/**
 * A GitHub-style contribution grid — weeks as columns (left = oldest,
 * right = most recent), days of the week as rows. Intensity 0-4 maps to
 * increasing opacity of the theme's primary color, so it automatically
 * matches whichever palette/theme is active rather than a hardcoded green.
 */
export function TrainingHeatmap({ days }: { days: HeatmapDay[] }) {
  const { colors } = useTheme();

  // Pad the front so the first column always starts on a Sunday — without
  // this, the grid's rows wouldn't line up with "Sunday at the top" the way
  // every week after it does, since `daysBack` doesn't necessarily start on
  // a Sunday itself.
  const firstDate = new Date(days[0]?.date + 'T00:00:00');
  const leadingPad = firstDate.getDay(); // 0 = Sunday
  const padded: (HeatmapDay | null)[] = [...Array(leadingPad).fill(null), ...days];

  const weeks: (HeatmapDay | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  const intensityColor = (intensity: number): string => {
    if (intensity === 0) return colors.surfaceVariant;
    // Opacity step per level — same base hue (primary) throughout, so the
    // grid reads as "one color, four strengths" rather than four
    // unrelated colors.
    const opacities = ['22', '55', '99', 'FF'];
    return colors.primary + opacities[intensity - 1];
  };

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.column}>
            {week.map((day, di) => (
              <View
                key={di}
                style={[
                  styles.cell,
                  { backgroundColor: day ? intensityColor(day.intensity) : 'transparent' },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: colors.textTertiary }]}>Menos</Text>
        {[0, 1, 2, 3, 4].map(i => (
          <View key={i} style={[styles.legendCell, { backgroundColor: intensityColor(i) }]} />
        ))}
        <Text style={[styles.legendText, { color: colors.textTertiary }]}>Mais</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  grid: { flexDirection: 'row', gap: CELL_GAP },
  column: { gap: CELL_GAP },
  cell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 3 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  legendText: { fontFamily: 'Inter-Regular', fontSize: 11 },
  legendCell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 3 },
});
