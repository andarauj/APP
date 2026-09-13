import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/ui/Card';
import { getSessionsForDate, getWorkoutDatesByMonth } from '@/db/workoutDao';
import { monthName, getDaysInMonth, getFirstDayOfMonth, formatTime, formatVolume } from '@/utils/format';
import { WEEKDAY_LABELS } from '@/utils/reminders';
import type { WorkoutSession } from '@/types';
import { ChevronLeft, ChevronRight, Flame, Calendar } from 'lucide-react-native';
import { useRouter } from 'expo-router';

type Props = {
  currentStreak: number;
  totalSessions: number;
  weekStartDow: number;
  scheduledByDay: Record<number, string>;
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
};

export function AgendaCalendar({
  currentStreak, totalSessions, weekStartDow, scheduledByDay, year, month, onMonthChange,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const [workoutDays, setWorkoutDays] = useState<number[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const today = new Date();

  useEffect(() => {
    getWorkoutDatesByMonth(year, month).then(setWorkoutDays).catch(() => setWorkoutDays([]));
    setSelectedDay(null);
    setSessions([]);
  }, [year, month]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfMonth(year, month);
  const leading = (firstDow - weekStartDow + 7) % 7;
  const headers = Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(weekStartDow + i) % 7]);

  const prevMonth = () => {
    if (month === 0) onMonthChange(year - 1, 11);
    else onMonthChange(year, month - 1);
  };
  const nextMonth = () => {
    if (month === 11) onMonthChange(year + 1, 0);
    else onMonthChange(year, month + 1);
  };

  const handleDayPress = async (day: number) => {
    setSelectedDay(day);
    try {
      setSessions(await getSessionsForDate(year, month, day));
    } catch {
      setSessions([]);
    }
  };

  const selectedKey = selectedDay ?? -1;
  const scheduledLabel = selectedDay != null ? scheduledByDay[selectedDay] : undefined;
  const selectedDate = selectedDay != null ? new Date(year, month, selectedDay) : null;
  const isFuture = selectedDate != null && selectedDate > new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <Card>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Flame size={16} color={colors.accent} />
          <Text style={[styles.statValue, { color: colors.text }]}>{currentStreak}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Dias seguidos</Text>
        </View>
        <View style={styles.stat}>
          <Calendar size={16} color={colors.primary} />
          <Text style={[styles.statValue, { color: colors.text }]}>{totalSessions}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total de sessões</Text>
        </View>
      </View>

      <View style={styles.calHeader}>
        <TouchableOpacity onPress={prevMonth} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mês anterior">
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.calTitle, { color: colors.text }]}>{monthName(month)} {year}</Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mês seguinte">
          <ChevronRight size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.calWeekdays}>
        {headers.map((d, i) => (
          <Text key={`${d}-${i}`} style={[styles.calWeekday, { color: colors.textTertiary }]}>{d}</Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {Array.from({ length: leading }).map((_, i) => <View key={`e-${i}`} style={styles.calCell} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          const done = workoutDays.includes(day);
          const scheduled = !!scheduledByDay[day];
          const selected = selectedDay === day;
          return (
            <TouchableOpacity
              key={day}
              style={styles.calCell}
              onPress={() => handleDayPress(day)}
              accessibilityRole="button"
              accessibilityLabel={`${day}${done ? ', sessão registada' : scheduled ? ', treino agendado' : ''}`}
            >
              <View style={[
                styles.calDay,
                done && { backgroundColor: colors.primary },
                !done && scheduled && { backgroundColor: colors.secondaryContainer },
                isToday && !done && !scheduled && { borderWidth: 2, borderColor: colors.secondary },
                selected && { borderWidth: 2, borderColor: colors.accent },
              ]}>
                <Text style={[
                  styles.calDayText,
                  { color: done ? colors.onPrimary : colors.text },
                ]}>{day}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedKey > 0 && (
        <View style={styles.dayDetail}>
          {sessions.length > 0 ? sessions.map(session => (
            <TouchableOpacity
              key={session.id}
              style={[styles.sessionRow, { borderColor: colors.border }]}
              onPress={() => router.push({ pathname: '/workout/summary', params: { sessionId: session.id } })}
            >
              <Text style={[styles.sessionName, { color: colors.text }]} numberOfLines={1}>{session.name}</Text>
              <Text style={[styles.sessionMeta, { color: colors.textSecondary }]}>
                {formatTime(session.total_duration)} · {formatVolume(session.total_volume)}
              </Text>
            </TouchableOpacity>
          )) : isFuture && scheduledLabel ? (
            <Text style={[styles.sessionMeta, { color: colors.textSecondary }]}>Agendado: {scheduledLabel}</Text>
          ) : (
            <Text style={[styles.sessionMeta, { color: colors.textTertiary }]}>Sem sessão neste dia.</Text>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontFamily: 'Inter-Black', fontSize: 24 },
  statLabel: { fontFamily: 'Inter-Regular', fontSize: 12 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calTitle: { fontFamily: 'Inter-Bold', fontSize: 16 },
  calWeekdays: { flexDirection: 'row' },
  calWeekday: { flex: 1, textAlign: 'center', fontFamily: 'Inter-SemiBold', fontSize: 11 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calDay: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  calDayText: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
  dayDetail: { marginTop: 12, gap: 8 },
  sessionRow: { borderWidth: 1, borderRadius: 10, padding: 10 },
  sessionName: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  sessionMeta: { fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 2 },
});
