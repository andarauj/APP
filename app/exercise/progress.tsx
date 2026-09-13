import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, SafeAreaView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Zap } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { getExerciseById } from '@/db/exerciseDao';
import { getExerciseProgression, getProgressionSuggestionForExercise, getSetsForExerciseHistory } from '@/db/workoutDao';
import { LineChart, StatCard } from '@/components/ui/Charts';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import type { Exercise, WorkoutSet } from '@/types';
import { formatVolume } from '@/utils/format';

export default function ExerciseProgressScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const { exerciseId: idParam } = useLocalSearchParams();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [progression, setProgression] = useState<any[]>([]);
  const [history, setHistory] = useState<WorkoutSet[]>([]);
  const [suggestion, setSuggestion] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const exerciseId = Number(idParam);

  useEffect(() => {
    if (!isReady || !exerciseId) return;

    (async () => {
      setLoading(true);
      try {
        const [ex, prog, hist, sug] = await Promise.all([
          getExerciseById(exerciseId),
          getExerciseProgression(exerciseId, 180),
          getSetsForExerciseHistory(exerciseId, 30),
          getProgressionSuggestionForExercise(exerciseId),
        ]);

        setExercise(ex);
        setProgression(prog);
        setHistory(hist);
        setSuggestion(sug);
      } catch (err) {
        console.error('Failed to load exercise progression:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [isReady, exerciseId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title="A carregar..." showBack />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!exercise) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Exercício não encontrado" showBack />
      </SafeAreaView>
    );
  }

  // Calcular estatísticas
  const stats = {
    totalSets: history.length,
    avgWeight: history.length > 0 ? Math.round(history.reduce((s, h) => s + h.weight, 0) / history.length * 100) / 100 : 0,
    maxWeight: Math.max(...history.map(h => h.weight), 0),
    totalVolume: history.reduce((s, h) => s + h.weight * h.reps, 0),
  };

  // Dados para gráfico (últimos 30 sets)
  const chartData = progression.slice(-30).map((p, i) => ({
    label: `Set ${i + 1}`,
    value: p.weight,
  }));

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={exercise.name} subtitle="Progressão detalhada" showBack />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Sugestão de Progressão */}
        {suggestion && (
          <Card style={styles.suggestionCard}>
            <View style={styles.suggestionHeader}>
              <Zap size={20} color={colors.secondary} />
              <Text style={[styles.suggestionTitle, { color: colors.text }]}>Próxima Progressão</Text>
            </View>
            <Text style={[styles.suggestionReasoning, { color: colors.textSecondary }]}>
              {suggestion.reasoning}
            </Text>
            <View style={styles.suggestionRow}>
              <View>
                <Text style={[styles.suggestionLabel, { color: colors.textTertiary }]}>Atual</Text>
                <Text style={[styles.suggestionValue, { color: colors.text }]}>
                  {suggestion.lastWeight}kg × {suggestion.lastReps}
                </Text>
              </View>
              <Text style={[styles.suggestionArrow, { color: colors.secondary }]}>→</Text>
              <View>
                <Text style={[styles.suggestionLabel, { color: colors.textTertiary }]}>Sugerido</Text>
                <Text style={[styles.suggestionValue, { color: colors.secondary }]}>
                  {suggestion.suggestedWeight}kg
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Estatísticas */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Estatísticas (últimos 30 sets)</Text>
        <View style={styles.statsGrid}>
          <StatCard
            label="Séries"
            value={stats.totalSets}
            color={colors.primary}
          />
          <StatCard
            label="Peso Médio"
            value={`${stats.avgWeight}kg`}
            color={colors.secondary}
          />
          <StatCard
            label="Peso Máximo"
            value={`${stats.maxWeight}kg`}
            color={colors.accent}
          />
          <StatCard
            label="Volume Total"
            value={formatVolume(stats.totalVolume)}
            color={colors.primary}
          />
        </View>

        {/* Gráfico de Progressão */}
        {chartData.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Peso ao Longo do Tempo</Text>
            <View style={[styles.chartContainer, { backgroundColor: colors.surface }]}>
              <LineChart
                data={chartData}
                width={360}
                height={240}
                lineColor={colors.primary}
                dotColor={colors.secondary}
                labelColor={colors.textTertiary}
                backgroundColor={colors.surface}
              />
            </View>
          </>
        )}

        {/* Histórico Recent */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Histórico Recent</Text>
        <View style={styles.historyList}>
          {history.slice(0, 10).map((set, i) => (
            <View
              key={i}
              style={[
                styles.historyRow,
                i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
              ]}
            >
              <View>
                <Text style={[styles.historyDate, { color: colors.text }]}>
                  Set #{history.length - i}
                </Text>
                <Text style={[styles.historySub, { color: colors.textSecondary }]}>
                  {new Date(set.completed_at * 1000).toLocaleDateString('pt-PT')}
                </Text>
              </View>
              <View style={styles.historyStats}>
                <Text style={[styles.historyStat, { color: colors.text }]}>
                  {set.weight}kg × {set.reps}
                </Text>
                {set.rpe !== null && (
                  <Text style={[styles.historyStat, { color: colors.textSecondary }]}>
                    RPE {set.rpe}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 32 },
  
  suggestionCard: {
    marginBottom: 20,
    padding: 16,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  suggestionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  suggestionReasoning: {
    fontSize: 13,
    marginBottom: 12,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestionLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
  },
  suggestionValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  suggestionArrow: {
    fontSize: 20,
    fontWeight: '300',
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 16,
  },
  statsGrid: {
    gap: 10,
  },
  chartContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  historyList: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  historySub: {
    fontSize: 12,
  },
  historyStats: {
    alignItems: 'flex-end',
    gap: 4,
  },
  historyStat: {
    fontSize: 13,
    fontWeight: '600',
  },
});
