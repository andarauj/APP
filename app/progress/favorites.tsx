/**
 * Favorites screen — bookmarked exercises for quick access
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { Card } from '@/components/ui/Card';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { getFavoriteExercises, getFavoritesCount } from '@/db/favoritesDao';
import { MUSCLE_GROUPS_PT } from '@/types';
import type { Exercise } from '@/types';
import { ChevronLeft, Star } from 'lucide-react-native';

export default function FavoritesScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Exercise[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isReady) return;
    loadFavorites();
  }, [isReady]);

  const loadFavorites = async () => {
    try {
      setLoading(true);
      const [exs, cnt] = await Promise.all([
        getFavoriteExercises(),
        getFavoritesCount(),
      ]);
      setFavorites(exs);
      setCount(cnt);
    } catch (err) {
      console.error('Failed to load favorites:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = async (_isFavorite: boolean) => {
    await loadFavorites();
  };

  const groupedByMuscle = favorites.reduce((acc, ex) => {
    const muscle = MUSCLE_GROUPS_PT[ex.primary_muscle as keyof typeof MUSCLE_GROUPS_PT] || ex.primary_muscle;
    if (!acc[muscle]) acc[muscle] = [];
    acc[muscle].push(ex);
    return acc;
  }, {} as Record<string, Exercise[]>);

  const renderExerciseItem = ({ item }: { item: Exercise }) => (
    <TouchableOpacity
      style={[styles.exerciseRow, { borderBottomColor: colors.border }]}
      onPress={() => router.push({
        pathname: '/exercise/[id]',
        params: { id: item.id.toString() },
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.exerciseName, { color: colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.exerciseMeta, { color: colors.textSecondary }]}>
          {item.equipment || '–'}
        </Text>
      </View>
      <FavoriteButton
        exerciseId={item.id}
        size={20}
        activeColor={colors.primary}
        inactiveColor={colors.textTertiary}
        onToggle={handleToggleFavorite}
      />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Favoritos ({count})</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : favorites.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyContainer}>
          <Star size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Sem favoritos</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Clica o ícone de estrela em qualquer exercício para adicionar aos favoritos
          </Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {Object.entries(groupedByMuscle).map(([muscle, exercises]) => (
            <View key={muscle}>
              <Text style={[styles.muscleHeader, { color: colors.primary }]}>
                {muscle} ({exercises.length})
              </Text>
              <Card style={{ marginBottom: 16 }}>
                <FlatList
                  data={exercises}
                  renderItem={renderExerciseItem}
                  keyExtractor={(item) => item.id.toString()}
                  scrollEnabled={false}
                />
              </Card>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontFamily: 'Inter-SemiBold', fontSize: 18 },
  content: { paddingHorizontal: 12, paddingVertical: 16, gap: 16, paddingBottom: 32 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  emptyTitle: { fontFamily: 'Inter-SemiBold', fontSize: 18 },
  emptyText: { fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center' },
  muscleHeader: { fontFamily: 'Inter-SemiBold', fontSize: 14, marginBottom: 8 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1 },
  exerciseName: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  exerciseMeta: { fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 2 },
});
