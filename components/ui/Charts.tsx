import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Circle, G, Polyline, TSpan, Text as SvgText } from 'react-native-svg';

/**
 * Gráfico de barras simples — sem animações, direto ao ponto.
 * Usado para volume por músculo, volume semanal, etc.
 */
interface BarChartProps {
  data: { label: string; value: number }[];
  width: number;
  height: number;
  maxValue?: number;
  barColor?: string;
  labelColor?: string;
  backgroundColor?: string;
}

export const BarChart = memo(function BarChart({
  data,
  width,
  height,
  maxValue,
  barColor = '#8B7FFF',
  labelColor = '#64748B',
  backgroundColor = '#FFFFFF',
}: BarChartProps) {
  if (data.length === 0) return null;

  const max = maxValue || Math.max(...data.map(d => d.value));
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const barWidth = chartWidth / data.length * 0.7;
  const barGap = chartWidth / data.length;

  return (
    <View style={{ width, height, backgroundColor }}>
      <Svg width={width} height={height}>
        {/* Eixo Y */}
        <Line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke={labelColor} strokeWidth={1} opacity={0.2} />
        {/* Eixo X */}
        <Line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke={labelColor} strokeWidth={1} opacity={0.2} />

        {/* Barras */}
        {data.map((item, i) => {
          const barHeight = (item.value / max) * chartHeight;
          const x = padding + i * barGap + (barGap - barWidth) / 2;
          const y = height - padding - barHeight;
          return (
            <G key={i}>
              <Rect x={x} y={y} width={barWidth} height={barHeight} fill={barColor} rx={4} />
              <SvgText x={x + barWidth / 2} y={y - 8} fontSize={11} fill={labelColor} textAnchor="middle">
                <TSpan>{Math.round(item.value)}</TSpan>
              </SvgText>
            </G>
          );
        })}

        {/* Labels do X */}
        {data.map((item, i) => {
          const x = padding + i * barGap + barGap / 2;
          const y = height - padding + 20;
          return (
            <SvgText key={`label-${i}`} x={x} y={y} fontSize={11} fill={labelColor} textAnchor="middle">
              <TSpan>{item.label}</TSpan>
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
});

/**
 * Gráfico de linha — volume ao longo do tempo.
 * Mostra tendência simples sem animações.
 */
interface LineChartProps {
  data: { label: string; value: number }[];
  width: number;
  height: number;
  maxValue?: number;
  lineColor?: string;
  dotColor?: string;
  labelColor?: string;
  backgroundColor?: string;
}

export const LineChart = memo(function LineChart({
  data,
  width,
  height,
  maxValue,
  lineColor = '#8B7FFF',
  dotColor = '#8B7FFF',
  labelColor = '#64748B',
  backgroundColor = '#FFFFFF',
}: LineChartProps) {
  if (data.length < 2) return null;

  const max = maxValue || Math.max(...data.map(d => d.value));
  const min = Math.min(...data.map(d => d.value));
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const pointGap = chartWidth / (data.length - 1);

  // Construir pontos da linha
  const points = data
    .map((item, i) => {
      const x = padding + i * pointGap;
      const y = height - padding - ((item.value - min) / (max - min || 1)) * chartHeight;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <View style={{ width, height, backgroundColor }}>
      <Svg width={width} height={height}>
        {/* Eixos */}
        <Line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke={labelColor} strokeWidth={1} opacity={0.2} />
        <Line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke={labelColor} strokeWidth={1} opacity={0.2} />

        {/* Linha */}
        <Polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Pontos */}
        {data.map((item, i) => {
          const x = padding + i * pointGap;
          const y = height - padding - ((item.value - min) / (max - min || 1)) * chartHeight;
          return (
            <Circle key={i} cx={x} cy={y} r={3} fill={dotColor} />
          );
        })}

        {/* Labels do X (espaçados) */}
        {data.map((item, i) => {
          // Mostrar labels a cada 2+ pontos para não ficar congestionado
          if (data.length > 7 && i % 2 !== 0 && i !== data.length - 1) return null;
          const x = padding + i * pointGap;
          const y = height - padding + 20;
          return (
            <SvgText
              key={`label-${i}`}
              x={x}
              y={y}
              fontSize={10}
              fill={labelColor}
              textAnchor="middle"
            >
              <TSpan>{item.label}</TSpan>
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
});

/**
 * Card pequeno para uma estatística singular.
 */
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
}

export const StatCard = memo(function StatCard({
  label,
  value,
  icon,
  color = '#8B7FFF',
}: StatCardProps) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      {icon && <View style={styles.statIcon}>{icon}</View>}
      <View style={styles.statContent}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  statContent: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 18,
    color: '#0F172A',
    fontWeight: '700',
  },
});
