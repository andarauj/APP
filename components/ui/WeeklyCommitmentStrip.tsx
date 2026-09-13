import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { Check, Flame } from 'lucide-react-native';
import { WEEKDAY_LABELS, WEEKDAY_FULL_LABELS } from '@/utils/reminders';
import type { WeeklyCommitment, WeekDayStatus } from '@/utils/weeklyCommitment';
import { hapticSelect } from '@/utils/haptics';

const AnimatedCheckWrap = Animated.createAnimatedComponent(View);

function dayAccessibilityLabel(day: WeekDayStatus): string {
  const weekday = WEEKDAY_FULL_LABELS[day.weekday];
  if (day.planned && day.completed) return `${weekday}: Treino Concluído`;
  if (day.isSkipped) return `${weekday}: Treino em Atraso`;
  if (day.completed && !day.planned) return `${weekday}: Treino extra não planeado, concluído`;
  if (day.planned) return `${weekday}: ${day.planLabel} agendado, ainda não feito`;
  return `${weekday}: sem treino agendado`;
}

function dayStatusMessage(day: WeekDayStatus): string {
  if (day.planned && day.completed) return `${day.planLabel} concluído.`;
  if (day.isSkipped) return `${day.planLabel} estava agendado e não foi feito.`;
  if (day.completed && !day.planned) return 'Treino extra, fora do planeado — ainda conta.';
  if (day.planned) return day.isToday ? `${day.planLabel} agendado para hoje.` : `${day.planLabel} agendado.`;
  return 'Nada agendado para este dia.';
}

export function WeeklyCommitmentStrip({ commitment }: { commitment: WeeklyCommitment }) {
  const { colors } = useTheme();
  const router = useRouter();

  const onDayPress = (day: WeekDayStatus) => {
    hapticSelect();
    if (day.isToday || (day.planned && !day.completed)) {
      router.push('/(tabs)');
      return;
    }
    Alert.alert(WEEKDAY_FULL_LABELS[day.weekday], dayStatusMessage(day), [
      { text: 'OK', style: 'cancel' },
      { text: 'Abrir Hoje', onPress: () => router.push('/(tabs)') },
    ]);
  };

  return (
    <View style={styles.container}>
      {commitment.adherencePercent !== null ? (
        <Text style={[styles.headline, { color: colors.text }]}>
          {commitment.adherencePercent}% de adesão esta semana
        </Text>
      ) : (
        <Text style={[styles.headline, { color: colors.textSecondary }]}>
          Sem dias planeados esta semana ainda
        </Text>
      )}

      <View style={styles.daysRow}>
        {commitment.days.map(day => {
          const extraCompleted = day.completed && !day.planned;
          const plainCompleted = day.planned && day.completed;

          let bg = 'transparent';
          let borderColor = colors.border;
          let borderStyle: 'solid' | 'dashed' = 'solid';
          if (plainCompleted) { bg = colors.success; borderColor = colors.success; }
          else if (extraCompleted) { bg = colors.accentContainer; borderColor = colors.accentContainer; }
          else if (day.isSkipped) { borderColor = colors.error; borderStyle = 'dashed'; }

          return (
            <TouchableOpacity
              key={day.weekday}
              style={styles.dayColumn}
              onPress={() => onDayPress(day)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={dayAccessibilityLabel(day)}
            >
              <View style={[styles.dayCellContent, day.isSkipped && styles.skippedContent]}>
                <Text style={[
                  styles.dayLabel,
                  { color: day.isToday ? colors.primary : colors.textTertiary },
                  day.isSkipped && styles.strikeThrough,
                ]}>
                  {WEEKDAY_LABELS[day.weekday]}
                </Text>
                <View
                  style={[
                    styles.dayDot,
                    { backgroundColor: bg, borderColor, borderStyle, borderWidth: day.isToday ? 2 : borderStyle === 'dashed' ? 1.5 : 0 },
                    day.isToday && { borderColor: colors.primary },
                  ]}
                >
                  {plainCompleted && (
                    <AnimatedCheckWrap entering={ZoomIn.springify().damping(14)}>
                      <Check size={14} color={colors.onSecondary} />
                    </AnimatedCheckWrap>
                  )}
                  {extraCompleted && <Flame size={12} color={colors.accent} />}
                </View>
                {day.planLabel && (
                  <Text style={[styles.dayPlanLabel, { color: colors.textTertiary }, day.isSkipped && styles.strikeThrough]} numberOfLines={1}>
                    {day.planLabel}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {commitment.extraCompletedCount > 0 && (
        <Text style={[styles.extraNote, { color: colors.textTertiary }]}>
          +{commitment.extraCompletedCount} treino{commitment.extraCompletedCount === 1 ? '' : 's'} extra{commitment.extraCompletedCount === 1 ? '' : 's'} não planeado{commitment.extraCompletedCount === 1 ? '' : 's'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  headline: { fontFamily: 'Inter-Bold', fontSize: 15 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayColumn: { flex: 1, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dayCellContent: { alignItems: 'center', gap: 5 },
  skippedContent: { opacity: 0.45 },
  strikeThrough: { textDecorationLine: 'line-through' },
  dayLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11 },
  dayDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayPlanLabel: { fontFamily: 'Inter-Regular', fontSize: 9, maxWidth: 44, textAlign: 'center' },
  extraNote: { fontFamily: 'Inter-Regular', fontSize: 12, textAlign: 'center' },
});
