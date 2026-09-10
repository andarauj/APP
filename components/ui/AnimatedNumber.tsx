import { useEffect, useState } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { useSharedValue, useAnimatedReaction, withTiming, runOnJS, Easing } from 'react-native-reanimated';

/** A number that counts up (or down) to its target value instead of just
 *  appearing — used for scores/stats where a static number update reads as
 *  flat, especially on a screen you land on often (the Home dashboard). */
export function AnimatedNumber({ value, style, duration = 700 }: { value: number; style?: StyleProp<TextStyle>; duration?: number }) {
  const [displayed, setDisplayed] = useState(value);
  const animated = useSharedValue(value);

  useEffect(() => {
    animated.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
    // `animated` is a shared value and keeps a stable identity; `duration`
    // is listed so a caller changing it takes effect on the next update
    // rather than being stuck with whatever it was on first render.
  }, [value, duration, animated]);

  useAnimatedReaction(
    () => Math.round(animated.value),
    (current, previous) => {
      if (current !== previous) runOnJS(setDisplayed)(current);
    }
  );

  return <Text style={style}>{displayed}</Text>;
}
