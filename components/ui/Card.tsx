import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'highlight';
  /** Extra NativeWind classes merged onto the card shell (layout only — no shadow-*). */
  className?: string;
}

/**
 * Elevated surface card — theme colors for light/dark/oled + NativeWind for
 * radius/padding. Shadows use inline styles (not shadow-* classNames):
 * NativeWind shadow utilities can race Expo Router's navigation context and
 * throw a misleading "Couldn't find a navigation context" RedBox.
 */
export function Card({ children, style, variant = 'default', className }: CardProps) {
  const { colors, isDark, isOled } = useTheme();
  const highlight = variant === 'highlight';
  return (
    <View
      className={`rounded-card border p-[18px] ${className ?? ''}`}
      style={[
        {
          backgroundColor: highlight ? colors.surfaceVariant : colors.surface,
          borderColor: isOled ? colors.primary + '33' : colors.border,
          borderWidth: isOled ? 1 : StyleSheet.hairlineWidth,
          ...(isOled
            ? {}
            : isDark
              ? {
                  shadowColor: '#000',
                  shadowOpacity: 0.35,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 6,
                }
              : {
                  shadowColor: '#000',
                  shadowOpacity: 0.12,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 3,
                }),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
