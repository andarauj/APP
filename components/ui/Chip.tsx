import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

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
          // JeFit-parity: pill chips, no ring on the unselected state.
          borderColor: selected ? colors.primary : 'transparent',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, { color: selected ? colors.onPrimaryContainer : colors.textSecondary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
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
