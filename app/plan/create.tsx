import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, TouchableOpacity, Alert, FlatList, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SearchBar } from '@/components/ui/SearchBar';
import { Card } from '@/components/ui/Card';
import { ExerciseTile } from '@/components/ui/ExerciseTile';
import { createPlan, addExerciseToPlan } from '@/db/planDao';
import { getDatabase } from '@/db/database';
import { searchExercises } from '@/db/exerciseDao';
import type { Exercise, PlanType, SplitType, SetType } from '@/types';
import { PLAN_TYPE_PT, SPLIT_TYPE_PT, MUSCLE_GROUPS_PT, EQUIPMENT_PT, SET_TYPE_PT } from '@/types';
import { useRouter } from 'expo-router';
import { Plus, Trash2, GripVertical, X, Link2 } from 'lucide-react-native';

interface PlanExerciseDraft {
  exercise: Exercise;
  sets: number;
  repsTarget: string;
  weightTarget: number;
  restSeconds: number;
  setType: SetType;
  supersetGroup: number | null;
  dayIndex: number;
  notes: string;
}

const PLAN_TYPES: PlanType[] = ['strength', 'hypertrophy', 'endurance', 'cardio', 'mobility'];
const SPLIT_TYPES: SplitType[] = ['abc', 'ppl', 'fullbody', 'upper_lower', 'ul_ppl', 'bro', 'custom'];
const SET_TYPES: SetType[] = ['normal', 'warmup', 'dropset', 'failure', 'amrap'];
const REST_OPTIONS = [30, 60, 90, 120, 180, 240, 300];

