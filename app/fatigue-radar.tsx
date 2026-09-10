import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { Card } from '@/components/ui/Card';
import { getProgressIndexData, getFatigueRadarExerciseData } from '@/db/workoutDao';
import { detectVolumeSpike, detectPerformanceRegression, detectRpeCreep, type VolumeSpikeSignal, type RegressionSignal, type RpeCreepSignal } from '@/utils/fatigueSignals';
import { ChevronLeft, Activity, TrendingDown, Gauge, CheckCircle2, Flame } from 'lucide-react-native';

interface ExerciseRegression {
  exerciseName: string;
  signal: RegressionSignal;
}

interface ExerciseRpeCreep {
  exerciseName: string;
  signal: RpeCreepSignal;
}

export default function FatigueRadarScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [volumeSpike, setVolumeSpike] = useState<VolumeSpikeSignal | null>(null);
  const [regressions, setRegressions] = useState<ExerciseRegression[]>([]);
  const [rpeCreeps, setRpeCreeps] = useState<ExerciseRpeCreep[]>([]);

  const load = useCallback(async () => {
    if (!isReady) return;
    setLoading(true);
    try {
      const [progressData, exerciseData] = await Promise.all([
        getProgressIndexData(),
        getFatigueRadarExerciseData(),
      ]);

      setVolumeSpike(detectVolumeSpike(progressData.volumeThisWeek, progressData.avgWeeklyVolume));

      const found: ExerciseRegression[] = [];
      const foundRpe: ExerciseRpeCreep[] = [];
      for (const ex of exerciseData) {
        const signal = detectPerformanceRegression(ex.points);
        if (signal) found.push({ exerciseName: ex.exerciseName, signal });
        const rpeSignal = detectRpeCreep(ex.rpeSets);
        if (rpeSignal) foundRpe.push({ exerciseName: ex.exerciseName, signal: rpeSignal });
      }
      setRegressions(found);
      setRpeCreeps(foundRpe);
    } catch (err) {
      console.error('Failed to load fatigue radar:', err);
    } finally {
      setLoading(false);
    }
  }, [isReady]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const hasAnySignal = volumeSpike !== null || regressions.length > 0 || rpeCreeps.length > 0;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar">
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Sinais de Fadiga</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            Padrões nos teus próprios números que, juntos, costumam aparecer antes de uma lesão de sobrecarga — não é um diagnóstico, é um sinal para prestares atenção. A app não sabe nada sobre sono, stress ou dor; se algo dói, isso conta mais do que qualquer número aqui.
          </Text>
        </Card>

        {!loading && !hasAnySignal && (
          <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 10 }}>
            <CheckCircle2 size={40} color={colors.success} />
            <Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 17 }}>Sem sinais de sobrecarga</Text>
            <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center', paddingHorizontal: 20 }}>
              O teu volume e a tua performance recente estão dentro do que é normal para ti.
            </Text>
          </Card>
        )}

        {volumeSpike && (
          <Card style={[styles.signalCard, { backgroundColor: colors.accentContainer }]}>
            <Gauge size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.signalTitle, { color: colors.text }]}>Salto de volume esta semana</Text>
              <Text style={[styles.signalDesc, { color: colors.textSecondary }]}>
                {volumeSpike.percentAboveAverage}% acima da tua média habitual — um salto grande de uma vez nem sempre deixa tempo para recuperar.
              </Text>
            </View>
          </Card>
        )}

        {regressions.map(r => (
          <Card key={r.exerciseName} style={[styles.signalCard, { backgroundColor: colors.accentContainer }]}>
            <TrendingDown size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.signalTitle, { color: colors.text }]}>{r.exerciseName}</Text>
              <Text style={[styles.signalDesc, { color: colors.textSecondary }]}>
                As últimas sessões ({r.signal.recentOneRM}kg estimado) ficaram {r.signal.percentDecline}% abaixo do teu recente melhor ({r.signal.peakOneRM}kg) — vale a pena rever descanso, sono e stress destas semanas.
              </Text>
            </View>
          </Card>
        ))}

        {rpeCreeps.map(r => (
          <Card key={`rpe-${r.exerciseName}`} style={[styles.signalCard, { backgroundColor: colors.accentContainer }]}>
            <Flame size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.signalTitle, { color: colors.text }]}>{r.exerciseName}</Text>
              <Text style={[styles.signalDesc, { color: colors.textSecondary }]}>
                Os mesmos {r.signal.weight}kg estão a sentir-se mais difíceis (RPE médio {r.signal.historicalAvgRpe} → {r.signal.recentAvgRpe}) — muitas vezes isto aparece antes do peso ou das reps começarem a cair a sério.
              </Text>
            </View>
          </Card>
        ))}

        {hasAnySignal && (
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Activity size={16} color={colors.textSecondary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>O que costuma ajudar</Text>
            </View>
            <Text style={[styles.helpText, { color: colors.textSecondary }]}>
              Uma semana com menos volume (deload), mais horas de sono, ou simplesmente mais alguns dias de descanso entre treinos do mesmo grupo muscular. Se houver dor persistente, isso importa mais do que qualquer número aqui — vale a pena falar com um profissional de saúde.
            </Text>
          </Card>
        )}
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
  signalCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  signalTitle: { fontFamily: 'Inter-Bold', fontSize: 15 },
  signalDesc: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19, marginTop: 3 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 14 },
  helpText: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19 },
});
