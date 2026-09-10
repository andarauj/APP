import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Ellipse, Rect, Path, G } from 'react-native-svg';
import type { MuscleGroup } from '@/types';
import { useTheme } from '@/hooks/useTheme';

interface MuscleMapProps {
  /** Muscle trained directly by the exercise — shown in full accent color. */
  primary?: MuscleGroup;
  /** Muscles trained indirectly — shown in a lighter tint. */
  secondary?: MuscleGroup[];
  /** Lets the person switch views; otherwise the view auto-picks front/back. */
  interactive?: boolean;
  size?: number;
}

const FRONT_MUSCLES: MuscleGroup[] = ['chest', 'shoulders', 'biceps', 'forearms', 'abs', 'quads', 'calves'];
const BACK_MUSCLES: MuscleGroup[] = ['back', 'lats', 'traps', 'shoulders', 'triceps', 'forearms', 'glutes', 'hamstrings', 'calves'];
// Cardio/fullbody/mobility exercises don't map to one region — every region
// gets a light highlight instead of leaving the whole figure blank.
const WHOLE_BODY_CATEGORIES: MuscleGroup[] = ['cardio', 'fullbody', 'mobility'];

/**
 * A simplified illustrated body silhouette (front/back) with the trained
 * muscle group highlighted — the same visual language as the muscle diagrams
 * in apps like Strong or Hevy. Drawn as vector shapes rather than a bitmap so
 * it stays crisp at any size and costs nothing in app weight, and avoids the
 * licensing issues that come with third-party exercise-illustration packs.
 */
