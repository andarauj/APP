import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { Card } from '@/components/ui/Card';
import { DonutChart } from '@/components/ui/DonutChart';
import { muscleColor } from '@/components/ui/ExerciseTile';
import { getMonthlyRecapData } from '@/db/workoutDao';
import { compareMonths, type MonthlyRecapData } from '@/utils/monthlyRecap';
import { formatVolume, formatTime, monthName } from '@/utils/format';
import { MUSCLE_GROUPS_PT, type MuscleGroup } from '@/types';
import { hapticSelect } from '@/utils/haptics';
import { ChevronLeft, ChevronRight, Trophy, Flame, Clock } from 'lucide-react-native';

export default function MonthlyRecapScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [current, setCurrent] = useState<MonthlyRecapData | null>(null);
  const [previous, setPrevious] = useState<MonthlyRecapData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isReady) return;
    setLoading(true);
    try {
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const [cur, prev] = await Promise.all([
        getMonthlyRecapData(year, month),
        getMonthlyRecapData(prevYear, prevMonth),
      ]);
      setCurrent(cur);
      setPrevious(prev);
    } catch (err) {
      console.error('Failed to load monthly recap:', err);
      setCurrent(null);
    } finally {
      setLoading(false);
    }
  }, [isReady, year, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const changeMonth = (delta: number) => {
    hapticSelect();
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 0) { newMonth = 11; newYear -= 1; }
    if (newMonth > 11) { newMonth = 0; newYear += 1; }
    setMonth(newMonth);
    setYear(newYear);
  };

  // Never allow navigating into a future month — there's nothing to show,
  // and it avoids an empty, slightly confusing screen for "next month".
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const comparison = current ? compareMonths(current, previous) : null;
  const hasData = current && current.totalWorkouts > 0;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar">
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>O Teu Mês</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => changeMonth(-1)} accessibilityRole="button" accessibilityLabel="Mês anterior" hitSlop={10}>
          <ChevronLeft size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.text }]}>{monthName(month)} {year}</Text>
        <TouchableOpacity
          onPress={() => !isCurrentMonth && changeMonth(1)}
          accessibilityRole="button"
          accessibilityLabel="Mês seguinte"
          hitSlop={10}
          disabled={isCurrentMonth}
        >
          <ChevronRight size={22} color={isCurrentMonth ? colors.textTertiary : colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!loading && !hasData && (
          <Card style={{ alignItems: 'center', padding: 32, gap: 8 }}>
            <Flame size={40} color={colors.textTertiary} />
            <Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 17 }}>Sem treinos neste mês</Text>
            <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center' }}>
              Ainda não há dados para {monthName(month)}.
            </Text>
          </Card>
        )}

        {hasData && current && comparison && (
          <>
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{current.totalWorkouts}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>treinos</Text>
                {comparison.workoutsTrend && (
                  <Text style={[styles.statDelta, { color: comparison.workoutsTrend === 'up' ? colors.success : comparison.workoutsTrend === 'down' ? colors.warning : colors.textTertiary }]}>
                    {comparison.workoutsDelta > 0 ? '+' : ''}{comparison.workoutsDelta} vs mês anterior
                  </Text>
                )}
              </Card>
              <Card style={styles.statCard}>
                <Text style={[styles.statValue, { color: colors.secondary }]}>{formatVolume(current.totalVolume)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>volume total</Text>
                {comparison.volumeTrend && (
                  <Text style={[styles.statDelta, { color: comparison.volumeTrend === 'up' ? colors.success : comparison.volumeTrend === 'down' ? colors.warning : colors.textTertiary }]}>
                    {comparison.volumeDelta > 0 ? '+' : ''}{formatVolume(comparison.volumeDelta)} vs anterior
                  </Text>
                )}
              </Card>
            </View>

            <Card style={styles.statCardWide}>
              <Clock size={18} color={colors.accent} />
              <Text style={[styles.wideStatText, { color: colors.text }]}>{formatTime(current.totalDuration)} de treino este mês</Text>
            </Card>

            {current.prCount > 0 && (
              <Card style={[styles.prCard, { backgroundColor: colors.accentContainer }]}>
                <Trophy size={22} color={colors.accent} />
                <Text style={[styles.prCardText, { color: colors.text }]}>
                  {current.prCount} {current.prCount === 1 ? 'novo recorde pessoal' : 'novos recordes pessoais'} este mês
                </Text>
              </Card>
            )}

            {current.muscleDistribution.length > 0 && (
              <Card style={{ alignItems: 'center', gap: 12 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Distribuição Muscular</Text>
                <DonutChart
                  slices={current.muscleDistribution.map(m => ({
                    label: MUSCLE_GROUPS_PT[m.muscle as MuscleGroup] || m.muscle,
                    value: m.sets,
                    color: muscleColor(m.muscle as MuscleGroup),
                  }))}
                  centerValue={comparison.topMuscle ? (MUSCLE_GROUPS_PT[comparison.topMuscle as MuscleGroup] || comparison.topMuscle) : ''}
                  centerLabel="mais treinado"
                />
              </Card>
            )}

            {current.topExercises.length > 0 && (
              <Card>
                <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>Exercícios em Destaque</Text>
                {current.topExercises.map((ex, i) => (
                  <View key={ex.name} style={[styles.exRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <Text style={[styles.exRank, { color: colors.textTertiary }]}>{i + 1}</Text>
                    <Text style={[styles.exName, { color: colors.text }]} numberOfLines={1}>{ex.name}</Text>
                    <Text style={[styles.exCount, { color: colors.textSecondary }]}>{ex.setCount} séries</Text>
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 14 },
  monthLabel: { fontFamily: 'Inter-Bold', fontSize: 17, minWidth: 140, textAlign: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 16 },
  statValue: { fontFamily: 'Inter-Black', fontSize: 28 },
  statLabel: { fontFamily: 'Inter-Regular', fontSize: 12 },
  statDelta: { fontFamily: 'Inter-SemiBold', fontSize: 11, marginTop: 2 },
  statCardWide: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  wideStatText: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  prCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  prCardText: { fontFamily: 'Inter-Bold', fontSize: 15, flex: 1 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 15 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  exRank: { fontFamily: 'Inter-Bold', fontSize: 14, width: 18 },
  exName: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 14 },
  exCount: { fontFamily: 'Inter-Regular', fontSize: 13 },
});
