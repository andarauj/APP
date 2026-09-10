import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { Typography } from '@/constants/typography';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = 'primary', size = 'medium', disabled, loading, icon, style }: ButtonProps) {
  const { colors } = useTheme();

  const getBgColor = () => {
    if (disabled) return colors.surfaceVariant;
    switch (variant) {
      case 'primary': return colors.primary;
      case 'secondary': return colors.secondary;
      case 'danger': return colors.error;
      case 'outline':
      case 'ghost': return 'transparent';
      default: return colors.primary;
    }
  };

  const getTextColor = () => {
    if (disabled) return colors.textTertiary;
    switch (variant) {
      case 'primary': return colors.onPrimary;
      case 'secondary': return colors.onSecondary;
      case 'danger': return colors.onError;
      case 'outline': return colors.primary;
      case 'ghost': return colors.text;
      default: return colors.onPrimary;
    }
  };

  const getBorderColor = () => {
    if (disabled) return colors.border;
    if (variant === 'outline') return colors.primary;
    return 'transparent';
  };

  const getHeight = () => {
    switch (size) {
      case 'small': return 36;
      case 'large': return 56;
      default: return 48;
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'small': return 14;
      case 'large': return 18;
      default: return 16;
    }
  };

  return (
    <AnimatedButtonInner
      title={title} onPress={onPress} disabled={disabled} loading={loading} icon={icon} style={style}
      bgColor={getBgColor()} textColor={getTextColor()} borderColor={getBorderColor()}
      height={getHeight()} fontSize={getFontSize()} outlined={variant === 'outline'}
    />
  );
}

// Split out so the scale animation's shared value doesn't need to be
// recreated on every Button re-render — it's a small perf/clarity win, and
// keeps the color/sizing logic above readable on its own.
function AnimatedButtonInner({
  title, onPress, disabled, loading, icon, style, bgColor, textColor, borderColor, height, fontSize, outlined,
}: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean; icon?: React.ReactNode; style?: ViewStyle;
  bgColor: string; textColor: string; borderColor: string; height: number; fontSize: number; outlined: boolean;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedTouchable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 15, stiffness: 400 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 300 }); }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[
        styles.button,
        { backgroundColor: bgColor, borderColor, height, borderWidth: outlined ? 2 : 0 },
        style,
        animatedStyle,
      ]}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.text, { color: textColor, fontSize }]}>
            {title}
          </Text>
        </View>
      )}
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
});
