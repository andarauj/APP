import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Modal, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { Card } from '@/components/ui/Card';
import { LineChart } from '@/components/ui/LineChart';
import { detectMeasurementTrend } from '@/utils/bodyAnalysis';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Badge } from '@/components/ui/Badge';
import { getPersonalRecords, getWeeklyVolumeByMuscle, getAchievementStats } from '@/db/workoutDao';
import { getAllBodyMetrics, addBodyMetric, deleteBodyMetric, getLatestBodyMetric } from '@/db/bodyMetricsDao';
import { getAllSettings, setSetting } from '@/db/settingsDao';
import { getLatestAdaptivePlanAny, setAdaptivePlanActive, updateAdaptivePlanWeekStart, updateAdaptivePlanExperience, type AdaptivePlanRow } from '@/db/adaptiveDao';
import { exportFullBackupZip, restoreFullBackup, restoreFullBackupZip, exportHistoryAsCsv, exportTrainingReport, shareTextFile  } from '@/utils/xmlExport';
import { pickBackupFile } from '@/utils/filePicker';
import { calculate1RM, calculate1RMPercentages, calculatePlates, calculateWarmupSets } from '@/utils/calculators';
import { scheduleWorkoutReminders, cancelAllWorkoutReminders, WEEKDAY_LABELS } from '@/utils/reminders';
import { formatDate, formatVolume } from '@/utils/format';
import { pickBodyPhoto, captureBodyPhoto, removeBodyPhoto } from '@/utils/bodyPhoto';
import { exportTrainingReportWithPhotos, shareZipFile } from '@/utils/exportWithPhotos';
import { ExerciseMedia } from '@/components/ui/ExerciseMedia';
import type { PersonalRecord, BodyMetric, MuscleGroup } from '@/types';
import { MUSCLE_GROUPS_PT } from '@/types';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Trophy, Calculator, Scale, Settings as SettingsIcon, Download, Upload,
  Plus, Trash2, ChevronDown, ChevronUp, Dumbbell, Award, Zap, ScanLine, Sparkles,
  Camera, ImagePlus, Ruler, Flame,
} from 'lucide-react-native';

type Tab = 'records' | 'calc' | 'body' | 'settings';
type BodyChartMetric = 'weight' | 'body_fat' | 'chest' | 'waist' | 'hips' | 'arm' | 'thigh' | 'back';

