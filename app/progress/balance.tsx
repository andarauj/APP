/**
 * Muscle Balance Screen — radar chart showing weekly volume distribution
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { Card } from '@/components/ui/Card';
import { MuscleBalanceRadar, type MuscleVolumeData } from '@/components/ui/MuscleBalanceRadar';
import { getWeeklyVolumeByMuscle } from '@/db/workoutDao';
import { MUSCLE_GROUPS_PT } from '@/types';
import { ChevronLeft, TrendingUp, Activity } from 'lucide-react-native';

export default function MuscleBalanceScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();
  const { daysBack = '30' } = useLocalSearchParams<{ daysBack?: string }>();

  const [loading, setLoading] = useState(true);
  const [radarData, setRadarData] = useState<MuscleVolumeData[]>([]);
  const [timeFrame, setTimeFrame] = useState<number>(parseInt(daysBack || '30'));

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const volumeByMuscle = await getWeeklyVolumeByMuscle(timeFrame);
      
      const totalVolume = volumeByMuscle.reduce((sum, m) => sum + m.sets, 0);
      const radarChartData: MuscleVolumeData[] = volumeByMuscle.map(m => ({
        muscle: MUSCLE_GROUPS_PT[m.muscle as keyof typeof MUSCLE_GROUPS_PT] || m.muscle,
        sets: m.sets,
        percentage: totalVolume > 0 ? (m.sets / totalVolume) * 100 : 0,
      }));

      // Sort by volume descending
      radarChartData.sort((a, b) => b.sets - a.sets);
      setRadarData(radarChartData);
    } catch (err) {
      console.error('Failed to load muscle balance:', err);
    } finally {
      setLoading(false);
    }
  }, [timeFrame]);

  useEffect(() => {
    if (!isReady) return;
    loadData();
  }, [isReady, loadData]);

  const balanceRating = () => {
    if (radarData.length === 0) return 'N/A';
    
    // Coefficient of variation — lower is more balanced
    const percentages = radarData.map(d => d.percentage);
    const mean = percentages.reduce((a, b) => a + b, 0) / percentages.length;
    const variance = percentages.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / percentages.length;
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / mean) * 100;

    if (cv < 30) return 'Excelente';
    if (cv < 50) return 'Muito Boa';
    if (cv < 70) return 'Boa';
    return 'Desequilibrada';
  };

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
        <Text style={[styles.title, { color: colors.text }]}>Equilíbrio Muscular</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Time frame selector */}
        <View style={styles.timeFrameSelector}>
          {[7, 14, 30, 60, 90].map(days => (
            <TouchableOpacity
              key={days}
              style={[
                styles.timeFrameBtn,
                {
                  backgroundColor: timeFrame === days ? colors.primary : colors.surface,
                  borderColor: timeFrame === days ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setTimeFrame(days)}
            >
              <Text
                style={[
                  styles.timeFrameText,
                  { color: timeFrame === days ? '#fff' : colors.text },
                ]}
              >
                {days}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Radar Chart */}
            <Card>
              <MuscleBalanceRadar data={radarData} size={300} />
            </Card>

            {/* Rating Card */}
            <Card>
              <View style={styles.ratingRow}>
                <View style={[styles.ratingBadge, { backgroundColor: colors.secondaryContainer }]}>
                  <Activity size={20} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.ratingLabel, { color: colors.textSecondary }]}>
                    Equilíbrio
                  </Text>
                  <Text style={[styles.ratingValue, { color: colors.text }]}>
                    {balanceRating()}
                  </Text>
                </View>
                <TrendingUp size={20} color={colors.secondary} />
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <Text style={[styles.statsTitle, { color: colors.textSecondary }]}>
                Volume por Grupo Muscular
              </Text>

              {radarData.map((item, idx) => (
                <View key={idx} style={[styles.volumeRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.muscleName, { color: colors.text }]}>
                    {item.muscle}
                  </Text>
                  <View style={styles.volumeBar}>
                    <View
                      style={[
                        styles.volumeFill,
                        { width: `${item.percentage}%`, backgroundColor: colors.primary },
                      ]}
                    />
                  </View>
                  <Text style={[styles.volumeText, { color: colors.textSecondary }]}>
                    {item.percentage.toFixed(0)}% ({item.sets}s)
                  </Text>
                </View>
              ))}
            </Card>

            {/* Tips */}
            <Card>
              <Text style={[styles.tipsTitle, { color: colors.text }]}>Dicas</Text>
              <Text style={[styles.tipsText, { color: colors.textSecondary }]}>
                • Ideal: cada grupo muscular 15-20% do volume total{'\n'}
                • Evita desequilíbrios que podem levar a lesão{'\n'}
                • Usa este gráfico para ajustar o plano de treino
              </Text>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontFamily: 'Inter-SemiBold', fontSize: 18 },
  content: { paddingHorizontal: 12, paddingVertical: 16, gap: 12, paddingBottom: 32 },
  timeFrameSelector: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 8 },
  timeFrameBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  timeFrameText: { fontFamily: 'Inter-SemiBold', fontSize: 12 },
  loadingContainer: { height: 300, alignItems: 'center', justifyContent: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ratingBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  ratingLabel: { fontFamily: 'Inter-Regular', fontSize: 12 },
  ratingValue: { fontFamily: 'Inter-Bold', fontSize: 18, marginTop: 2 },
  divider: { height: 1, marginVertical: 12 },
  statsTitle: { fontFamily: 'Inter-SemiBold', fontSize: 13, marginBottom: 12 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  muscleName: { fontFamily: 'Inter-SemiBold', fontSize: 13, width: 80 },
  volumeBar: { flex: 1, height: 6, backgroundColor: '#00000010', borderRadius: 3, overflow: 'hidden' },
  volumeFill: { height: '100%', borderRadius: 3 },
  volumeText: { fontFamily: 'Inter-Regular', fontSize: 12, minWidth: 50, textAlign: 'right' },
  tipsTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14, marginBottom: 8 },
  tipsText: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 18 },
});
