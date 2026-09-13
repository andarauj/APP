import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Badge } from '@/components/ui/Badge';
import { useRouter } from 'expo-router';
import { Sparkles, Clock, Calendar, Dumbbell, Zap, ScanLine, AlertCircle } from 'lucide-react-native';
import type { PlanType } from '@/types';
import { PLAN_TYPE_PT, MUSCLE_GROUPS_PT } from '@/types';
import { AVAILABLE_DAYS, AVAILABLE_DURATIONS, generatePlan, getSplitDays, targetExerciseCountFor, EquipmentPreference } from '@/utils/planGenerator';
import { previewDoseForSplit, usesDoseEngine } from '@/utils/trainingDose';
import { VolumeDoseAudit } from '@/components/ui/VolumeDoseAudit';
import { getLatestBodyMetric, getAllBodyMetrics } from '@/db/bodyMetricsDao';
import { getSettingWithDefault } from '@/db/settingsDao';
import { analyzeBody, getMuscleLabel } from '@/utils/bodyAnalysis';
import type { BodyAnalysis } from '@/utils/bodyAnalysis';
import { hapticSuccess } from '@/utils/haptics';

const PLAN_TYPES: PlanType[] = ['hypertrophy', 'strength', 'endurance', 'cardio', 'mobility'];
const EQUIPMENT_OPTIONS: { key: EquipmentPreference; label: string }[] = [
  { key: 'any', label: 'Qualquer' },
  { key: 'gymleco', label: 'Gymleco' },
  { key: 'free_weights', label: 'Pesos Livres' },
];

