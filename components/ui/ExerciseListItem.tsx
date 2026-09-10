import { memo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';
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
 * Renderiza um exercício numa lista com:
 * - Imagem thumbnail se disponível (ExerciseDB)
 * - Tile de cor/ícone se não
 * - Nome, músculo e equipamento
 * - Indicador "Personalizado" se for do utilizador
 */
export const ExerciseListItem = memo(function ExerciseListItem({
  exercise,
  onPress,
  onLongPress,
  surfaceColor,
  textColor,
  textSecondaryColor,
  textTertiaryColor,
}: ExerciseListItemProps) {
  const hasImage = exercise.image_url && exercise.image_url.trim() !== '';

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
      {/* Thumbnail / Tile */}
      <View style={styles.mediaContainer}>
        {hasImage ? (
          <Image
            source={{ uri: exercise.image_url }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <ExerciseTile muscle={exercise.primary_muscle} equipment={exercise.equipment} size={46} />
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>
          {exercise.name}
        </Text>
        <View style={styles.subRow}>
          <Text style={[styles.sub, { color: textSecondaryColor }]} numberOfLines={1}>
            {MUSCLE_GROUPS_PT[exercise.primary_muscle]} · {EQUIPMENT_PT[exercise.equipment]}
          </Text>
          {exercise.is_custom === 1 && (
            <Text style={[styles.customTag, { color: textSecondaryColor }]}> · Personalizado</Text>
          )}
        </View>
      </View>

      {/* Chevron */}
      <ChevronRight size={20} color={textTertiaryColor} />
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
    borderBottomColor: 'rgba(0,0,0,0.05)',
    gap: 12,
  },
  mediaContainer: {
    width: 46,
    height: 46,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  thumbnail: {
    width: 46,
    height: 46,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sub: {
    fontSize: 12,
  },
  customTag: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
