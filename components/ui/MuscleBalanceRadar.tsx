/**
 * Muscle balance radar chart — visualize weekly volume distribution across muscle groups
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/hooks/useTheme';

export interface MuscleVolumeData {
  muscle: string;
  sets: number;
  percentage: number;
}

interface RadarChartProps {
  data: MuscleVolumeData[];
  size?: number;
  strokeWidth?: number;
}

const MUSCLE_COLORS: Record<string, string> = {
  chest: '#FF6B6B',
  back: '#4ECDC4',
  shoulders: '#45B7D1',
  biceps: '#FFA07A',
  triceps: '#98D8C8',
  forearms: '#F7DC6F',
  abs: '#BB8FCE',
  quads: '#85C1E2',
  hamstrings: '#F8B4B8',
  glutes: '#A8D5BA',
  calves: '#FFD93D',
  traps: '#6BCB77',
  lats: '#4D96FF',
  cardio: '#FF6B9D',
  fullbody: '#FFB703',
  mobility: '#8ECAE6',
};

export function MuscleBalanceRadar({ data, size = 250, strokeWidth = 2 }: RadarChartProps) {
  const { colors } = useTheme();

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Sem dados de volume muscular
        </Text>
      </View>
    );
  }

  const numLevels = 5;
  const centerX = size / 2;
  const centerY = size / 2;
  const numMuscles = data.length;
  const angleSlice = (Math.PI * 2) / numMuscles;
  const maxRadius = size / 2 - 40;

  // Calculate SVG paths
  const getPoint = (angleIndex: number, radiusPercent: number) => {
    const angle = angleIndex * angleSlice - Math.PI / 2;
    const radius = (radiusPercent / 100) * maxRadius;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  };

  // Grid levels
  const gridPaths: string[] = [];
  for (let level = 1; level <= numLevels; level++) {
    const levelPercentage = (level / numLevels) * 100;
    let path = '';
    for (let i = 0; i < numMuscles; i++) {
      const point = getPoint(i, levelPercentage);
      path += (i === 0 ? 'M' : 'L') + point.x + ',' + point.y;
    }
    path += 'Z';
    gridPaths.push(path);
  }

  // Radial lines
  const radialLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < numMuscles; i++) {
    const outerPoint = getPoint(i, 100);
    radialLines.push({
      x1: centerX,
      y1: centerY,
      x2: outerPoint.x,
      y2: outerPoint.y,
    });
  }

  // Data polygon
  let dataPath = '';
  for (let i = 0; i < numMuscles; i++) {
    const point = getPoint(i, data[i].percentage);
    dataPath += (i === 0 ? 'M' : 'L') + point.x + ',' + point.y;
  }
  dataPath += 'Z';

  // Labels
  const labelPoints = data.map((d, i) => {
    const labelRadius = maxRadius + 25;
    const point = getPoint(i, (labelRadius / maxRadius) * 100);
    return { ...d, x: point.x, y: point.y };
  });

  return (
    <View style={styles.container}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid levels */}
        {gridPaths.map((path, idx) => (
          <Path
            key={`grid-${idx}`}
            d={path}
            fill="none"
            stroke={colors.border}
            strokeWidth={0.5}
            opacity={0.5}
          />
        ))}

        {/* Radial lines */}
        {radialLines.map((line, idx) => (
          <Line
            key={`radial-${idx}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={colors.border}
            strokeWidth={0.5}
            opacity={0.3}
          />
        ))}

        {/* Data polygon */}
        <Path
          d={dataPath}
          fill="#8B7FFF"
          fillOpacity={0.2}
          stroke="#8B7FFF"
          strokeWidth={strokeWidth}
        />

        {/* Data points */}
        {data.map((d, i) => {
          const point = getPoint(i, d.percentage);
          const color = MUSCLE_COLORS[d.muscle.toLowerCase()] || '#8B7FFF';
          return (
            <Circle
              key={`point-${i}`}
              cx={point.x}
              cy={point.y}
              r={4}
              fill={color}
              stroke="#fff"
              strokeWidth={1.5}
            />
          );
        })}

        {/* Level labels (100%, 80%, 60%, 40%, 20%) */}
        {Array.from({ length: numLevels }).map((_, idx) => {
          const levelPercent = ((idx + 1) / numLevels) * 100;
          const point = getPoint(0, levelPercent);
          return (
            <SvgText
              key={`level-${idx}`}
              x={point.x - 8}
              y={point.y - 8}
              fontSize="10"
              fill={colors.textTertiary}
              opacity={0.6}
            >
              {levelPercent.toFixed(0)}%
            </SvgText>
          );
        })}
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        {labelPoints.map((item, idx) => (
          <View key={`legend-${idx}`} style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: MUSCLE_COLORS[item.muscle.toLowerCase()] || '#8B7FFF' },
              ]}
            />
            <Text style={[styles.legendText, { color: colors.text }]} numberOfLines={1}>
              {item.muscle} {item.percentage.toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 12,
  },
  empty: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    width: '100%',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: '45%',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    flex: 1,
  },
});
