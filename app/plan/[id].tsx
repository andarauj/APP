import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, FlatList, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { SearchBar } from '@/components/ui/SearchBar';
import { ExerciseTile } from '@/components/ui/ExerciseTile';
import { getPlanById, getPlanExercisesWithDetails, addExerciseToPlan, deletePlanExercise, updatePlanExercise } from '@/db/planDao';
import { searchExercises } from '@/db/exerciseDao';
import { exportPlanAsXml, shareXmlFile } from '@/utils/xmlExport';
import { parseTempo } from '@/utils/calculators';
import type { WorkoutPlan, SetType, MuscleGroup , Exercise } from '@/types';
import { PLAN_TYPE_PT, SPLIT_TYPE_PT, MUSCLE_GROUPS_PT, EQUIPMENT_PT, SET_TYPE_PT } from '@/types';
import { Play, Plus, Trash2, Download, X, CalendarDays } from 'lucide-react-native';

const REST_OPTIONS = [30, 60, 90, 120, 180, 240, 300];
const SET_TYPES: SetType[] = ['normal', 'warmup', 'dropset', 'failure', 'amrap'];

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [exercises, setExercises] = useState<any[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<Exercise[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);

  // load() re-reads the plan from the database every time this screen gains
  // focus, which is what makes edits made in the exercise picker show up on
  // return. It closes only over the route id, which never changes for a
  // given mount.
  const load = useCallback(async () => {
    const p = await getPlanById(Number(id));
    const exs = await getPlanExercisesWithDetails(Number(id));
    setPlan(p);
    setExercises(exs);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickerSeq = useRef(0);
  useEffect(() => {
    if (!showPicker) return;
    // BUGFIX: see app/plan/create.tsx — no request sequencing or error
    // handling meant a slower, stale result could silently overwrite the
    // correct current one.
    const seq = ++pickerSeq.current;
    searchExercises(pickerQuery)
      .then(results => { if (seq === pickerSeq.current) setPickerResults(results); })
      .catch(err => {
        console.error('Failed to search exercises:', err);
        if (seq === pickerSeq.current) setPickerResults([]);
      });
  }, [pickerQuery, showPicker]);

  const handleAddExercise = async (ex: Exercise) => {
    // Add into the day the user is currently viewing, not blindly at the end.
    const dayExercises = exercises.filter((e: any) => (e.day_index ?? 0) === selectedDay);
    const dayLabel = days.find(d => d.day_index === selectedDay)?.day_label || 'Treino';
    await addExerciseToPlan(
      Number(id), ex.id, 3, '8-12', 0, 90, 'normal', null, '',
      dayExercises.length, dayLabel, selectedDay,
    );
    setShowPicker(false);
    load();
  };

  const handleDeleteExercise = (peId: number) => {
    Alert.alert('Remover exercício', 'Remover do plano?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => { await deletePlanExercise(peId); load(); } },
    ]);
  };

  const handleUpdate = async (pe: any) => {
    await updatePlanExercise(pe);
    load();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const xml = await exportPlanAsXml(Number(id));
      const filename = `Changes_Plano_${plan?.name.replace(/\s+/g, '_')}_${Date.now()}.xml`;
      await shareXmlFile(xml, filename);
    } catch (e) {
      Alert.alert('Erro ao exportar', String(e));
    } finally {
      setExporting(false);
    }
  };

  if (!plan) return null;

  // Group the plan's exercises into its training days. Plans created before
  // multi-day support (or single-day plans) collapse into one implicit day.
  const dayMap = new Map<number, { day_index: number; day_label: string }>();
  for (const e of exercises) {
    const idx: number = e.day_index ?? 0;
    if (!dayMap.has(idx)) dayMap.set(idx, { day_index: idx, day_label: e.day_label || 'Treino' });
  }
  const days = Array.from(dayMap.values()).sort((a, b) => a.day_index - b.day_index);

  const activeDay = days.find(d => d.day_index === selectedDay) ?? days[0];
  const activeDayIndex = activeDay?.day_index ?? 0;
  const dayExercises = exercises.filter((e: any) => (e.day_index ?? 0) === activeDayIndex);
  const hasMultipleDays = days.length > 1;

  // Muscle groups trained on this day, for the day summary line.
  const dayMuscles: string[] = Array.from(
    new Set(dayExercises.map((e: any) => MUSCLE_GROUPS_PT[e.primary_muscle as MuscleGroup]))
  );
  const dayTotalSets = dayExercises.reduce((sum: number, e: any) => sum + (e.sets || 0), 0);

  return (
    <SafeAreaView edges={['top','bottom']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={plan.name}
        showBack
        right={
          // Only the export icon lives in the header now — the start button
          // moved into the day card below, so a long plan name can no longer
          // collide with two side-by-side buttons on narrow headers.
          <TouchableOpacity
            onPress={handleExport}
            style={[styles.iconBtn, { backgroundColor: colors.surfaceVariant }]}
            accessibilityRole="button"
            accessibilityLabel="Exportar plano em XML"
          >
            <Download size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Meta */}
        <Card>
          <View style={styles.metaRow}>
            <Badge label={PLAN_TYPE_PT[plan.plan_type]} color={colors.primaryContainer} textColor={colors.primary} />
            <Badge label={SPLIT_TYPE_PT[plan.split_type]} color={colors.surfaceVariant} textColor={colors.textSecondary} />
          </View>
          {plan.description ? <Text style={[styles.desc, { color: colors.textSecondary }]}>{plan.description}</Text> : null}
        </Card>

        {/* Day selector */}
        {hasMultipleDays && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabsScroll} contentContainerStyle={styles.dayTabs}>
            {days.map(d => (
              <TouchableOpacity
                key={d.day_index}
                onPress={() => { setSelectedDay(d.day_index); setEditingId(null); }}
                style={[
                  styles.dayTab,
                  {
                    backgroundColor: d.day_index === activeDayIndex ? colors.primary : colors.surfaceVariant,
                    borderColor: d.day_index === activeDayIndex ? colors.primary : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Dia ${d.day_label}`}
                accessibilityState={{ selected: d.day_index === activeDayIndex }}
              >
                <Text style={[styles.dayTabText, { color: d.day_index === activeDayIndex ? '#fff' : colors.textSecondary }]}>
                  {d.day_label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Day summary */}
        {activeDay && (
          <Card style={styles.dayCard}>
            <View style={styles.dayHeaderRow}>
              <CalendarDays size={18} color={colors.primary} />
              <Text style={[styles.dayTitle, { color: colors.text }]}>{activeDay.day_label}</Text>
            </View>
            <Text style={[styles.daySub, { color: colors.textSecondary }]}>
              {dayExercises.length} exercícios · {dayTotalSets} séries
            </Text>
            {dayMuscles.length > 0 && (
              <View style={styles.dayMuscles}>
                {dayMuscles.map(m => (
                  <Badge key={m} label={m} color={colors.surfaceVariant} textColor={colors.textSecondary} />
                ))}
              </View>
            )}
            <Button
              title={hasMultipleDays ? `Treinar ${activeDay.day_label}` : 'Iniciar Treino'}
              size="small"
              icon={<Play size={16} color="#fff" />}
              onPress={() => router.push({
                pathname: '/workout/active',
                params: {
                  planId: plan.id,
                  planName: hasMultipleDays ? `${plan.name} · ${activeDay.day_label}` : plan.name,
                  dayIndex: String(activeDayIndex),
                },
              })}
            />
          </Card>
        )}

        {/* Exercises */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Exercícios ({dayExercises.length})</Text>
        {dayExercises.map((ex, i) => (
          <Card key={ex.id} style={styles.exCard}>
            <TouchableOpacity style={styles.exHeader} onPress={() => setEditingId(editingId === ex.id ? null : ex.id)}>
              <View>
                <ExerciseTile muscle={(ex as any).primary_muscle} equipment={(ex as any).equipment} size={40} />
                <View style={[styles.exIndex, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
                  <Text style={styles.exIndexText}>{i + 1}</Text>
                </View>
              </View>
              <View style={styles.exInfo}>
                <Text style={[styles.exName, { color: colors.text }]}>{ex.exercise_name}</Text>
                <Text style={[styles.exSub, { color: colors.textSecondary }]}>
                  {ex.sets} séries · {ex.reps_target} reps{ex.weight_target > 0 ? ` · ${ex.weight_target}kg` : ''} · {ex.rest_seconds}s descanso
                </Text>
              </View>
              <TouchableOpacity onPress={() => handleDeleteExercise(ex.id)} hitSlop={8}>
                <Trash2 size={18} color={colors.error} />
              </TouchableOpacity>
            </TouchableOpacity>

            {editingId === ex.id && (
              <PlanExerciseEditor pe={ex} colors={colors} onSave={async (updated) => { await handleUpdate({ ...ex, ...updated }); setEditingId(null); }} />
            )}
          </Card>
        ))}

        <TouchableOpacity
          style={[styles.addExBtn, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}
          onPress={() => { setPickerQuery(''); setShowPicker(true); }}
        >
          <Plus size={20} color={colors.primary} />
          <Text style={[styles.addExText, { color: colors.primary }]}>Adicionar Exercício</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPicker(false)}>
        <View style={[styles.picker, { backgroundColor: colors.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Escolher Exercício</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)}><X size={24} color={colors.text} /></TouchableOpacity>
          </View>
          <View style={{ padding: 12 }}>
            <SearchBar value={pickerQuery} onChangeText={setPickerQuery} placeholder="Pesquisar..." />
          </View>
          <FlatList
            data={pickerResults}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.pickerItem, { borderBottomColor: colors.border }]} onPress={() => handleAddExercise(item)}>
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

function PlanExerciseEditor({ pe, colors, onSave }: { pe: any; colors: any; onSave: (u: any) => void }) {
  const [sets, setSets] = useState(pe.sets);
  const [reps, setReps] = useState(pe.reps_target);
  const [weight, setWeight] = useState(String(pe.weight_target));
  const [rest, setRest] = useState(pe.rest_seconds);
  const [setType, setSetType] = useState<SetType>(pe.set_type);
  const [tempo, setTempo] = useState(pe.tempo || '');
  const [notes, setNotes] = useState(pe.notes || '');
  const tempoValid = tempo === '' || parseTempo(tempo) !== null;

  return (
    <View style={styles.editor}>
      <View style={styles.editRow}>
        <View style={styles.editField}>
          <Text style={[styles.editLabel, { color: colors.textSecondary }]}>Séries</Text>
          <View style={styles.stepper}>
            <TouchableOpacity onPress={() => setSets(Math.max(1, sets - 1))} style={[styles.stepBtn, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={[{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 18 }]}>-</Text>
            </TouchableOpacity>
            <Text style={[{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 18, minWidth: 28, textAlign: 'center' }]}>{sets}</Text>
            <TouchableOpacity onPress={() => setSets(sets + 1)} style={[styles.stepBtn, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={[{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 18 }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.editField}>
          <Text style={[styles.editLabel, { color: colors.textSecondary }]}>Reps</Text>
          <TextInput style={[styles.editInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]} value={reps} onChangeText={setReps} placeholder="8-12" placeholderTextColor={colors.textTertiary} />
        </View>
        <View style={styles.editField}>
          <Text style={[styles.editLabel, { color: colors.textSecondary }]}>Peso (kg)</Text>
          <TextInput style={[styles.editInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]} value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textTertiary} />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 44 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        {REST_OPTIONS.map(r => <Chip key={r} label={r >= 60 ? `${r / 60}min` : `${r}s`} selected={rest === r} onPress={() => setRest(r)} />)}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {SET_TYPES.map(t => <Chip key={t} label={SET_TYPE_PT[t]} selected={setType === t} onPress={() => setSetType(t)} />)}
      </View>
      {/* Rep cadence: down-pause-up-pause, in seconds (e.g. 3-1-2-0) */}
      <View>
        <Text style={[styles.editLabel, { color: colors.textSecondary }]}>Cadência (opcional)</Text>
        <TextInput
          style={[styles.notesInput, {
            color: colors.text,
            backgroundColor: colors.surfaceVariant,
            borderColor: tempoValid ? colors.border : colors.error,
          }]}
          value={tempo}
          onChangeText={setTempo}
          placeholder="Ex: 3-1-2-0 (descer-pausa-subir-pausa)"
          placeholderTextColor={colors.textTertiary}
        />
        {!tempoValid && (
          <Text style={[styles.tempoError, { color: colors.error }]}>
            Usa 4 números de 0 a 10, ex: 3-1-2-0
          </Text>
        )}
      </View>
      <TextInput style={[styles.notesInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]} value={notes} onChangeText={setNotes} placeholder="Notas..." placeholderTextColor={colors.textTertiary} />
      <Button
        title="Guardar"
        size="small"
        disabled={!tempoValid}
        onPress={() => onSave({ sets, reps_target: reps, weight_target: parseFloat(weight) || 0, rest_seconds: rest, set_type: setType, tempo, notes })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12 },
  metaRow: { flexDirection: 'row', gap: 8 },
  // BUGFIX: a horizontal ScrollView with no explicit height/style can render
  // with an ambiguous, too-short height on Android, clipping the top of its
  // content (seen with the muscle-filter chips on the Exercises tab).
  // Same fix applied everywhere this pattern is used: explicit height +
  // vertically centered content.
  dayTabsScroll: { flexGrow: 0, height: 48 },
  dayTabs: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 2 },
  dayTab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  dayTabText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  dayCard: { gap: 10 },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayTitle: { fontFamily: 'Inter-Bold', fontSize: 17 },
  daySub: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17 },
  dayMuscles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  desc: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 18 },
  exCard: { gap: 8 },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exIndex: {
    position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  exIndexText: { fontFamily: 'Inter-Bold', fontSize: 10, lineHeight: 13, color: '#fff' },
  exInfo: { flex: 1 },
  exName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  exSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  addExBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', paddingVertical: 14, marginBottom: 32 },
  addExText: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  startText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 14 },
  picker: { flex: 1 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  pickerTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  pickerName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  pickerSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  editor: { gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#ffffff15' },
  editRow: { flexDirection: 'row', gap: 12 },
  editField: { flex: 1 },
  editLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1, marginBottom: 6 },
  editInput: { borderRadius: 8, padding: 10, fontFamily: 'Inter-Regular', fontSize: 14, borderWidth: 1, textAlign: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tempoError: { fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 14, marginTop: 4 },
  notesInput: { borderRadius: 8, padding: 10, fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17, borderWidth: 1 },
});
