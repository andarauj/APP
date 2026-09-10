import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { Card } from '@/components/ui/Card';
import { getAchievementStats } from '@/db/workoutDao';
import { setSetting } from '@/db/settingsDao';
import {
  ACHIEVEMENTS, getUnlockedAchievementIds, getProgressToward, type AchievementStats, type AchievementCategory,
} from '@/utils/achievements';
import { ChevronLeft, Trophy, Flame, TrendingUp, Dumbbell, Lock } from 'lucide-react-native';

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  workouts: 'Treinos', streak: 'Sequência', prs: 'Recordes', volume: 'Volume',
};
const CATEGORY_ICONS: Record<AchievementCategory, any> = {
  workouts: Dumbbell, streak: Flame, prs: TrendingUp, volume: Trophy,
};

export default function AchievementsScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();

  const [stats, setStats] = useState<AchievementStats | null>(null);

  const load = useCallback(async () => {
    if (!isReady) return;
    try {
      const s = await getAchievementStats();
      setStats(s);
      // Mark everything currently unlocked as "seen" — the celebratory
      // popup for newly-unlocked ones is shown from the Home screen (where
      // stats are already fetched each visit); this screen is the browse/
      // review view, so opening it shouldn't itself trigger a celebration.
      const unlocked = getUnlockedAchievementIds(s);
      await setSetting('achievementsSeen', JSON.stringify(unlocked));
    } catch (err) {
      console.error('Failed to load achievements:', err);
    }
  }, [isReady]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unlockedIds = stats ? new Set(getUnlockedAchievementIds(stats)) : new Set<string>();
  const categories: AchievementCategory[] = ['workouts', 'streak', 'prs', 'volume'];

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar">
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Conquistas</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {stats && (
          <Card style={styles.summaryCard}>
            <Trophy size={22} color={colors.accent} />
            <Text style={[styles.summaryText, { color: colors.text }]}>
              {unlockedIds.size} de {ACHIEVEMENTS.length} desbloqueadas
            </Text>
          </Card>
        )}

        {categories.map(category => {
          const Icon = CATEGORY_ICONS[category];
          const items = ACHIEVEMENTS.filter(a => a.category === category);
          return (
            <View key={category} style={{ gap: 8 }}>
              <View style={styles.categoryHeader}>
                <Icon size={16} color={colors.textSecondary} />
                <Text style={[styles.categoryTitle, { color: colors.textSecondary }]}>{CATEGORY_LABELS[category].toUpperCase()}</Text>
              </View>
              <Card style={{ gap: 2 }}>
                {items.map((a, i) => {
                  const isUnlocked = unlockedIds.has(a.id);
                  const progress = stats ? getProgressToward(a, stats) : 0;
                  return (
                    <View key={a.id} style={[styles.achRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <View style={[styles.achIcon, { backgroundColor: isUnlocked ? colors.accentContainer : colors.surfaceVariant }]}>
                        {isUnlocked ? <Trophy size={18} color={colors.accent} /> : <Lock size={16} color={colors.textTertiary} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.achTitle, { color: isUnlocked ? colors.text : colors.textSecondary }]}>{a.title}</Text>
                        <Text style={[styles.achDesc, { color: colors.textTertiary }]}>{a.description}</Text>
                        {!isUnlocked && (
                          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceVariant }]}>
                            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </Card>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  summaryText: { fontFamily: 'Inter-Bold', fontSize: 16 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryTitle: { fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 1 },
  achRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  achIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  achTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  achDesc: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 1 },
  progressTrack: { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
});
