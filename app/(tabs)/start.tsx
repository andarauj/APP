import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { getAllPlans, getPlanDays } from '@/db/planDao';
import { getWeeklyPlanner, setPlannerDay, type WeeklyPlanner, type PlannerEntry } from '@/db/plannerDao';
import { getUnfinishedSession, discardSession, getAllSessions } from '@/db/workoutDao';
import type { WorkoutPlan } from '@/types';
import { PLAN_TYPE_PT } from '@/types';
import { useRouter, useFocusEffect } from 'expo-router';
import { Play, Zap, Plus, AlertCircle, RotateCcw, Calendar, Check as CheckIcon, X as XIcon, Sparkles } from 'lucide-react-native';
import { WEEKDAY_LABELS } from '@/utils/reminders';

const WEEKDAY_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function StartScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();
  
  // Top Tab Navigation (JEFIT-like)
  const [activeTab, setActiveTab] = useState<'plano' | 'livre' | 'historico'>('plano');
  
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [unfinished, setUnfinished] = useState<{ id: number; name: string; started_at: number } | null>(null);
  const [lastSession, setLastSession] = useState<{ id: number; name: string; total_sets: number } | null>(null);
  const [planner, setPlanner] = useState<WeeklyPlanner>({});
  const [planNames, setPlanNames] = useState<Record<number, string>>({});
  const [planDayLabels, setPlanDayLabels] = useState<Record<string, string>>({});
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [pickerPlanId, setPickerPlanId] = useState<number | null>(null);
  const [pickerDays, setPickerDays] = useState<{ day_index: number; day_label: string }[]>([]);
  const today = new Date().getDay(); // 0=Sun..6=Sat, matches planner keys
  const [refreshing, setRefreshing] = useState(false);

  const loadStart = useCallback(async () => {
    getUnfinishedSession().then(s => setUnfinished(s as any)).catch(() => setUnfinished(null));
    getAllSessions(1, 0).then(s => setLastSession((s[0] as any) || null)).catch(() => setLastSession(null));

    try {
      const [allPlans, p] = await Promise.all([getAllPlans(), getWeeklyPlanner()]);
      setPlans(allPlans);
      setPlanner(p);

      // Resolve each assigned plan's name and that specific day's label, so
      // the strip can show "Push" under Monday without a join query.
      const planIds = Array.from(new Set(Object.values(p).map(e => e!.planId)));
      const names: Record<number, string> = {};
      const dayLabels: Record<string, string> = {};
      for (const planId of planIds) {
        const found = allPlans.find(pl => pl.id === planId);
        if (found) names[planId] = found.name;
        const days = await getPlanDays(planId);
        for (const d of days) dayLabels[`${planId}:${d.day_index}`] = d.day_label;
      }
      setPlanNames(names);
      setPlanDayLabels(dayLabels);
    } catch {
      setPlans([]); setPlanner({}); setPlanNames({}); setPlanDayLabels({});
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!isReady) return;
    loadStart();
  }, [isReady, loadStart]));

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStart();
    setRefreshing(false);
  };

  const openDayPicker = (weekday: number) => {
    setEditingDay(weekday);
    setPickerPlanId(null);
    setPickerDays([]);
  };

  const choosePlanForDay = async (planId: number) => {
    setPickerPlanId(planId);
    const days = await getPlanDays(planId);
    setPickerDays(days);
    // Single-day plans (or plans with no explicit day split) assign directly
    // without an extra tap.
    if (days.length <= 1) {
      await confirmDayAssignment(planId, days[0]?.day_index ?? 0);
    }
  };

  const confirmDayAssignment = async (planId: number, dayIndex: number) => {
    if (editingDay === null) return;
    await setPlannerDay(editingDay, { planId, dayIndex });
    setPlanner(prev => ({ ...prev, [editingDay]: { planId, dayIndex } }));
    const plan = plans.find(p => p.id === planId);
    if (plan) setPlanNames(prev => ({ ...prev, [planId]: plan.name }));
    const days = await getPlanDays(planId);
    setPlanDayLabels(prev => {
      const next = { ...prev };
      for (const d of days) next[`${planId}:${d.day_index}`] = d.day_label;
      return next;
    });
    setEditingDay(null);
  };

  const clearDayAssignment = async () => {
    if (editingDay === null) return;
    await setPlannerDay(editingDay, null);
    setPlanner(prev => {
      const next = { ...prev };
      delete next[editingDay];
      return next;
    });
    setEditingDay(null);
  };

  const startPlannerDay = (entry: PlannerEntry) => {
    const planName = planNames[entry.planId] || 'Treino';
    const dayLabel = planDayLabels[`${entry.planId}:${entry.dayIndex}`];
    router.push({
      pathname: '/workout/active',
      params: {
        planId: entry.planId,
        planName: dayLabel ? `${planName} · ${dayLabel}` : planName,
        dayIndex: String(entry.dayIndex),
      },
    });
  };

  const todayEntry = planner[today];

  const handleDiscardUnfinished = () => {
    if (!unfinished) return;
    Alert.alert('Descartar treino', `Descartar "${unfinished.name}" e as series registadas?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar', style: 'destructive',
        onPress: async () => { await discardSession(unfinished.id); setUnfinished(null); },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header com Título */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Treino</Text>
      </View>

      {/* Top Tabs Contextuais (JEFIT-like) */}
      <View style={[styles.topTabs, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => setActiveTab('plano')}
          style={[styles.topTab, activeTab === 'plano' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.topTabLabel, { color: activeTab === 'plano' ? colors.primary : colors.textSecondary }]}>
            Meu Plano
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('livre')}
          style={[styles.topTab, activeTab === 'livre' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.topTabLabel, { color: activeTab === 'livre' ? colors.primary : colors.textSecondary }]}>
            Treino Livre
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('historico')}
          style={[styles.topTab, activeTab === 'historico' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.topTabLabel, { color: activeTab === 'historico' ? colors.primary : colors.textSecondary }]}>
            Histórico
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* TAB: MEU PLANO */}
        {activeTab === 'plano' && (
          <>
            {/* Weekly planner — "Monday: Push, Wednesday: Pull...", inspired by
                EvolveYou's weekly schedule. Tapping an assigned day starts that
                workout directly; tapping an empty day opens the assignment picker. */}
        <View style={[styles.plannerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.plannerHeader}>
            <Calendar size={16} color={colors.textSecondary} />
            <Text style={[styles.plannerTitle, { color: colors.textSecondary }]}>PLANEADOR SEMANAL</Text>
          </View>
          <View style={styles.plannerRow}>
            {WEEKDAY_LABELS.map((label, weekday) => {
              const entry = planner[weekday];
              const isToday = weekday === today;
              return (
                <TouchableOpacity
                  key={weekday}
                  style={[
                    styles.plannerDay,
                    { backgroundColor: entry ? colors.primaryContainer : colors.surfaceVariant },
                    isToday && { borderWidth: 2, borderColor: colors.primary },
                  ]}
                  onPress={() => entry ? startPlannerDay(entry) : openDayPicker(weekday)}
                  onLongPress={() => openDayPicker(weekday)}
                  delayLongPress={400}
                  accessibilityRole="button"
                  accessibilityLabel={
                    entry
                      ? `${WEEKDAY_FULL[weekday]}: ${planNames[entry.planId] || 'Treino'}, toca para iniciar, mantém para editar`
                      : `${WEEKDAY_FULL[weekday]}: sem treino atribuído, toca para atribuir`
                  }
                >
                  <Text style={[styles.plannerDayLabel, { color: isToday ? colors.primary : colors.textSecondary }]}>{label}</Text>
                  {entry ? (
                    <Text style={[styles.plannerDayPlan, { color: colors.primary }]} numberOfLines={1}>
                      {(planDayLabels[`${entry.planId}:${entry.dayIndex}`] || planNames[entry.planId] || 'Treino').slice(0, 4)}
                    </Text>
                  ) : (
                    <Plus size={14} color={colors.textTertiary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Today's assigned workout gets a prominent CTA when set. */}
        {todayEntry && (
          <TouchableOpacity
            style={[styles.todayCard, { backgroundColor: colors.secondary }]}
            onPress={() => startPlannerDay(todayEntry)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Iniciar treino de hoje: ${planNames[todayEntry.planId] || 'Treino'}`}
          >
            <View style={styles.quickIcon}><Calendar size={28} color="#fff" /></View>
            <View style={styles.quickInfo}>
              <Text style={styles.quickTitle}>Treino de hoje</Text>
              <Text style={styles.quickDesc} numberOfLines={1}>
                {planNames[todayEntry.planId] || 'Treino'}
                {planDayLabels[`${todayEntry.planId}:${todayEntry.dayIndex}`] ? ` · ${planDayLabels[`${todayEntry.planId}:${todayEntry.dayIndex}`]}` : ''}
              </Text>
            </View>
            <Play size={28} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Unfinished workout recovery. A session row is created the moment a
            workout starts, so closing the app mid-workout used to leave it
            stranded with no way to resume or clear it. */}
        {unfinished && (
          <View style={[styles.resumeCard, { backgroundColor: colors.accentContainer, borderColor: colors.accent }]}>
            <View style={styles.resumeTop}>
              <AlertCircle size={20} color={colors.accent} />
              <Text style={[styles.resumeTitle, { color: colors.accent }]}>Treino por terminar</Text>
            </View>
            <Text style={[styles.resumeName, { color: colors.text }]} numberOfLines={1}>{unfinished.name}</Text>
            <View style={styles.resumeActions}>
              <TouchableOpacity
                style={[styles.resumeBtn, { backgroundColor: colors.accent }]}
                onPress={() => router.push({ pathname: '/workout/summary', params: { sessionId: unfinished.id } })}
                accessibilityRole="button"
                accessibilityLabel="Ver resumo do treino por terminar"
              >
                <Text style={styles.resumeBtnText}>Ver resumo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resumeBtnOutline, { borderColor: colors.accent }]}
                onPress={handleDiscardUnfinished}
                accessibilityRole="button"
                accessibilityLabel="Descartar treino por terminar"
              >
                <Text style={[styles.resumeBtnOutlineText, { color: colors.accent }]}>Descartar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>COMEÇAR AGORA</Text>

        {/* Smart workout — decides what to train today from actual recent
            history rather than a fixed weekly split, so it's naturally
            different every session. */}
        <TouchableOpacity
          style={[styles.smartCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}
          onPress={() => router.push('/workout/smart-start')}
          activeOpacity={0.85}
        >
          <View style={[styles.smartIcon, { backgroundColor: colors.primaryContainer }]}>
            <Sparkles size={26} color={colors.primary} />
          </View>
          <View style={styles.quickInfo}>
            <Text style={[styles.smartTitle, { color: colors.text }]}>Treino Inteligente</Text>
            <Text style={[styles.smartDesc, { color: colors.textSecondary }]}>Gera o treino de hoje a partir do que já treinaste</Text>
          </View>
        </TouchableOpacity>

        {/* Quick start */}
        <TouchableOpacity
          style={[styles.quickCard, { backgroundColor: colors.primary }]}
          onPress={() => router.push({ pathname: '/workout/active', params: { planId: 0, planName: 'Treino Livre' } })}
          activeOpacity={0.85}
        >
          <View style={styles.quickIcon}><Zap size={32} color="#fff" /></View>
          <View style={styles.quickInfo}>
            <Text style={styles.quickTitle}>Treino Livre</Text>
            <Text style={styles.quickDesc}>Começa sem plano e adiciona exercícios à medida que treinas</Text>
          </View>
          <Play size={28} color="#fff" />
        </TouchableOpacity>

        {/* Repeat the previous workout — the most common way to start a
            session when you're following the same routine week to week. */}
        {lastSession && (
          <TouchableOpacity
            style={[styles.repeatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push({
              pathname: '/workout/active',
              params: { planId: 0, planName: lastSession.name, repeatSessionId: String(lastSession.id) },
            })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Repetir treino ${lastSession.name}`}
          >
            <View style={[styles.repeatIcon, { backgroundColor: colors.secondaryContainer }]}>
              <RotateCcw size={22} color={colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.repeatTitle, { color: colors.text }]}>Repetir último treino</Text>
              <Text style={[styles.repeatSub, { color: colors.textSecondary }]} numberOfLines={1}>
                {lastSession.name} · {lastSession.total_sets} séries
              </Text>
            </View>
            <Play size={22} color={colors.secondary} />
          </TouchableOpacity>
        )}

        {/* Create / generate — every entry point that produces a new plan
            lives here now. What gets produced (manual plans to reuse
            deliberately) shows up in the Planos tab; what gets generated
            each day (Treino Inteligente, 5/3/1) shows up in the calendar
            (Histórico tab) as a record of what happened, not here.
            Deliberately more compact than the cards above — these are
            occasional setup actions, not something tapped every session,
            so they shouldn't compete visually with "começar agora". */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CRIAR NOVO PLANO</Text>

        <View style={styles.compactRow}>
          <TouchableOpacity
            style={[styles.compactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push('/plan/create')}
            activeOpacity={0.8}
          >
            <View style={[styles.compactIcon, { backgroundColor: colors.surfaceVariant }]}>
              <Plus size={20} color={colors.primary} />
            </View>
            <Text style={[styles.compactTitle, { color: colors.text }]}>Novo Plano</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.compactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push('/plan/auto')}
            activeOpacity={0.8}
          >
            <View style={[styles.compactIcon, { backgroundColor: colors.surfaceVariant }]}>
              <Calendar size={20} color={colors.primary} />
            </View>
            <Text style={[styles.compactTitle, { color: colors.text }]}>Gerar Divisão</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.compactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push('/plan/531')}
            activeOpacity={0.8}
          >
            <View style={[styles.compactIcon, { backgroundColor: colors.surfaceVariant }]}>
              <Zap size={20} color={colors.primary} />
            </View>
            <Text style={[styles.compactTitle, { color: colors.text }]}>5/3/1</Text>
          </TouchableOpacity>
        </View>
          </>
        )}

        {/* TAB: TREINO LIVRE */}
        {activeTab === 'livre' && (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 20 }}>
            <Zap size={64} color={colors.primary} />
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text style={[styles.title, { color: colors.text }]}>Treino Livre</Text>
              <Text style={[{ fontFamily: 'Inter-Regular', fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 20 }]}>
                Cria um treino sem seguir um plano
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.resumeBtn, { backgroundColor: colors.primary, width: 200 }]}
              onPress={() => router.push('/workout/active?planId=0&planName=Treino%20Livre')}
            >
              <Play size={20} color="#fff" />
              <Text style={styles.resumeBtnText}>Iniciar Treino Livre</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB: HISTÓRICO */}
        {activeTab === 'historico' && (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
            <TouchableOpacity
              style={[styles.resumeBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/(tabs)/history')}
            >
              <Text style={styles.resumeBtnText}>Ver Histórico Completo</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Weekly planner assignment: pick a plan, then (if it has more than
          one training day) which specific day. */}
      <Modal visible={editingDay !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingDay(null)}>
        <View style={[styles.picker, { backgroundColor: colors.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>
                {pickerPlanId && pickerDays.length > 1 ? 'Escolher dia' : editingDay !== null ? WEEKDAY_FULL[editingDay] : ''}
              </Text>
              <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>
                {pickerPlanId && pickerDays.length > 1 ? 'Qual dia do plano treinas hoje?' : 'Que plano treinas neste dia?'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setEditingDay(null)} accessibilityRole="button" accessibilityLabel="Fechar">
              <XIcon size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {pickerPlanId && pickerDays.length > 1 ? (
            <FlatList
              data={pickerDays}
              keyExtractor={d => String(d.day_index)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                  onPress={() => confirmDayAssignment(pickerPlanId, item.day_index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Atribuir ${item.day_label}`}
                >
                  <Text style={[styles.pickerName, { color: colors.text }]}>{item.day_label}</Text>
                  <CheckIcon size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          ) : (
            <FlatList
              data={plans}
              keyExtractor={p => String(p.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                  onPress={() => choosePlanForDay(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Atribuir plano ${item.name}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerName, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>{PLAN_TYPE_PT[item.plan_type]}</Text>
                  </View>
                  <Play size={18} color={colors.primary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center' }}>
                    Ainda não tens planos. Cria um primeiro para o poderes agendar.
                  </Text>
                </View>
              }
              ListFooterComponent={
                planner[editingDay ?? -1] ? (
                  <TouchableOpacity
                    style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                    onPress={clearDayAssignment}
                    accessibilityRole="button"
                    accessibilityLabel="Remover treino deste dia"
                  >
                    <Text style={[styles.pickerName, { color: colors.error }]}>Remover deste dia</Text>
                  </TouchableOpacity>
                ) : null
              }
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontFamily: 'Inter-Bold', fontSize: 28 },
  topTabs: { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1 },
  topTab: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  topTabLabel: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
  content: { padding: 16, gap: 12 },
  resumeCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  resumeTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resumeTitle: { fontFamily: 'Inter-Bold', fontSize: 14 },
  resumeName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  resumeActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  resumeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  resumeBtnText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 14 },
  resumeBtnOutline: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  resumeBtnOutlineText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  repeatCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  repeatIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  repeatTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  repeatSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  quickCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 20, gap: 14 },
  quickIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  quickInfo: { flex: 1 },
  smartCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 18, gap: 14, borderWidth: 2 },
  smartIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  smartTitle: { fontFamily: 'Inter-Bold', fontSize: 17 },
  smartDesc: { fontFamily: 'Inter-Regular', fontSize: 13, marginTop: 2 },
  compactRow: { flexDirection: 'row', gap: 10 },
  compactCard: { flex: 1, alignItems: 'center', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, gap: 8, borderWidth: 1 },
  compactIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  compactTitle: { fontFamily: 'Inter-SemiBold', fontSize: 13, textAlign: 'center' },
  quickTitle: { fontFamily: 'Inter-Bold', fontSize: 20, color: '#fff' },
  quickDesc: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17, color: 'rgba(255,255,255,0.8)', marginTop: 3 },
  sectionTitle: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16, letterSpacing: 1, marginTop: 8 },
  plannerCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  plannerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  plannerTitle: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1 },
  plannerRow: { flexDirection: 'row', gap: 6 },
  plannerDay: { flex: 1, aspectRatio: 0.72, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  plannerDayLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14 },
  plannerDayPlan: { fontFamily: 'Inter-Bold', fontSize: 10, lineHeight: 13 },
  todayCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 18, gap: 14 },
  picker: { flex: 1 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 12 },
  pickerTitle: { fontFamily: 'Inter-Bold', fontSize: 18 },
  pickerSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  pickerName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
});
