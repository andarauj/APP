import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { LineChart } from '@/components/ui/LineChart';
import { ExerciseMedia } from '@/components/ui/ExerciseMedia';
import { getAllBodyMetrics, addBodyMetric, deleteBodyMetric, getLatestBodyMetric } from '@/db/bodyMetricsDao';
import { getSetting, setSetting } from '@/db/settingsDao';
import { detectMeasurementTrend } from '@/utils/bodyAnalysis';
import { pickBodyPhoto, captureBodyPhoto, removeBodyPhoto } from '@/utils/bodyPhoto';
import { formatDate } from '@/utils/format';
import { RADIUS } from '@/constants/tokens';
import type { Theme } from '@/constants/colors';
import type { BodyMetric } from '@/types';
import { Plus, Trash2, ScanLine, Camera, ImagePlus, Ruler, Scale } from 'lucide-react-native';

type BodyChartMetric = 'weight' | 'body_fat' | 'chest' | 'waist' | 'hips' | 'arm' | 'thigh' | 'back';

export function BodyTrackingSection() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [latest, setLatest] = useState<BodyMetric | null>(null);
  const [heightCm, setHeightCm] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    if (!isReady) return;
    try {
      const [all, last, height] = await Promise.all([
        getAllBodyMetrics(),
        getLatestBodyMetric(),
        getSetting('heightCm'),
      ]);
      setMetrics(all);
      setLatest(last);
      setHeightCm(height || '');
    } catch (err) {
      console.error('Failed to load body metrics:', err);
    }
  }, [isReady]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <>
      <BodyTab
        metrics={metrics}
        latest={latest}
        colors={colors}
        heightCm={heightCm}
        onAdd={() => setShowAdd(true)}
        onAnalyze={() => router.push('/plan/auto')}
        onChangeHeight={async (v) => {
          setHeightCm(v);
          await setSetting('heightCm', v).catch(() => {});
        }}
        onDelete={async (id) => {
          const metric = metrics.find(m => m.id === id);
          if (metric?.photo_uri) await removeBodyPhoto(metric.photo_uri);
          await deleteBodyMetric(id);
          load();
        }}
      />
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <AddBodyModal
          colors={colors}
          onClose={() => setShowAdd(false)}
          onSave={async (metric) => {
            await addBodyMetric({ ...metric, date: Math.floor(Date.now() / 1000) });
            setShowAdd(false);
            load();
          }}
        />
      </Modal>
    </>
  );
}

