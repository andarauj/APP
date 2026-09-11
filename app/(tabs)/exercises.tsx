import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, SectionList, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { SearchBar } from '@/components/ui/SearchBar';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { muscleColor } from '@/components/ui/ExerciseTile';
import { ExerciseListItem } from '@/components/ui/ExerciseListItem';
import { useDatabase } from '@/hooks/useDatabase';
import { searchExercises, createCustomExercise, deleteCustomExercise, getExerciseUsage } from '@/db/exerciseDao';
import { hapticWarning } from '@/utils/haptics';
import type { Exercise, MuscleGroup, Equipment, ExerciseType } from '@/types';
import { MUSCLE_GROUPS_PT, EQUIPMENT_PT } from '@/types';
import { Dumbbell, Plus, SlidersHorizontal, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';

const MUSCLES: (MuscleGroup | null)[] = [null, 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'quads', 'hamstrings', 'glutes', 'calves', 'traps', 'lats', 'cardio', 'mobility', 'fullbody'];

// Exercise landing: a grid of muscle groups you tap to drill into.
const MUSCLE_GRID: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'quads', 'hamstrings', 'glutes', 'calves', 'cardio'];
const EQUIPMENTS: (Equipment | null)[] = [null, 'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'ez_bar', 'smith', 'plate', 'other'];
const TYPES: (ExerciseType | null)[] = [null, 'strength', 'cardio', 'mobility'];

export default function ExercisesScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [filterMuscle, setFilterMuscle] = useState<MuscleGroup | null>(null);
  const [filterEquip, setFilterEquip] = useState<Equipment | null>(null);
  const [filterType, setFilterType] = useState<ExerciseType | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  // 'grid' = muscle-group landing; 'list' = the filtered list.
  const [browse, setBrowse] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newMuscle, setNewMuscle] = useState<MuscleGroup>('chest');
  const [newEquip, setNewEquip] = useState<Equipment>('dumbbell');
  const [newType, setNewType] = useState<ExerciseType>('strength');
  const [newInstructions, setNewInstructions] = useState('');

  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    if (!isReady) return;
    // BUGFIX: every keystroke fired a new async searchExercises() call with
    // no sequencing, so a slower request for an earlier (shorter) query text
    // could resolve AFTER a faster request for the final query — including
    // the empty string when clearing the search — silently overwriting the
    // correct results with stale ones. This made search look broken/random
    // and made clearing the box sometimes fail to bring back the full list.
    // Tagging each request and only applying the result if it's still the
    // most recent one fixes it.
    const seq = ++searchSeq.current;
    setLoading(true);
    try {
      // Infinity, not the default limit: this screen *is* the library, so
      // truncating it would silently hide exercises. The SectionList below
      // is windowed to keep that affordable.
      const results = await searchExercises(query, {
        muscle: filterMuscle,
        equipment: filterEquip,
        type: filterType,
      }, Infinity);
      if (seq !== searchSeq.current) return; // a newer search superseded this one
      setExercises(results);
    } catch (err) {
      console.error('Failed to load exercises:', err);
      if (seq === searchSeq.current) setExercises([]);
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }, [isReady, query, filterMuscle, filterEquip, filterType]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const [creating, setCreating] = useState(false);
  const handleCreate = async () => {
    if (!newName.trim()) { Alert.alert('Nome obrigatório'); return; }
    setCreating(true);
    try {
      await createCustomExercise(newName.trim(), newMuscle, '', newEquip, newType, newInstructions.trim());
      setShowCreate(false);
      setNewName(''); setNewInstructions('');
      load();
    } catch (err) {
      console.error('Failed to create exercise:', err);
      Alert.alert('Erro', 'Não foi possível criar o exercício. Tenta novamente.');
    } finally {
      setCreating(false);
    }
  };

  // PERF: wrapped in useCallback so it doesn't change identity every render —
  // otherwise renderItem's own useCallback (which depends on this) would
  // still get a new function every time, defeating the memoization above.
  const handleDelete = useCallback(async (ex: Exercise) => {
    if (!ex.is_custom) return;

    // BUGFIX: exercises.id cascades into both plan_exercises and workout_sets
    // (ON DELETE CASCADE), so deleting an exercise that's actually in use
    // silently strips it out of any plan and destroys every set ever logged
    // for it — the confirmation used to just say 'Eliminar "X"?' with no hint
    // of that. Block deletion outright once real history exists (consistent
    // with the rest of the app never letting the UI erase logged sets), and
    // warn clearly when it's only used in plans.
    const { planCount, setCount } = await getExerciseUsage(ex.id);

    if (setCount > 0) {
      Alert.alert(
        'Não é possível eliminar',
        `Já tens ${setCount} ${setCount === 1 ? 'série registada' : 'séries registadas'} com "${ex.name}". Para manter o teu histórico de treino intacto, este exercício não pode ser eliminado.`
      );
      return;
    }

    const planWarning = planCount > 0
      ? `\n\nEste exercício está em ${planCount} ${planCount === 1 ? 'plano' : 'planos'} — será removido de ${planCount === 1 ? 'lá' : 'todos eles'} também.`
      : '';

    Alert.alert('Eliminar exercício', `Eliminar "${ex.name}"?${planWarning}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          hapticWarning();
          try {
            await deleteCustomExercise(ex.id);
            load();
          } catch (err) {
            console.error('Failed to delete exercise:', err);
            Alert.alert('Erro', 'Não foi possível eliminar o exercício. Tenta novamente.');
          }
        }
      },
    ]);
  }, [load]);

  const activeFilters = [filterMuscle, filterEquip, filterType].filter(Boolean).length;

  // Grouping alphabetically turns a flat wall of 560+ rows into something
  // actually scannable, with sticky letter headers like a contacts list.
  // PERF: this was recomputed from scratch on every render (including ones
  // unrelated to `exercises`, e.g. toggling a modal), redoing a 560-item
  // group-and-sort each time. Memoizing it so it only reruns when the
  // exercise list itself actually changes.
  const sections = useMemo(() => {
    const groups = new Map<string, Exercise[]>();
    for (const ex of exercises) {
      const letter = ex.name.charAt(0).toUpperCase();
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter)!.push(ex);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, data]) => ({ title: letter, data }));
  }, [exercises]);

  // PERF: an inline function here gets a new identity every render, which
  // defeats SectionList's ability to skip re-rendering rows that haven't
  // actually changed. useCallback keeps the same function reference across
  // renders that don't touch its dependencies.
  const renderItem = useCallback(({ item }: { item: Exercise }) => {
    return (
      <ExerciseListItem
        exercise={item}
        onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })}
        onLongPress={() => item.is_custom === 1 && handleDelete(item)}
        surfaceColor={colors.surface}
        textColor={colors.text}
        textSecondaryColor={colors.textSecondary}
        textTertiaryColor={colors.textTertiary}
      />
    );
  }, [colors, router, handleDelete]);

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {browse === 'list' && (
            <TouchableOpacity
              onPress={() => { setBrowse('grid'); setFilterMuscle(null); setQuery(''); }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Voltar aos grupos musculares"
            >
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {browse === 'list' && filterMuscle ? MUSCLE_GROUPS_PT[filterMuscle] : 'Exercícios'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: activeFilters > 0 ? colors.primaryContainer : colors.surfaceVariant }]}
            onPress={() => setShowFilters(true)}
            accessibilityRole="button"
            accessibilityLabel="Filtros de exercícios"
          >
            <SlidersHorizontal size={20} color={activeFilters > 0 ? colors.primary : colors.textSecondary} />
            {activeFilters > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>{activeFilters}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowCreate(true)}
            accessibilityRole="button"
            accessibilityLabel="Criar exercício personalizado"
          >
            <Plus size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {browse === 'grid' && (
        <ScrollView contentContainerStyle={styles.gridContent} showsVerticalScrollIndicator={false}>
          <View style={styles.searchRow}>
            <SearchBar
              value={query}
              onChangeText={(t) => { setQuery(t); if (t) setBrowse('list'); }}
              placeholder="Pesquisar exercícios..."
            />
          </View>
          <View style={styles.muscleGrid}>
            {MUSCLE_GRID.map(m => {
              const c = muscleColor(m);
              return (
                <TouchableOpacity
                  key={m}
                  style={styles.muscleTile}
                  onPress={() => { setFilterMuscle(m); setBrowse('list'); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={MUSCLE_GROUPS_PT[m]}
                >
                  <View style={[styles.muscleCircle, { backgroundColor: c + '22' }]}>
                    <Dumbbell size={26} color={c} />
                  </View>
                  <Text style={[styles.muscleLabel, { color: colors.text }]} numberOfLines={1}>{MUSCLE_GROUPS_PT[m]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={[styles.seeAllBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setFilterMuscle(null); setBrowse('list'); }}
            accessibilityRole="button"
            accessibilityLabel="Ver todos os exercícios"
          >
            <Text style={styles.seeAllBtnText}>Ver todos os {exercises.length || ''} exercícios</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {browse === 'list' && (<>
      {/* Search */}
      <View style={styles.searchRow}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Pesquisar exercícios..." />
      </View>

      {/* Inline filter pills. The full picker stays in the bottom-sheet
          modal; these surface what's active and open it. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterPillsWrap}
        contentContainerStyle={styles.filterPills}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => setShowFilters(true)}
          style={[styles.pill, { backgroundColor: activeFilters > 0 ? colors.primary : colors.surfaceVariant }]}
        >
          <SlidersHorizontal size={14} color={activeFilters > 0 ? '#fff' : colors.textSecondary} />
          <Text style={[styles.pillText, { color: activeFilters > 0 ? '#fff' : colors.textSecondary }]}>
            Filtros{activeFilters > 0 ? ` · ${activeFilters}` : ''}
          </Text>
        </TouchableOpacity>
        {filterMuscle && (
          <TouchableOpacity onPress={() => setFilterMuscle(null)} style={[styles.pill, { backgroundColor: colors.primaryContainer }]}>
            <Text style={[styles.pillText, { color: colors.onPrimaryContainer }]}>{MUSCLE_GROUPS_PT[filterMuscle]}</Text>
            <X size={13} color={colors.onPrimaryContainer} />
          </TouchableOpacity>
        )}
        {filterEquip && (
          <TouchableOpacity onPress={() => setFilterEquip(null)} style={[styles.pill, { backgroundColor: colors.primaryContainer }]}>
            <Text style={[styles.pillText, { color: colors.onPrimaryContainer }]}>{EQUIPMENT_PT[filterEquip]}</Text>
            <X size={13} color={colors.onPrimaryContainer} />
          </TouchableOpacity>
        )}
        {filterType && (
          <TouchableOpacity onPress={() => setFilterType(null)} style={[styles.pill, { backgroundColor: colors.primaryContainer }]}>
            <Text style={[styles.pillText, { color: colors.onPrimaryContainer }]}>
              {filterType === 'strength' ? 'Força' : filterType === 'cardio' ? 'Cardio' : 'Mobilidade'}
            </Text>
            <X size={13} color={colors.onPrimaryContainer} />
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Count */}
      <Text style={[styles.count, { color: colors.textTertiary }]}>
        {exercises.length} exercício{exercises.length !== 1 ? 's' : ''}
      </Text>

      {/* List, grouped alphabetically with sticky letter headers */}
      <SectionList
        sections={sections}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionHeaderText, { color: colors.primary }]}>{section.title}</Text>
          </View>
        )}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
        // The library holds ~1400 rows. Without these the list mounts far
        // more of them than fit on screen, which shows up as a stutter when
        // opening the tab and when flinging through the alphabet.
        // getItemLayout is deliberately not used: row height varies with
        // whether an exercise has an illustration, so a fixed estimate would
        // misplace rows rather than speed anything up.
        //
        // removeClippedSubviews is deliberately NOT set: on the New
        // Architecture (Fabric) it crashes this list hard once it holds the
        // full ~1400 rows — "addViewAt: failed to insert view ... index=N
        // count=0" out of ReactClippingViewManager. The three windowing props
        // below already bound how many rows mount, so the perf intent stands
        // without it.
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <EmptyState
              icon={<Dumbbell size={48} color={colors.textTertiary} />}
              title="Nenhum exercício encontrado"
              description="Tenta outra pesquisa ou cria um exercício personalizado."
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
      </>)}

      {/* Filter Modal */}
      <Modal visible={showFilters} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFilters(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Filtros</Text>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>GRUPO MUSCULAR</Text>
            <View style={styles.filterChips}>
              {MUSCLES.map(m => (
                <Chip key={m || 'all'} label={m ? MUSCLE_GROUPS_PT[m] : 'Todos'} selected={filterMuscle === m} onPress={() => setFilterMuscle(m)} />
              ))}
            </View>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>EQUIPAMENTO</Text>
            <View style={styles.filterChips}>
              {EQUIPMENTS.map(e => (
                <Chip key={e || 'all'} label={e ? EQUIPMENT_PT[e] : 'Todos'} selected={filterEquip === e} onPress={() => setFilterEquip(e)} />
              ))}
            </View>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>TIPO</Text>
            <View style={styles.filterChips}>
              {TYPES.map(t => (
                <Chip key={t || 'all'} label={t === 'strength' ? 'Força' : t === 'cardio' ? 'Cardio' : t === 'mobility' ? 'Mobilidade' : 'Todos'} selected={filterType === t} onPress={() => setFilterType(t)} />
              ))}
            </View>
            <Button title="Limpar Filtros" variant="outline" onPress={() => { setFilterMuscle(null); setFilterEquip(null); setFilterType(null); }} style={{ marginTop: 16, marginBottom: 8 }} />
            <Button title="Aplicar" onPress={() => setShowFilters(false)} style={{ marginBottom: 32 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Create Exercise Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Novo Exercício</Text>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>NOME</Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="Ex: Remada máquina específica"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>GRUPO MUSCULAR</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.inlineChips} contentContainerStyle={styles.inlineChipsContent}>
              {(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'abs', 'quads', 'hamstrings', 'glutes', 'calves', 'forearms', 'cardio', 'fullbody', 'mobility'] as MuscleGroup[]).map(m => (
                <Chip key={m} label={MUSCLE_GROUPS_PT[m]} selected={newMuscle === m} onPress={() => setNewMuscle(m)} />
              ))}
            </ScrollView>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>EQUIPAMENTO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.inlineChips} contentContainerStyle={styles.inlineChipsContent}>
              {(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other'] as Equipment[]).map(e => (
                <Chip key={e} label={EQUIPMENT_PT[e]} selected={newEquip === e} onPress={() => setNewEquip(e)} />
              ))}
            </ScrollView>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>TIPO</Text>
            <View style={styles.typeRow}>
              {(['strength', 'cardio', 'mobility'] as ExerciseType[]).map(t => (
                <Chip key={t} label={t === 'strength' ? 'Força' : t === 'cardio' ? 'Cardio' : 'Mobilidade'} selected={newType === t} onPress={() => setNewType(t)} />
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>INSTRUÇÕES (opcional)</Text>
            <TextInput
              style={[styles.inputMulti, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
              value={newInstructions}
              onChangeText={setNewInstructions}
              placeholder="Descreve como executar o exercício..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
            />
            <Button title="Criar Exercício" onPress={handleCreate} loading={creating} style={{ marginTop: 8, marginBottom: 32 }} />
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Inter-ExtraBold', fontSize: 28 },
  gridContent: { padding: 16, gap: 16, paddingBottom: 32 },
  muscleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  muscleTile: { width: '30%', alignItems: 'center', gap: 8, paddingVertical: 8 },
  muscleCircle: { width: 72, height: 72, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  muscleLabel: { fontFamily: 'Inter-SemiBold', fontSize: 13, textAlign: 'center' },
  seeAllBtn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  seeAllBtnText: { fontFamily: 'Inter-Bold', fontSize: 15, color: '#fff' },
  filterPillsWrap: { flexGrow: 0, flexShrink: 0 },
  filterPills: { paddingHorizontal: 16, paddingVertical: 4, gap: 8, flexDirection: 'row', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  pillText: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
  headerRight: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, lineHeight: 13, fontFamily: 'Inter-Bold' },
  searchRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  count: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16, paddingHorizontal: 16, paddingBottom: 4, marginTop: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  sectionHeader: { paddingVertical: 6 },
  sectionHeaderText: { fontFamily: 'Inter-Bold', fontSize: 13, lineHeight: 17, letterSpacing: 0.5 },
  modal: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  modalBody: { flex: 1, padding: 20 },
  filterLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1, marginBottom: 10, marginTop: 16 },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1, marginBottom: 8, marginTop: 20 },
  input: { borderRadius: 12, padding: 14, fontFamily: 'Inter-Regular', fontSize: 15, borderWidth: 1 },
  inputMulti: { borderRadius: 12, padding: 14, fontFamily: 'Inter-Regular', fontSize: 15, borderWidth: 1, minHeight: 100, textAlignVertical: 'top' },
  inlineChips: { flexGrow: 0, height: 44, marginBottom: 4 },
  inlineChipsContent: { gap: 8, alignItems: 'center', paddingRight: 4 },
  typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
