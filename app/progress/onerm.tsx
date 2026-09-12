/**
 * One-rep-max tracker screen — 1RM history, progression, and estimates
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { Card } from '@/components/ui/Card';
import { LineChart } from '@/components/ui/LineChart';
import { getDatabase } from '@/db/database';
import { formatDate } from '@/utils/format';
import { calculate1RM as estimate1RM } from '@/utils/calculators';
import { ChevronLeft, TrendingUp, Zap } from 'lucide-react-native';

interface OneRepMaxRecord {
  date: number;
  weight: number;
  reps: number;
  rpe?: number | null;
  estimated1RM: number;
}

export default function OneRepMaxScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();

  const [loading, setLoading] = useState(true);
  const [exerciseName, setExerciseName] = useState('');
  const [records, setRecords] = useState<OneRepMaxRecord[]>([]);
  const [chartData, setChartData] = useState<number[]>([]);
  const [chartDates, setChartDates] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getDatabase();

      // Get exercise name
      const exercise = await db.getFirstAsync<{ name: string }>(
        'SELECT name FROM exercises WHERE id = ? LIMIT 1',
        [parseInt(exerciseId || '0')]
      );
      if (exercise) setExerciseName(exercise.name);

      // Get top sets by estimated 1RM (last 90 days)
      const now = Math.floor(Date.now() / 1000);
      const since = now - 90 * 86400;

      const sets = await db.getAllAsync<{ completed_at: number; weight: number; reps: number; rpe: number | null }>(
        `SELECT completed_at, weight, reps, rpe FROM workout_sets 
         WHERE exercise_id = ? AND completed_at >= ? AND reps >= 1 AND weight > 0
         ORDER BY completed_at DESC`,
        [parseInt(exerciseId || '0'), since]
      );

      const recordsData: OneRepMaxRecord[] = sets.map(s => ({
        date: s.completed_at,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        estimated1RM: estimate1RM(s.weight, s.reps),
      }));

      setRecords(recordsData);
      // recordsData is newest-first (matches the query's ORDER BY); the
      // chart reads left-to-right chronologically, so both need reversing.
      const chronological = [...recordsData].reverse();
      setChartData(chronological.map(r => r.estimated1RM));
      setChartDates(chronological.map(r => formatDate(r.date * 1000)));
    } catch (err) {
      console.error('Failed to load 1RM data:', err);
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    if (!isReady) return;
    // Opened from the progress hub there is no exerciseId: there is nothing to
    // load, so drop out of the loading state and let the empty view render
    // instead of spinning forever.
    if (!exerciseId) {
      setLoading(false);
      return;
    }
    loadData();
  }, [isReady, exerciseId, loadData]);

  const current1RM = records.length > 0 ? records[0].estimated1RM : 0;
  const previous1RM = records.length > 1 ? records[1].estimated1RM : 0;
  const improvement = current1RM - previous1RM;

  const renderRecord = ({ item, index }: { item: OneRepMaxRecord; index: number }) => (
    <View
      style={[
        styles.recordRow,
        {
          backgroundColor: index === 0 ? colors.secondaryContainer : 'transparent',
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.recordDate,
            { color: index === 0 ? colors.secondary : colors.textSecondary },
          ]}
        >
          {formatDate(item.date * 1000)}
        </Text>
      </View>
      <Text
        style={[
          styles.recordWeight,
          { color: colors.text, fontFamily: index === 0 ? 'Inter-Bold' : 'Inter-SemiBold' },
        ]}
      >
        {item.weight}kg × {item.reps} reps
      </Text>
      <Text
        style={[
          styles.record1RM,
          { color: index === 0 ? colors.secondary : colors.primary },
        ]}
      >
        ~{item.estimated1RM.toFixed(1)}kg
      </Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          1RM - {exerciseName}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {records.length === 0 ? (
            <Card>
              <View style={styles.emptyState}>
                <Zap size={40} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.text }]}>
                  Sem dados de 1RM
                </Text>
                <Text style={[styles.emptySubText, { color: colors.textSecondary }]}>
                  Completa sets para começar a rastrear o teu máximo estimado
                </Text>
              </View>
            </Card>
          ) : (
            <>
              {/* Current 1RM Card */}
              <Card>
                <View style={styles.currentrmContainer}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.currentrmLabel, { color: colors.textSecondary }]}>
                      1RM Estimado
                    </Text>
                    <Text style={[styles.currentrmValue, { color: colors.text }]}>
                      {current1RM.toFixed(1)}kg
                    </Text>
                  </View>
                  {improvement !== 0 && (
                    <View
                      style={[
                        styles.improvementBadge,
                        {
                          backgroundColor:
                            improvement > 0
                              ? colors.secondaryContainer
                              : colors.primaryContainer,
                        },
                      ]}
                    >
                      <TrendingUp
                        size={16}
                        color={improvement > 0 ? colors.secondary : colors.primary}
                      />
                      <Text
                        style={[
                          styles.improvementText,
                          {
                            color: improvement > 0 ? colors.secondary : colors.primary,
                          },
                        ]}
                      >
                        {improvement > 0 ? '+' : ''}{improvement.toFixed(1)}kg
                      </Text>
                    </View>
                  )}
                </View>
              </Card>

              {/* Progression Chart — LineChart renders its own clean
                  "Sem dados suficientes" placeholder below 2 points, so this
                  card shows whenever there's at least one record instead of
                  disappearing outright while there's too little to plot. */}
              <Card>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Progressão</Text>
                <LineChart
                  data={chartDates.map((label, idx) => ({ value: chartData[idx], label }))}
                  height={200}
                  color={colors.primary}
                  unit="kg"
                />
              </Card>

              {/* Records List */}
              <Card>
                <Text style={[styles.recordsTitle, { color: colors.text }]}>
                  Histórico (últimos 90 dias)
                </Text>
                <FlatList
                  data={records}
                  renderItem={renderRecord}
                  keyExtractor={(_, idx) => idx.toString()}
                  scrollEnabled={false}
                />
              </Card>

              {/* Info */}
              <Card>
                <Text style={[styles.infoTitle, { color: colors.text }]}>
                  Sobre o 1RM Estimado
                </Text>
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                  Os valores são calculados pela fórmula de Epley: 1RM = peso × (1 +
                  reps/30). Quanto melhor o RPE, mais preciso o cálculo.
                </Text>
              </Card>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: { fontFamily: 'Inter-SemiBold', fontSize: 16, flex: 1, textAlign: 'center' },
  content: { paddingHorizontal: 12, paddingVertical: 16, gap: 12, paddingBottom: 32 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyText: { fontFamily: 'Inter-SemiBold', fontSize: 16 },
  emptySubText: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, textAlign: 'center' },
  currentrmContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  currentrmLabel: { fontFamily: 'Inter-Regular', fontSize: 12 },
  currentrmValue: { fontFamily: 'Inter-Black', fontSize: 36, marginTop: 4 },
  improvementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  improvementText: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16 },
  chartTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14, marginBottom: 12 },
  recordsTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14, marginBottom: 8 },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    // 44dp minimum touch target — this row has no onPress today, but stays
    // consistent with every other tappable/near-tappable row in the app.
    minHeight: 44,
  },
  recordDate: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16 },
  recordWeight: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16 },
  record1RM: { fontFamily: 'Inter-Bold', fontSize: 12, lineHeight: 16, minWidth: 60, textAlign: 'right' },
  infoTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14, marginBottom: 8 },
  infoText: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18 },
});
