import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/hooks/useTheme';

interface LineChartProps {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  unit?: string;
  emptyLabel?: string;
}

export function LineChart({ data, color, height = 160, unit = '', emptyLabel = 'Sem dados suficientes' }: LineChartProps) {
  const { colors } = useTheme();
  const lineColor = color || colors.primary;
  const width = 300;
  const padding = 28;

  if (!data || data.length < 2) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={{ color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 13 }}>{emptyLabel}</Text>
      </View>
    );
  }

  const values = data.map(d => d.value);
  const maxV = Math.max(...values);
  const minV = Math.min(...values);
  const range = maxV - minV || 1;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * innerWidth;
    const y = padding + innerHeight - ((d.value - minV) / range) * innerHeight;
    return { x, y, value: d.value };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Grid baseline */}
        <Line x1={padding} y1={padding + innerHeight} x2={width - padding} y2={padding + innerHeight} stroke={colors.border} strokeWidth={1} />
        <Polyline points={polylinePoints} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={lineColor} />
        ))}
        {/* Max / min labels */}
        <SvgText x={padding} y={padding - 8} fontSize={11} fill={colors.textSecondary}>
          {`${maxV}${unit}`}
        </SvgText>
        <SvgText x={padding} y={height - 6} fontSize={11} fill={colors.textSecondary}>
          {`${minV}${unit}`}
        </SvgText>
      </Svg>
      <View style={styles.axisLabels}>
        <Text style={[styles.axisLabel, { color: colors.textTertiary }]}>{data[0].label}</Text>
        <Text style={[styles.axisLabel, { color: colors.textTertiary }]}>{data[data.length - 1].label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  axisLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 2 },
  axisLabel: { fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 14 },
});
