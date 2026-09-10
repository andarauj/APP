import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getAllTrainingMaxes, setTrainingMax, advanceTrainingMaxWeek } from '@/db/trainingMaxDao';
import { getExerciseByName } from '@/db/exerciseDao';
import { createPlan, addExerciseToPlan } from '@/db/planDao';
import { getDatabase } from '@/db/database';
import {
  FIVE31_LIFTS, FIVE31_LIFT_LABELS, FIVE31_TM_INCREMENT, getFiveThreeOneSets,
  nextTrainingMax, trainingMaxFromEstimated1RM, type FiveThreeOneLift,
} from '@/utils/fiveThreeOne';
import { hapticSuccess, hapticSelect } from '@/utils/haptics';
import { ChevronLeft, Dumbbell, TrendingUp, Zap } from 'lucide-react-native';

// The exercise name each lift maps to in this app's seed data — confirmed
// to exist exactly as written before wiring this up.
const LIFT_EXERCISE_NAME: Record<FiveThreeOneLift, string> = {
  squat: 'Agachamento com Barra',
  bench: 'Supino com Barra',
  deadlift: 'Levantamento Terra',
  press: 'Press Militar com Barra',
};

export default function FiveThreeOneScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();

  const [maxes, setMaxes] = useState<Record<FiveThreeOneLift, { weight: number; week: number } | null>>({
    squat: null, bench: null, deadlift: null, press: null,
  });
  const [editingLift, setEditingLift] = useState<FiveThreeOneLift | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [inputMode, setInputMode] = useState<'tm' | 'orm'>('tm');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!isReady) return;
    const rows = await getAllTrainingMaxes();
    const next: typeof maxes = { squat: null, bench: null, deadlift: null, press: null };
    for (const row of rows) next[row.lift] = { weight: row.weight, week: row.cycle_week };
    setMaxes(next);
  }, [isReady]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEditor = (lift: FiveThreeOneLift) => {
    setEditingLift(lift);
    setInputMode('tm');
    setInputValue(maxes[lift]?.weight ? String(maxes[lift]!.weight) : '');
  };

  const saveTrainingMax = async () => {
    if (!editingLift) return;
    const value = parseFloat(inputValue.replace(',', '.'));
    if (!value || value <= 0) {
      Alert.alert('Valor inválido', 'Indica um peso válido.');
      return;
    }
    const tm = inputMode === 'orm' ? trainingMaxFromEstimated1RM(value) : value;
    try {
      await setTrainingMax(editingLift, tm);
      hapticSuccess();
      setEditingLift(null);
      load();
    } catch (err) {
      console.error('Failed to save training max:', err);
      Alert.alert('Erro', 'Não foi possível guardar. Tenta novamente.');
    }
  };

  const allSet = FIVE31_LIFTS.every(l => maxes[l] !== null);

  const handleGenerate = async () => {
    if (!allSet) {
      Alert.alert('Falta definir pesos', 'Define o Peso de Referência dos 4 levantamentos antes de gerar o plano.');
      return;
    }
    setGenerating(true);
    try {
      // BUGFIX (caught before shipping): a plan_exercise row always has ONE
      // fixed reps/weight for however many sets it specifies — the workout
      // screen builds one exercise card per row, with all its sets sharing
      // that same target. 5/3/1's three working sets each have a genuinely
      // different weight and rep target, so each percentage needs its own
      // row (sets=1) rather than trying to cram 3 different weights into a
      // single 3-set row. This mirrors how 5/3/1 is written by hand anyway
      // — three distinct lines, not one.
      const db = await getDatabase();
      let planId!: number;
      await db.withTransactionAsync(async () => {
        planId = await createPlan(
          `5/3/1 — Semana ${maxes.squat!.week}`,
          'Programa 5/3/1 de Jim Wendler, gerado a partir dos teus Pesos de Referência.',
          'strength',
          'custom',
          true,
        );

        for (let dayIndex = 0; dayIndex < FIVE31_LIFTS.length; dayIndex++) {
          const lift = FIVE31_LIFTS[dayIndex];
          const tm = maxes[lift]!;
          const exercise = await getExerciseByName(LIFT_EXERCISE_NAME[lift]);
          if (!exercise) continue; // shouldn't happen — name is fixed and verified above

          const workingSets = getFiveThreeOneSets(tm.weight, tm.week);
          let orderIndex = 0;
          for (const set of workingSets) {
            await addExerciseToPlan(
              planId, exercise.id, 1, set.reps, set.weight, 180,
              set.isAmrap ? 'amrap' : 'normal', null,
              `${set.percent}% do Peso de Referência (${tm.weight}kg)`,
              orderIndex++, `${FIVE31_LIFT_LABELS[lift]} — Semana ${tm.week}`, dayIndex,
            );
          }
        }
      });

      hapticSuccess();
      Alert.alert('Plano gerado!', 'A semana atual do 5/3/1 foi adicionada aos teus planos.', [
        { text: 'Ver plano', onPress: () => router.replace({ pathname: '/plan/[id]', params: { id: planId } }) },
      ]);
    } catch (err) {
      console.error('Failed to generate 5/3/1 plan:', err);
      Alert.alert('Erro', 'Não foi possível gerar o plano. Tenta novamente.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAdvanceWeek = async () => {
    if (!allSet) return;
    try {
      for (const lift of FIVE31_LIFTS) {
        const tm = maxes[lift]!;
        await advanceTrainingMaxWeek(lift, tm.weight, nextTrainingMax(tm.weight, lift));
      }
      hapticSuccess();
      load();
    } catch (err) {
      console.error('Failed to advance 5/3/1 week:', err);
      Alert.alert('Erro', 'Não foi possível avançar a semana. Tenta novamente.');
    }
  };

  const currentWeek = maxes.squat?.week ?? 1;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar">
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>5/3/1</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            O programa de força de Jim Wendler — um dos mais respeitados e usados no mundo do treino. Baseia-se num &quot;Peso de Referência&quot; (~90% do teu máximo real) e sobe todas as semanas de forma calculada, com uma série final AMRAP.
          </Text>
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PESOS DE REFERÊNCIA</Text>
        {FIVE31_LIFTS.map(lift => (
          <TouchableOpacity
            key={lift}
            style={[styles.liftRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => openEditor(lift)}
            activeOpacity={0.7}
          >
            <View style={[styles.liftIcon, { backgroundColor: colors.primaryContainer }]}>
              <Dumbbell size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.liftName, { color: colors.text }]}>{FIVE31_LIFT_LABELS[lift]}</Text>
              <Text style={[styles.liftIncrement, { color: colors.textTertiary }]}>+{FIVE31_TM_INCREMENT[lift]}kg por ciclo</Text>
            </View>
            {maxes[lift] ? (
              <Text style={[styles.liftWeight, { color: colors.primary }]}>{maxes[lift]!.weight}kg</Text>
            ) : (
              <Badge label="Por definir" color={colors.surfaceVariant} textColor={colors.textSecondary} />
            )}
          </TouchableOpacity>
        ))}

        {allSet && (
          <Card style={styles.weekCard}>
            <View style={styles.weekRow}>
              <Zap size={16} color={colors.accent} />
              <Text style={[styles.weekText, { color: colors.text }]}>Semana {currentWeek} de 4{currentWeek === 4 ? ' (deload)' : ''}</Text>
            </View>
          </Card>
        )}

        <Button
          title={`Gerar Plano da Semana ${currentWeek}`}
          onPress={handleGenerate}
          loading={generating}
          disabled={!allSet}
          icon={<TrendingUp size={18} color="#fff" />}
          style={{ marginTop: 8 }}
        />
        {allSet && (
          <Button
            title="Avançar para a Semana Seguinte"
            onPress={handleAdvanceWeek}
            variant="outline"
            style={{ marginTop: 8 }}
          />
        )}
      </ScrollView>

      {editingLift && (
        <View style={styles.editorOverlay}>
          <View style={[styles.editorCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.editorTitle, { color: colors.text }]}>{FIVE31_LIFT_LABELS[editingLift]}</Text>
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeChip, { backgroundColor: inputMode === 'tm' ? colors.primary : colors.surfaceVariant }]}
                onPress={() => { hapticSelect(); setInputMode('tm'); }}
              >
                <Text style={{ color: inputMode === 'tm' ? '#fff' : colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>Peso de Referência</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeChip, { backgroundColor: inputMode === 'orm' ? colors.primary : colors.surfaceVariant }]}
                onPress={() => { hapticSelect(); setInputMode('orm'); }}
              >
                <Text style={{ color: inputMode === 'orm' ? '#fff' : colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>A partir do 1RM</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.editorHint, { color: colors.textTertiary }]}>
              {inputMode === 'orm' ? 'Indica o teu 1RM estimado — calculamos ~90% automaticamente.' : 'Indica o Peso de Referência diretamente.'}
            </Text>
            <TextInput
              style={[styles.editorInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType="decimal-pad"
              placeholder="Ex: 100"
              placeholderTextColor={colors.textTertiary}
              autoFocus
            />
            <View style={styles.editorActions}>
              <Button title="Cancelar" variant="ghost" onPress={() => setEditingLift(null)} style={{ flex: 1 }} />
              <Button title="Guardar" onPress={saveTrainingMax} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  introText: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 19 },
  sectionTitle: { fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 1, marginTop: 4 },
  liftRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  liftIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  liftName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  liftIncrement: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  liftWeight: { fontFamily: 'Inter-Bold', fontSize: 18 },
  weekCard: { paddingVertical: 12 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  weekText: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  editorOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 24 },
  editorCard: { width: '100%', borderRadius: 16, padding: 20, gap: 10 },
  editorTitle: { fontFamily: 'Inter-Bold', fontSize: 18 },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modeChip: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  editorHint: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16 },
  editorInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter-SemiBold', fontSize: 18 },
  editorActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
