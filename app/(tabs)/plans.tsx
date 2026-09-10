import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, RefreshControl, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { getAllPlans, deletePlan, duplicatePlan, getPlanDayCounts } from '@/db/planDao';
import { hapticWarning } from '@/utils/haptics';
import { clearPlannerForPlan } from '@/db/plannerDao';
import { groupPlansByName, type PlanGroup } from '@/utils/planGrouping';
import type { WorkoutPlan } from '@/types';
import { PLAN_TYPE_PT, SPLIT_TYPE_PT } from '@/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { useRouter, useFocusEffect } from 'expo-router';
import { ListChecks, Copy, Trash2, ChevronRight, Play, X, Layers } from 'lucide-react-native';
import { formatDate } from '@/utils/format';

export default function PlansScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();
  
  // Top Tab Navigation (JEFIT-like)
  const [activeTab, setActiveTab] = useState<'todos' | 'novos' | 'favoritos'>('todos');
  
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  // Cached day count per plan, so the list's quick "Iniciar Treino" button
  // knows whether it's safe to jump straight into a workout (single-day
  // plans) or whether the person needs to pick which day first.
  const [dayCounts, setDayCounts] = useState<Record<number, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  // When a name has more than one version, tapping its card opens this
  // instead of navigating straight to a plan — lets the person pick which
  // version they mean.
  const [openGroup, setOpenGroup] = useState<PlanGroup | null>(null);

  useFocusEffect(useCallback(() => {
    if (isReady) loadPlans();
  }, [isReady]));

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPlans();
    setRefreshing(false);
  };

  const loadPlans = async () => {
    try {
      // This tab is exclusively for plans the person built themselves —
      // Treino Inteligente and 5/3/1 both generate their own plans behind
      // the scenes, but those live in the calendar (Histórico tab) as a
      // record of what happened each day, not here as something to
      // reopen and reuse deliberately.
      const data = (await getAllPlans()).filter(p => !p.is_auto_generated);
      setPlans(data);
      // BUGFIX: this used to call getPlanDays() once per plan in a loop
      // (N+1 queries) just to count each plan's training days. A single
      // batched query does the same job regardless of how many plans exist.
      const counts = await getPlanDayCounts(data.map(p => p.id));
      setDayCounts(counts);
    } catch (err) {
      console.error('Failed to load plans:', err);
      setPlans([]);
    }
  };

  const handleDelete = (plan: WorkoutPlan) => {
    Alert.alert('Eliminar plano', `Eliminar "${plan.name}"?\nIsto não elimina o histórico de treinos.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          hapticWarning();
          await deletePlan(plan.id);
          // A plan removed from the weekly planner would otherwise leave a
          // day pointing at a plan that no longer exists.
          await clearPlannerForPlan(plan.id);
          // If this was the last version in an open group modal, close it
          // rather than leaving it showing a now-empty list.
          setOpenGroup(g => {
            if (!g) return g;
            const remaining = g.plans.filter(p => p.id !== plan.id);
            return remaining.length > 0 ? { ...g, plans: remaining } : null;
          });
          loadPlans();
        }
      },
    ]);
  };

  const handleDuplicate = async (plan: WorkoutPlan) => {
    await duplicatePlan(plan.id);
    loadPlans();
  };

  /**
   * BUGFIX: this quick-start button used to navigate straight to the workout
   * screen without a `dayIndex`, which made active.tsx fall back to loading
   * every day of the plan combined into one session — the exact "all days
   * squashed into one" bug fixed earlier for the auto-generator, reappearing
   * through this second entry point. Single-day plans still jump straight in
   * (with an explicit dayIndex so there's no ambiguous fallback); multi-day
   * plans open the plan detail screen instead, where the day tabs let the
   * person pick which day to train.
   */
  const handleQuickStart = (plan: WorkoutPlan) => {
    const days = dayCounts[plan.id] ?? 1;
    if (days > 1) {
      router.push({ pathname: '/plan/[id]', params: { id: plan.id } });
    } else {
      router.push({ pathname: '/workout/active', params: { planId: plan.id, planName: plan.name, dayIndex: '0' } });
    }
  };

  const handleOpenGroup = (group: PlanGroup) => {
    if (group.plans.length === 1) {
      router.push({ pathname: '/plan/[id]', params: { id: group.plans[0].id } });
    } else {
      setOpenGroup(group);
    }
  };

  const groups = groupPlansByName(plans);

  const renderVersionRow = (item: WorkoutPlan) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.versionRow, { borderColor: colors.border }]}
      onPress={() => { setOpenGroup(null); router.push({ pathname: '/plan/[id]', params: { id: item.id } }); }}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.planMeta}>
          <Badge label={PLAN_TYPE_PT[item.plan_type]} color={colors.primaryContainer} textColor={colors.primary} />
          <Badge label={SPLIT_TYPE_PT[item.split_type]} color={colors.surfaceVariant} textColor={colors.textSecondary} />
        </View>
        <Text style={[styles.versionDate, { color: colors.textTertiary }]}>Atualizado {formatDate(item.updated_at)}</Text>
      </View>
      <TouchableOpacity
        style={[styles.startBtnSmall, { backgroundColor: colors.primary }]}
        onPress={() => { setOpenGroup(null); handleQuickStart(item); }}
        accessibilityRole="button"
        accessibilityLabel={`Iniciar treino ${item.name}`}
      >
        <Play size={14} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDuplicate(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Duplicar versão de ${item.name}`}>
        <Copy size={18} color={colors.textTertiary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Eliminar versão de ${item.name}`}>
        <Trash2 size={18} color={colors.error} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderItem = ({ item: group }: { item: PlanGroup }) => {
    const latest = group.plans[0];
    const hasMultiple = group.plans.length > 1;
    return (
      <TouchableOpacity
        style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => handleOpenGroup(group)}
        activeOpacity={0.7}
      >
        <View style={[styles.planAccent, { backgroundColor: colors.primary }]} />
        <View style={styles.planBody}>
          <View style={styles.planTop}>
            <Text style={[styles.planName, { color: colors.text }]} numberOfLines={1}>{group.name}</Text>
            {!hasMultiple && (
              <View style={styles.planActions}>
                <TouchableOpacity onPress={() => handleDuplicate(latest)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Duplicar plano ${group.name}`}>
                  <Copy size={18} color={colors.textTertiary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(latest)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Eliminar plano ${group.name}`}>
                  <Trash2 size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            )}
          </View>
          {latest.description ? <Text style={[styles.planDesc, { color: colors.textSecondary }]} numberOfLines={2}>{latest.description}</Text> : null}
          <View style={styles.planMeta}>
            <Badge label={PLAN_TYPE_PT[latest.plan_type]} color={colors.primaryContainer} textColor={colors.primary} />
            <Badge label={SPLIT_TYPE_PT[latest.split_type]} color={colors.surfaceVariant} textColor={colors.textSecondary} />
            {hasMultiple && (
              <Badge label={`${group.plans.length} versões`} color={colors.accentContainer} textColor={colors.accent} />
            )}
            <Text style={[styles.planDate, { color: colors.textTertiary }]}>{formatDate(latest.updated_at)}</Text>
          </View>
          {!hasMultiple && (
            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: colors.primary }]}
              onPress={() => handleQuickStart(latest)}
              accessibilityRole="button"
              accessibilityLabel={`Iniciar treino ${group.name}`}
            >
              <Play size={16} color="#fff" />
              <Text style={styles.startBtnText}>{(dayCounts[latest.id] ?? 1) > 1 ? 'Escolher Dia' : 'Iniciar Treino'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {hasMultiple ? <Layers size={18} color={colors.textTertiary} style={styles.chevron} /> : <ChevronRight size={18} color={colors.textTertiary} style={styles.chevron} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Planos</Text>
      </View>

      {/* Top Tabs Contextuais (JEFIT-like) */}
      <View style={[styles.topTabs, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => setActiveTab('todos')}
          style={[styles.topTab, activeTab === 'todos' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.topTabLabel, { color: activeTab === 'todos' ? colors.primary : colors.textSecondary }]}>
            Todos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('novos')}
          style={[styles.topTab, activeTab === 'novos' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.topTabLabel, { color: activeTab === 'novos' ? colors.primary : colors.textSecondary }]}>
            Novos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('favoritos')}
          style={[styles.topTab, activeTab === 'favoritos' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.topTabLabel, { color: activeTab === 'favoritos' ? colors.primary : colors.textSecondary }]}>
            Favoritos
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter groups based on active tab */}
      <FlatList
        data={
          activeTab === 'novos' 
            ? groups.filter(g => g.plans.some(p => p.is_auto_generated === 1))
            : activeTab === 'favoritos'
            ? groups.filter(g => g.plans.some(p => p.is_auto_generated === 0))
            : groups
        }
        keyExtractor={g => g.name}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListEmptyComponent={
          <EmptyState
            icon={<ListChecks size={48} color={colors.textTertiary} />}
            title="Ainda sem planos"
            description="Cria um plano no separador Treinar — aparece aqui para gerires: editar, duplicar ou apagar."
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Version picker — only shown for a name with more than one plan. */}
      <Modal visible={openGroup !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpenGroup(null)}>
        <SafeAreaView style={[styles.modalScreen, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{openGroup?.name}</Text>
            <TouchableOpacity onPress={() => setOpenGroup(null)}><X size={24} color={colors.text} /></TouchableOpacity>
          </View>
          <FlatList
            data={openGroup?.plans ?? []}
            keyExtractor={p => String(p.id)}
            renderItem={({ item }) => renderVersionRow(item)}
            contentContainerStyle={{ padding: 16, gap: 10 }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: 28 },
  topTabs: { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1 },
  topTab: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  topTabLabel: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
  list: { padding: 16, gap: 12 },
  planCard: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  planAccent: { width: 4, alignSelf: 'stretch' },
  planBody: { flex: 1, padding: 14, gap: 8 },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  planActions: { flexDirection: 'row', gap: 12 },
  planName: { fontFamily: 'Inter-Bold', fontSize: 17, flex: 1, marginRight: 8 },
  planDesc: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 18 },
  planMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  planDate: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16 },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, marginTop: 4 },
  startBtnText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 14 },
  chevron: { alignSelf: 'center', marginRight: 8 },
  modalScreen: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  versionDate: { fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 4 },
  startBtnSmall: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
