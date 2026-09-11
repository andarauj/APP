import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'highlight';
}

export function Card({ children, style, variant = 'default' }: CardProps) {
  const { colors, isDark } = useTheme();
  const highlight = variant === 'highlight';
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: highlight ? colors.surfaceVariant : colors.surface,
          // JeFit-parity: near-borderless cards — a hairline only on the
          // plain white card, none on the grey "highlight" fill.
          borderColor: colors.borderLight,
          borderWidth: highlight ? 0 : StyleSheet.hairlineWidth,
        },
        !highlight && !isDark && styles.shadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 18,
  },
  shadow: {
    shadowColor: 'rgba(16,24,40,0.10)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 1,
  },
});