function BodyTab({ metrics, latest, colors, onAdd, onDelete, onAnalyze, heightCm, onChangeHeight }: {
  metrics: BodyMetric[]; latest: BodyMetric | null; colors: Theme;
  onAdd: () => void; onDelete: (id: number) => void; onAnalyze: () => void;
  heightCm: string; onChangeHeight: (v: string) => void;
}) {
  const [heightDraft, setHeightDraft] = useState(heightCm);
  useEffect(() => { setHeightDraft(heightCm); }, [heightCm]);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [bodyChartMetric, setBodyChartMetric] = useState<BodyChartMetric>('weight');
  const router = useRouter();
  const photosTimeline = metrics.filter(m => m.photo_uri).slice().reverse();
  const waistTrend = detectMeasurementTrend(
    metrics.slice(0, 5).reverse().map(m => m.waist).filter((w): w is number => w !== null && w !== undefined),
  );
  const bodyChartData = metrics
    .slice()
    .reverse()
    .filter(m => m[bodyChartMetric] !== null && m[bodyChartMetric] !== undefined)
    .map(m => ({ label: formatDate(m.date), value: m[bodyChartMetric] as number }));

  const bmi = (() => {
    const h = parseFloat(heightCm) / 100;
    if (!h || !latest?.weight) return null;
    return latest.weight / (h * h);
  })();

  return (
    <>
      <Card>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Altura</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <Ruler size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.calcInput, { flex: 1, color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
            value={heightDraft}
            onChangeText={setHeightDraft}
            onEndEditing={() => onChangeHeight(heightDraft)}
            keyboardType="decimal-pad"
            placeholder="Ex: 175"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14 }}>cm</Text>
        </View>
        {bmi !== null && (
          <Text style={{ color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 8 }}>
            IMC atual: {bmi.toFixed(1)} — usado apenas como contexto geral para a análise corporal.
          </Text>
        )}
      </Card>

      {photosTimeline.length > 0 && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Progresso em Fotos</Text>
            {photosTimeline.length >= 2 && (
              <TouchableOpacity onPress={() => router.push('/photo-compare')} accessibilityRole="button" accessibilityLabel="Comparar fotos de progresso">
                <Text style={{ color: colors.primary, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>Comparar →</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 160, marginTop: 8 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
            {photosTimeline.map(m => (
              <TouchableOpacity key={m.id} onPress={() => setViewingPhoto(m.photo_uri)} activeOpacity={0.8}>
                <View>
                  <ExerciseMedia uri={m.photo_uri!} height={140} />
                  <Text style={{ color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 11, textAlign: 'center', marginTop: 4 }}>
                    {formatDate(m.date)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Card>
      )}

      {latest && (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Mais recente</Text>
          <Text style={{ color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 13, marginBottom: 10 }}>{formatDate(latest.date)}</Text>
          <View style={styles.bodyGrid}>
            {latest.weight && <BodyStat label="Peso" value={`${latest.weight} kg`} colors={colors} />}
            {latest.body_fat && <BodyStat label="% Gordura" value={`${latest.body_fat}%`} colors={colors} />}
            {latest.chest && <BodyStat label="Peito" value={`${latest.chest} cm`} colors={colors} />}
            {latest.back && <BodyStat label="Costas" value={`${latest.back} cm`} colors={colors} />}
            {latest.waist && <BodyStat label="Cintura" value={`${latest.waist} cm`} colors={colors} />}
            {latest.hips && <BodyStat label="Ancas" value={`${latest.hips} cm`} colors={colors} />}
            {latest.arm && <BodyStat label="Braço" value={`${latest.arm} cm`} colors={colors} />}
            {latest.thigh && <BodyStat label="Coxa" value={`${latest.thigh} cm`} colors={colors} />}
          </View>
          {waistTrend && (
            <Text style={[styles.trendNote, { color: colors.textSecondary }]}>
              Cintura {waistTrend.direction === 'increasing' ? 'a subir' : 'a descer'} nas últimas {waistTrend.measurementCount} medições ({waistTrend.direction === 'increasing' ? '+' : '−'}{waistTrend.totalChangeCm}cm).
            </Text>
          )}
        </Card>
      )}

      {metrics.length >= 2 && (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Evolução</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bodyMetricChips} contentContainerStyle={styles.bodyMetricChipsContent}>
            <Chip label="Peso" selected={bodyChartMetric === 'weight'} onPress={() => setBodyChartMetric('weight')} />
            <Chip label="% Gordura" selected={bodyChartMetric === 'body_fat'} onPress={() => setBodyChartMetric('body_fat')} />
            <Chip label="Peito" selected={bodyChartMetric === 'chest'} onPress={() => setBodyChartMetric('chest')} />
            <Chip label="Costas" selected={bodyChartMetric === 'back'} onPress={() => setBodyChartMetric('back')} />
            <Chip label="Cintura" selected={bodyChartMetric === 'waist'} onPress={() => setBodyChartMetric('waist')} />
            <Chip label="Ancas" selected={bodyChartMetric === 'hips'} onPress={() => setBodyChartMetric('hips')} />
            <Chip label="Braço" selected={bodyChartMetric === 'arm'} onPress={() => setBodyChartMetric('arm')} />
            <Chip label="Coxa" selected={bodyChartMetric === 'thigh'} onPress={() => setBodyChartMetric('thigh')} />
          </ScrollView>
          <LineChart
            data={bodyChartData}
            unit={bodyChartMetric === 'weight' ? ' kg' : bodyChartMetric === 'body_fat' ? '%' : ' cm'}
            emptyLabel="Sem registos suficientes desta medida"
          />
        </Card>
      )}

      <Button title="Registar Medidas" onPress={onAdd} icon={<Plus size={18} color={colors.onPrimary} />} style={{ marginBottom: 8 }} />

      {latest && (
        <TouchableOpacity style={[styles.analyzeBtn, { backgroundColor: colors.primaryContainer, borderColor: colors.primary }]} onPress={onAnalyze}>
          <ScanLine size={18} color={colors.primary} />
          <Text style={[styles.analyzeBtnText, { color: colors.primary }]}>Gerar Plano com Analise Corporal</Text>
        </TouchableOpacity>
      )}

      {metrics.length > 0 && (
        <>
          <Text style={[styles.historyTitle, { color: colors.textSecondary }]}>HISTÓRICO ({metrics.length})</Text>
          {metrics.map(m => (
            <Card key={m.id} style={styles.metricRow}>
              {m.photo_uri && (
                <TouchableOpacity onPress={() => setViewingPhoto(m.photo_uri)}>
                  <ExerciseMedia uri={m.photo_uri} height={44} />
                </TouchableOpacity>
              )}
              <View style={styles.metricLeft}>
                <Text style={[styles.metricDate, { color: colors.text }]}>{formatDate(m.date)}</Text>
                <Text style={[styles.metricVals, { color: colors.textSecondary }]}>
                  {m.weight ? `${m.weight}kg` : ''} {m.body_fat ? `· ${m.body_fat}%` : ''} {m.waist ? `· ${m.waist}cm` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => onDelete(m.id)} hitSlop={8}>
                <Trash2 size={18} color={colors.error} />
              </TouchableOpacity>
            </Card>
          ))}
        </>
      )}

      {metrics.length === 0 && !latest && (
        <Card style={{ alignItems: 'center', padding: 32, gap: 8 }}>
          <Scale size={40} color={colors.textTertiary} />
          <Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 18 }}>Sem dados corporais</Text>
          <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center' }}>
            Regista o teu peso e medidas para acompanhar a evolução.
          </Text>
        </Card>
      )}

      <Modal visible={viewingPhoto !== null} animationType="fade" transparent onRequestClose={() => setViewingPhoto(null)}>
        <TouchableOpacity style={styles.photoOverlay} activeOpacity={1} onPress={() => setViewingPhoto(null)}>
          {viewingPhoto && <ExerciseMedia uri={viewingPhoto} height={500} />}
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function BodyStat({ label, value, colors }: { label: string; value: string; colors: Theme }) {
  return (
    <View style={styles.bodyStat}>
      <Text style={[styles.bodyStatVal, { color: colors.primary }]}>{value}</Text>
      <Text style={[styles.bodyStatLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function AddBodyModal({ colors, onClose, onSave }: {
  colors: Theme; onClose: () => void;
  onSave: (m: Omit<BodyMetric, 'id' | 'date'>) => void;
}) {
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [chest, setChest] = useState('');
  const [back, setBack] = useState('');
  const [waist, setWaist] = useState('');
  const [hips, setHips] = useState('');
  const [arm, setArm] = useState('');
  const [thigh, setThigh] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const attachPhoto = async (fromCamera: boolean) => {
    const uri = fromCamera ? await captureBodyPhoto() : await pickBodyPhoto();
    if (uri) setPhotoUri(uri);
  };

  const handleSave = async () => {
    const values = [weight, bodyFat, chest, back, waist, hips, arm, thigh];
    if (values.every(v => !v.trim()) && !photoUri) {
      Alert.alert('Nada para guardar', 'Preenche pelo menos um valor ou tira uma foto.');
      return;
    }
    setSaving(true);
    await onSave({
      weight: weight ? parseFloat(weight) : null,
      body_fat: bodyFat ? parseFloat(bodyFat) : null,
      chest: chest ? parseFloat(chest) : null,
      back: back ? parseFloat(back) : null,
      waist: waist ? parseFloat(waist) : null,
      hips: hips ? parseFloat(hips) : null,
      arm: arm ? parseFloat(arm) : null,
      thigh: thigh ? parseFloat(thigh) : null,
      photo_uri: photoUri,
    });
    setSaving(false);
  };

  return (
    <SafeAreaView style={[styles.modalScreen, { backgroundColor: colors.background }]}>
      <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>Registar Medidas</Text>
        <TouchableOpacity onPress={onClose}><Text style={{ color: colors.primary, fontFamily: 'Inter-SemiBold', fontSize: 16 }}>Cancelar</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={[styles.calcLabel, { color: colors.textSecondary, marginBottom: 8 }]}>FOTO DE PROGRESSO (OPCIONAL)</Text>
          {photoUri ? (
            <View style={{ gap: 8 }}>
              <ExerciseMedia uri={photoUri} height={260} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.photoBtn, { backgroundColor: colors.surfaceVariant }]} onPress={() => attachPhoto(false)}>
                  <ImagePlus size={16} color={colors.primary} />
                  <Text style={[styles.photoBtnText, { color: colors.primary }]}>Substituir</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.photoBtn, { backgroundColor: colors.surfaceVariant }]} onPress={() => setPhotoUri(null)}>
                  <Trash2 size={16} color={colors.error} />
                  <Text style={[styles.photoBtnText, { color: colors.error }]}>Remover</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.photoBtn, { backgroundColor: colors.primaryContainer, flex: 1, justifyContent: 'center' }]} onPress={() => attachPhoto(true)}>
                <Camera size={16} color={colors.primary} />
                <Text style={[styles.photoBtnText, { color: colors.primary }]}>Câmara</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.photoBtn, { backgroundColor: colors.primaryContainer, flex: 1, justifyContent: 'center' }]} onPress={() => attachPhoto(false)}>
                <ImagePlus size={16} color={colors.primary} />
                <Text style={[styles.photoBtnText, { color: colors.primary }]}>Galeria</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <BodyInput label="Peso (kg)" value={weight} onChange={setWeight} colors={colors} />
        <BodyInput label="% Gordura" value={bodyFat} onChange={setBodyFat} colors={colors} />
        <BodyInput label="Peito (cm)" value={chest} onChange={setChest} colors={colors} />
        <BodyInput label="Costas (cm)" value={back} onChange={setBack} colors={colors} />
        <BodyInput label="Cintura (cm)" value={waist} onChange={setWaist} colors={colors} />
        <BodyInput label="Ancas (cm)" value={hips} onChange={setHips} colors={colors} />
        <BodyInput label="Braço (cm)" value={arm} onChange={setArm} colors={colors} />
        <BodyInput label="Coxa (cm)" value={thigh} onChange={setThigh} colors={colors} />
        <Button title="Guardar" onPress={handleSave} loading={saving} style={{ marginTop: 8, marginBottom: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function BodyInput({ label, value, onChange, colors }: { label: string; value: string; onChange: (v: string) => void; colors: Theme }) {
  return (
    <View>
      <Text style={[styles.calcLabel, { color: colors.textSecondary }]}>{label.toUpperCase()}</Text>
      <TextInput
        style={[styles.calcInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={colors.textTertiary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 16 },
  historyTitle: { fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 1 },
  calcLabel: { fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 1, marginBottom: 6 },
  calcInput: { borderRadius: RADIUS.input, padding: 12, fontFamily: 'Inter-Regular', fontSize: 16, borderWidth: 1, textAlign: 'center' },
  bodyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  trendNote: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17, marginTop: 12 },
  bodyMetricChips: { flexGrow: 0, height: 44, marginTop: 8, marginBottom: 4 },
  bodyMetricChipsContent: { gap: 8, alignItems: 'center' },
  bodyStat: { width: '30%', alignItems: 'center' },
  bodyStatVal: { fontFamily: 'Inter-Bold', fontSize: 18 },
  bodyStatLabel: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  metricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  photoOverlay: { flex: 1, backgroundColor: '#000000dd', alignItems: 'center', justifyContent: 'center', padding: 24 },
  metricLeft: { flex: 1 },
  metricDate: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  metricVals: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  analyzeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 2, paddingVertical: 12, marginBottom: 8 },
  analyzeBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  modalScreen: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  photoBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17 },
});
