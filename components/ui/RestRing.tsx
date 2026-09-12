import { View, StyleSheet, TextInput } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** Worklet-local copy of utils/format.ts's formatTime — a function called
 *  from useAnimatedProps runs on the UI thread and needs to be a worklet
 *  itself; keeping this copy here avoids marking the shared utility (used
 *  all over the app as plain JS) as a worklet just for this one caller. */
function formatTimeWorklet(seconds: number): string {
  'worklet';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Circular rest-timer clock — a full ring that empties as the rest period
 * runs out, big MM:SS centered inside. Reuses the same SVG stroke-dasharray
 * ring technique as DonutChart (proven pattern in this codebase) rather
 * than a new charting approach.
 *
 * Driven by a Reanimated shared value (remainingSV), not a plain number —
 * the caller (FloatingRestBar in app/workout/active.tsx) smooths its own
 * 250ms-ticking state into this via withTiming, so the ring's fill and
 * countdown text animate continuously on the UI thread between ticks
 * instead of visibly stepping four times a second. Both the ring's stroke
 * offset and the center text update via useAnimatedProps, so this
 * component itself never re-renders as the value changes — only its
 * animated props do.
 */
export function RestRing({
  remainingSV, duration, size = 88, strokeWidth = 8, color, trackColor,
}: {
  remainingSV: SharedValue<number>; duration: number; size?: number; strokeWidth?: number; color: string; trackColor: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const animatedCircleProps = useAnimatedProps(() => {
    // Rotating -90° (below) makes the ring start emptying from 12 o'clock
    // instead of SVG's default 3 o'clock start.
    const fraction = duration > 0 ? Math.max(0, Math.min(1, remainingSV.value / duration)) : 0;
    return { strokeDashoffset: circumference * (1 - fraction) };
  });

  const animatedTextProps = useAnimatedProps(() => {
    const text = formatTimeWorklet(Math.max(0, remainingSV.value));
    return { text, defaultValue: text } as any;
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="transparent" />
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            animatedProps={animatedCircleProps}
            strokeLinecap="round"
            fill="transparent"
          />
        </G>
      </Svg>
      <View style={styles.centerOverlay} pointerEvents="none">
        <AnimatedTextInput
          style={[styles.centerText, { color, fontSize: size * 0.24 }]}
          animatedProps={animatedTextProps}
          defaultValue=""
          editable={false}
          underlineColorAndroid="transparent"
          selectTextOnFocus={false}
          caretHidden
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  centerText: {
    fontFamily: 'Inter-Bold', textAlign: 'center', padding: 0,
    // Match the old plain <Text>'s box exactly — a TextInput otherwise
    // brings its own platform chrome (min height, default padding) that
    // would shift the number off the ring's visual center.
    includeFontPadding: false,
  },
});
