import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { usePlansManager } from '@/hooks/usePlansManager';
import { useAdaptiveStatus } from '@/hooks/useAdaptiveStatus';
import type { PlanGroup } from '@/utils/planGrouping';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { PlanGroupCard } from '@/components/ui/PlanGroupCard';
import { PlanVersionModal } from '@/components/ui/PlanVersionModal';
import { AdaptivePlanCard } from '@/components/ui/AdaptivePlanCard';
import { filterPlanGroupsByTab, shouldShowPlansEmpty, type PlansFilterTab } from '@/utils/plansUi';
import { useFocusEffect, useRouter } from 'expo-router';
import { ListChecks, Plus, Sparkles, Home, Zap, History, Compass } from 'lucide-react-native';
import { hapticSelect } from '@/utils/haptics';
import ExercisesScreen from './exercises';

type HubSegment = 'planos' | 'biblioteca';

export default function PlansScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();
  const { status: adaptiveStatus } = useAdaptiveStatus();

  const [hub, setHub] = useState<HubSegment>('planos');
  const [activeTab, setActiveTab] = useState<PlansFilterTab>('todos');
  const [refreshing, setRefreshing] = useState(false);

  const {
    dayCounts, groups, openGroup, setOpenGroup,
    load, handleDelete, handleDuplicate, handleQuickStart, handleOpenGroup,
  } = usePlansManager();

  useFocusEffect(useCallback(() => {
    if (isReady && hub === 'planos') load();
  }, [isReady, load, hub]));

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

  const filterTabs: { key: PlansFilterTab; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'gerados', label: 'Gerados' },
    { key: 'manuais', label: 'Manuais' },
  ];

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Treinos"
        right={hub === 'planos' ? (
          <TouchableOpacity
            className="rounded-[10px] p-2"
            style={{ backgroundColor: colors.primaryContainer }}
            onPress={() => { hapticSelect(); router.push('/plan/create'); }}
            accessibilityRole="button"
            accessibilityLabel="Criar plano"
          >
            <Plus size={18} color={colors.primary} />
          </TouchableOpacity>
        ) : undefined}
      />

      {/* Primary hub: Meus Planos | Biblioteca de Exercícios */}
      <View className="mx-4 mb-1 mt-3 flex-row gap-1 rounded-[14px] p-1" style={{ backgroundColor: colors.surfaceVariant }}>
        {([
          ['planos', 'Meus Planos'],
          ['biblioteca', 'Biblioteca de Exercícios'],
        ] as const).map(([key, label]) => {
          const active = hub === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => { hapticSelect(); setHub(key); }}
              className="flex-1 items-center rounded-[11px] px-2 py-2.5"
              style={active ? {
                backgroundColor: colors.surface,
                // Inline shadow — do NOT toggle NativeWind shadow-* here.
                // Conditional shadow-md ↔ empty triggers CSS-interop race with
                // Expo Router ("Couldn't find a navigation context") when
                // switching to Biblioteca (ExercisesScreen mount).
                shadowColor: '#000',
                shadowOpacity: 0.12,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 3,
              } : undefined}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
            >
              <Text
                className="text-center font-sans-bold text-xs"
                style={{ color: active ? colors.primary : colors.textSecondary }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {hub === 'biblioteca' ? (
        <ExercisesScreen embedded />
      ) : (
        <>
          <View style={[styles.topTabs, { borderBottomColor: colors.border }]}>
            {filterTabs.map(t => (
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
              <View style={{ marginBottom: 4, gap: 10 }}>
                <TouchableOpacity
                  style={[styles.exploreCard, { backgroundColor: colors.accent }]}
                  onPress={() => router.push(adaptiveStatus ? '/adaptive/plan' : '/adaptive/start')}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel={adaptiveStatus ? 'Ver plano adaptativo' : 'Criar plano adaptativo'}
                >
                  <Sparkles size={22} color="#fff" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exploreTitle}>
                      {adaptiveStatus ? 'Ver o meu plano' : 'Plano Adaptativo'}
                    </Text>
                    <Text style={styles.exploreSub}>
                      {adaptiveStatus
                        ? 'Agenda de 3 semanas, exercícios e ajustes'
                        : 'Gera um ciclo que se ajusta ao teu progresso'}
                    </Text>
                  </View>
                </TouchableOpacity>
                {adaptiveStatus && activeTab !== 'manuais' ? (
                  <AdaptivePlanCard
                    status={adaptiveStatus}
                    onStartToday={() => router.push('/adaptive/plan')}
                    todayLabel="Ver agenda"
                  />
                ) : null}
                <View style={styles.toolsRow}>
                  <TouchableOpacity
                    style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => { hapticSelect(); router.push('/plan/home'); }}
                    accessibilityRole="button"
                    accessibilityLabel="Treino em casa"
                  >
                    <Home size={18} color={colors.primary} />
                    <Text style={[styles.toolTitle, { color: colors.text }]}>Em casa</Text>
                    <Text style={[styles.toolSub, { color: colors.textSecondary }]}>Sem ginásio</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => { hapticSelect(); router.push('/plan/531'); }}
                    accessibilityRole="button"
                    accessibilityLabel="Plano 5/3/1"
                  >
                    <Zap size={18} color={colors.secondary} />
                    <Text style={[styles.toolTitle, { color: colors.text }]}>5/3/1</Text>
                    <Text style={[styles.toolSub, { color: colors.textSecondary }]}>Força clássica</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.toolsRow}>
                  <TouchableOpacity
                    style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => { hapticSelect(); router.push('/(tabs)/history'); }}
                    accessibilityRole="button"
                    accessibilityLabel="Histórico"
                  >
                    <History size={18} color={colors.primary} />
                    <Text style={[styles.toolTitle, { color: colors.text }]}>Histórico</Text>
                    <Text style={[styles.toolSub, { color: colors.textSecondary }]}>Sessões</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => { hapticSelect(); router.push('/(tabs)/discover'); }}
                    accessibilityRole="button"
                    accessibilityLabel="Descobrir"
                  >
                    <Compass size={18} color={colors.accent} />
                    <Text style={[styles.toolTitle, { color: colors.text }]}>Descobrir</Text>
                    <Text style={[styles.toolSub, { color: colors.textSecondary }]}>Dicas</Text>
                  </TouchableOpacity>
                </View>
                {filtered.length > 0 ? (
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Os meus planos</Text>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              showEmpty ? (
                <EmptyState
                  icon={<ListChecks size={48} color={colors.textTertiary} />}
                  title="Ainda sem planos"
                  description="Cria um plano aqui ou gera um Plano Adaptativo — aparece nesta lista para editar, duplicar ou começar."
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
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topTabs: { flexDirection: 'row', paddingHorizontal: 8 },
  topTab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  topTabLabel: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  exploreCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 16,
  },
  exploreTitle: { fontFamily: 'Inter-Bold', fontSize: 16, color: '#fff' },
  exploreSub: { fontFamily: 'Inter-Regular', fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  toolsRow: { flexDirection: 'row', gap: 10 },
  toolCard: {
    flex: 1, gap: 2, padding: 12, borderRadius: 14, borderWidth: 1,
  },
  toolTitle: { fontFamily: 'Inter-Bold', fontSize: 14, marginTop: 6 },
  toolSub: { fontFamily: 'Inter-Regular', fontSize: 11 },
  sectionLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
});
