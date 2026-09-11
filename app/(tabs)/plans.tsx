import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { usePlansManager } from '@/hooks/usePlansManager';
import type { PlanGroup } from '@/utils/planGrouping';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlanGroupCard } from '@/components/ui/PlanGroupCard';
import { PlanVersionModal } from '@/components/ui/PlanVersionModal';
import { useFocusEffect } from 'expo-router';
import { ListChecks } from 'lucide-react-native';

export default function PlansScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();

  // Top tab navigation
  const [activeTab, setActiveTab] = useState<'todos' | 'novos' | 'favoritos'>('todos');
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

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Planos</Text>
      </View>

      {/* Top tabs contextuais */}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: 28 },
  topTabs: { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1 },
  topTab: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  topTabLabel: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
  list: { padding: 16, gap: 12 },
});
