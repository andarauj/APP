import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { getMuscleRecency, getFatigueRadarExerciseData } from '@/db/workoutDao';
import { getLatestBodyMetric, getAllBodyMetrics } from '@/db/bodyMetricsDao';
import { getSettingWithDefault } from '@/db/settingsDao';
import { analyzeBody } from '@/utils/bodyAnalysis';
import { generateTodaysWorkout, AVAILABLE_DURATIONS } from '@/utils/planGenerator';
import { selectTodaysMuscles, muscleGroupCountForMinutes } from '@/utils/dailyWorkoutGenerator';
import { detectPerformanceRegression, detectRpeCreep } from '@/utils/fatigueSignals';
import { MUSCLE_GROUPS_PT, type MuscleGroup } from '@/types';
import { hapticSelect, hapticSuccess } from '@/utils/haptics';
import { ChevronLeft, Sparkles, Clock, ShieldAlert } from 'lucide-react-native';

export default function SmartWorkoutScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();

  const [minutes, setMinutes] = useState(60);
  const [preview, setPreview] = useState<{ muscle: MuscleGroup; daysSinceLastTrained: number | null }[]>([]);
  const [restingMuscles, setRestingMuscles] = useState<MuscleGroup[]>([]);
  const [generating, setGenerating] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!isReady) return;
    try {
      const [recency, fatigueData, latest, heightCm, allMetrics] = await Promise.all([
        getMuscleRecency(),
        getFatigueRadarExerciseData(),
        getLatestBodyMetric(),
        getSettingWithDefault('heightCm', ''),
        getAllBodyMetrics(),
      ]);
      const recentHistory = allMetrics.slice(0, 5).reverse();
      const analysis = analyzeBody(latest, heightCm, recentHistory);
      const fatiguedMuscles = Array.from(new Set(
        fatigueData
          .filter(ex => detectPerformanceRegression(ex.points) !== null || detectRpeCreep(ex.rpeSets) !== null)
          .map(ex => ex.primaryMuscle as MuscleGroup)
      ));
      const muscleCount = muscleGroupCountForMinutes(minutes);
      const todaysMuscles = selectTodaysMuscles(
        recency.map(r => ({ muscle: r.muscle as MuscleGroup, daysSinceLastTrained: r.daysSinceLastTrained })),
        muscleCount,
        analysis.focusAreas,
        fatiguedMuscles,
      );
      // Show the reasoning behind the pick, not just the result — matches
      // the same "explain every point" approach as the Progress Index.
      const recencyMap = new Map(recency.map(r => [r.muscle, r.daysSinceLastTrained]));
      setPreview(todaysMuscles.map(m => ({ muscle: m, daysSinceLastTrained: recencyMap.get(m) ?? null })));
      // Only worth mentioning the ones actually skipped BECAUSE of fatigue
      // (not every fatigued muscle — one already resting for other reasons
      // doesn't need a special callout).
      setRestingMuscles(fatiguedMuscles.filter(m => !todaysMuscles.includes(m)));
    } catch (err) {
      console.error('Failed to load smart workout preview:', err);
    }
  }, [isReady, minutes]);

  useFocusEffect(useCallback(() => { loadPreview(); }, [loadPreview]));

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const [latest, heightCm, allMetrics] = await Promise.all([
        getLatestBodyMetric(),
        getSettingWithDefault('heightCm', ''),
        getAllBodyMetrics(),
      ]);
      const recentHistory = allMetrics.slice(0, 5).reverse();
      const analysis = analyzeBody(latest, heightCm, recentHistory);
      const planId = await generateTodaysWorkout(minutes, { bodyAnalysis: analysis });
      hapticSuccess();
      router.replace({ pathname: '/workout/active', params: { planId, planName: 'Treino de Hoje', isSmartWorkout: '1' } });
    } catch (err) {
      console.error('Failed to generate today\'s workout:', err);
      Alert.alert('Erro', 'Não foi possível gerar o treino. Tenta novamente.');
      setGenerating(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar">
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Treino Inteligente</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            Em vez de um plano fixo, a app olha para o que treinaste recentemente e decide agora o que faz sentido treinar hoje — nunca o mesmo dia duas vezes seguidas.
          </Text>
        </Card>

        <Card>
          <View style={styles.sectionHeader}>
            <Clock size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Tempo disponível</Text>
          </View>
          <View style={styles.chipsRow}>
            {AVAILABLE_DURATIONS.map(d => (
              <Chip key={d} label={`${d}min`} selected={minutes === d} onPress={() => { hapticSelect(); setMinutes(d); }} />
            ))}
          </View>
        </Card>

        <Card>
          <View style={styles.sectionHeader}>
            <Sparkles size={18} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Foco de hoje</Text>
          </View>
          {preview.map(p => (
            <View key={p.muscle} style={styles.previewRow}>
              <Text style={[styles.previewMuscle, { color: colors.text }]}>{MUSCLE_GROUPS_PT[p.muscle] || p.muscle}</Text>
              <Text style={[styles.previewReason, { color: colors.textTertiary }]}>
                {p.daysSinceLastTrained === null ? 'ainda não treinado' : p.daysSinceLastTrained === 0 ? 'treinado hoje' : `há ${p.daysSinceLastTrained} dia${p.daysSinceLastTrained === 1 ? '' : 's'}`}
              </Text>
            </View>
          ))}
        </Card>

        {restingMuscles.length > 0 && (
          <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.accentContainer }}>
            <ShieldAlert size={18} color={colors.accent} />
            <Text style={[styles.restingText, { color: colors.text }]}>
              {restingMuscles.map(m => MUSCLE_GROUPS_PT[m] || m).join(', ')} {restingMuscles.length === 1 ? 'ficou' : 'ficaram'} de fora hoje — há sinais de fadiga recentes em{' '}
              {restingMuscles.length === 1 ? 'exercícios desse grupo' : 'exercícios desses grupos'} (ver Sinais de Fadiga no Início).
            </Text>
          </Card>
        )}

        <Button
          title="Gerar e Começar Treino"
          onPress={handleGenerate}
          loading={generating}
          icon={<Sparkles size={18} color="#fff" />}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  introText: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 15 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  previewMuscle: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  previewReason: { fontFamily: 'Inter-Regular', fontSize: 13 },
  restingText: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19 },
});
