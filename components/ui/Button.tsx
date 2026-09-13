import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { BUTTON_HEIGHT, PRESS_SCALE, PRESS_SPRING_IN, PRESS_SPRING_OUT } from '@/constants/tokens';

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
  className?: string;
}

export function Button({ title, onPress, variant = 'primary', size = 'medium', disabled, loading, icon, style, className }: ButtonProps) {
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
      case 'small': return 38;
      case 'large': return 56;
      default: return BUTTON_HEIGHT;
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'small': return 14;
      case 'large': return 17;
      default: return 16;
    }
  };

  return (
    <AnimatedButtonInner
      title={title} onPress={onPress} disabled={disabled} loading={loading} icon={icon} style={style}
      className={className}
      bgColor={getBgColor()} textColor={getTextColor()} borderColor={getBorderColor()}
      height={getHeight()} fontSize={getFontSize()} outlined={variant === 'outline'}
    />
  );
}

function AnimatedButtonInner({
  title, onPress, disabled, loading, icon, style, className, bgColor, textColor, borderColor, height, fontSize, outlined,
}: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean; icon?: React.ReactNode; style?: ViewStyle;
  className?: string;
  bgColor: string; textColor: string; borderColor: string; height: number; fontSize: number; outlined: boolean;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedTouchable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(PRESS_SCALE, PRESS_SPRING_IN); }}
      onPressOut={() => { scale.value = withSpring(1, PRESS_SPRING_OUT); }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      className={`items-center justify-center rounded-[14px] px-5 ${className ?? ''}`}
      style={[
        { backgroundColor: bgColor, borderColor, height, borderWidth: outlined ? 2 : 0 },
        style,
        animatedStyle,
      ]}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon}
          <Text className="font-sans-bold" style={{ color: textColor, fontSize, fontWeight: '700' }}>
            {title}
          </Text>
        </View>
      )}
    </AnimatedTouchable>
  );
}