export function MuscleMap({ primary, secondary = [], interactive = true, size = 180 }: MuscleMapProps) {
  const { colors } = useTheme();
  const primaryIsBack = primary ? BACK_MUSCLES.includes(primary) && !FRONT_MUSCLES.includes(primary) : false;
  const [showBack, setShowBack] = useState(primaryIsBack);

  const visibleSet = showBack ? BACK_MUSCLES : FRONT_MUSCLES;
  const wholeBody = primary ? WHOLE_BODY_CATEGORIES.includes(primary) : false;
  const fill = (muscle: MuscleGroup): string => {
    if (wholeBody) return colors.primary + '55';
    if (!visibleSet.includes(muscle)) return colors.surfaceVariant;
    if (muscle === primary || (muscle === 'back' && primary === 'lats')) return colors.primary;
    if (secondary.includes(muscle)) return colors.primary + '55';
    return colors.surfaceVariant;
  };

  const skin = colors.surfaceHighlight;
  const outline = colors.border;

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size * 1.72} viewBox="0 0 300 516">
        {/* Head + neck */}
        <Ellipse cx="150" cy="38" rx="27" ry="31" fill={skin} stroke={outline} strokeWidth="2" />
        <Rect x="137" y="62" width="26" height="24" fill={skin} stroke={outline} strokeWidth="2" />

        {!showBack ? (
          <G>
            {/* Traps (front sliver near neck) */}
            <Path d="M110 88 L137 80 L163 80 L190 88 L163 100 L137 100 Z" fill={fill('traps')} stroke={outline} strokeWidth="2" />
            {/* Shoulders */}
            <Ellipse cx="92" cy="112" rx="26" ry="24" fill={fill('shoulders')} stroke={outline} strokeWidth="2" />
            <Ellipse cx="208" cy="112" rx="26" ry="24" fill={fill('shoulders')} stroke={outline} strokeWidth="2" />
            {/* Chest */}
            <Path d="M118 96 Q150 88 182 96 L188 158 Q150 172 112 158 Z" fill={fill('chest')} stroke={outline} strokeWidth="2" />
            {/* Abs */}
            <Rect x="126" y="162" width="48" height="82" rx="10" fill={fill('abs')} stroke={outline} strokeWidth="2" />
            <Path d="M150 162 V244 M126 182 H174 M126 204 H174 M126 226 H174" stroke={outline} strokeWidth="1.5" opacity={0.5} />
            {/* Biceps */}
            <Rect x="66" y="128" width="30" height="78" rx="14" fill={fill('biceps')} stroke={outline} strokeWidth="2" />
            <Rect x="204" y="128" width="30" height="78" rx="14" fill={fill('biceps')} stroke={outline} strokeWidth="2" />
            {/* Forearms */}
            <Rect x="62" y="206" width="26" height="76" rx="12" fill={fill('forearms')} stroke={outline} strokeWidth="2" />
            <Rect x="212" y="206" width="26" height="76" rx="12" fill={fill('forearms')} stroke={outline} strokeWidth="2" />
            {/* Hips (neutral) */}
            <Path d="M120 246 Q150 258 180 246 L184 282 Q150 296 116 282 Z" fill={skin} stroke={outline} strokeWidth="2" />
            {/* Quads */}
            <Rect x="118" y="286" width="34" height="118" rx="16" fill={fill('quads')} stroke={outline} strokeWidth="2" />
            <Rect x="148" y="286" width="34" height="118" rx="16" fill={fill('quads')} stroke={outline} strokeWidth="2" />
            {/* Calves (front = shins, neutral tone unless selected) */}
            <Rect x="120" y="410" width="28" height="92" rx="12" fill={fill('calves')} stroke={outline} strokeWidth="2" />
            <Rect x="152" y="410" width="28" height="92" rx="12" fill={fill('calves')} stroke={outline} strokeWidth="2" />
          </G>
        ) : (
          <G>
            {/* Traps (back) */}
            <Path d="M104 86 L150 78 L196 86 L176 118 L150 128 L124 118 Z" fill={fill('traps')} stroke={outline} strokeWidth="2" />
            {/* Shoulders (rear delts) */}
            <Ellipse cx="92" cy="112" rx="26" ry="24" fill={fill('shoulders')} stroke={outline} strokeWidth="2" />
            <Ellipse cx="208" cy="112" rx="26" ry="24" fill={fill('shoulders')} stroke={outline} strokeWidth="2" />
            {/* Back (lats) */}
            <Path d="M116 120 Q150 132 184 120 L192 220 Q150 238 108 220 Z" fill={fill('back')} stroke={outline} strokeWidth="2" />
            {/* Triceps */}
            <Rect x="66" y="128" width="30" height="78" rx="14" fill={fill('triceps')} stroke={outline} strokeWidth="2" />
            <Rect x="204" y="128" width="30" height="78" rx="14" fill={fill('triceps')} stroke={outline} strokeWidth="2" />
            {/* Forearms */}
            <Rect x="62" y="206" width="26" height="76" rx="12" fill={fill('forearms')} stroke={outline} strokeWidth="2" />
            <Rect x="212" y="206" width="26" height="76" rx="12" fill={fill('forearms')} stroke={outline} strokeWidth="2" />
            {/* Glutes */}
            <Path d="M116 222 Q150 236 184 222 L188 268 Q150 284 112 268 Z" fill={fill('glutes')} stroke={outline} strokeWidth="2" />
            {/* Hamstrings */}
            <Rect x="118" y="270" width="34" height="120" rx="16" fill={fill('hamstrings')} stroke={outline} strokeWidth="2" />
            <Rect x="148" y="270" width="34" height="120" rx="16" fill={fill('hamstrings')} stroke={outline} strokeWidth="2" />
            {/* Calves */}
            <Rect x="120" y="394" width="28" height="92" rx="12" fill={fill('calves')} stroke={outline} strokeWidth="2" />
            <Rect x="152" y="394" width="28" height="92" rx="12" fill={fill('calves')} stroke={outline} strokeWidth="2" />
          </G>
        )}
      </Svg>

      {interactive && (
        <View style={styles.toggleRow}>
          <TouchableOpacity
            onPress={() => setShowBack(false)}
            style={[styles.toggleBtn, { backgroundColor: !showBack ? colors.primary : colors.surfaceVariant }]}
            accessibilityRole="button"
            accessibilityLabel="Ver vista da frente"
            accessibilityState={{ selected: !showBack }}
          >
            <Text style={[styles.toggleText, { color: !showBack ? '#fff' : colors.textSecondary }]}>Frente</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowBack(true)}
            style={[styles.toggleBtn, { backgroundColor: showBack ? colors.primary : colors.surfaceVariant }]}
            accessibilityRole="button"
            accessibilityLabel="Ver vista de costas"
            accessibilityState={{ selected: showBack }}
          >
            <Text style={[styles.toggleText, { color: showBack ? '#fff' : colors.textSecondary }]}>Costas</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 10 },
  toggleText: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16 },
});
