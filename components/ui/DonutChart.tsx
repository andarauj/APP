import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '@/hooks/useTheme';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** A simple donut chart built from stacked SVG circle strokes (one ring per
 *  slice, each drawn as a partial arc via strokeDasharray) — no charting
 *  library needed, matches how LineChart/MuscleMap already do raw SVG here. */
export function DonutChart({ slices, size = 160, strokeWidth = 22, centerLabel, centerValue }: {
  slices: DonutSlice[]; size?: number; strokeWidth?: number; centerLabel?: string; centerValue?: string;
}) {
  const { colors } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    return (
      <View style={[styles.empty, { width: size, height: size }]}>
        <Text style={{ color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 13, textAlign: 'center' }}>
          Sem dados suficientes ainda
        </Text>
      </View>
    );
  }

  let cumulative = 0; // fraction of the full circle drawn so far (0 to 1)

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* Rotating the whole group -90° makes the first slice start at 12
            o'clock (SVG circles otherwise start drawing at 3 o'clock) — the
            per-slice offset below only needs to handle how far AROUND the
            circle each slice starts, not that base rotation too. */}
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          {slices.map((slice, i) => {
            const fraction = total > 0 ? slice.value / total : 0;
            const dashLength = circumference * fraction;
            const dashOffset = -cumulative * circumference;
            cumulative += fraction;
            return (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={dashOffset}
                fill="transparent"
                strokeLinecap="butt"
              />
            );
          })}
        </G>
      </Svg>
      {(centerLabel || centerValue) && (
        <View style={styles.centerOverlay} pointerEvents="none">
          {centerValue && <Text style={[styles.centerValue, { color: colors.text }]}>{centerValue}</Text>}
          {centerLabel && <Text style={[styles.centerLabel, { color: colors.textSecondary }]}>{centerLabel}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  centerOverlay: { position: 'absolute', alignItems: 'center' },
  centerValue: { fontFamily: 'Inter-Bold', fontSize: 22 },
  centerLabel: { fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 2 },
});
