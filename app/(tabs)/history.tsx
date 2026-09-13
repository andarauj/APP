import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, RefreshControl, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { getStreakData, getWorkoutDatesByMonth, getSessionsForDate, getWeeklyVolumeByMuscle, getSessionHistory, getMostTrainedExercises, getPersonalRecords, type MostTrainedExercise } from '@/db/workoutDao';
import { exportWorkoutAsXml, shareXmlFile, importXml } from '@/utils/xmlExport';
import { pickXmlFile } from '@/utils/filePicker';
import type { WorkoutSession, PersonalRecord } from '@/types';
import { formatTime, formatDate, formatDateTime, formatVolume, monthName, getDaysInMonth, getFirstDayOfMonth } from '@/utils/format';
import { useFocusEffect, useRouter } from 'expo-router';
import { Calendar, Flame, TrendingUp, Download, Upload, ChevronLeft, ChevronRight, X, Play, Zap, Dumbbell, Radar, Star } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { TabBar } from '@/components/ui/TabBar';
import { BarChart } from '@/components/ui/Charts';

export default function HistoryScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'calendar' | 'stats' | 'sessions'>('calendar');

  // Shared state
  const [streak, setStreak] = useState({ currentStreak: 0, longestStreak: 0, totalWorkouts: 0 });
  const [refreshing, setRefreshing] = useState(false);

  // Calendar state
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [workoutDays, setWorkoutDays] = useState<number[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedDaySessions, setSelectedDaySessions] = useState<WorkoutSession[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);

  // Stats state
  const [weeklyVolume, setWeeklyVolume] = useState<any[]>([]);
  const [topExercises, setTopExercises] = useState<MostTrainedExercise[]>([]);
  const [topPRs, setTopPRs] = useState<PersonalRecord[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  // Sessions state
  const [allSessions, setAllSessions] = useState<WorkoutSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [hasMoreSessions, setHasMoreSessions] = useState(true);

  const today = new Date();

  // The only loader that depends on state (the month being viewed), so it is
  // the one the focus effect below has to list. The others close over
  // nothing that changes.
  const loadCalendar = useCallback(async () => {
    try {
      const days = await getWorkoutDatesByMonth(calendarYear, calendarMonth);
      setWorkoutDays(days);
    } catch (err) {
      console.error('Failed to load calendar:', err);
    }
  }, [calendarYear, calendarMonth]);

  // Load functions by tab
  useFocusEffect(useCallback(() => {
    if (!isReady) return;
    loadStreak();
    if (activeTab === 'calendar') loadCalendar();
    else if (activeTab === 'stats') loadStats();
    else if (activeTab === 'sessions') loadSessionsData();
  }, [isReady, activeTab, loadCalendar]));

  const loadStreak = async () => {
    try {
      const str = await getStreakData();
      setStreak(str);
    } catch (err) {
      console.error('Failed to load streak:', err);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const [volume, exercises, prs] = await Promise.all([
        getWeeklyVolumeByMuscle(7),
        getMostTrainedExercises(5, 30),
        getPersonalRecords(),
      ]);
      setWeeklyVolume(volume);
      setTopExercises(exercises);
      setTopPRs(prs.slice(0, 5));
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadSessionsData = async () => {
    setLoadingSessions(true);
    try {
      const sessions = await getSessionHistory(30, 0);
      setAllSessions(sessions);
      setHasMoreSessions(sessions.length === 30);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadMoreSessions = async () => {
    if (loadingSessions || !hasMoreSessions) return;
    setLoadingSessions(true);
    try {
      const sessions = await getSessionHistory(30, allSessions.length);
      if (sessions.length < 30) setHasMoreSessions(false);
      setAllSessions(prev => [...prev, ...sessions]);
    } catch (err) {
      console.error('Failed to load more sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStreak();
    if (activeTab === 'calendar') await loadCalendar();
    else if (activeTab === 'stats') await loadStats();
    else if (activeTab === 'sessions') await loadSessionsData();
    setRefreshing(false);
  };

  // BUGFIX: calendar days were plain, non-interactive Views — tapping a day
  // did nothing at all. Tapping now shows the workout(s) done that day (or
  // an empty state), whether or not the dot is present.
  const handleDayPress = async (day: number) => {
    setSelectedDay(day);
    setLoadingDay(true);
    try {
      const daySessions = await getSessionsForDate(calendarYear, calendarMonth, day);
      setSelectedDaySessions(daySessions);
    } catch (err) {
      console.error('Failed to load sessions for date:', err);
      setSelectedDaySessions([]);
    } finally {
      setLoadingDay(false);
    }
  };

  const handleExport = async (session: WorkoutSession) => {
    try {
      const xml = await exportWorkoutAsXml(session.id);
      const name = session.name.replace(/\s+/g, '_');
      await shareXmlFile(xml, `Changes_${name}_${Date.now()}.xml`);
    } catch (e) {
      Alert.alert('Erro ao exportar', String(e));
    }
  };

  const handleImport = async () => {
    try {
      const content = await pickXmlFile();
      if (!content) return;
      const result = await importXml(content);
      Alert.alert(result.success ? 'Importado!' : 'Erro', result.message);
      if (result.success) {
        await loadStreak();
        if (activeTab === 'calendar') await loadCalendar();
        else if (activeTab === 'stats') await loadStats();
        else if (activeTab === 'sessions') await loadSessionsData();
      }
    } catch (err) {
      console.error('Failed to import file:', err);
      Alert.alert('Erro', 'Não foi possível importar o ficheiro. Confirma que é um XML válido exportado pela app.');
    }
  };

  const prevMonth = () => {
    setSelectedDay(null);
    if (calendarMonth === 0) { setCalendarYear(y => y - 1); setCalendarMonth(11); }
    else setCalendarMonth(m => m - 1);
  };

  const nextMonth = () => {
    setSelectedDay(null);
    if (calendarMonth === 11) { setCalendarYear(y => y + 1); setCalendarMonth(0); }
    else setCalendarMonth(m => m + 1);
  };

  const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
  const firstDay = getFirstDayOfMonth(calendarYear, calendarMonth);
  const adjustedFirstDay = (firstDay + 6) % 7; // Mon=0

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerTitleRow}>
          {/* BUGFIX (reported: "não deixa voltar a trás"): this screen is a
              hidden tab (reached via router.push from Progresso/summary, not
              a visible bottom-tab icon), so there's no bottom-bar icon to tap
              back to Progresso with. router.canGoBack()/router.back() looked
              like the fix but isn't: canGoBack() is true even right after a
              plain tab switch, and back() in that case doesn't return to
              Progresso — it unwinds to the tabs navigator's first declared
              child (Descobrir) instead, regardless of which tab was actually
              open before. router.replace('/(tabs)') has the same problem
              once the tabs navigator is already mounted. router.navigate,
              unlike back()/replace(), lets an already-mounted nested
              navigator resolve to the right screen instead of resetting —
              confirmed on-device across every entry point (Progresso tab
              switch, and back-out-of-Equilíbrio-Muscular stack pop). */}
          <TouchableOpacity
            onPress={() => router.navigate('/(tabs)')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <ChevronLeft size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Histórico</Text>
        </View>
        <TouchableOpacity onPress={handleImport} style={[styles.importBtn, { backgroundColor: colors.surfaceVariant }]} accessibilityRole="button" accessibilityLabel="Importar treino ou plano XML">
          <Upload size={18} color={colors.textSecondary} />
          <Text style={[styles.importText, { color: colors.textSecondary }]}>Importar</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <TabBar
        tabs={[
          { id: 'calendar', label: 'Calendário' },
          { id: 'stats', label: 'Estatísticas' },
          { id: 'sessions', label: 'Sessões' },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as 'calendar' | 'stats' | 'sessions')}
        activeColor={colors.primary}
        inactiveColor={colors.textSecondary}
        backgroundColor={colors.surface}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Streak cards — always visible */}
        <View style={styles.streakRow}>
          <Card style={styles.streakCard}>
            <View style={[styles.streakIcon, { backgroundColor: colors.accentContainer }]}>
              <Flame size={22} color={colors.accent} />
            </View>
            <Text style={[styles.streakValue, { color: colors.text }]}>{streak.currentStreak}</Text>
            <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>Dias seguidos</Text>
          </Card>
          <Card style={styles.streakCard}>
            <View style={[styles.streakIcon, { backgroundColor: colors.primaryContainer }]}>
              <TrendingUp size={22} color={colors.primary} />
            </View>
            <Text style={[styles.streakValue, { color: colors.text }]}>{streak.longestStreak}</Text>
            <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>Recorde</Text>
          </Card>
          <Card style={styles.streakCard}>
            <View style={[styles.streakIcon, { backgroundColor: colors.secondaryContainer }]}>
              <Calendar size={22} color={colors.secondary} />
            </View>
            <Text style={[styles.streakValue, { color: colors.text }]}>{streak.totalWorkouts}</Text>
            <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>Total</Text>
          </Card>
        </View>

        {/* CALENDAR TAB */}
        {activeTab === 'calendar' && (
          <>
            <Card>
              <View style={styles.calHeader}>
            <TouchableOpacity onPress={prevMonth} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mês anterior">
              <ChevronLeft size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.calTitle, { color: colors.text }]}>
              {monthName(calendarMonth)} {calendarYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mês seguinte">
              <ChevronRight size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.calWeekdays}>
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => (
              <Text key={i} style={[styles.calWeekday, { color: colors.textTertiary }]}>{d}</Text>
            ))}
          </View>
          <View style={styles.calGrid}>
            {Array.from({ length: adjustedFirstDay }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.calCell} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday = day === today.getDate() && calendarMonth === today.getMonth() && calendarYear === today.getFullYear();
              const hasWorkout = workoutDays.includes(day);
              const isSelected = selectedDay === day;
              return (
                <TouchableOpacity
                  key={day}
                  style={styles.calCell}
                  onPress={() => handleDayPress(day)}
                  accessibilityRole="button"
                  accessibilityLabel={hasWorkout ? `${day}, treino registado, toca para ver` : `${day}, sem treino`}
                >
                  <View style={[
                    styles.calDay,
                    hasWorkout && { backgroundColor: colors.primary },
                    isToday && !hasWorkout && { borderWidth: 2, borderColor: colors.secondary },
                    isSelected && { borderWidth: 2, borderColor: colors.accent },
                  ]}>
                    <Text style={[
                      styles.calDayText,
                      { color: hasWorkout ? '#fff' : isToday ? colors.secondary : colors.text },
                    ]}>{day}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
            </>
        )}

        {/* STATS TAB */}
        {activeTab === 'stats' && (
          <>
            {loadingStats ? (
              <View style={{ alignItems: 'center', padding: 40 }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <>
                {/* Entry points into the deeper analysis screens — without
                    these the radar/1RM/favourites screens are unreachable. */}
                <View style={styles.analysisRow}>
                  <TouchableOpacity
                    style={[styles.analysisCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => router.push('/progress/balance')}
                    accessibilityRole="button"
                    accessibilityLabel="Ver equilíbrio muscular"
                  >
                    <Radar size={20} color={colors.primary} />
                    <Text style={[styles.analysisLabel, { color: colors.text }]}>Equilíbrio</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.analysisCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => router.push('/progress/onerm')}
                    accessibilityRole="button"
                    accessibilityLabel="Ver progressão de 1RM"
                  >
                    <Zap size={20} color={colors.primary} />
                    <Text style={[styles.analysisLabel, { color: colors.text }]}>1RM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.analysisCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => router.push('/progress/favorites')}
                    accessibilityRole="button"
                    accessibilityLabel="Ver exercícios favoritos"
                  >
                    <Star size={20} color={colors.primary} />
                    <Text style={[styles.analysisLabel, { color: colors.text }]}>Favoritos</Text>
                  </TouchableOpacity>
                </View>

                {/* Weekly Volume by Muscle */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Volume Semanal por Músculo</Text>
                {weeklyVolume.length > 0 ? (
                  <View style={[styles.chartContainer, { backgroundColor: colors.surface }]}>
                    <BarChart
                      data={weeklyVolume.map(v => ({
                        label: v.muscle.slice(0, 3).toUpperCase(),
                        value: Math.round(v.volume),
                      }))}
                      width={360}
                      height={240}
                      barColor={colors.primary}
                      labelColor={colors.textTertiary}
                      backgroundColor={colors.surface}
                    />
                  </View>
                ) : (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Sem dados disponíveis</Text>
                )}

                {/* Top Exercises */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Exercícios Mais Treinados</Text>
                <View style={styles.listContainer}>
                  {topExercises.length > 0 ? topExercises.map((ex, i) => (
                    <View key={i} style={[styles.listRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.listLabel, { color: colors.text }]} numberOfLines={1}>
                          {ex.name}
                        </Text>
                        <Text style={[styles.listSub, { color: colors.textSecondary }]}>
                          {ex.set_count} séries
                        </Text>
                      </View>
                      <Dumbbell size={18} color={colors.primary} />
                    </View>
                  )) : (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Sem dados</Text>
                  )}
                </View>

                {/* Top PRs */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Recordes Pessoais</Text>
                <View style={styles.listContainer}>
                  {topPRs.length > 0 ? topPRs.map((pr, i) => (
                    <View key={i} style={[styles.listRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.listLabel, { color: colors.text }]} numberOfLines={1}>
                          {pr.exercise_name}
                        </Text>
                        <Text style={[styles.listSub, { color: colors.textSecondary }]}>
                          {formatDate(pr.date_achieved)}
                        </Text>
                      </View>
                      <Text style={[styles.prValue, { color: colors.secondary }]}>
                        {pr.is_bodyweight
                          ? `${pr.max_reps} reps`
                          : `${pr.max_weight}kg × ${pr.max_reps}`}
                      </Text>
                    </View>
                  )) : (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Sem PRs registados</Text>
                  )}
                </View>
              </>
            )}
          </>
        )}

        {/* SESSIONS TAB */}
        {activeTab === 'sessions' && (
          <>
            {allSessions.length === 0 && !loadingSessions ? (
              <View style={{ alignItems: 'center', padding: 40 }}>
                <Calendar size={40} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 12 }]}>
                  Sem sessões registadas
                </Text>
              </View>
            ) : (
              <FlatList
                scrollEnabled={false}
                data={allSessions}
                keyExtractor={item => String(item.id)}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={[
                      styles.sessionRow,
                      index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                    ]}
                    onPress={() => router.push({ pathname: '/workout/summary', params: { sessionId: item.id } })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listLabel, { color: colors.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.listSub, { color: colors.textSecondary }]}>
                        {formatDateTime(item.started_at)}
                      </Text>
                      <View style={styles.sessionMeta}>
                        <Text style={[styles.sessionStat, { color: colors.textSecondary }]}>
                          ⏱ {formatTime(item.total_duration)}
                        </Text>
                        <Text style={[styles.sessionStat, { color: colors.textSecondary }]}>
                          📦 {item.total_sets} séries
                        </Text>
                        <Text style={[styles.sessionStat, { color: colors.textSecondary }]}>
                          💪 {formatVolume(item.total_volume)}
                        </Text>
                      </View>
                    </View>
                    <Play size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
                onEndReached={loadMoreSessions}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  loadingSessions ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  ) : null
                }
              />
            )}
          </>
        )}
      </ScrollView>

      {/* Day detail — shows the workout(s) done on a tapped calendar day.
          Calendar cells used to be plain, non-interactive Views. */}
      <Modal
        visible={selectedDay !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedDay(null)}
      >
        <View style={[styles.dayModal, { backgroundColor: colors.background }]}>
          <View style={[styles.dayModalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.dayModalTitle, { color: colors.text }]}>
              {selectedDay !== null ? `${selectedDay} de ${monthName(calendarMonth)}` : ''}
            </Text>
            <TouchableOpacity onPress={() => setSelectedDay(null)} accessibilityRole="button" accessibilityLabel="Fechar">
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.dayModalContent} showsVerticalScrollIndicator={false}>
            {loadingDay ? null : selectedDaySessions.length === 0 ? (
              <View style={styles.dayEmpty}>
                <Calendar size={40} color={colors.textTertiary} />
                <Text style={[styles.dayEmptyText, { color: colors.textSecondary }]}>Sem treino registado neste dia.</Text>
              </View>
            ) : (
              selectedDaySessions.map(session => (
                <TouchableOpacity
                  key={session.id}
                  style={[styles.sessionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => {
                    setSelectedDay(null);
                    router.push({ pathname: '/workout/summary', params: { sessionId: session.id } });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.sessionAccent, { backgroundColor: colors.secondary }]} />
                  <View style={styles.sessionBody}>
                    <View style={styles.sessionTop}>
                      <Text style={[styles.sessionName, { color: colors.text }]} numberOfLines={1}>{session.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => handleExport(session)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Exportar treino ${session.name}`}>
                          <Download size={18} color={colors.textTertiary} />
                        </TouchableOpacity>
                        <Play size={16} color={colors.textTertiary} />
                      </View>
                    </View>
                    <Text style={[styles.sessionDate, { color: colors.textSecondary }]}>{formatDateTime(session.started_at)}</Text>
                    <View style={styles.sessionMeta}>
                      <Text style={[styles.sessionStat, { color: colors.textSecondary }]}>⏱ {formatTime(session.total_duration)}</Text>
                      <Text style={[styles.sessionStat, { color: colors.textSecondary }]}>📦 {session.total_sets} séries</Text>
                      <Text style={[styles.sessionStat, { color: colors.textSecondary }]}>💪 {formatVolume(session.total_volume)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dayModal: { flex: 1 },
  dayModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  dayModalTitle: { fontFamily: 'Inter-Bold', fontSize: 18 },
  dayModalContent: { padding: 16, gap: 12 },
  dayEmpty: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 48 },
  dayEmptyText: { fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center' },
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: 28 },
  importBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  importText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  streakRow: { flexDirection: 'row', gap: 10 },
  streakCard: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14 },
  streakIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  streakValue: { fontFamily: 'Inter-Bold', fontSize: 28 },
  streakLabel: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calTitle: { fontFamily: 'Inter-Bold', fontSize: 17 },
  calWeekdays: { flexDirection: 'row', marginBottom: 4 },
  calWeekday: { flex: 1, textAlign: 'center', fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  calDay: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  calDayText: { fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17 },
  sessionCard: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  sessionAccent: { width: 4, alignSelf: 'stretch' },
  sessionBody: { flex: 1, padding: 14, gap: 4 },
  sessionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionName: { fontFamily: 'Inter-SemiBold', fontSize: 15, flex: 1, marginRight: 8 },
  sessionDate: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17 },
  sessionMeta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 4 },
  sessionStat: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 15, marginBottom: 12, marginTop: 20 },
  analysisRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  analysisCard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  analysisLabel: { fontFamily: 'Inter-SemiBold', fontSize: 12 },
  chartContainer: { borderRadius: 12, overflow: 'hidden', marginBottom: 24, padding: 8 },
  listContainer: { borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.02)' },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, gap: 12 },
  listLabel: { fontFamily: 'Inter-SemiBold', fontSize: 14, marginBottom: 2 },
  listSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16 },
  emptyText: { fontFamily: 'Inter-Regular', fontSize: 13, textAlign: 'center', marginVertical: 12 },
  prValue: { fontFamily: 'Inter-Bold', fontSize: 14 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, gap: 12 },
});
