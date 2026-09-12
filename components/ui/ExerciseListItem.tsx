import { memo, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { ExerciseTile, muscleColor } from './ExerciseTile';
import { EQUIPMENT_ICON } from '@/utils/equipmentIcons';
import { getLastSetForExercise } from '@/db/workoutDao';
import { RADIUS, TYPE } from '@/constants/tokens';
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
  borderColor: string;
}

/**
 * Exercise row: thumbnail, name, and exactly three pieces of meta — muscle
 * badge, equipment, last weight used. Deliberately nothing else (secondary
 * muscles used to be appended to the subtitle; dropped as clutter the
 * screen-level filters/detail page already cover).
 */
export const ExerciseListItem = memo(function ExerciseListItem({
  exercise,
  onPress,
  onLongPress,
  surfaceColor,
  textColor,
  textSecondaryColor,
  textTertiaryColor,
  borderColor,
}: ExerciseListItemProps) {
  const hasImage = exercise.image_url && exercise.image_url.trim() !== '';
  const mColor = muscleColor(exercise.primary_muscle);
  const EquipIcon = EQUIPMENT_ICON[exercise.equipment];

  // Lazy, per-row: with ~1400 exercises in the library, fetching this for
  // all of them upfront would be 1400 queries for a handful of visible
  // rows. Windowing (initialNumToRender/maxToRenderPerBatch in the parent
  // SectionList) already bounds how many of these actually mount at once.
  const [lastSet, setLastSet] = useState<{ weight: number; reps: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getLastSetForExercise(exercise.id).then(set => {
      if (!cancelled && set) setLastSet({ weight: set.weight, reps: set.reps });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [exercise.id]);

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: surfaceColor, borderBottomColor: borderColor }]}
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

        <View style={styles.metaRow}>
          <View style={[styles.muscleBadge, { backgroundColor: mColor + '22' }]}>
            <View style={[styles.muscleDot, { backgroundColor: mColor }]} />
            <Text style={[styles.metaText, { color: textColor }]} numberOfLines={1}>
              {MUSCLE_GROUPS_PT[exercise.primary_muscle]}
            </Text>
          </View>
          <View style={styles.equipRow}>
            <EquipIcon size={13} color={textSecondaryColor} strokeWidth={2.2} />
            <Text style={[styles.metaText, { color: textSecondaryColor }]} numberOfLines={1}>
              {EQUIPMENT_PT[exercise.equipment]}
            </Text>
          </View>
        </View>

        {lastSet && (
          <Text style={[styles.lastWeight, { color: textTertiaryColor }]} numberOfLines={1}>
            Última vez: {lastSet.weight}kg × {lastSet.reps}
          </Text>
        )}
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
    gap: 14,
    // 56 (media) + 24 (padding) = 80, comfortably above the 44dp minimum
    // touch target for the whole row.
    minHeight: 44,
  },
  mediaContainer: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  thumbnail: { width: 56, height: 56 },
  info: { flex: 1, justifyContent: 'center', gap: 4 },
  name: { fontFamily: 'Inter-Bold', fontSize: 16, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  muscleBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  muscleDot: { width: 6, height: 6, borderRadius: 3 },
  equipRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...TYPE.caption },
  lastWeight: { ...TYPE.caption },
});
