import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface BadgeProps {
  label: string;
  color?: string;
  textColor?: string;
}

export function Badge({ label, color, textColor }: BadgeProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: color || colors.primaryContainer }]}>
      <Text style={[styles.text, { color: textColor || colors.onPrimaryContainer }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    // Same fix as Chip.tsx — no explicit lineHeight risked clipping the
    // text inside this badge's especially tight 3px vertical padding.
    lineHeight: 15,
  },
});
