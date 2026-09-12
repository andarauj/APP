import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { RADIUS, TYPE } from '@/constants/tokens';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primaryContainer : colors.chip,
          // Pill chips, no ring on the unselected state.
          borderColor: selected ? colors.primary : 'transparent',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
    >
      {/* BUGFIX (WCAG AA audit): textSecondary measures ~2.98:1 against
          the unselected chip's light-mode fill (colors.chip) — under the
          4.5:1 minimum. Selected vs unselected is already unmistakable
          from fill + border color alone, so the unselected label uses
          full-strength text instead of leaning on a second, under-contrast
          cue. */}
      <Text style={[styles.label, { color: selected ? colors.onPrimaryContainer : colors.text }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  label: {
    ...TYPE.caption,
    // BUGFIX: with no explicit lineHeight, Android computes one from the
    // font's own metrics — and for this custom font, on some devices that
    // came out shorter than the glyphs actually need, clipping the text
    // inside the tight 6px vertical padding even though the chip itself
    // rendered at the right size. This was a *different* bug from the
    // ScrollView height-clipping fixed earlier — that fixed the container,
    // this fixes the text within it.
    lineHeight: 18,
  },
});