const EXPERIENCE_LEVELS = [
  { key: 'beginner', label: 'Iniciante' },
  { key: 'intermediate', label: 'Intermédio' },
  { key: 'advanced', label: 'Avançado' },
] as const;

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('records');
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetric[]>([]);
  const [latestBody, setLatestBody] = useState<BodyMetric | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [showAddBody, setShowAddBody] = useState(false);
  const [showBackupMenu, setShowBackupMenu] = useState(false);
  const [weeklyVolume, setWeeklyVolume] = useState<{ muscle: string; sets: number; volume: number }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lifetimeStats, setLifetimeStats] = useState<{
    totalWorkouts: number; currentStreak: number; prCount: number; totalVolume: number; firstWorkoutAt: number | null;
  } | null>(null);

  useFocusEffect(useCallback(() => {
    if (!isReady) return;
    loadAll();
  }, [isReady]));

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const loadAll = async () => {
    try {
      const [p, bm, lb, st, wv, ls] = await Promise.all([
        getPersonalRecords(),
        getAllBodyMetrics(),
        getLatestBodyMetric(),
        getAllSettings(),
        getWeeklyVolumeByMuscle(7),
        getAchievementStats(),
      ]);
      setPrs(p);
      setBodyMetrics(bm);
      setLatestBody(lb);
      setSettings(st);
      setWeeklyVolume(wv);
      setLifetimeStats(ls);
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  };

  const handleSettingChange = async (key: string, value: string) => {
    // BUGFIX: this had no error handling — if the database write failed for
    // any reason, the promise rejected silently (fire-and-forget from the
    // Chip's onPress) and the button visually did nothing: no selection
    // change, no error, nothing to tell the person their tap registered at
    // all. Update the UI optimistically so it responds immediately, and roll
    // back with a clear message if the save actually failed.
    const previous = settings[key];
    setSettings(prev => ({ ...prev, [key]: value }));
    try {
      await setSetting(key, value);
    } catch (err) {
      console.error('Failed to save setting:', key, err);
      setSettings(prev => ({ ...prev, [key]: previous }));
      Alert.alert('Não foi possível guardar', 'Tenta novamente.');
    }
  };

  const handleExportCsv = async () => {
    setShowBackupMenu(false);
    try {
      const csv = await exportHistoryAsCsv();
      const filename = `Changes_Historico_${new Date().toISOString().split('T')[0]}.csv`;
      await shareTextFile(csv, filename, 'text/csv');
    } catch (e) {
      Alert.alert('Erro ao exportar', String(e));
    }
  };

  /**
   * A short, readable Markdown report (streaks, PRs, weekly volume, recent
   * sessions) meant to be shared with an assistant like Claude for feedback
   * on the training — the raw XML backup and row-per-set CSV are better
   * suited to restoring data or crunching numbers in a spreadsheet than to
   * being read/discussed directly.
   */
  const handleExportReport = async () => {
    setShowBackupMenu(false);
    try {
      const report = await exportTrainingReport();
      const filename = `Changes_Relatorio_${new Date().toISOString().split('T')[0]}.md`;
      await shareTextFile(report, filename, 'text/markdown');
    } catch (e) {
      Alert.alert('Erro ao exportar', String(e));
    }
  };

  /**
   * Same report, but bundled as a .zip together with every progress photo —
   * for when you want to share the visual side too (e.g. with an assistant
   * for feedback), not just the numbers.
   */
  const [exportingPhotos, setExportingPhotos] = useState(false);
  const handleExportReportWithPhotos = async () => {
    setShowBackupMenu(false);
    setExportingPhotos(true);
    try {
      const { path, photoCount } = await exportTrainingReportWithPhotos();
      if (photoCount === 0) {
        Alert.alert(
          'Sem fotos de progresso',
          'Ainda não tens fotos guardadas nas medidas corporais. O ficheiro vai conter só o relatório.',
          [{ text: 'Exportar mesmo assim', onPress: () => shareZipFile(path) }, { text: 'Cancelar', style: 'cancel' }]
        );
      } else {
        await shareZipFile(path);
      }
    } catch (e) {
      Alert.alert('Erro ao exportar', String(e));
    } finally {
      setExportingPhotos(false);
    }
  };

  const handleBackup = async () => {
    setShowBackupMenu(false);
    try {
      const { path, mediaCount } = await exportFullBackupZip();
      await shareZipFile(path);
      if (mediaCount === 0) {
        // Not an error — just useful context if the person expected photos
        // to be included and doesn't see the size they'd expect.
        console.log('Backup concluído sem fotos/media anexados (nenhum encontrado).');
      }
    } catch (e) {
      Alert.alert('Erro', String(e));
    }
  };

  const handleRestore = async () => {
    setShowBackupMenu(false);
    Alert.alert(
      'Restaurar Backup',
      'Isto vai substituir todos os dados atuais. Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar', style: 'destructive', onPress: async () => {
            try {
              const picked = await pickBackupFile();
              if (!picked) return;
              // .zip (current format, includes photos) and .xml (older
              // backups, data only — see restoreFullBackup's own docs for
              // why photos can't come back from that format) both work.
              const result = picked.kind === 'zip'
                ? await restoreFullBackupZip(picked.content)
                : await restoreFullBackup(picked.content);
              Alert.alert(result.success ? 'Restaurado!' : 'Erro', result.message);
              if (result.success) loadAll();
            } catch (err) {
              console.error('Failed to restore backup:', err);
              Alert.alert('Erro', 'Não foi possível restaurar o backup. Confirma que é um ficheiro de backup válido.');
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Perfil</Text>
      </View>

      {/* Lifetime summary — a quick "how far have I come" snapshot, visible
          regardless of which sub-tab is open below. There's no account/login
          in this app, so this (not a name or avatar) is what "profile"
          means here: the training itself. */}
      {lifetimeStats && lifetimeStats.totalWorkouts > 0 && (
        <View style={[styles.summaryBlock, { borderBottomColor: colors.border }]}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryStat}>
              <Dumbbell size={18} color={colors.primary} />
              <Text style={[styles.summaryValue, { color: colors.text }]}>{lifetimeStats.totalWorkouts}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Treinos</Text>
            </View>
            <View style={styles.summaryStat}>
              <Flame size={18} color={colors.accent} />
              <Text style={[styles.summaryValue, { color: colors.text }]}>{lifetimeStats.currentStreak}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Dias seguidos</Text>
            </View>
            <View style={styles.summaryStat}>
              <Award size={18} color={colors.warning} />
              <Text style={[styles.summaryValue, { color: colors.text }]}>{lifetimeStats.prCount}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Recordes</Text>
            </View>
            <View style={styles.summaryStat}>
              <Zap size={18} color={colors.success} />
              <Text style={[styles.summaryValue, { color: colors.text }]}>{formatVolume(lifetimeStats.totalVolume)}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Levantados</Text>
            </View>
          </View>
          {lifetimeStats.firstWorkoutAt && (
            <Text style={[styles.summarySince, { color: colors.textTertiary }]}>
              A treinar com a Changes desde {formatDate(lifetimeStats.firstWorkoutAt)}
            </Text>
          )}
        </View>
      )}

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {([
          { key: 'records', label: 'Recordes', icon: Trophy },
          { key: 'calc', label: 'Calc.', icon: Calculator },
          { key: 'body', label: 'Corpo', icon: Scale },
          { key: 'settings', label: 'Definições', icon: SettingsIcon },
        ] as { key: Tab; label: string; icon: any }[]).map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setTab(t.key)}
            >
              <Icon size={18} color={active ? colors.primary : colors.textTertiary} />
              <Text style={[styles.tabText, { color: active ? colors.primary : colors.textTertiary }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {tab === 'records' && <RecordsTab prs={prs} colors={colors} weeklyVolume={weeklyVolume} />}
        {tab === 'calc' && <CalculatorTab colors={colors} />}
        {tab === 'body' && (
          <BodyTab
            metrics={bodyMetrics} latest={latestBody} colors={colors}
            onAdd={() => setShowAddBody(true)}
            onDelete={async (id) => {
              const metric = bodyMetrics.find(m => m.id === id);
              if (metric?.photo_uri) await removeBodyPhoto(metric.photo_uri);
              await deleteBodyMetric(id);
              loadAll();
            }}
            onAnalyze={() => router.push('/plan/auto')}
            heightCm={settings.heightCm || ''}
            onChangeHeight={(v) => handleSettingChange('heightCm', v)}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab settings={settings} colors={colors} onChange={handleSettingChange}
            onBackup={() => setShowBackupMenu(true)} onRestore={handleRestore} onExportCsv={handleExportCsv} onExportReport={handleExportReport} onExportReportWithPhotos={handleExportReportWithPhotos}
            exportingPhotos={exportingPhotos}
          />
        )}
      </ScrollView>

      {/* Add body metric modal */}
      <Modal visible={showAddBody} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddBody(false)}>
        <AddBodyModal colors={colors} onClose={() => setShowAddBody(false)} onSave={async (metric) => {
          await addBodyMetric({ ...metric, date: Math.floor(Date.now() / 1000) });
          setShowAddBody(false);
          loadAll();
        }} />
      </Modal>

      {/* Backup menu */}
      <Modal visible={showBackupMenu} animationType="fade" transparent onRequestClose={() => setShowBackupMenu(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowBackupMenu(false)}>
          <View style={[styles.backupMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity style={[styles.backupItem, { borderBottomColor: colors.border }]} onPress={handleBackup}>
              <Download size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.backupItemText, { color: colors.text }]}>Exportar Backup Completo</Text>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 2 }}>
                  Tudo — planos, histórico, medidas e fotos — para restaurares depois de reinstalar
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.backupItem, { borderBottomColor: colors.border }]} onPress={handleExportCsv}>
              <Download size={20} color={colors.secondary} />
              <Text style={[styles.backupItemText, { color: colors.text }]}>Exportar Histórico (CSV)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.backupItem, { borderBottomColor: colors.border }]} onPress={handleExportReport}>
              <Sparkles size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.backupItemText, { color: colors.text }]}>Relatório para Partilhar</Text>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 2 }}>
                  Resumo legível para enviares a um treinador ou assistente
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.backupItem, { borderBottomColor: colors.border }]} onPress={handleExportReportWithPhotos}>
              <Camera size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.backupItemText, { color: colors.text }]}>Relatório + Fotos (ZIP)</Text>
                <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 2 }}>
                  Inclui as tuas fotos de progresso
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backupItem} onPress={handleRestore}>
              <Upload size={20} color={colors.accent} />
              <Text style={[styles.backupItemText, { color: colors.text }]}>Restaurar Backup</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function RecordsTab({ prs, colors, weeklyVolume }: {
  prs: PersonalRecord[]; colors: any;
  weeklyVolume: { muscle: string; sets: number; volume: number }[];
}) {
  // Weekly set count per muscle is the number hypertrophy programmes are
  // planned around; roughly 10-20 working sets per muscle per week is the
  // range most guidelines land on, so the bar is scaled against 20.
  const maxSets = Math.max(20, ...weeklyVolume.map(v => v.sets));
  const totalSets = weeklyVolume.reduce((s, v) => s + v.sets, 0);

  const volumeCard = weeklyVolume.length > 0 ? (
    <Card style={{ gap: 10, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Zap size={18} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Volume desta semana</Text>
      </View>
      <Text style={[styles.calcDesc, { color: colors.textSecondary }]}>
        {totalSets} séries efetivas nos últimos 7 dias (aquecimentos excluídos)
      </Text>
      {weeklyVolume.map(v => (
        <View key={v.muscle} style={styles.volRow}>
          <Text style={[styles.volLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            {MUSCLE_GROUPS_PT[v.muscle as MuscleGroup] || v.muscle}
          </Text>
          <View style={[styles.volTrack, { backgroundColor: colors.surfaceVariant }]}>
            <View style={[styles.volFill, {
              width: `${Math.min(100, (v.sets / maxSets) * 100)}%`,
              backgroundColor: v.sets >= 10 ? colors.secondary : colors.primary,
            }]} />
          </View>
          <Text style={[styles.volValue, { color: colors.text }]}>{v.sets}</Text>
        </View>
      ))}
    </Card>
  ) : null;

  if (prs.length === 0) {
    return (
      <>
        {volumeCard}
        <Card style={{ alignItems: 'center', padding: 32, gap: 8 }}>
          <Trophy size={40} color={colors.textTertiary} />
          <Text style={[{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 18 }]}>Sem recordes ainda</Text>
          <Text style={[{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center' }]}>
            Os teus recordes pessoais aparecem aqui automaticamente quando treinas.
          </Text>
        </Card>
      </>
    );
  }
  return (
    <>
      {volumeCard}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>RECORDES PESSOAIS ({prs.length})</Text>
      {prs.map((pr, i) => (
        <Card key={i} style={styles.prCard}>
          <View style={styles.prHeader}>
            <Award size={16} color={colors.accent} />
            <Text style={[styles.prName, { color: colors.text }]} numberOfLines={1}>{pr.exercise_name}</Text>
          </View>
          <View style={styles.prStats}>
            <View style={styles.prStat}>
              <Text style={[styles.prStatVal, { color: colors.primary }]}>{pr.max_weight} kg</Text>
              <Text style={[styles.prStatLabel, { color: colors.textSecondary }]}>Peso Máx.</Text>
            </View>
            <View style={[styles.prStatDiv, { backgroundColor: colors.border }]} />
            <View style={styles.prStat}>
              <Text style={[styles.prStatVal, { color: colors.primary }]}>{pr.max_reps}</Text>
              <Text style={[styles.prStatLabel, { color: colors.textSecondary }]}>Reps Máx.</Text>
            </View>
            <View style={[styles.prStatDiv, { backgroundColor: colors.border }]} />
            <View style={styles.prStat}>
              <Text style={[styles.prStatVal, { color: colors.accent }]}>{pr.estimated_1rm} kg</Text>
              <Text style={[styles.prStatLabel, { color: colors.textSecondary }]}>1RM Est.</Text>
            </View>
          </View>
        </Card>
      ))}
    </>
  );
}

function CalculatorTab({ colors }: { colors: any }) {
  const [calcWeight, setCalcWeight] = useState('');
  const [calcReps, setCalcReps] = useState('');

  const [warmupWeight, setWarmupWeight] = useState('');
  const [barWeight, setBarWeight] = useState(20);

  const [plateWeight, setPlateWeight] = useState('');

  // BUGFIX: both calculators used to only recompute on the input's onBlur
  // (losing focus) or a manual "Calcular" tap — tabbing between fields could
  // trigger a calculation with only half the values filled in, making the
  // result flicker to something wrong before you'd even finished typing.
  // These are pure client-side maths with no network/DB cost, so deriving
  // them live from the current input on every render is simpler and reads
  // as instantly responsive instead of unpredictable.
  const ormResult = (() => {
    const w = parseFloat(calcWeight) || 0;
    const r = parseInt(calcReps) || 0;
    if (w <= 0 || r <= 0) return null;
    return calculate1RM(w, r);
  })();
  const ormPercentages = ormResult ? calculate1RMPercentages(ormResult) : [];

  const warmupResult = calculateWarmupSets(parseFloat(warmupWeight) || 0, barWeight);
  const plateResult = (() => {
    const w = parseFloat(plateWeight) || 0;
    if (w <= 0) return null;
    return calculatePlates(w, 'kg');
  })();

  return (
    <>
      {/* 1RM Calculator */}
      <Card>
        <View style={styles.calcHeader}>
          <Zap size={18} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Calculadora de 1RM</Text>
        </View>
        <Text style={[styles.calcDesc, { color: colors.textSecondary }]}>Estima a tua repetição máxima com a fórmula de Epley.</Text>
        <View style={styles.calcRow}>
          <View style={styles.calcField}>
            <Text style={[styles.calcLabel, { color: colors.textSecondary }]}>PESO (KG)</Text>
            <TextInput
              style={[styles.calcInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
              value={calcWeight} onChangeText={setCalcWeight}
              keyboardType="decimal-pad" placeholder="80" placeholderTextColor={colors.textTertiary}
            />
          </View>
          <View style={styles.calcField}>
            <Text style={[styles.calcLabel, { color: colors.textSecondary }]}>REPS</Text>
            <TextInput
              style={[styles.calcInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
              value={calcReps} onChangeText={setCalcReps}
              keyboardType="numeric" placeholder="5" placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        {ormResult !== null ? (
          <>
            <View style={[styles.heroResult, { backgroundColor: colors.surfaceVariant, borderLeftColor: colors.accent }]}>
              <Text style={[styles.heroResultLabel, { color: colors.textSecondary }]}>1RM ESTIMADO</Text>
              <Text style={[styles.heroResultVal, { color: colors.accent }]}>{ormResult} kg</Text>
            </View>
            <Text style={[styles.calcLabel, { color: colors.textSecondary, marginTop: 14, marginBottom: 6 }]}>PERCENTAGENS PARA TREINO</Text>
            <View style={styles.percentGrid}>
              {ormPercentages.map(p => (
                <View key={p.percent} style={[styles.percentCell, { backgroundColor: colors.surfaceVariant }]}>
                  <Text style={[styles.percentLabel, { color: colors.textTertiary }]}>{p.percent}%</Text>
                  <Text style={[styles.percentValue, { color: colors.text }]}>{p.weight}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={[styles.calcHint, { color: colors.textTertiary }]}>Preenche o peso e as reps para ver o resultado.</Text>
        )}
      </Card>

      {/* Warmup ramp calculator */}
      <Card>
        <View style={styles.calcHeader}>
          <Zap size={18} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Séries de Aquecimento</Text>
        </View>
        <Text style={[styles.calcDesc, { color: colors.textSecondary }]}>
          Indica o peso de trabalho e calcula a rampa de aquecimento (40/60/80%).
        </Text>
        <Text style={[styles.calcLabel, { color: colors.textSecondary, marginTop: 4 }]}>PESO DE TRABALHO (KG)</Text>
        <TextInput
          style={[styles.calcInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
          value={warmupWeight}
          onChangeText={setWarmupWeight}
          keyboardType="numeric"
          placeholder="100"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={[styles.calcLabel, { color: colors.textSecondary, marginTop: 12, marginBottom: 6 }]}>PESO DA BARRA</Text>
        <View style={styles.barRow}>
          {[20, 15, 10, 0].map(bw => (
            <TouchableOpacity
              key={bw}
              style={[styles.barChip, { backgroundColor: barWeight === bw ? colors.accent : colors.surfaceVariant }]}
              onPress={() => setBarWeight(bw)}
              accessibilityRole="button"
              accessibilityLabel={bw === 0 ? 'Sem barra' : `Barra de ${bw} quilos`}
              accessibilityState={{ selected: barWeight === bw }}
            >
              <Text style={[styles.barChipText, { color: barWeight === bw ? '#fff' : colors.textSecondary }]}>
                {bw === 0 ? 'Sem barra' : `${bw}kg`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {warmupWeight.trim() === '' ? (
          <Text style={[styles.calcHint, { color: colors.textTertiary }]}>Indica o peso de trabalho para ver a rampa.</Text>
        ) : warmupResult.length > 0 ? (
          <View style={{ marginTop: 14, gap: 6 }}>
            {warmupResult.map((w, i) => (
              <View key={i} style={[styles.warmupRow, { backgroundColor: colors.surfaceVariant }]}>
                <View style={[styles.warmupPercentBadge, { backgroundColor: colors.accentContainer }]}>
                  <Text style={[styles.warmupPercentText, { color: colors.accent }]}>{w.percent}%</Text>
                </View>
                <Text style={[styles.warmupSetText, { color: colors.text }]}>
                  {w.weight} kg <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular' }}>× {w.reps} reps</Text>
                </Text>
              </View>
            ))}
            <Text style={[styles.calcHint, { color: colors.textTertiary, marginTop: 2 }]}>
              Depois avança para o peso de trabalho ({parseFloat(warmupWeight)} kg).
            </Text>
          </View>
        ) : (
          <Text style={[styles.calcHint, { color: colors.textTertiary }]}>
            Peso demasiado leve para justificar aquecimento progressivo.
          </Text>
        )}
      </Card>

      {/* Plate Calculator */}
      <Card>
        <View style={styles.calcHeader}>
          <Dumbbell size={18} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Calculadora de Discos</Text>
        </View>
        <Text style={[styles.calcDesc, { color: colors.textSecondary }]}>Barra olímpica de 20kg. Calcula os discos por lado.</Text>
        <Text style={[styles.calcLabel, { color: colors.textSecondary, marginTop: 4 }]}>PESO TOTAL (KG)</Text>
        <TextInput
          style={[styles.calcInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
          value={plateWeight} onChangeText={setPlateWeight}
          keyboardType="decimal-pad" placeholder="100" placeholderTextColor={colors.textTertiary}
        />
        {plateResult ? (
          <View style={styles.plateResult}>
            <Text style={[styles.plateSummary, { color: colors.text }]}>
              Barra: 20kg + {plateResult.perSide}kg/lado × 2 = {plateResult.totalWeight}kg
            </Text>
            <View style={styles.plateVisual}>
              <View style={[styles.plateBar, { backgroundColor: colors.textTertiary }]} />
              {plateResult.plates.map((p, i) => (
                <View key={i} style={[styles.plateDisc, {
                  backgroundColor: p.weight >= 20 ? colors.primary : p.weight >= 10 ? colors.secondary : colors.accent,
                  width: 12 + p.weight * 0.8,
                  height: 40 + p.weight * 1.5,
                }]} />
              ))}
              <View style={[styles.plateBar, { backgroundColor: colors.textTertiary }]} />
            </View>
            <View style={styles.plateList}>
              {plateResult.plates.map((p, i) => (
                <Badge key={i} label={`${p.count}× ${p.weight}kg`} color={colors.surfaceVariant} textColor={colors.text} />
              ))}
              {plateResult.plates.length === 0 && (
                <Text style={[{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14 }]}>Só a barra (20kg)</Text>
              )}
            </View>
          </View>
        ) : (
          <Text style={[styles.calcHint, { color: colors.textTertiary }]}>Indica o peso total para ver os discos.</Text>
        )}
      </Card>
    </>
  );
}

function BodyTab({ metrics, latest, colors, onAdd, onDelete, onAnalyze, heightCm, onChangeHeight }: {
  metrics: BodyMetric[]; latest: BodyMetric | null; colors: any;
  onAdd: () => void; onDelete: (id: number) => void; onAnalyze: () => void;
  heightCm: string; onChangeHeight: (v: string) => void;
}) {
  const [heightDraft, setHeightDraft] = useState(heightCm);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [bodyChartMetric, setBodyChartMetric] = useState<BodyChartMetric>('weight');
  const router = useRouter();
  const photosTimeline = metrics.filter(m => m.photo_uri).slice().reverse(); // oldest first
  // Same "last 5, oldest first" window used when feeding history into the
  // plan generator's body analysis — keeps what's shown here consistent
  // with what actually influences a generated plan.
  const waistTrend = detectMeasurementTrend(
    metrics.slice(0, 5).reverse().map(m => m.waist).filter((w): w is number => w !== null && w !== undefined)
  );

  // `metrics` arrives newest-first (matches the history list below); a trend
  // chart reads left-to-right as oldest-to-newest, so this reverses it and
  // drops any entry missing the selected field rather than plotting a gap
  // as zero.
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
      {/* Height — stored once (doesn't change like weight/measurements do),
          used for BMI-informed guidance in the body analysis below. */}
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
            IMC atual: {bmi.toFixed(1)} — usado apenas como contexto geral para a análise corporal, não é um indicador exato de composição corporal.
          </Text>
        )}
      </Card>

      {/* Progress photo timeline */}
      {photosTimeline.length > 0 && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Progresso em Fotos</Text>
            {photosTimeline.length >= 2 && (
              <TouchableOpacity
                onPress={() => router.push('/photo-compare')}
                accessibilityRole="button"
                accessibilityLabel="Comparar fotos de progresso"
              >
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

      {/* Latest stats */}
      {latest && (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Mais recente</Text>
          <Text style={[{ color: colors.textTertiary, fontFamily: 'Inter-Regular', fontSize: 13, marginBottom: 10 }]}>{formatDate(latest.date)}</Text>
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
              Cintura {waistTrend.direction === 'increasing' ? 'a subir' : 'a descer'} nas últimas {waistTrend.measurementCount} medições ({waistTrend.direction === 'increasing' ? '+' : '−'}{waistTrend.totalChangeCm}cm) — sem julgamento aqui, só um facto que pode ser útil consoante o teu objetivo.
            </Text>
          )}
        </Card>
      )}

      {/* Evolution chart — the numbers above tell you where you are; this is
          where you can actually see the trend, the same way exercise
          progress already gets a chart on its own detail screen. */}
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

      <Button title="Registar Medidas" onPress={onAdd} icon={<Plus size={18} color="#fff" />} style={{ marginBottom: 8 }} />

      {latest && (
        <TouchableOpacity
          style={[styles.analyzeBtn, { backgroundColor: colors.primaryContainer, borderColor: colors.primary }]}
          onPress={onAnalyze}
        >
          <ScanLine size={18} color={colors.primary} />
          <Text style={[styles.analyzeBtnText, { color: colors.primary }]}>Gerar Plano com Analise Corporal</Text>
        </TouchableOpacity>
      )}

      {/* History */}
      {metrics.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>HISTÓRICO ({metrics.length})</Text>
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
          <Text style={[{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 18 }]}>Sem dados corporais</Text>
          <Text style={[{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center' }]}>
            Regista o teu peso e medidas para acompanhar a evolução.
          </Text>
        </Card>
      )}

      {/* Full-size photo viewer */}
      <Modal visible={viewingPhoto !== null} animationType="fade" transparent onRequestClose={() => setViewingPhoto(null)}>
        <TouchableOpacity style={styles.photoOverlay} activeOpacity={1} onPress={() => setViewingPhoto(null)}>
          {viewingPhoto && <ExerciseMedia uri={viewingPhoto} height={500} />}
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function BodyStat({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.bodyStat}>
      <Text style={[styles.bodyStatVal, { color: colors.primary }]}>{value}</Text>
      <Text style={[styles.bodyStatLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function AddBodyModal({ colors, onClose, onSave }: {
  colors: any; onClose: () => void;
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
        <TouchableOpacity onPress={onClose}><Text style={[{ color: colors.primary, fontFamily: 'Inter-SemiBold', fontSize: 16 }]}>Cancelar</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Progress photo — tracked alongside the measurements so you can
            visually compare "when I had these numbers" over time. */}
        <View>
          <Text style={[styles.calcLabel, { color: colors.textSecondary, marginBottom: 8 }]}>FOTO DE PROGRESSO (OPCIONAL)</Text>
          {photoUri ? (
            <View style={{ gap: 8 }}>
              <ExerciseMedia uri={photoUri} height={260} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[bodyPhotoStyles.btn, { backgroundColor: colors.surfaceVariant }]}
                  onPress={() => attachPhoto(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Substituir foto"
                >
                  <ImagePlus size={16} color={colors.primary} />
                  <Text style={[bodyPhotoStyles.btnText, { color: colors.primary }]}>Substituir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[bodyPhotoStyles.btn, { backgroundColor: colors.surfaceVariant }]}
                  onPress={() => setPhotoUri(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Remover foto"
                >
                  <Trash2 size={16} color={colors.error} />
                  <Text style={[bodyPhotoStyles.btnText, { color: colors.error }]}>Remover</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[bodyPhotoStyles.btn, { backgroundColor: colors.primaryContainer, flex: 1, justifyContent: 'center' }]}
                onPress={() => attachPhoto(true)}
                accessibilityRole="button"
                accessibilityLabel="Tirar foto"
              >
                <Camera size={16} color={colors.primary} />
                <Text style={[bodyPhotoStyles.btnText, { color: colors.primary }]}>Câmara</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[bodyPhotoStyles.btn, { backgroundColor: colors.primaryContainer, flex: 1, justifyContent: 'center' }]}
                onPress={() => attachPhoto(false)}
                accessibilityRole="button"
                accessibilityLabel="Escolher da galeria"
              >
                <ImagePlus size={16} color={colors.primary} />
                <Text style={[bodyPhotoStyles.btnText, { color: colors.primary }]}>Galeria</Text>
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

const bodyPhotoStyles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  btnText: { fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17 },
});

function BodyInput({ label, value, onChange, colors }: { label: string; value: string; onChange: (v: string) => void; colors: any }) {
  return (
    <View>
      <Text style={[styles.calcLabel, { color: colors.textSecondary }]}>{label.toUpperCase()}</Text>
      <TextInput
        style={[styles.calcInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
        value={value} onChangeText={onChange}
        keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textTertiary}
      />
    </View>
  );
}

function SettingsTab({ settings, colors, onChange, onBackup, onRestore, onExportCsv, onExportReport, onExportReportWithPhotos, exportingPhotos }: {
  settings: Record<string, string>; colors: any;
  onChange: (key: string, value: string) => void;
  onBackup: () => void; onRestore: () => void; onExportCsv: () => void; onExportReport: () => void; onExportReportWithPhotos: () => void;
  exportingPhotos: boolean;
}) {
  const [restExpanded, setRestExpanded] = useState(true);
  const restOptions = [30, 60, 90, 120, 180, 240, 300];
  const themeOptions = [
    { key: 'system', label: 'Sistema' },
    { key: 'dark', label: 'Escuro' },
    { key: 'light', label: 'Claro' },
  ];

  return (
    <>
      {/* App mode — Modo Simples hides RPE, the tempo metronome, in-session
          auto-regulation suggestions, and the Fatigue Radar entry on the
          Início tab. Nothing is deleted, it's purely a display filter — all
          of that data keeps being tracked underneath, so switching back to
          Avançado later shows it all again exactly as it was. */}
      <Card>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Modo da App</Text>
        <View style={styles.settingChips}>
          <Chip label="Simples" selected={(settings.appMode || 'advanced') === 'simple'} onPress={() => onChange('appMode', 'simple')} />
          <Chip label="Avançado" selected={(settings.appMode || 'advanced') === 'advanced'} onPress={() => onChange('appMode', 'advanced')} />
        </View>
        <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 8 }}>
          {(settings.appMode || 'advanced') === 'simple'
            ? 'Esconde RPE, metrónomo de cadência, sugestões de autorregulação e Sinais de Fadiga — para um treino mais direto.'
            : 'Tudo visível: RPE, metrónomo, autorregulação e Sinais de Fadiga.'}
        </Text>
      </Card>

      {/* Appearance */}
      <Card>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Aparência</Text>
        <Text style={[styles.calcLabel, { color: colors.textSecondary, marginBottom: 8 }]}>TEMA</Text>
        <View style={styles.settingChips}>
          {themeOptions.map(t => (
            <Chip key={t.key} label={t.label} selected={settings.theme === t.key || (!settings.theme && t.key === 'system')} onPress={() => onChange('theme', t.key)} />
          ))}
        </View>
      </Card>

      {/* Rest timer defaults */}
      <Card>
        <TouchableOpacity style={styles.settingHeader} onPress={() => setRestExpanded(!restExpanded)}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Descanso padrão</Text>
          {restExpanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
        </TouchableOpacity>
        {restExpanded && (
          <>
            <Text style={[styles.calcLabel, { color: colors.textSecondary, marginBottom: 8 }]}>DESCANSO PADRÃO (SEGUNDOS)</Text>
            <View style={styles.settingChips}>
              {restOptions.map(r => (
                <Chip key={r} label={r >= 60 ? `${r / 60}min` : `${r}s`} selected={settings.defaultRestSeconds === String(r)} onPress={() => onChange('defaultRestSeconds', String(r))} />
              ))}
            </View>
          </>
        )}
      </Card>

      {/* Notifications */}
      <Card>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Notificações e Som</Text>
        <SettingToggle label="Som do descanso" value={settings.soundEnabled === '1'} colors={colors} onToggle={() => onChange('soundEnabled', settings.soundEnabled === '1' ? '0' : '1')} />
        <SettingToggle label="Vibração" value={settings.vibrateEnabled === '1'} colors={colors} onToggle={() => onChange('vibrateEnabled', settings.vibrateEnabled === '1' ? '0' : '1')} />
        <SettingToggle
          label="Avisar quando o descanso acabar"
          value={settings.restNotifyEnabled !== '0'}
          colors={colors}
          onToggle={() => onChange('restNotifyEnabled', settings.restNotifyEnabled === '0' ? '1' : '0')}
        />
        <SettingToggle label="Manter ecrã ligado" value={settings.keepScreenAwake === '1'} colors={colors} onToggle={() => onChange('keepScreenAwake', settings.keepScreenAwake === '1' ? '0' : '1')} />
      </Card>

      {/* Adaptive engine (NSPI) */}
      <AdaptiveEngineSettings colors={colors} />

      {/* Workout reminders */}
      <ReminderSettings settings={settings} colors={colors} onChange={onChange} />

      {/* Backup */}
      <Card>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Backup e Restauro</Text>
        <Text style={[styles.calcDesc, { color: colors.textSecondary, marginBottom: 12 }]}>
          Exporta todos os dados (exercícios, planos, treinos, medidas) para um ficheiro XML. Usa para mudar de telemóvel ou prevenir perda de dados.
        </Text>
        <Button title="Backup Completo" onPress={onBackup} icon={<Download size={18} color="#fff" />} style={{ marginBottom: 8 }} />
        <Button title="Restaurar Backup" variant="outline" onPress={onRestore} icon={<Upload size={18} color={colors.primary} />} style={{ marginBottom: 8 }} />
        <Button title="Exportar Histórico (CSV)" variant="outline" onPress={onExportCsv} icon={<Download size={18} color={colors.primary} />} style={{ marginBottom: 8 }} />
        <Button title="Relatório para Partilhar" variant="outline" onPress={onExportReport} icon={<Sparkles size={18} color={colors.accent} />} style={{ marginBottom: 8 }} />
        <Button title="Relatório + Fotos (ZIP)" variant="outline" onPress={onExportReportWithPhotos} icon={<Camera size={18} color={colors.accent} />} loading={exportingPhotos} />
        <Text style={[styles.calcDesc, { color: colors.textTertiary, marginTop: 8, fontSize: 12 }]}>
          O relatório é um resumo legível (recordes, volume, treinos recentes) que podes enviar por qualquer app de mensagens ou anexar numa conversa com um assistente. A versão em ZIP inclui também as tuas fotos de progresso.
        </Text>
      </Card>

      {/* About */}
      <Card>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Sobre</Text>
        <Text style={[styles.calcDesc, { color: colors.textSecondary, marginTop: 4 }]}>Changes v1.0.0</Text>
        <Text style={[styles.calcDesc, { color: colors.textSecondary, marginTop: 8, lineHeight: 19 }]}>
          Um treinador de treino de força no teu bolso: planos que se adaptam
          semana a semana ao que realmente treinas, progressão de carga
          orientada por dados, e cada série, recorde e medida registados com
          precisão — para decidires o próximo passo com factos, não com
          palpites.
        </Text>
      </Card>
    </>
  );
}

function SettingToggle({ label, value, colors, onToggle }: { label: string; value: boolean; colors: any; onToggle: () => void }) {
  return (
    <TouchableOpacity style={styles.toggleRow} onPress={onToggle} activeOpacity={0.7}>
      <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.toggleSwitch, { backgroundColor: value ? colors.secondary : colors.surfaceVariant }]}>
        <View style={[styles.toggleKnob, { backgroundColor: '#fff', transform: [{ translateX: value ? 20 : 0 }] }]} />
      </View>
    </TouchableOpacity>
  );
}

/**
 * "Periodização automática" toggle + dia de início de semana (NSPI_ENGINE.md
 * §7). Self-contained (not part of the k/v `settings` object): the flag it
 * flips lives on adaptive_plan.active, not in the settings table. Turning it
 * on/off never deletes the cycle — just whether closeWeekIfDue looks at it.
 */
function AdaptiveEngineSettings({ colors }: { colors: any }) {
  const router = useRouter();
  const [plan, setPlan] = useState<AdaptivePlanRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await getLatestAdaptivePlanAny();
      setPlan(p);
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleActive = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const next = plan.active !== 1;
      await setAdaptivePlanActive(plan.id, next);
      setPlan({ ...plan, active: next ? 1 : 0 });
    } finally {
      setSaving(false);
    }
  };

  const changeWeekStart = async (dow: number) => {
    if (!plan) return;
    setPlan({ ...plan, week_start_dow: dow });
    try { await updateAdaptivePlanWeekStart(plan.id, dow); } catch { /* best effort */ }
  };

  const changeExperience = async (level: string) => {
    if (!plan) return;
    setPlan({ ...plan, experience: level });
    try { await updateAdaptivePlanExperience(plan.id, level); } catch { /* best effort */ }
  };

  if (loading) return null;

  if (!plan) {
    return (
      <Card>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Plano Adaptativo (NSPI)</Text>
        <Text style={[styles.calcDesc, { color: colors.textSecondary, marginBottom: 12 }]}>
          Motor de periodização automática: ajusta séries, reps e peso a cada semana consoante o que registas.
        </Text>
        <Button title="Configurar" variant="outline" onPress={() => router.push('/adaptive/start')} icon={<Sparkles size={18} color={colors.accent} />} />
      </Card>
    );
  }

  return (
    <Card>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Plano Adaptativo (NSPI)</Text>
      <SettingToggle
        label={saving ? 'A atualizar…' : 'Periodização automática'}
        value={plan.active === 1}
        colors={colors}
        onToggle={toggleActive}
      />
      {plan.active === 1 && (
        <>
          <Text style={[styles.calcLabel, { color: colors.textSecondary, marginTop: 10, marginBottom: 8 }]}>NÍVEL</Text>
          <View style={styles.settingChips}>
            {EXPERIENCE_LEVELS.map(({ key, label }) => (
              <Chip key={key} label={label} selected={plan.experience === key} onPress={() => changeExperience(key)} />
            ))}
          </View>
          <Text style={[styles.calcDesc, { color: colors.textTertiary, marginTop: 6, fontSize: 11 }]}>
            Iniciante avança mais depressa e mais leve na intensificação; avançado exige mais para avançar e descarrega mais fundo. Aplica-se a partir da próxima mudança de fase.
          </Text>
          <Text style={[styles.calcLabel, { color: colors.textSecondary, marginTop: 14, marginBottom: 8 }]}>DIA DE INÍCIO DA SEMANA</Text>
          <View style={styles.settingChips}>
            {WEEKDAY_LABELS.map((label, day) => (
              <Chip key={day} label={label} selected={plan.week_start_dow === day} onPress={() => changeWeekStart(day)} />
            ))}
          </View>
        </>
      )}
      <TouchableOpacity onPress={() => router.push('/adaptive/recap')} style={{ marginTop: 12 }}>
        <Text style={[styles.calcDesc, { color: colors.primary, fontFamily: 'Inter-SemiBold' }]}>Ver Weekly Recap →</Text>
      </TouchableOpacity>
    </Card>
  );
}

function ReminderSettings({ settings, colors, onChange }: {
  settings: Record<string, string>; colors: any;
  onChange: (key: string, value: string) => void;
}) {
  const enabled = settings.reminderEnabled === '1';
  const selectedDays = (settings.reminderDays || '1,3,5').split(',').filter(Boolean).map(Number);
  const [hour, minute] = (settings.reminderTime || '18:00').split(':');
  const [saving, setSaving] = useState(false);
  // BUGFIX (reported: "não deixa alterar o horário" — the time field
  // fought back against typing): the hour/minute TextInputs used to be
  // controlled directly by `hour`/`minute` (derived from the settings prop)
  // and saved + rescheduled the notification on EVERY keystroke. Typing the
  // first digit of "21" immediately committed "02:00" (padStart on a
  // single "2") and re-scheduled for that half-typed value before the
  // second digit ever landed — the field was fighting the person's own
  // typing. A local draft that only commits on blur (finished editing that
  // field) fixes it: the field behaves like a normal text input while
  // typing, and only saves/reschedules once.
  const [hourDraft, setHourDraft] = useState(hour);
  const [minuteDraft, setMinuteDraft] = useState(minute);
  useEffect(() => { setHourDraft(hour); setMinuteDraft(minute); }, [hour, minute]);

  const applyReminders = async (nextEnabled: boolean, nextDays: number[], nextTime: string) => {
    setSaving(true);
    try {
      if (nextEnabled && nextDays.length > 0) {
        const ok = await scheduleWorkoutReminders(nextDays, nextTime);
        if (!ok) {
          Alert.alert(
            'Permissão necessária',
            'Ativa as notificações para a Changes nas definições do telemóvel para receber lembretes.'
          );
          await onChange('reminderEnabled', '0');
          setSaving(false);
          return;
        }
      } else {
        await cancelAllWorkoutReminders();
      }
    } catch (e) {
      console.error('Failed to schedule reminders:', e);
    }
    setSaving(false);
  };

  const toggleDay = async (day: number) => {
    const next = selectedDays.includes(day) ? selectedDays.filter(d => d !== day) : [...selectedDays, day].sort();
    await onChange('reminderDays', next.join(','));
    if (enabled) await applyReminders(true, next, `${hour}:${minute}`);
  };

  const commitTime = async (h: string, m: string) => {
    const time = `${(h || '0').padStart(2, '0')}:${(m || '0').padStart(2, '0')}`;
    await onChange('reminderTime', time);
    if (enabled) await applyReminders(true, selectedDays, time);
  };

  const toggleEnabled = async () => {
    const next = !enabled;
    await onChange('reminderEnabled', next ? '1' : '0');
    await applyReminders(next, selectedDays, `${hour}:${minute}`);
  };

  return (
    <Card>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Lembretes de Treino</Text>
      <SettingToggle label={saving ? 'A atualizar…' : 'Ativar lembretes'} value={enabled} colors={colors} onToggle={toggleEnabled} />
      {enabled && (
        <>
          <Text style={[styles.calcLabel, { color: colors.textSecondary, marginTop: 10, marginBottom: 8 }]}>DIAS DA SEMANA</Text>
          <View style={styles.settingChips}>
            {WEEKDAY_LABELS.map((label, day) => (
              <Chip key={day} label={label} selected={selectedDays.includes(day)} onPress={() => toggleDay(day)} />
            ))}
          </View>
          <Text style={[styles.calcLabel, { color: colors.textSecondary, marginTop: 10, marginBottom: 8 }]}>HORA</Text>
          <View style={styles.reminderTimeRow}>
            <TextInput
              style={[styles.reminderTimeInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
              value={hourDraft}
              onChangeText={v => setHourDraft(v.replace(/\D/g, '').slice(0, 2))}
              onBlur={() => commitTime(hourDraft, minuteDraft)}
              keyboardType="numeric"
              maxLength={2}
              accessibilityLabel="Hora do lembrete"
            />
            <Text style={[styles.reminderTimeColon, { color: colors.text }]}>:</Text>
            <TextInput
              style={[styles.reminderTimeInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
              value={minuteDraft}
              onChangeText={v => setMinuteDraft(v.replace(/\D/g, '').slice(0, 2))}
              onBlur={() => commitTime(hourDraft, minuteDraft)}
              keyboardType="numeric"
              maxLength={2}
              accessibilityLabel="Minuto do lembrete"
            />
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: 28 },
  summaryBlock: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryStat: { alignItems: 'center', gap: 3 },
  summaryValue: { fontFamily: 'Inter-Bold', fontSize: 17 },
  summaryLabel: { fontFamily: 'Inter-Regular', fontSize: 11 },
  summarySince: { fontFamily: 'Inter-Regular', fontSize: 11, textAlign: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabText: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 16 },
  prCard: { gap: 10 },
  prHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prName: { fontFamily: 'Inter-SemiBold', fontSize: 15, flex: 1 },
  prStats: { flexDirection: 'row', alignItems: 'center' },
  prStat: { flex: 1, alignItems: 'center' },
  prStatVal: { fontFamily: 'Inter-Bold', fontSize: 18 },
  prStatLabel: { fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 14, marginTop: 2 },
  prStatDiv: { width: 1, height: 32 },
  calcHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  calcDesc: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19 },
  calcRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'flex-end' },
  calcField: { flex: 1 },
  calcLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1, marginBottom: 6 },
  calcInput: { borderRadius: 10, padding: 12, fontFamily: 'Inter-Regular', fontSize: 16, borderWidth: 1, textAlign: 'center' },
  calcBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, justifyContent: 'center' },
  calcBtnText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 14 },
  calcResult: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: 14, marginTop: 12 },
  calcResultLabel: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  calcResultVal: { fontFamily: 'Inter-Bold', fontSize: 28 },
  calcHint: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17, marginTop: 12 },
  // A left-accent-border card reads as a clean highlight; the old solid
  // low-opacity accentContainer fill looked muddy against the dark theme.
  heroResult: { borderRadius: 12, borderLeftWidth: 4, padding: 14, marginTop: 14, gap: 4 },
  heroResultLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1 },
  heroResultVal: { fontFamily: 'Inter-Bold', fontSize: 32 },
  percentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  percentCell: { width: '31%', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  percentLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14 },
  percentValue: { fontFamily: 'Inter-Bold', fontSize: 16, marginTop: 2 },
  barRow: { flexDirection: 'row', gap: 8 },
  barChip: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  barChipText: { fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17 },
  warmupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  warmupPercentBadge: { width: 44, paddingVertical: 4, borderRadius: 8, alignItems: 'center' },
  warmupPercentText: { fontFamily: 'Inter-Bold', fontSize: 13, lineHeight: 17 },
  warmupSetText: { fontFamily: 'Inter-Bold', fontSize: 15 },
  plateInputRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'flex-end' },
  plateField: { flex: 1 },
  plateResult: { marginTop: 16, gap: 12 },
  plateSummary: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  plateVisual: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 80, gap: 2 },
  plateBar: { width: 60, height: 6, borderRadius: 3 },
  plateDisc: { borderRadius: 4 },
  plateList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bodyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  trendNote: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17, marginTop: 12 },
  // Explicit height + centered content — the same fix applied earlier to
  // every other horizontal chip scroller in the app, after finding the
  // real cause of chips rendering with clipped text on some devices.
  bodyMetricChips: { flexGrow: 0, height: 44, marginTop: 8, marginBottom: 4 },
  bodyMetricChipsContent: { gap: 8, alignItems: 'center' },
  bodyStat: { width: '30%', alignItems: 'center' },
  bodyStatVal: { fontFamily: 'Inter-Bold', fontSize: 18 },
  bodyStatLabel: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  metricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  photoOverlay: { flex: 1, backgroundColor: '#000000dd', alignItems: 'center', justifyContent: 'center', padding: 24 },
  metricLeft: { flex: 1 },
  metricDate: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  metricVals: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17, marginTop: 2 },
  analyzeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 2, paddingVertical: 12, marginBottom: 8 },
  analyzeBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  modalScreen: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  settingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  volLabel: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, width: 76 },
  volTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  volFill: { height: 8, borderRadius: 4 },
  volValue: { fontFamily: 'Inter-Bold', fontSize: 13, lineHeight: 17, width: 26, textAlign: 'right' },
  settingChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reminderTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reminderTimeInput: { width: 64, height: 48, borderRadius: 12, borderWidth: 1, textAlign: 'center', fontFamily: 'Inter-Bold', fontSize: 20 },
  reminderTimeColon: { fontFamily: 'Inter-Bold', fontSize: 20 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  toggleLabel: { fontFamily: 'Inter-Regular', fontSize: 15 },
  toggleSwitch: { width: 48, height: 28, borderRadius: 14, padding: 4 },
  toggleKnob: { width: 20, height: 20, borderRadius: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 40 },
  backupMenu: { width: '100%', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  backupItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderBottomWidth: 1 },
  backupItemText: { fontFamily: 'Inter-SemiBold', fontSize: 16 },
});