export default function CreatePlanScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [planType, setPlanType] = useState<PlanType>('hypertrophy');
  const [splitType, setSplitType] = useState<SplitType>('custom');
  const [exercises, setExercises] = useState<PlanExerciseDraft[]>([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<Exercise[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Plans are organised into training days (Treino A / B / C...). A new plan
  // starts with a single day; the user can add more.
  const [dayLabels, setDayLabels] = useState<string[]>(['Treino A']);
  const [activeDay, setActiveDay] = useState(0);

  const pickerSeq = useRef(0);
  useEffect(() => {
    if (!showExercisePicker) return;
    // BUGFIX: no request sequencing meant a slower result for an earlier
    // keystroke could overwrite a faster, more recent one (including
    // clearing the box back to showing everything) — same class of bug as
    // the main Exercises tab's search. Also had no error handling at all,
    // so any failed request left the list silently stuck on stale results.
    const seq = ++pickerSeq.current;
    searchExercises(pickerQuery)
      .then(results => { if (seq === pickerSeq.current) setPickerResults(results); })
      .catch(err => {
        console.error('Failed to search exercises:', err);
        if (seq === pickerSeq.current) setPickerResults([]);
      });
  }, [pickerQuery, showExercisePicker]);

  const addExercise = (ex: Exercise) => {
    setExercises(prev => [...prev, {
      exercise: ex, sets: 3, repsTarget: '8-12', weightTarget: 0,
      restSeconds: 90, setType: 'normal', supersetGroup: null,
      dayIndex: activeDay, notes: '',
    }]);
    setShowExercisePicker(false);
  };

  const removeExercise = (i: number) => {
    setExercises(prev => prev.filter((_, idx) => idx !== i));
    if (editingIndex === i) setEditingIndex(null);
  };

  const updateExercise = (i: number, update: Partial<PlanExerciseDraft>) => {
    setExercises(prev => prev.map((ex, idx) => idx === i ? { ...ex, ...update } : ex));
  };

  const addDay = () => {
    const letter = String.fromCharCode(65 + dayLabels.length); // A, B, C...
    setDayLabels(prev => [...prev, `Treino ${letter}`]);
    setActiveDay(dayLabels.length);
    setEditingIndex(null);
  };

  const removeDay = (dayIdx: number) => {
    if (dayLabels.length === 1) return;
    Alert.alert('Remover dia', `Remover "${dayLabels[dayIdx]}" e os seus exercicios?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: () => {
          setExercises(prev => prev
            .filter(e => e.dayIndex !== dayIdx)
            .map(e => e.dayIndex > dayIdx ? { ...e, dayIndex: e.dayIndex - 1 } : e));
          setDayLabels(prev => prev.filter((_, i) => i !== dayIdx));
          setActiveDay(a => Math.max(0, a >= dayIdx ? a - 1 : a));
          setEditingIndex(null);
        },
      },
    ]);
  };

  const renameDay = (dayIdx: number, label: string) => {
    setDayLabels(prev => prev.map((l, i) => i === dayIdx ? label : l));
  };

  /**
   * Toggles whether an exercise is supersetted with the one above it. Grouped
   * exercises share a superset_group id and are performed back-to-back.
   */
  const toggleSuperset = (globalIdx: number) => {
    setExercises(prev => {
      const target = prev[globalIdx];
      const sameDay = prev.filter(e => e.dayIndex === target.dayIndex);
      const posInDay = sameDay.indexOf(target);
      if (posInDay <= 0) return prev; // first exercise of a day has nothing above
      const above = sameDay[posInDay - 1];

      if (target.supersetGroup !== null && target.supersetGroup === above.supersetGroup) {
        // Ungroup this one
        return prev.map((e, i) => i === globalIdx ? { ...e, supersetGroup: null } : e);
      }

      const group = above.supersetGroup ?? (Math.max(0, ...prev.map(e => e.supersetGroup ?? -1)) + 1);
      return prev.map(e => {
        if (e === above) return { ...e, supersetGroup: group };
        if (e === target) return { ...e, supersetGroup: group };
        return e;
      });
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Nome obrigatório', 'Dá um nome ao plano.'); return; }
    setSaving(true);
    try {
      // BUGFIX: this had no error handling at all (a failure would be an
      // unhandled rejection, with "Guardar" just appearing to do nothing),
      // and if it failed partway through the exercise loop, the plan was
      // left half-saved in the database. Wrapping in a transaction makes it
      // atomic: either the whole plan saves, or none of it does.
      let planId!: number;
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        planId = await createPlan(name.trim(), description.trim(), planType, splitType);
        // Order restarts within each day so every day reads 1..N.
        const perDayOrder = new Map<number, number>();
        for (const e of exercises) {
          const order = perDayOrder.get(e.dayIndex) ?? 0;
          perDayOrder.set(e.dayIndex, order + 1);
          await addExerciseToPlan(
            planId, e.exercise.id, e.sets, e.repsTarget, e.weightTarget,
            e.restSeconds, e.setType, e.supersetGroup, e.notes, order,
            dayLabels[e.dayIndex] || `Dia ${e.dayIndex + 1}`, e.dayIndex,
          );
        }
      });
      router.replace({ pathname: '/plan/[id]', params: { id: planId } });
    } catch (err) {
      console.error('Failed to save plan:', err);
      Alert.alert('Erro', 'Não foi possível guardar o plano. Tenta novamente.');
    } finally {
      setSaving(false);
    }
  };

  // Exercises of the currently selected day, keeping their index in the full
  // list so edit/remove/superset actions still address the right item.
  const dayExercises = exercises
    .map((ex, i) => ({ ex, i }))
    .filter(({ ex }) => ex.dayIndex === activeDay)
    .map(({ ex, i }, posInDay, arr) => {
      const above = posInDay > 0 ? arr[posInDay - 1].ex : null;
      const groupedWithAbove = ex.supersetGroup !== null && above !== null && above.supersetGroup === ex.supersetGroup;
      return { ex, i, posInDay, groupedWithAbove };
    });

  return (
    <SafeAreaView edges={['top','bottom']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Novo Plano" showBack right={
        <Button title="Guardar" onPress={handleSave} loading={saving} size="small" />
      } />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Basic info */}
        <Card>
          <Text style={[styles.label, { color: colors.textSecondary }]}>NOME DO PLANO</Text>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
            value={name} onChangeText={setName}
            placeholder="Ex: Treino A – Peito/Tríceps"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={[styles.label, { color: colors.textSecondary }]}>DESCRIÇÃO (opcional)</Text>
          <TextInput
            style={[styles.inputMulti, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
            value={description} onChangeText={setDescription}
            placeholder="Notas sobre o plano..."
            placeholderTextColor={colors.textTertiary}
            multiline numberOfLines={3}
          />
        </Card>

        <Card>
          <Text style={[styles.label, { color: colors.textSecondary }]}>TIPO DE TREINO</Text>
          <View style={styles.chips}>
            {PLAN_TYPES.map(t => <Chip key={t} label={PLAN_TYPE_PT[t]} selected={planType === t} onPress={() => setPlanType(t)} />)}
          </View>
          <Text style={[styles.label, { color: colors.textSecondary }]}>DIVISÃO</Text>
          <View style={styles.chips}>
            {SPLIT_TYPES.map(t => <Chip key={t} label={SPLIT_TYPE_PT[t]} selected={splitType === t} onPress={() => setSplitType(t)} />)}
          </View>
        </Card>

        {/* Day tabs */}
        <Card>
          <Text style={[styles.label, { color: colors.textSecondary }]}>DIAS DE TREINO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabsScroll} contentContainerStyle={styles.dayTabs}>
            {dayLabels.map((label, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => { setActiveDay(i); setEditingIndex(null); }}
                onLongPress={() => removeDay(i)}
                delayLongPress={600}
                style={[styles.dayTab, {
                  backgroundColor: i === activeDay ? colors.primary : colors.surfaceVariant,
                  borderColor: i === activeDay ? colors.primary : colors.border,
                }]}
                accessibilityRole="button"
                accessibilityLabel={`Dia ${label}`}
                accessibilityState={{ selected: i === activeDay }}
              >
                <Text style={[styles.dayTabText, { color: i === activeDay ? '#fff' : colors.textSecondary }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={addDay}
              style={[styles.dayTab, styles.dayTabAdd, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Adicionar dia de treino"
            >
              <Plus size={16} color={colors.primary} />
            </TouchableOpacity>
          </ScrollView>
          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>NOME DO DIA</Text>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
            value={dayLabels[activeDay] || ''}
            onChangeText={v => renameDay(activeDay, v)}
            placeholder="Ex: Peito e Tríceps"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Mantém premido um dia para o remover.
          </Text>
        </Card>

        {/* Exercises */}
        <View style={styles.exSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {dayLabels[activeDay]} ({dayExercises.length} exercícios)
          </Text>
          {dayExercises.map(({ ex, i, posInDay, groupedWithAbove }) => (
            <Card key={i} style={[styles.exCard, groupedWithAbove && { borderLeftWidth: 3, borderLeftColor: colors.accent }]}>
              {groupedWithAbove && (
                <View style={styles.supersetTag}>
                  <Link2 size={12} color={colors.accent} />
                  <Text style={[styles.supersetTagText, { color: colors.accent }]}>Superserie com o anterior</Text>
                </View>
              )}
              <TouchableOpacity style={styles.exHeader} onPress={() => setEditingIndex(editingIndex === i ? null : i)}>
                <GripVertical size={16} color={colors.textTertiary} />
                <ExerciseTile muscle={ex.exercise.primary_muscle} equipment={ex.exercise.equipment} size={38} />
                <View style={styles.exInfo}>
                  <Text style={[styles.exName, { color: colors.text }]}>{ex.exercise.name}</Text>
                  <Text style={[styles.exSub, { color: colors.textSecondary }]}>
                    {ex.sets} séries · {ex.repsTarget} reps · {ex.weightTarget}kg · {ex.restSeconds}s
                  </Text>
                </View>
                {posInDay > 0 && (
                  <TouchableOpacity
                    onPress={() => toggleSuperset(i)}
                    hitSlop={8}
                    style={{ marginRight: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={groupedWithAbove ? 'Desagrupar superserie' : 'Agrupar em superserie com o exercicio anterior'}
                  >
                    <Link2 size={18} color={groupedWithAbove ? colors.accent : colors.textTertiary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => removeExercise(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remover exercicio">
                  <Trash2 size={18} color={colors.error} />
                </TouchableOpacity>
              </TouchableOpacity>

              {editingIndex === i && (
                <View style={styles.exEdit}>
                  <View style={styles.editRow}>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: colors.textSecondary }]}>Séries</Text>
                      <View style={styles.stepper}>
                        <TouchableOpacity onPress={() => updateExercise(i, { sets: Math.max(1, ex.sets - 1) })} style={[styles.stepBtn, { backgroundColor: colors.surfaceVariant }]}>
                          <Text style={[styles.stepBtnText, { color: colors.text }]}>-</Text>
                        </TouchableOpacity>
                        <Text style={[styles.stepValue, { color: colors.text }]}>{ex.sets}</Text>
                        <TouchableOpacity onPress={() => updateExercise(i, { sets: ex.sets + 1 })} style={[styles.stepBtn, { backgroundColor: colors.surfaceVariant }]}>
                          <Text style={[styles.stepBtnText, { color: colors.text }]}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: colors.textSecondary }]}>Reps</Text>
                      <TextInput
                        style={[styles.editInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                        value={ex.repsTarget}
                        onChangeText={v => updateExercise(i, { repsTarget: v })}
                        placeholder="8-12"
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                    <View style={styles.editField}>
                      <Text style={[styles.editLabel, { color: colors.textSecondary }]}>Peso (kg)</Text>
                      <TextInput
                        style={[styles.editInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                        value={ex.weightTarget ? String(ex.weightTarget) : ''}
                        onChangeText={v => updateExercise(i, { weightTarget: parseFloat(v) || 0 })}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                  </View>
                  <View style={styles.editRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.editLabel, { color: colors.textSecondary }]}>Descanso</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.restChips} contentContainerStyle={styles.restChipsContent}>
                        {REST_OPTIONS.map(r => (
                          <Chip key={r} label={r >= 60 ? `${r / 60}min` : `${r}s`} selected={ex.restSeconds === r} onPress={() => updateExercise(i, { restSeconds: r })} />
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                  <View>
                    <Text style={[styles.editLabel, { color: colors.textSecondary }]}>Tipo de Série</Text>
                    <View style={styles.setTypeRow}>
                      {SET_TYPES.map(t => <Chip key={t} label={SET_TYPE_PT[t]} selected={ex.setType === t} onPress={() => updateExercise(i, { setType: t })} />)}
                    </View>
                  </View>
                  <TextInput
                    style={[styles.notesInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                    value={ex.notes}
                    onChangeText={v => updateExercise(i, { notes: v })}
                    placeholder="Notas..."
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              )}
            </Card>
          ))}

          <TouchableOpacity
            style={[styles.addExBtn, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}
            onPress={() => { setPickerQuery(''); setShowExercisePicker(true); }}
          >
            <Plus size={20} color={colors.primary} />
            <Text style={[styles.addExText, { color: colors.primary }]}>Adicionar Exercício</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Exercise picker modal */}
      <Modal visible={showExercisePicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowExercisePicker(false)}>
        <View style={[styles.pickerModal, { backgroundColor: colors.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Escolher Exercício</Text>
            <TouchableOpacity onPress={() => setShowExercisePicker(false)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: 12 }}>
            <SearchBar value={pickerQuery} onChangeText={setPickerQuery} placeholder="Pesquisar..." />
          </View>
          <FlatList
            data={pickerResults}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                onPress={() => addExercise(item)}
              >
                <ExerciseTile muscle={item.primary_muscle} equipment={item.equipment} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>{MUSCLE_GROUPS_PT[item.primary_muscle]} · {EQUIPMENT_PT[item.equipment]}</Text>
                </View>
                <Plus size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12 },
  label: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  input: { borderRadius: 10, padding: 12, fontFamily: 'Inter-Regular', fontSize: 15, borderWidth: 1 },
  inputMulti: { borderRadius: 10, padding: 12, fontFamily: 'Inter-Regular', fontSize: 15, borderWidth: 1, minHeight: 80, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 18, marginBottom: 8 },
  // BUGFIX: see app/(tabs)/index.tsx — a horizontal ScrollView with no
  // explicit height can clip its content's top on Android.
  dayTabsScroll: { flexGrow: 0, height: 48 },
  dayTabs: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 4 },
  dayTab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  dayTabAdd: { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  dayTabText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  hint: { fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 14, marginTop: 6 },
  supersetTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  supersetTagText: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14 },
  exSection: { gap: 8 },
  exCard: { gap: 8 },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exInfo: { flex: 1 },
  exName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  exSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  exEdit: { gap: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#ffffff10' },
  editRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  editField: { flex: 1, minWidth: 80 },
  editLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1, marginBottom: 6 },
  editInput: { borderRadius: 8, padding: 10, fontFamily: 'Inter-Regular', fontSize: 14, borderWidth: 1, textAlign: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontFamily: 'Inter-Bold', fontSize: 18 },
  stepValue: { fontFamily: 'Inter-Bold', fontSize: 18, minWidth: 28, textAlign: 'center' },
  restChips: { flexGrow: 0, height: 44 },
  restChipsContent: { gap: 6, alignItems: 'center' },
  setTypeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  notesInput: { borderRadius: 8, padding: 10, fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17, borderWidth: 1 },
  addExBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', paddingVertical: 14 },
  addExText: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  pickerModal: { flex: 1 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  pickerTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  pickerName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  pickerSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
});
