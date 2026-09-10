import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Chip } from '@/components/ui/Chip';
import { LineChart } from '@/components/ui/LineChart';
import { MuscleMap } from '@/components/ui/MuscleMap';
import { ExerciseMedia } from '@/components/ui/ExerciseMedia';
import { pickExerciseMedia, captureExerciseMedia, removeExerciseMedia } from '@/utils/exerciseMedia';
import { getExerciseById, setExerciseUserNotes, setExerciseMedia } from '@/db/exerciseDao';
import { getSetsForExerciseHistory, getExerciseProgressChart } from '@/db/workoutDao';
import { calculate1RM } from '@/utils/calculators';
import type { Exercise, WorkoutSet } from '@/types';
import { MUSCLE_GROUPS_PT, EQUIPMENT_PT } from '@/types';
import { formatDate, formatDateShort } from '@/utils/format';
import { Dumbbell, TrendingUp, Trophy, LineChart as LineChartIcon, StickyNote, Camera, ImagePlus, Trash2, Check } from 'lucide-react-native';

type ChartMetric = 'weight' | 'volume';

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [history, setHistory] = useState<WorkoutSet[]>([]);
  const [progress, setProgress] = useState<{ date: number; weight: number; volume: number; reps: number }[]>([]);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('weight');
  const [maxWeight, setMaxWeight] = useState(0);
  const [maxReps, setMaxReps] = useState(0);
  const [orm, setOrm] = useState(0);
  const [notes, setNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [mediaUri, setMediaUri] = useState('');

  useEffect(() => {
    (async () => {
      const ex = await getExerciseById(Number(id));
      setExercise(ex);
      setNotes((ex as any)?.user_notes || '');
      setMediaUri((ex as any)?.media_uri || '');
      const h = await getSetsForExerciseHistory(Number(id), 30);
      setHistory(h);
      const p = await getExerciseProgressChart(Number(id));
      setProgress(p);
      if (h.length > 0) {
        const mw = Math.max(...h.map(s => s.weight));
        const mr = Math.max(...h.map(s => s.reps));
        setMaxWeight(mw);
        setMaxReps(mr);
        const best = h.reduce((a, b) => calculate1RM(a.weight, a.reps) > calculate1RM(b.weight, b.reps) ? a : b);
        setOrm(calculate1RM(best.weight, best.reps));
      }
    })();
  }, [id]);

  const saveNotes = async () => {
    await setExerciseUserNotes(Number(id), notes.trim());
    setNotes(notes.trim());
    setEditingNotes(false);
  };

  const attachMedia = async (fromCamera: boolean) => {
    const uri = fromCamera
      ? await captureExerciseMedia(Number(id))
      : await pickExerciseMedia(Number(id));
    if (!uri) return;
    if (mediaUri) await removeExerciseMedia(mediaUri);
    await setExerciseMedia(Number(id), uri);
    setMediaUri(uri);
  };

  const clearMedia = () => {
    Alert.alert('Remover ficheiro', 'Remover a imagem/video deste exercicio?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          await removeExerciseMedia(mediaUri);
          await setExerciseMedia(Number(id), '');
          setMediaUri('');
        },
      },
    ]);
  };

  if (!exercise) return null;

  const chartData = progress.map(p => ({
    label: formatDateShort(p.date),
    value: chartMetric === 'weight' ? p.weight : Math.round(p.volume),
  }));

  return (
    <SafeAreaView edges={['top','bottom']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={exercise.name} showBack />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info badges */}
        <View style={styles.badges}>
          <Badge label={MUSCLE_GROUPS_PT[exercise.primary_muscle]} color={colors.primaryContainer} textColor={colors.primary} />
          <Badge label={EQUIPMENT_PT[exercise.equipment]} color={colors.surfaceVariant} textColor={colors.textSecondary} />
          <Badge label={exercise.type === 'strength' ? 'Força' : exercise.type === 'cardio' ? 'Cardio' : 'Mobilidade'} color={colors.accentContainer} textColor={colors.accent} />
          {exercise.is_custom === 1 && <Badge label="Custom" color={colors.secondaryContainer} textColor={colors.secondary} />}
        </View>

        {/* Illustrated muscle map — a lightweight, always-available stand-in
            for a demo image/GIF. Third-party exercise-illustration packs
            (like the ones behind Workout Inspo/LiftAGym-style demos) are
            commercially licensed, so this is drawn as our own vector art
            instead: it costs nothing in app size and covers every exercise,
            including custom ones, with zero per-exercise artwork needed. */}
        <Card style={[styles.card, { alignItems: 'center' }]}>
          <View style={[styles.sectionHeader, { alignSelf: 'flex-start' }]}>
            <Dumbbell size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Músculos Trabalhados</Text>
          </View>
          <MuscleMap
            primary={exercise.primary_muscle}
            secondary={(exercise.secondary_muscles || '').split(',').filter(Boolean) as any}
            size={170}
          />
        </Card>

        {/* User-attached media: their gym's machine, or their own form to
            compare over time. */}
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Camera size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Imagem</Text>
          </View>
          {mediaUri ? (
            <>
              <ExerciseMedia uri={mediaUri} />
              <View style={styles.mediaActions}>
                <TouchableOpacity
                  style={[styles.mediaBtn, { backgroundColor: colors.surfaceVariant }]}
                  onPress={() => attachMedia(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Substituir imagem ou video"
                >
                  <ImagePlus size={16} color={colors.primary} />
                  <Text style={[styles.mediaBtnText, { color: colors.primary }]}>Substituir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mediaBtn, { backgroundColor: colors.surfaceVariant }]}
                  onPress={clearMedia}
                  accessibilityRole="button"
                  accessibilityLabel="Remover imagem ou video"
                >
                  <Trash2 size={16} color={colors.error} />
                  <Text style={[styles.mediaBtnText, { color: colors.error }]}>Remover</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* Falls back to the dataset illustration so the section is
                  never empty for a catalogue exercise. The user's own photo
                  still takes precedence when they add one. */}
              {!!exercise.image_url && (
                <ExerciseMedia uri={exercise.image_url} />
              )}
              <Text style={[styles.instructions, { color: colors.textSecondary }]}>
                Adiciona uma foto da máquina do teu ginásio ou um vídeo da tua execução para comparares a técnica.
              </Text>
              <View style={styles.mediaActions}>
                <TouchableOpacity
                  style={[styles.mediaBtn, { backgroundColor: colors.primaryContainer }]}
                  onPress={() => attachMedia(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Tirar foto ou filmar"
                >
                  <Camera size={16} color={colors.primary} />
                  <Text style={[styles.mediaBtnText, { color: colors.primary }]}>Câmara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mediaBtn, { backgroundColor: colors.primaryContainer }]}
                  onPress={() => attachMedia(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Escolher da galeria"
                >
                  <ImagePlus size={16} color={colors.primary} />
                  <Text style={[styles.mediaBtnText, { color: colors.primary }]}>Galeria</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Card>

        {/* Sticky personal notes */}
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <StickyNote size={18} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>As minhas notas</Text>
          </View>
          {editingNotes ? (
            <>
              <TextInput
                style={[styles.notesInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Ex: banco na posição 4, pega larga, máquina do fundo"
                placeholderTextColor={colors.textTertiary}
                multiline
                autoFocus
              />
              <TouchableOpacity
                style={[styles.mediaBtn, { backgroundColor: colors.primary, alignSelf: 'flex-start' }]}
                onPress={saveNotes}
                accessibilityRole="button"
                accessibilityLabel="Guardar notas"
              >
                <Check size={16} color="#fff" />
                <Text style={[styles.mediaBtnText, { color: '#fff' }]}>Guardar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              onPress={() => setEditingNotes(true)}
              accessibilityRole="button"
              accessibilityLabel={notes ? 'Editar notas' : 'Adicionar notas'}
            >
              <Text style={[styles.instructions, { color: notes ? colors.text : colors.textTertiary }]}>
                {notes || 'Toca para adicionar notas que aparecem sempre que fizeres este exercício.'}
              </Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Instructions */}
        {exercise.instructions ? (
          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Como executar</Text>
            <Text style={[styles.instructions, { color: colors.textSecondary }]}>{exercise.instructions}</Text>
          </Card>
        ) : null}

        {/* Personal Records */}
        {history.length > 0 && (
          <Card style={styles.card}>
            <View style={styles.sectionHeader}>
              <Trophy size={18} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Recordes</Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{maxWeight} kg</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Peso Máx.</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{maxReps}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Reps Máx.</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{orm} kg</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>1RM Est.</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Progress chart */}
        {progress.length >= 2 && (
          <Card style={styles.card}>
            <View style={styles.sectionHeader}>
              <LineChartIcon size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Progresso</Text>
            </View>
            <View style={styles.chartToggle}>
              <Chip label="Peso" selected={chartMetric === 'weight'} onPress={() => setChartMetric('weight')} />
              <Chip label="Volume" selected={chartMetric === 'volume'} onPress={() => setChartMetric('volume')} />
            </View>
            <LineChart data={chartData} unit={chartMetric === 'weight' ? ' kg' : ''} />
          </Card>
        )}

        {/* History */}
        {history.length > 0 ? (
          <Card style={styles.card}>
            <View style={styles.sectionHeader}>
              <TrendingUp size={18} color={colors.secondary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Histórico ({history.length} séries)</Text>
            </View>
            {history.slice(0, 20).map((set, i) => (
              <View key={set.id} style={[styles.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={styles.histLeft}>
                  <Text style={[styles.histDate, { color: colors.textTertiary }]}>{formatDate(set.completed_at)}</Text>
                  {set.is_pr === 1 && <Badge label="PR" color={colors.accentContainer} textColor={colors.accent} />}
                </View>
                <Text style={[styles.histValue, { color: colors.text }]}>
                  {set.reps} × {set.weight} kg
                  {set.rpe ? <Text style={{ color: colors.textSecondary }}> · RPE {set.rpe}</Text> : null}
                </Text>
              </View>
            ))}
          </Card>
        ) : (
          <Card style={styles.card}>
            <View style={styles.sectionHeader}>
              <Dumbbell size={18} color={colors.textTertiary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Sem histórico</Text>
            </View>
            <Text style={[styles.instructions, { color: colors.textSecondary }]}>Ainda não fizeste este exercício. Adiciona-o a um plano ou inicia um treino livre!</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 16 },
  instructions: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 22 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: 'Inter-Bold', fontSize: 22 },
  statLabel: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  statDivider: { width: 1, height: 40 },
  mediaActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  mediaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  mediaBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17 },
  notesInput: { borderRadius: 10, borderWidth: 1, padding: 12, fontFamily: 'Inter-Regular', fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  chartToggle: { flexDirection: 'row', gap: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  histLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  histDate: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17 },
  histValue: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
});

