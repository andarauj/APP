import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { ExerciseTile } from './ExerciseTile';
import type { Exercise } from '@/types';
import { MUSCLE_GROUPS_PT, EQUIPMENT_PT } from '@/types';

interface ExerciseListItemProps {
  exercise: Exercise;
  onPress: () => void;
  onLongPress?: () => void;
  surfaceColor: string;
  textColor: string;
  textSecondaryColor: string;
  textTertiaryColor: string;
}

/**
 * JeFit-parity exercise row: a circular thumbnail, a bold name, and the
 * muscles worked underneath. No chevron — the whole row is the target.
 */
export const ExerciseListItem = memo(function ExerciseListItem({
  exercise,
  onPress,
  onLongPress,
  surfaceColor,
  textColor,
  textSecondaryColor,
}: ExerciseListItemProps) {
  const hasImage = exercise.image_url && exercise.image_url.trim() !== '';

  const secondary = (exercise.secondary_muscles || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .map(m => MUSCLE_GROUPS_PT[m as keyof typeof MUSCLE_GROUPS_PT] || m);
  const subtitle = [
    MUSCLE_GROUPS_PT[exercise.primary_muscle],
    ...secondary.slice(0, 2),
  ].join(', ') || EQUIPMENT_PT[exercise.equipment];

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: surfaceColor }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={exercise.name}
      accessibilityHint={exercise.is_custom === 1 ? 'Mantém premido para eliminar' : undefined}
    >
      <View style={styles.mediaContainer}>
        {hasImage ? (
          <Image source={{ uri: exercise.image_url }} style={styles.thumbnail} resizeMode="cover" />
        ) : (
          <ExerciseTile muscle={exercise.primary_muscle} equipment={exercise.equipment} size={56} />
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: textColor }]} numberOfLines={2}>
          {exercise.name}
          {exercise.is_custom === 1 ? <Text style={{ color: textSecondaryColor }}>  ·  Personalizado</Text> : null}
        </Text>
        <Text style={[styles.sub, { color: textSecondaryColor }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    gap: 14,
  },
  mediaContainer: {
    width: 56,
    height: 56,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  thumbnail: { width: 56, height: 56 },
  info: { flex: 1, justifyContent: 'center', gap: 3 },
  name: { fontFamily: 'Inter-Bold', fontSize: 16, lineHeight: 20 },
  sub: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17 },
});
