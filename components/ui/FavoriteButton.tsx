/**
 * Favorite button component — star icon to bookmark exercises
 */

import React, { useState, useEffect } from 'react';
import { TouchableOpacity, ActivityIndicator } from 'react-native';
import { Star } from 'lucide-react-native';
import { toggleExerciseFavorite, isExerciseFavorite } from '@/db/favoritesDao';

interface FavoriteButtonProps {
  exerciseId: number;
  size?: number;
  onToggle?: (isFavorite: boolean) => void;
  activeColor?: string;
  inactiveColor?: string;
}

export function FavoriteButton({
  exerciseId,
  size = 20,
  onToggle,
  activeColor = '#FFD700',
  inactiveColor = '#999999',
}: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // `cancelled` guards two things: a state update landing after the button
    // unmounts, and a slow lookup for a previous exerciseId overwriting the
    // result for the current one when this renders inside a list that
    // recycles rows.
    let cancelled = false;
    (async () => {
      try {
        const status = await isExerciseFavorite(exerciseId);
        if (!cancelled) setIsFavorite(status);
      } catch (err) {
        console.error('Failed to check favorite status:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [exerciseId]);

  const handlePress = async () => {
    try {
      setLoading(true);
      const newStatus = await toggleExerciseFavorite(exerciseId);
      setIsFavorite(newStatus);
      onToggle?.(newStatus);
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={loading}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      {loading ? (
        <ActivityIndicator size={size} color={inactiveColor} />
      ) : (
        <Star
          size={size}
          color={isFavorite ? activeColor : inactiveColor}
          fill={isFavorite ? activeColor : 'none'}
          strokeWidth={2}
        />
      )}
    </TouchableOpacity>
  );
}
