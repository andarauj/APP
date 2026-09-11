import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { formatTime } from '@/utils/format';

/**
 * Circular rest-timer clock — a full ring that empties as the rest period
 * runs out, big MM:SS centered inside. Reuses the same SVG stroke-dasharray
 * ring technique as DonutChart (proven pattern in this codebase) rather
 * than a new charting approach.
 */
export function RestRing({
  remaining, duration, size = 88, strokeWidth = 8, color, trackColor,
}: {
  remaining: number; duration: number; size?: number; strokeWidth?: number; color: string; trackColor: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;
  const dashOffset = circumference * (1 - fraction);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="transparent" />
        {/* Rotating -90° makes the ring start emptying from 12 o'clock
            instead of SVG's default 3 o'clock start. */}
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </G>
      </Svg>
      <View style={styles.centerOverlay} pointerEvents="none">
        <Text style={[styles.centerText, { color, fontSize: size * 0.24 }]}>{formatTime(remaining)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  centerText: { fontFamily: 'Inter-Bold' },
});
