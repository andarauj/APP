import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Calendar, Check as CheckIcon, Plus, AlertCircle, X as XIcon } from 'lucide-react-native';
import type { Theme } from '@/constants/colors';
import { buildRollingThreeWeeks, weekSectionLabel, type CalendarDay } from '@/utils/rollingCalendar';
import type { PlannerEntry } from '@/db/plannerDao';

export type StripDayVisual = {
  entry?: PlannerEntry;
  isDone?: boolean;
  isSkipped?: boolean;
  isBacklog?: boolean;
  title?: string;
};

type Props = {
  colors: Theme;
  /** Map weekday 0–6 → visual for the repeating weekly template. */
  resolveDay: (day: CalendarDay) => StripDayVisual;
  onPressDay: (day: CalendarDay, visual: StripDayVisual) => void;
  onLongPressDay?: (day: CalendarDay, visual: StripDayVisual) => void;
  headerTitle?: string;
  /** Scroll so today is near the start of the viewport. */
  autoScrollToToday?: boolean;
};

/**
 * Horizontal 3-week strip (current + next 2). Reuses the weekly planner
 * template by weekday — future weeks show the same Mon/Wed/… slots until
 * the adaptive engine regenerates them.
 */
export function RollingWeekStrip({
  colors,
  resolveDay,
  onPressDay,
  onLongPressDay,
  headerTitle = 'PRÓXIMAS 3 SEMANAS',
}: Props) {
  const days = buildRollingThreeWeeks();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Calendar size={16} color={colors.textSecondary} />
        <Text style={[styles.headerTitle, { color: colors.textSecondary }]}>{headerTitle}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {[0, 1, 2].map(weekIndex => {
          const weekDays = days.filter(d => d.weekIndex === weekIndex);
          return (
            <View key={weekIndex} style={styles.weekBlock}>
              <Text style={[styles.weekLabel, { color: colors.textTertiary }]}>{weekSectionLabel(weekIndex)}</Text>
              <View style={styles.row}>
                {weekDays.map(day => {
                  const visual = resolveDay(day);
                  const { entry, isDone, isSkipped, isBacklog } = visual;
                  const pastUntracked = day.offsetFromToday < 0 && !isDone && !isSkipped && !entry;
                  return (
                    <TouchableOpacity
                      key={`${weekIndex}-${day.weekday}-${day.dayOfMonth}`}
                      hitSlop={4}
                      style={[
                        styles.day,
                        {
                          backgroundColor: isBacklog ? colors.errorContainer
                            : isDone ? colors.secondaryContainer
                            : isSkipped ? colors.surfaceVariant
                            : entry ? colors.primaryContainer
                            : colors.surfaceVariant,
                        },
                        isSkipped && [styles.daySkipped, { borderColor: colors.border }],
                        !entry && !isSkipped && [styles.dayEmpty, { borderColor: colors.border }],
                        day.isToday && [styles.dayToday, { borderColor: isBacklog ? colors.error : colors.primary }],
                        pastUntracked && { opacity: 0.55 },
                      ]}
                      onPress={() => onPressDay(day, visual)}
                      onLongPress={onLongPressDay ? () => onLongPressDay(day, visual) : undefined}
                      delayLongPress={400}
                      accessibilityRole="button"
                      accessibilityLabel={`${day.shortLabel} ${day.dayOfMonth}: ${visual.title ?? (entry ? 'Treino' : 'Descanso')}`}
                    >
                      <Text style={[styles.dayLetter, { color: day.isToday ? colors.primary : colors.textSecondary }]}>
                        {day.shortLabel}
                      </Text>
                      <Text style={[styles.dayNum, { color: colors.text }]}>{day.dayOfMonth}</Text>
                      {isDone ? (
                        <CheckIcon size={14} color={colors.secondary} />
                      ) : isSkipped ? (
                        <XIcon size={12} color={colors.textTertiary} />
                      ) : isBacklog ? (
                        <AlertCircle size={12} color={colors.error} />
                      ) : entry ? (
                        <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                      ) : (
                        <Plus size={12} color={colors.textTertiary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1 },
  scroll: { gap: 14, paddingRight: 8 },
  weekBlock: { gap: 6 },
  weekLabel: { fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 0.4 },
  row: { flexDirection: 'row', gap: 6 },
  day: {
    width: 44, minHeight: 64, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 6,
  },
  daySkipped: { opacity: 0.45, borderWidth: 1, borderStyle: 'dashed' },
  dayEmpty: { borderWidth: 1, borderStyle: 'dashed' },
  dayToday: { borderWidth: 2 },
  dayLetter: { fontFamily: 'Inter-SemiBold', fontSize: 10, lineHeight: 12 },
  dayNum: { fontFamily: 'Inter-Bold', fontSize: 13, lineHeight: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 2 },
});
