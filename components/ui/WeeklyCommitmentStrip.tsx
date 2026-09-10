import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Check, Flame } from 'lucide-react-native';
import { WEEKDAY_LABELS } from '@/utils/reminders';
import type { WeeklyCommitment } from '@/utils/weeklyCommitment';

/** The weekly commitment strip — 7 days, each showing what was planned (if
 *  anything) and whether it actually happened, plus the adherence
 *  percentage. Answers "what are we doing this week, and how's it gone" in
 *  one glance, distinct from Progress Index (which compares to your own
 *  rolling average, not an explicit plan you set for yourself). */
export function WeeklyCommitmentStrip({ commitment }: { commitment: WeeklyCommitment }) {
  const { colors } = useTheme();

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
          let bg = colors.surfaceVariant;
          let border = 'transparent';
          if (day.planned && day.completed) bg = colors.success;
          else if (day.planned && day.isPast && !day.completed) bg = colors.errorContainer;
          else if (day.completed && !day.planned) bg = colors.accentContainer;
          if (day.isToday) border = colors.primary;

          return (
            <View key={day.weekday} style={styles.dayColumn}>
              <Text style={[styles.dayLabel, { color: day.isToday ? colors.primary : colors.textTertiary }]}>
                {WEEKDAY_LABELS[day.weekday]}
              </Text>
              <View style={[styles.dayDot, { backgroundColor: bg, borderColor: border, borderWidth: day.isToday ? 2 : 0 }]}>
                {day.planned && day.completed && <Check size={14} color="#fff" />}
                {day.completed && !day.planned && <Flame size={12} color={colors.accent} />}
              </View>
              {day.planLabel && (
                <Text style={[styles.dayPlanLabel, { color: colors.textTertiary }]} numberOfLines={1}>
                  {day.planLabel}
                </Text>
              )}
            </View>
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
  dayColumn: { alignItems: 'center', gap: 5, flex: 1 },
  dayLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11 },
  dayDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayPlanLabel: { fontFamily: 'Inter-Regular', fontSize: 9, maxWidth: 44, textAlign: 'center' },
  extraNote: { fontFamily: 'Inter-Regular', fontSize: 12, textAlign: 'center' },
});
