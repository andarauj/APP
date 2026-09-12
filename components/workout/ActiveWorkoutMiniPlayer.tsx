import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Play, Check } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { finishSessionAsIs } from '@/db/workoutDao';
import { formatTime } from '@/utils/format';
import { hapticSelect, hapticSuccess } from '@/utils/haptics';

/**
 * Spotify-style sticky mini-player for a minimized active workout — see
 * hooks/useActiveWorkout.tsx's MinimizedWorkout doc comment for what it's
 * built from. Mounted once in app/(tabs)/_layout.tsx (not per-screen) so it
 * survives switching tabs; renders nothing when there's no minimized
 * session. Its own elapsed-time tick lives entirely in this component —
 * app/workout/active.tsx isn't mounted while minimized, so nothing else is
 * ticking it.
 */
export function ActiveWorkoutMiniPlayer({ bottomOffset }: { bottomOffset: number }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { minimized, clearMinimized } = useActiveWorkout();
  const [now, setNow] = useState(Date.now());

  // BUGFIX (found in on-device verification): this component is mounted
  // once, for the app's whole lifetime — `now`'s initial value is whatever
  // Date.now() happened to be back then, potentially minutes before any
  // workout was even minimized. Without the synchronous setNow() below,
  // the very first render after a fresh minimize computed elapsed from
  // that stale timestamp instead of a current one, showing a large
  // negative duration until the first 1000ms interval tick corrected it.
  // Depends on the whole `minimized` object (a fresh one every minimize()
  // call, see hooks/useActiveWorkout.tsx) rather than just its truthiness,
  // so minimizing the same session again later also re-syncs immediately
  // instead of reusing an even-older interval.
  useEffect(() => {
    if (!minimized) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [minimized]);

  if (!minimized) return null;

  const elapsed = minimized.baseElapsedSeconds + Math.floor((now - minimized.minimizedAtMs) / 1000);

  const expand = () => {
    hapticSelect();
    router.push({
      pathname: '/workout/active',
      params: { planId: String(minimized.planId ?? 0), planName: minimized.name, resumeSessionId: String(minimized.sessionId) },
    });
  };

  const quickFinish = () => {
    Alert.alert('Concluir treino?', `Guardar "${minimized.name}" com as ${minimized.doneSets} séries já registadas.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Concluir', onPress: async () => {
          hapticSuccess();
          await finishSessionAsIs(minimized.sessionId).catch(() => {});
          clearMinimized();
        },
      },
    ]);
  };

  return (
    <TouchableOpacity
      style={[styles.bar, { bottom: bottomOffset, backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
      onPress={expand}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Treino minimizado: ${minimized.name}, ${formatTime(elapsed)} decorridos, toca para expandir`}
    >
      <View style={[styles.progressDot, { backgroundColor: colors.primary }]} />
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{minimized.name}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
          {minimized.currentExerciseName} · {formatTime(elapsed)}
          {minimized.totalPlannedSets > 0 ? ` · ${minimized.doneSets}/${minimized.totalPlannedSets} séries` : ''}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: colors.secondaryContainer }]}
        onPress={quickFinish}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Concluir treino rapidamente"
      >
        <Check size={18} color={colors.secondary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: colors.primaryContainer }]}
        onPress={expand}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Expandir treino"
      >
        <Play size={18} color={colors.primary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: -2 },
  },
  progressDot: { width: 8, height: 8, borderRadius: 4 },
  info: { flex: 1 },
  name: { fontFamily: 'Inter-Bold', fontSize: 13 },
  sub: { fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 15, marginTop: 1 },
  actionBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
