import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Chip } from '@/components/ui/Chip';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
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
import { Dumbbell, TrendingUp, StickyNote, Camera, ImagePlus, Trash2, Check, Zap, Share2 } from 'lucide-react-native';

type ChartMetric = 'weight' | 'volume';
type DetailTab = 'historico' | 'grafico';

// Range chips (14D · 1M · 3M · 6M). Applied client-side to the already-loaded
// history/chart data so no extra query is needed.
const RANGES: { key: string; label: string; days: number }[] = [
  { key: '14d', label: '14D', days: 14 },
  { key: '1m', label: '1M', days: 30 },
  { key: '3m', label: '3M', days: 90 },
  { key: '6m', label: '6M', days: 180 },
];

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [history, setHistory] = useState<WorkoutSet[]>([]);
  const [progress, setProgress] = useState<{ date: number; weight: number; volume: number; reps: number }[]>([]);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('weight');
  const [detailTab, setDetailTab] = useState<DetailTab>('grafico');
  const [rangeKey, setRangeKey] = useState('3m');
  const [notes, setNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [mediaUri, setMediaUri] = useState('');

  useEffect(() => {
    (async () => {
      const ex = await getExerciseById(Number(id));
      setExercise(ex);
      setNotes((ex as any)?.user_notes || '');
      setMediaUri((ex as any)?.media_uri || '');
      const h = await getSetsForExerciseHistory(Number(id), 60);
      setHistory(h);
      const p = await getExerciseProgressChart(Number(id));
      setProgress(p);
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

  const rangeDays = RANGES.find(r => r.key === rangeKey)?.days ?? 90;
  const cutoff = Math.floor(Date.now() / 1000) - rangeDays * 86400;

  const rangedHistory = useMemo(
    () => history.filter(s => (s.completed_at ?? 0) >= cutoff),
    [history, cutoff],
  );
  const rangedProgress = useMemo(
    () => progress.filter(p => p.date >= cutoff),
    [progress, cutoff],
  );

  const { maxWeight, maxReps, orm } = useMemo(() => {
    if (rangedHistory.length === 0) return { maxWeight: 0, maxReps: 0, orm: 0 };
    const mw = Math.max(...rangedHistory.map(s => s.weight));
    const mr = Math.max(...rangedHistory.map(s => s.reps));
    const best = rangedHistory.reduce((a, b) =>
      calculate1RM(a.weight, a.reps) > calculate1RM(b.weight, b.reps) ? a : b);
    return { maxWeight: mw, maxReps: mr, orm: calculate1RM(best.weight, best.reps) };
  }, [rangedHistory]);

  if (!exercise) return null;

  const altNames = (exercise.alt_names || '')
    .split(',').map(s => s.trim()).filter(Boolean).join(', ');
  const displayImage = mediaUri || exercise.gif_url || exercise.image_url || exercise.thumbnail_url || '';
  const typeLabel = exercise.type === 'strength' ? 'Força' : exercise.type === 'cardio' ? 'Cardio' : 'Mobilidade';

  const chartData = rangedProgress.map(p => ({
    label: formatDateShort(p.date),
    value: chartMetric === 'weight' ? p.weight : Math.round(p.volume),
  }));

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={exercise.name}
        showBack
        right={
          <>
            <TouchableOpacity
              onPress={() => Share.share({
                message: `${exercise.name} — ${MUSCLE_GROUPS_PT[exercise.primary_muscle]} · ${EQUIPMENT_PT[exercise.equipment]}${exercise.instructions ? `\n\n${exercise.instructions}` : ''}`,
              }).catch(() => {})}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Partilhar exercício"
            >
              <Share2 size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <FavoriteButton
              exerciseId={Number(id)}
              size={24}
              activeColor={colors.warning}
              inactiveColor={colors.textTertiary}
            />
          </>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Media first — the demo goes up top. Falls back to the dataset
            illustration; the user's own photo/video wins when set. */}
        {!!displayImage && (
          <View style={styles.mediaWrap}>
            <ExerciseMedia
              uri={mediaUri || undefined}
              gifUrl={exercise.gif_url}
              imageUrl={exercise.image_url}
              thumbnailUrl={exercise.thumbnail_url}
              videoUrl={exercise.video_cached_path || undefined}
              allowVideo={!!exercise.video_cached_path}
              height={210}
              accessibilityLabel={`Execução de ${exercise.name}`}
            />
          </View>
        )}

        <View style={styles.titleBlock}>
          <Text style={[styles.name, { color: colors.text }]}>{exercise.name}</Text>
          {!!altNames && (
            <Text style={[styles.altNames, { color: colors.textSecondary }]} numberOfLines={2}>{altNames}</Text>
          )}
          <View style={styles.badges}>
            <Badge label={MUSCLE_GROUPS_PT[exercise.primary_muscle]} color={colors.primaryContainer} textColor={colors.primary} />
            <Badge label={EQUIPMENT_PT[exercise.equipment]} color={colors.surfaceVariant} textColor={colors.textSecondary} />
            <Badge label={typeLabel} color={colors.accentContainer} textColor={colors.accent} />
            {exercise.is_custom === 1 && <Badge label="Custom" color={colors.secondaryContainer} textColor={colors.secondary} />}
          </View>
        </View>

        {/* History · Chart tabs + range chips */}
        <View style={[styles.detailTabs, { borderBottomColor: colors.border }]}>
          {([['grafico', 'Gráfico'], ['historico', 'Histórico']] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => setDetailTab(key)}
              style={[styles.detailTab, detailTab === key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              <Text style={[styles.detailTabLabel, { color: detailTab === key ? colors.primary : colors.textSecondary }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.rangeRow}>
          {RANGES.map(r => (
            <Chip key={r.key} label={r.label} selected={rangeKey === r.key} onPress={() => setRangeKey(r.key)} />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.progressLink, { backgroundColor: colors.primaryContainer }]}
          onPress={() => router.push({ pathname: '/exercise/progress', params: { exerciseId: String(id) } })}
          accessibilityRole="button"
          accessibilityLabel="Abrir progressão detalhada"
        >
          <TrendingUp size={16} color={colors.primary} />
          <Text style={[styles.progressLinkText, { color: colors.primary }]}>Progressão detalhada</Text>
        </TouchableOpacity>

        {detailTab === 'grafico' && (
          <>
            {/* 1 Rep Max hero */}
            <Card style={styles.card}>
              <View style={styles.sectionHeader}>
                <Zap size={18} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Máximo estimado (1RM)</Text>
              </View>
              <Text style={[styles.ormValue, { color: colors.text }]}>
                {orm > 0 ? `${orm.toFixed(1)} kg` : '—'}
              </Text>
              {rangedHistory.length > 0 && (
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={[styles.statValue, { color: colors.primary }]}>{maxWeight} kg</Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Peso máx.</Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.stat}>
                    <Text style={[styles.statValue, { color: colors.primary }]}>{maxReps}</Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Reps máx.</Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.stat}>
                    <Text style={[styles.statValue, { color: colors.primary }]}>{rangedHistory.length}</Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>séries</Text>
                  </View>
                </View>
              )}
            </Card>

            {rangedProgress.length >= 2 ? (
              <Card style={styles.card}>
                <View style={styles.chartToggle}>
                  <Chip label="Peso" selected={chartMetric === 'weight'} onPress={() => setChartMetric('weight')} />
                  <Chip label="Volume" selected={chartMetric === 'volume'} onPress={() => setChartMetric('volume')} />
                </View>
                <LineChart data={chartData} unit={chartMetric === 'weight' ? ' kg' : ''} />
              </Card>
            ) : (
              <Card style={styles.card}>
                <Text style={[styles.instructions, { color: colors.textSecondary }]}>
                  Sem dados suficientes neste período. Regista mais séries deste exercício.
                </Text>
              </Card>
            )}
          </>
        )}

        {detailTab === 'historico' && (
          rangedHistory.length > 0 ? (
            <Card style={styles.card}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{rangedHistory.length} séries</Text>
              {rangedHistory.slice(0, 40).map((set, i) => (
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
                <TrendingUp size={18} color={colors.textTertiary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Sem histórico</Text>
              </View>
              <Text style={[styles.instructions, { color: colors.textSecondary }]}>
                Ainda não fizeste este exercício neste período. Adiciona-o a um plano ou inicia um treino livre.
              </Text>
            </Card>
          )
        )}

        {/* Muscle map */}
        <Card style={[styles.card, { alignItems: 'center' }]}>
          <View style={[styles.sectionHeader, { alignSelf: 'flex-start' }]}>
            <Dumbbell size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Músculos trabalhados</Text>
          </View>
          <MuscleMap
            primary={exercise.primary_muscle}
            secondary={(exercise.secondary_muscles || '').split(',').filter(Boolean) as any}
            size={170}
          />
        </Card>

        {/* Instructions */}
        {exercise.instructions ? (
          <Card style={styles.card}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Como executar</Text>
            <Text style={[styles.instructions, { color: colors.textSecondary }]}>{exercise.instructions}</Text>
          </Card>
        ) : null}

        {/* User media controls */}
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Camera size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Imagem / vídeo</Text>
          </View>
          {mediaUri ? (
            <View style={styles.mediaActions}>
              <TouchableOpacity style={[styles.mediaBtn, { backgroundColor: colors.surfaceVariant }]} onPress={() => attachMedia(false)}>
                <ImagePlus size={16} color={colors.primary} />
                <Text style={[styles.mediaBtnText, { color: colors.primary }]}>Substituir</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mediaBtn, { backgroundColor: colors.surfaceVariant }]} onPress={clearMedia}>
                <Trash2 size={16} color={colors.error} />
                <Text style={[styles.mediaBtnText, { color: colors.error }]}>Remover</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[styles.instructions, { color: colors.textSecondary }]}>
                Adiciona uma foto da máquina do teu ginásio ou um vídeo da tua execução.
              </Text>
              <View style={styles.mediaActions}>
                <TouchableOpacity style={[styles.mediaBtn, { backgroundColor: colors.primaryContainer }]} onPress={() => attachMedia(true)}>
                  <Camera size={16} color={colors.primary} />
                  <Text style={[styles.mediaBtnText, { color: colors.primary }]}>Câmara</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.mediaBtn, { backgroundColor: colors.primaryContainer }]} onPress={() => attachMedia(false)}>
                  <ImagePlus size={16} color={colors.primary} />
                  <Text style={[styles.mediaBtnText, { color: colors.primary }]}>Galeria</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Card>

        {/* Sticky notes */}
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
              <TouchableOpacity style={[styles.mediaBtn, { backgroundColor: colors.primary, alignSelf: 'flex-start' }]} onPress={saveNotes}>
                <Check size={16} color="#fff" />
                <Text style={[styles.mediaBtnText, { color: '#fff' }]}>Guardar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={() => setEditingNotes(true)}>
              <Text style={[styles.instructions, { color: notes ? colors.text : colors.textTertiary }]}>
                {notes || 'Toca para adicionar notas que aparecem sempre que fizeres este exercício.'}
              </Text>
            </TouchableOpacity>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  mediaWrap: { borderRadius: 16, overflow: 'hidden' },
  titleBlock: { gap: 8 },
  name: { fontFamily: 'Inter-ExtraBold', fontSize: 24, lineHeight: 30 },
  altNames: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 19 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  detailTabs: { flexDirection: 'row', borderBottomWidth: 1 },
  detailTab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  detailTabLabel: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  rangeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  progressLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, borderRadius: 12,
  },
  progressLinkText: { fontFamily: 'Inter-Bold', fontSize: 13 },
  card: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 16 },
  ormValue: { fontFamily: 'Inter-ExtraBold', fontSize: 36, lineHeight: 40 },
  instructions: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 22 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: 'Inter-Bold', fontSize: 20 },
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
