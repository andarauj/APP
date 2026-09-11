import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { getSessionById, getSessionSetsWithExercise, updateSession } from '@/db/workoutDao';
import { exportWorkoutAsXml, shareXmlFile, exportWorkoutSummaryText, shareTextFile } from '@/utils/xmlExport';
import type { WorkoutSession , MuscleGroup } from '@/types';
import { formatTime, formatDate } from '@/utils/format';
import { Trophy, Download, Home, Dumbbell, Gauge, Mail } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MUSCLE_GROUPS_PT } from '@/types';
import { summarizeWorkoutPace, rateSetPace, type WorkoutPaceSummary } from '@/utils/setPace';

const PACE_VERDICT_TEXT: Record<WorkoutPaceSummary['verdict'], (p: WorkoutPaceSummary) => string> = {
  fast: () => 'Estás a fazer as séries mais depressa do que o ideal — vale a pena controlar melhor o movimento, sem pressa.',
  slow: () => 'As séries estão a demorar mais do que o necessário — pode ser pausa a mais entre repetições.',
  good: () => 'Ritmo das séries dentro do esperado.',
  mixed: () => 'Ritmo inconsistente esta sessão: algumas séries rápidas, outras lentas.',
  unmeasured: () => '',
};

export default function WorkoutSummaryScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [setsByExercise, setSetsByExercise] = useState<any[]>([]);
  const [prCount, setPrCount] = useState(0);
  const [displayStats, setDisplayStats] = useState({ sets: 0, volume: 0, duration: 0 });
  const [pace, setPace] = useState<WorkoutPaceSummary | null>(null);
  const [sendingSummary, setSendingSummary] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSessionById(Number(sessionId));
      setSession(s);
      const sets = await getSessionSetsWithExercise(Number(sessionId));

      // Group by exercise
      const grouped: Record<number, any> = {};
      for (const set of sets) {
        if (!grouped[set.exercise_id]) {
          grouped[set.exercise_id] = { name: set.exercise_name, muscle: set.primary_muscle, sets: [] };
        }
        grouped[set.exercise_id].sets.push(set);
      }
      setSetsByExercise(Object.values(grouped));
      setPrCount(sets.filter((s: any) => s.is_pr).length);
      setPace(summarizeWorkoutPace(sets.map((s: any) => ({ reps: s.reps, actualSeconds: s.set_duration || 0 }))));

      // BUGFIX: total_sets/total_volume/total_duration on the session row are
      // only written when a workout finishes normally (confirmFinish) or is
      // cancelled (handleCancel). This screen is also reached from the
      // "Treino por terminar" recovery card for a session that was NEVER
      // finished (app closed mid-workout) — for that case the session row
      // still had its original zero defaults, so the stats up top showed
      // "0 séries, 0 kg, 00:00" while the exercise list below correctly
      // showed the sets that were actually logged. Deriving the displayed
      // totals from the logged sets themselves (the ground truth) instead of
      // the session's summary fields fixes this for unfinished sessions and
      // is equally correct for finished ones.
      const realSets = sets.length;
      const realVolume = sets.reduce((sum: number, st: any) => sum + st.reps * st.weight, 0);
      let realDuration = s?.total_duration || 0;
      if (s && !s.ended_at) {
        const lastSetTime = sets.reduce((max: number, st: any) => Math.max(max, st.completed_at || 0), 0);
        realDuration = Math.max(0, (lastSetTime || Math.floor(Date.now() / 1000)) - s.started_at);
      }
      setDisplayStats({ sets: realSets, volume: realVolume, duration: realDuration });
    })();
  }, [sessionId]);

  const handleExport = async () => {
    try {
      const xml = await exportWorkoutAsXml(Number(sessionId));
      const name = session?.name.replace(/\s+/g, '_') || 'Treino';
      await shareXmlFile(xml, `Changes_${name}_${Date.now()}.xml`);
    } catch (e) {
      Alert.alert('Erro ao exportar', String(e));
    }
  };

  /**
   * A short, readable text version of this one workout — sets, volume, PRs,
   * and the pace analysis — for sending to yourself (the OS share sheet
   * includes Gmail/Mail among the targets, same mechanism as the training
   * report in Perfil). Distinct from handleExport's XML, which is for
   * restoring data, not reading.
   */
  const handleSendSummary = async () => {
    setSendingSummary(true);
    try {
      const text = await exportWorkoutSummaryText(Number(sessionId));
      const name = session?.name.replace(/\s+/g, '_') || 'Treino';
      await shareTextFile(text, `Changes_Resumo_${name}_${Date.now()}.txt`, 'text/plain');
    } catch (e) {
      Alert.alert('Erro ao enviar', String(e));
    } finally {
      setSendingSummary(false);
    }
  };

  /**
   * Closes out a workout that was never properly finished (app closed
   * mid-session). Previously the only options for one of these were "view"
   * or "discard" — there was no way to keep the sets already logged and
   * still have the session count correctly in streaks/history, so someone
   * who simply forgot to tap "Terminar" was pushed toward losing their data.
   */
  const handleFinalize = async () => {
    if (!session) return;
    try {
      const now = Math.floor(Date.now() / 1000);
      await updateSession({
        id: session.id,
        ended_at: now,
        total_duration: displayStats.duration,
        total_sets: displayStats.sets,
        total_volume: displayStats.volume,
      });
      setSession({ ...session, ended_at: now });
    } catch (err) {
      console.error('Failed to finalize workout:', err);
      Alert.alert('Erro', 'Não foi possível terminar o treino. Tenta novamente.');
    }
  };

  if (!session) return null;

  const volumePerMuscle: Record<string, number> = {};
  setsByExercise.forEach(ex => {
    const vol = ex.sets.reduce((s: number, set: any) => s + set.weight * set.reps, 0);
    volumePerMuscle[ex.muscle] = (volumePerMuscle[ex.muscle] || 0) + vol;
  });

  return (
    <SafeAreaView edges={['top','bottom']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.heroSection}>
          <View style={[styles.heroIcon, { backgroundColor: colors.secondaryContainer }]}>
            <Dumbbell size={40} color={colors.secondary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Treino Concluído!</Text>
          <Text style={[styles.heroDate, { color: colors.textSecondary }]}>{formatDate(session.started_at)}</Text>
          {prCount > 0 && (
            <View style={[styles.prBanner, { backgroundColor: colors.accentContainer }]}>
              <Trophy size={18} color={colors.accent} />
              <Text style={[styles.prBannerText, { color: colors.accent }]}>
                {prCount} novo{prCount > 1 ? 's' : ''} PR{prCount > 1 ? 's' : ''}!
              </Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <Card style={styles.statsCard}>
          {!session.ended_at && (
            <View style={[styles.unfinishedBanner, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={[styles.unfinishedBannerText, { color: colors.textSecondary }]}>
                Este treino não foi terminado — a mostrar o que já foi registado.
              </Text>
              <TouchableOpacity onPress={handleFinalize} accessibilityRole="button" accessibilityLabel="Terminar este treino agora, guardando as séries já registadas">
                <Text style={[styles.unfinishedBannerAction, { color: colors.primary }]}>Terminar agora</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.statsGrid}>
            <View style={styles.statCell}>
              <Text style={[styles.statVal, { color: colors.primary }]}>{formatTime(displayStats.duration)}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Duração</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statVal, { color: colors.primary }]}>{displayStats.sets}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Séries</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statVal, { color: colors.primary }]}>{Math.round(displayStats.volume)}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>kg Volume</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statVal, { color: colors.primary }]}>{setsByExercise.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Exercícios</Text>
            </View>
          </View>
        </Card>

        {/* Set pace — only shown when at least one set was actually timed
            with the "Tempo de série" stopwatch; most workouts won't have
            this, and there's nothing useful to say when it's empty. */}
        {pace && pace.measuredSets > 0 && (
          <Card style={styles.paceCard}>
            <View style={styles.paceHeader}>
              <Gauge size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Ritmo das séries</Text>
            </View>
            <Text style={[styles.paceVerdict, { color: colors.text }]}>{PACE_VERDICT_TEXT[pace.verdict](pace)}</Text>
            <Text style={[styles.paceDetail, { color: colors.textSecondary }]}>
              Média: {formatTime(Math.round(pace.avgActualSeconds))} por série · ideal ≈ {formatTime(Math.round(pace.avgIdealSeconds))}
              {pace.measuredSets < pace.totalSets ? ` · ${pace.measuredSets} de ${pace.totalSets} séries cronometradas` : ''}
            </Text>
          </Card>
        )}

        {/* Volume by muscle */}
        {Object.keys(volumePerMuscle).length > 0 && (
          <Card>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Volume por músculo</Text>
            {Object.entries(volumePerMuscle)
              .sort((a, b) => b[1] - a[1])
              .map(([muscle, vol]) => {
                const totalVol = Object.values(volumePerMuscle).reduce((a, b) => a + b, 0);
                const pct = totalVol > 0 ? (vol / totalVol) * 100 : 0;
                return (
                  <View key={muscle} style={styles.muscleRow}>
                    <Text style={[styles.muscleName, { color: colors.text }]}>{MUSCLE_GROUPS_PT[muscle as MuscleGroup] || muscle}</Text>
                    <View style={styles.muscleBarBg}>
                      <View style={[styles.muscleBarFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                    </View>
                    <Text style={[styles.muscleVol, { color: colors.textSecondary }]}>{Math.round(vol)} kg</Text>
                  </View>
                );
              })}
          </Card>
        )}

        {/* Exercise breakdown */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Exercícios</Text>
        {setsByExercise.map((ex, i) => (
          <Card key={i} style={styles.exCard}>
            <View style={styles.exHeader}>
              <Text style={[styles.exName, { color: colors.text }]}>{ex.name}</Text>
              <Badge label={MUSCLE_GROUPS_PT[ex.muscle as MuscleGroup] || ex.muscle} color={colors.primaryContainer} textColor={colors.primary} />
            </View>
            {ex.sets.map((set: any, si: number) => {
              const setPace = set.set_duration > 0 ? rateSetPace(set.reps, set.set_duration) : 'unmeasured';
              return (
                <View key={si} style={[styles.setRow, si > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Text style={[styles.setIndex, { color: colors.textTertiary }]}>{si + 1}</Text>
                  <Text style={[styles.setVal, { color: colors.text }]}>{set.reps} × {set.weight} kg</Text>
                  {set.rpe && <Text style={[styles.setRpe, { color: colors.textSecondary }]}>RPE {set.rpe}</Text>}
                  {setPace !== 'unmeasured' && (
                    <Text style={[styles.setPace, { color: setPace === 'good' ? colors.textSecondary : colors.accent }]}>
                      {formatTime(set.set_duration)}
                    </Text>
                  )}
                  {set.is_pr === 1 && <Badge label="PR" color={colors.accentContainer} textColor={colors.accent} />}
                </View>
              );
            })}
          </Card>
        ))}
      </ScrollView>

      {/* Actions */}
      <View style={[styles.actions, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.actionBtnSquare, { backgroundColor: colors.surfaceVariant }]}
          onPress={handleExport}
          accessibilityRole="button"
          accessibilityLabel="Exportar dados deste treino"
        >
          <Download size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtnSquare, { backgroundColor: colors.surfaceVariant }]}
          onPress={handleSendSummary}
          disabled={sendingSummary}
          accessibilityRole="button"
          accessibilityLabel="Enviar resumo deste treino por email"
        >
          <Mail size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={() => router.replace('/(tabs)/history')}>
          <Home size={20} color="#fff" />
          <Text style={[styles.actionBtnText, { color: '#fff' }]}>Ver Histórico</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 100 },
  heroSection: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  heroIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle: { fontFamily: 'Inter-Bold', fontSize: 28 },
  heroDate: { fontFamily: 'Inter-Regular', fontSize: 15 },
  prBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, marginTop: 4 },
  prBannerText: { fontFamily: 'Inter-Bold', fontSize: 16 },
  statsCard: {},
  unfinishedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  unfinishedBannerText: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, flex: 1 },
  unfinishedBannerAction: { fontFamily: 'Inter-Bold', fontSize: 12, lineHeight: 16 },
  statsGrid: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  statVal: { fontFamily: 'Inter-Bold', fontSize: 22 },
  statLabel: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  statDivider: { width: 1, height: 36 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 18 },
  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  muscleName: { fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17, width: 90 },
  muscleBarBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#ffffff18', overflow: 'hidden' },
  muscleBarFill: { height: 8, borderRadius: 4 },
  muscleVol: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, width: 60, textAlign: 'right' },
  exCard: { gap: 8 },
  exHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exName: { fontFamily: 'Inter-SemiBold', fontSize: 15, flex: 1, marginRight: 8 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8 },
  setIndex: { fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17, width: 20 },
  setVal: { fontFamily: 'Inter-SemiBold', fontSize: 15, flex: 1 },
  setRpe: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17 },
  actions: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionBtnSquare: { width: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  actionBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  paceCard: { gap: 6 },
  paceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paceVerdict: { fontFamily: 'Inter-SemiBold', fontSize: 14, lineHeight: 19 },
  paceDetail: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16 },
  setPace: { fontFamily: 'Inter-Regular', fontSize: 12 },
});
