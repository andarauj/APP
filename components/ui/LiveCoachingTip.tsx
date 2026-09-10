/**
 * Live coaching tip display — shows real-time tips during workout
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import type { CoachingTip } from '@/utils/livCoachingTips';
import { Flame, AlertCircle, Target, Lightbulb, TrendingUp, Activity, X } from 'lucide-react-native';

interface LiveCoachingTipProps {
  tip: CoachingTip;
  onDismiss?: () => void;
  animated?: boolean;
}

const ICON_MAP = {
  fire: Flame,
  alert: AlertCircle,
  target: Target,
  lightbulb: Lightbulb,
  'arrow-up': TrendingUp,
  pulse: Activity,
};

const TYPE_CONFIG = {
  positive: {
    bgColor: '#ecfdf5',
    borderColor: '#10b981',
    textColor: '#047857',
    iconColor: '#10b981',
  },
  warning: {
    bgColor: '#fffbeb',
    borderColor: '#f59e0b',
    textColor: '#92400e',
    iconColor: '#f59e0b',
  },
  info: {
    bgColor: '#eff6ff',
    borderColor: '#3b82f6',
    textColor: '#1e40af',
    iconColor: '#3b82f6',
  },
  tip: {
    bgColor: '#faf5ff',
    borderColor: '#8b5cf6',
    textColor: '#6b21a8',
    iconColor: '#8b5cf6',
  },
};

export function LiveCoachingTip({ tip, onDismiss, animated = true }: LiveCoachingTipProps) {
  const config = TYPE_CONFIG[tip.type];
  const IconComponent = ICON_MAP[tip.icon] || Lightbulb;

  const tipContent = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: config.bgColor,
          borderColor: config.borderColor,
        },
      ]}
    >
      {/* Left icon */}
      <View style={styles.iconContainer}>
        <IconComponent size={18} color={config.iconColor} strokeWidth={2} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.title, { color: config.textColor }]}>
          {tip.title}
        </Text>
        <Text style={[styles.message, { color: config.textColor }]} numberOfLines={2}>
          {tip.message}
        </Text>
      </View>

      {/* Dismiss button */}
      {onDismiss && (
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={8}
          style={styles.dismissBtn}
        >
          <X size={16} color={config.textColor} strokeWidth={2.5} />
        </TouchableOpacity>
      )}
    </View>
  );

  if (animated) {
    return (
      <Animated.View
        entering={SlideInDown.springify()}
        exiting={FadeOut}
        style={{ marginVertical: 2 }}
      >
        {tipContent}
      </Animated.View>
    );
  }

  return <View style={{ marginVertical: 2 }}>{tipContent}</View>;
}

/**
 * Stack of multiple coaching tips
 */
interface LiveCoachingStackProps {
  tips: CoachingTip[];
  maxTips?: number;
  onDismiss?: (index: number) => void;
}

export function LiveCoachingStack({ tips, maxTips = 2, onDismiss }: LiveCoachingStackProps) {
  const visibleTips = tips.slice(0, maxTips);

  if (visibleTips.length === 0) return null;

  return (
    <View style={styles.stack}>
      {visibleTips.map((tip, idx) => (
        <LiveCoachingTip
          key={`${tip.title}-${idx}`}
          tip={tip}
          onDismiss={onDismiss ? () => onDismiss(idx) : undefined}
          animated
        />
      ))}
      {tips.length > maxTips && (
        <Text style={[styles.more, { color: '#666' }]}>
          +{tips.length - maxTips} mais dica{tips.length - maxTips > 1 ? 's' : ''}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  content: {
    flex: 1,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    marginBottom: 2,
  },
  message: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  dismissBtn: {
    padding: 4,
  },
  stack: {
    gap: 6,
  },
  more: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
});
