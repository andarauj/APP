import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { usePlansManager } from '@/hooks/usePlansManager';
import { useAdaptiveStatus } from '@/hooks/useAdaptiveStatus';
import type { PlanGroup } from '@/utils/planGrouping';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlanGroupCard } from '@/components/ui/PlanGroupCard';
import { PlanVersionModal } from '@/components/ui/PlanVersionModal';
import { AdaptivePlanCard } from '@/components/ui/AdaptivePlanCard';
import { filterPlanGroupsByTab, shouldShowPlansEmpty, type PlansFilterTab } from '@/utils/plansUi';
import { useFocusEffect, useRouter } from 'expo-router';
import { ListChecks } from 'lucide-react-native';

export default function PlansScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();
  const { status: adaptiveStatus } = useAdaptiveStatus();

  const [activeTab, setActiveTab] = useState<PlansFilterTab>('todos');
  const [refreshing, setRefreshing] = useState(false);

  const {
    dayCounts, groups, openGroup, setOpenGroup,
    load, handleDelete, handleDuplicate, handleQuickStart, handleOpenGroup,
  } = usePlansManager();

  useFocusEffect(useCallback(() => {
    if (isReady) load();
  }, [isReady, load]));

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = filterPlanGroupsByTab(groups, activeTab);
  const showEmpty = shouldShowPlansEmpty(filtered.length, !!adaptiveStatus && activeTab !== 'manuais');

  const renderItem = ({ item: group }: { item: PlanGroup }) => (
    <PlanGroupCard
      group={group}
      dayCounts={dayCounts}
      onOpenGroup={handleOpenGroup}
      onDuplicate={handleDuplicate}
      onDelete={handleDelete}
      onQuickStart={handleQuickStart}
    />
  );

  const tabs: { key: PlansFilterTab; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'gerados', label: 'Gerados' },
    { key: 'manuais', label: 'Manuais' },
  ];

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Planos</Text>
      </View>

      <View style={[styles.topTabs, { borderBottomColor: colors.border }]}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setActiveTab(t.key)}
            style={[styles.topTab, activeTab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.topTabLabel, { color: activeTab === t.key ? colors.primary : colors.textSecondary }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={g => g.name}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={
          adaptiveStatus && activeTab !== 'manuais' ? (
            <View style={{ marginBottom: 4 }}>
              <AdaptivePlanCard
                status={adaptiveStatus}
                onStartToday={() => router.push('/adaptive/plan')}
                todayLabel="Ver ciclo"
              />
              {filtered.length > 0 ? (
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Os meus planos</Text>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          showEmpty ? (
            <EmptyState
              icon={<ListChecks size={48} color={colors.textTertiary} />}
              title="Ainda sem planos"
              description="Cria um plano no separador Treino — aparece aqui para gerires: editar, duplicar ou apagar."
            />
          ) : adaptiveStatus && filtered.length === 0 ? (
            <Text style={{ fontFamily: 'Inter-Regular', fontSize: 14, color: colors.textSecondary, paddingVertical: 8 }}>
              Sem planos manuais nesta vista — o teu Plano Adaptativo está acima.
            </Text>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />

      <PlanVersionModal
        group={openGroup}
        onClose={() => setOpenGroup(null)}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onQuickStart={handleQuickStart}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: 28 },
  topTabs: { flexDirection: 'row', paddingHorizontal: 8 },
  topTab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  topTabLabel: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  sectionLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
});