export default function AutoPlanScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [minutesPerDay, setMinutesPerDay] = useState(60);
  const [planType, setPlanType] = useState<PlanType>('hypertrophy');
  const [equipmentPref, setEquipmentPref] = useState<EquipmentPreference>('any');
  const [analysis, setAnalysis] = useState<BodyAnalysis | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    Promise.all([getLatestBodyMetric(), getSettingWithDefault('heightCm', ''), getAllBodyMetrics()])
      .then(([latest, heightCm, allMetrics]) => {
        // Last 5, oldest first — analyzeBody expects chronological order
        // ending with `latest`, matching what a "recent trend" should mean.
        const recentHistory = allMetrics.slice(0, 5).reverse();
        setAnalysis(analyzeBody(latest, heightCm, recentHistory));
      })
      .catch(() => {
        setAnalysis(analyzeBody(null));
      });
  }, []);

  const splitLabel = (() => {
    const splits: Record<number, string> = {
      1: 'Full Body',
      2: 'Full Body A/B',
      3: 'Push / Pull / Pernas',
      4: 'Upper / Lower',
      5: 'Upper / Lower + PPL',
      6: 'PPL x2',
    };
    return splits[daysPerWeek] || 'Personalizado';
  })();

  const estimatedExercises = targetExerciseCountFor(minutesPerDay);
  const dosePreview = usesDoseEngine(planType)
    ? previewDoseForSplit(getSplitDays(daysPerWeek), minutesPerDay, planType, 'intermediate', analysis?.focusAreas ?? [])
    : [];

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const planId = await generatePlan(daysPerWeek, minutesPerDay, planType, {
        equipmentPref,
        bodyAnalysis: analysis,
      });
      hapticSuccess();
      Alert.alert('Plano criado!', `O teu plano de ${daysPerWeek} dias foi gerado com sucesso.`, [
        { text: 'Ver plano', onPress: () => router.replace({ pathname: '/plan/[id]', params: { id: planId } }) },
      ]);
    } catch (err) {
      console.error('Failed to generate plan:', err);
      Alert.alert('Erro', 'Nao foi possivel gerar o plano. Tenta novamente.');
    } finally {
      setGenerating(false);
    }
  };

  const severityColor = (sev: 'low' | 'medium' | 'high') => {
    if (sev === 'high') return colors.error;
    if (sev === 'medium') return colors.accent;
    return colors.secondary;
  };

  const severityLabel = (sev: 'low' | 'medium' | 'high') => {
    if (sev === 'high') return 'Alta';
    if (sev === 'medium') return 'Media';
    return 'Baixa';
  };

  return (
    <SafeAreaView edges={['top','bottom']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Gerar Plano" showBack />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <Sparkles size={36} color="#fff" />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Plano Automatico</Text>
            <Text style={styles.heroDesc}>
              Escolhe os dias, o tempo e o equipamento. Nós montamos o plano ideal para ti.
            </Text>
          </View>
        </View>

        {/* Body Analysis */}
        {analysis && (
          <Card>
            <View style={styles.optionHeader}>
              <ScanLine size={20} color={colors.primary} />
              <Text style={[styles.optionTitle, { color: colors.text }]}>Analise Corporal</Text>
            </View>
            {analysis.hasData ? (
              <View style={styles.analysisContent}>
                <Text style={[styles.analysisSummary, { color: colors.textSecondary }]}>
                  {analysis.summary}
                </Text>
                {analysis.bmi !== null && (
                  <Text style={[styles.bmiNote, { color: colors.textTertiary }]}>
                    IMC de referência: {analysis.bmi.toFixed(1)} (contexto geral, não mede composição corporal)
                  </Text>
                )}
                {analysis.imbalances.map((imp, i) => (
                  <View key={i} style={[styles.imbalanceRow, { borderColor: colors.border }]}>
                    <View style={[styles.severityDot, { backgroundColor: severityColor(imp.severity) }]} />
                    <View style={styles.imbalanceInfo}>
                      <View style={styles.imbalanceTop}>
                        <Text style={[styles.imbalanceLabel, { color: colors.text }]}>{imp.label}</Text>
                        <Badge
                          label={severityLabel(imp.severity)}
                          color={severityColor(imp.severity) === colors.error ? colors.errorContainer : severityColor(imp.severity) === colors.accent ? colors.accentContainer : colors.secondaryContainer}
                          textColor={severityColor(imp.severity)}
                        />
                      </View>
                      <Text style={[styles.imbalanceDesc, { color: colors.textSecondary }]}>
                        {imp.description}
                      </Text>
                    </View>
                  </View>
                ))}
                {analysis.suggestConditioning && (
                  <View style={[styles.conditioningNote, { backgroundColor: colors.surfaceVariant }]}>
                    <Zap size={16} color={colors.secondary} />
                    <Text style={[styles.conditioningText, { color: colors.textSecondary }]}>
                      {analysis.conditioningNote}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.noAnalysis}>
                <AlertCircle size={18} color={colors.textTertiary} />
                <Text style={[styles.noAnalysisText, { color: colors.textSecondary }]}>
                  Sem medidas registadas. Regista as tuas medidas no Perfil para um plano personalizado.
                </Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
                  <Text style={[styles.goProfile, { color: colors.primary }]}>Ir para Perfil</Text>
                </TouchableOpacity>
              </View>
            )}
          </Card>
        )}

        {/* Days per week */}
        <Card>
          <View style={styles.optionHeader}>
            <Calendar size={20} color={colors.primary} />
            <Text style={[styles.optionTitle, { color: colors.text }]}>Dias por semana</Text>
          </View>
          <View style={styles.chips}>
            {AVAILABLE_DAYS.map(d => (
              <Chip key={d} label={`${d}`} selected={daysPerWeek === d} onPress={() => setDaysPerWeek(d)} />
            ))}
          </View>
          <Text style={[styles.splitInfo, { color: colors.textSecondary }]}>
            Divisão: {splitLabel}
          </Text>

          {/* Preview of the split so the user sees the day-by-day structure
              (and which muscles each day trains) before generating. */}
          <View style={styles.splitPreview}>
            {getSplitDays(daysPerWeek).map((d, i) => (
              <View key={i} style={[styles.splitDayRow, { borderColor: colors.border }]}>
                <View style={[styles.splitDayBadge, { backgroundColor: colors.primaryContainer }]}>
                  <Text style={[styles.splitDayBadgeText, { color: colors.primary }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.splitDayLabel, { color: colors.text }]}>{d.label}</Text>
                  <Text style={[styles.splitDayMuscles, { color: colors.textSecondary }]} numberOfLines={2}>
                    {d.focus.map(m => MUSCLE_GROUPS_PT[m]).join(' · ')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>

        {/* Minutes per session */}
        <Card>
          <View style={styles.optionHeader}>
            <Clock size={20} color={colors.primary} />
            <Text style={[styles.optionTitle, { color: colors.text }]}>Tempo por sessão</Text>
          </View>
          <View style={styles.chips}>
            {AVAILABLE_DURATIONS.map(m => (
              <Chip key={m} label={`${m}min`} selected={minutesPerDay === m} onPress={() => setMinutesPerDay(m)} />
            ))}
          </View>
        </Card>

        {/* Equipment preference */}
        <Card>
          <View style={styles.optionHeader}>
            <Dumbbell size={20} color={colors.primary} />
            <Text style={[styles.optionTitle, { color: colors.text }]}>Equipamento</Text>
          </View>
          <View style={styles.chips}>
            {EQUIPMENT_OPTIONS.map(e => (
              <Chip key={e.key} label={e.label} selected={equipmentPref === e.key} onPress={() => setEquipmentPref(e.key)} />
            ))}
          </View>
          {equipmentPref === 'any' && (
            <Text style={[styles.eqHint, { color: colors.textSecondary }]}>
              Quando ha livres e maquinas, o plano usa composto livre e isolamento em maquina.
            </Text>
          )}
          {equipmentPref === 'gymleco' && (
            <Text style={[styles.eqHint, { color: colors.textSecondary }]}>
              Prioriza exercicios nas maquinas Gymleco do teu ginasio.
            </Text>
          )}
        </Card>

        {/* Plan type */}
        <Card>
          <View style={styles.optionHeader}>
            <Zap size={20} color={colors.primary} />
            <Text style={[styles.optionTitle, { color: colors.text }]}>Objetivo</Text>
          </View>
          <View style={styles.chips}>
            {PLAN_TYPES.map(t => (
              <Chip key={t} label={PLAN_TYPE_PT[t]} selected={planType === t} onPress={() => setPlanType(t)} />
            ))}
          </View>
        </Card>

        {/* Summary */}
        <Card>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>Resumo</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>{daysPerWeek}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>dias/semana</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>{minutesPerDay}min</Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>sessão</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>~{estimatedExercises}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>exercicios/dia</Text>
            </View>
          </View>
          <View style={styles.summaryTags}>
            <View style={[styles.tag, { backgroundColor: colors.primaryContainer }]}>
              <Text style={[styles.tagText, { color: colors.primary }]}>{PLAN_TYPE_PT[planType]}</Text>
            </View>
            <View style={[styles.tag, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={[styles.tagText, { color: colors.textSecondary }]}>{splitLabel}</Text>
            </View>
            {equipmentPref !== 'any' && (
              <View style={[styles.tag, { backgroundColor: colors.accentContainer }]}>
                <Text style={[styles.tagText, { color: colors.accent }]}>
                  {equipmentPref === 'gymleco' ? 'Gymleco' : 'Pesos Livres'}
                </Text>
              </View>
            )}
          </View>
          {dosePreview.length > 0 && (
            <VolumeDoseAudit rows={dosePreview} colors={colors} />
          )}
          {analysis && analysis.focusAreas.length > 0 && (
            <View style={styles.focusAreas}>
              <Text style={[styles.focusTitle, { color: colors.textSecondary }]}>AREAS DE FOCO</Text>
              <View style={styles.focusChips}>
                {analysis.focusAreas.map(m => (
                  <View key={m} style={[styles.focusChip, { backgroundColor: colors.secondaryContainer }]}>
                    <Text style={[styles.focusChipText, { color: colors.secondary }]}>{getMuscleLabel(m)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Card>

        <Button
          title="Gerar Plano"
          onPress={handleGenerate}
          loading={generating}
          icon={<Zap size={20} color="#fff" />}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 20 },
  heroText: { flex: 1 },
  heroTitle: { fontFamily: 'Inter-Bold', fontSize: 20, color: '#fff' },
  heroDesc: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  optionTitle: { fontFamily: 'Inter-Bold', fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  splitInfo: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17, marginTop: 10 },
  splitPreview: { marginTop: 12, gap: 8 },
  splitDayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  splitDayBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  splitDayBadgeText: { fontFamily: 'Inter-Bold', fontSize: 12, lineHeight: 16 },
  splitDayLabel: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  splitDayMuscles: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  eqHint: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17, marginTop: 10 },
  analysisContent: { gap: 10 },
  analysisSummary: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19, marginBottom: 4 },
  bmiNote: { fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 14, marginBottom: 8 },
  imbalanceRow: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  severityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  imbalanceInfo: { flex: 1 },
  imbalanceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  imbalanceLabel: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  imbalanceDesc: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17 },
  conditioningNote: { flexDirection: 'row', gap: 8, borderRadius: 10, padding: 10, marginTop: 8 },
  conditioningText: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17 },
  noAnalysis: { gap: 8, alignItems: 'flex-start' },
  noAnalysisText: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19 },
  goProfile: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  summaryTitle: { fontFamily: 'Inter-Bold', fontSize: 16, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontFamily: 'Inter-Bold', fontSize: 26 },
  summaryLabel: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 4 },
  summaryDivider: { width: 1, height: 36 },
  summaryTags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  tagText: { fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17 },
  focusAreas: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  focusTitle: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1, marginBottom: 8 },
  focusChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  focusChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  focusChipText: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16 },
});
