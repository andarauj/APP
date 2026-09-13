import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Play, Check, Timer } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useActiveWorkout, remainingRestSeconds } from '@/hooks/useActiveWorkout';
import { finishSessionAsIs, getSessionSetsWithExercise } from '@/db/workoutDao';
import { cancelRestEndNotification, scheduleRestEndNotification } from '@/utils/restNotification';
import { sessionProgressFromSets } from '@/utils/sessionProgressSnapshot';
import { formatTime } from '@/utils/format';
import { hapticSelect, hapticSuccess } from '@/utils/haptics';

/**
 * Sticky mini-player for a minimized active workout. Shows live elapsed
 * time + rest countdown with −10 / skip / +30 while browsing other tabs.
 * Progress (doneSets / exercise name) is refreshed from SQLite periodically
 * so the label stays honest if the session data changes while minimized.
 */
export function ActiveWorkoutMiniPlayer({ bottomOffset }: { bottomOffset: number }) {
  const { colors, isOled } = useTheme();
  const router = useRouter();
  const { minimized, clearMinimized, adjustMinimizedRest, patchMinimizedProgress } = useActiveWorkout();
  const [now, setNow] = useState(Date.now());

  // Refs so the 5s poll does not recreate when rest adjust / progress patch
  // updates the snapshot object — only sessionId should restart the interval.
  const snapshotRef = useRef(minimized);
  snapshotRef.current = minimized;

  const refreshProgress = useCallback(async () => {
    const snap = snapshotRef.current;
    if (!snap) return;
    try {
      const rows = await getSessionSetsWithExercise(snap.sessionId);
      const next = sessionProgressFromSets(
        rows.map((r: { exercise_name?: string; completed_at?: number | null }) => ({
          exercise_name: r.exercise_name,
          completed_at: r.completed_at,
        })),
        snap.currentExerciseName,
      );
      if (
        next.doneSets !== snap.doneSets
        || next.currentExerciseName !== snap.currentExerciseName
      ) {
        patchMinimizedProgress({
          doneSets: next.doneSets,
          currentExerciseName: next.currentExerciseName,
          totalPlannedSets: snap.totalPlannedSets,
        });
      }
    } catch {
      // Offline / DB race while discarding — keep last snapshot.
    }
  }, [patchMinimizedProgress]);

  useEffect(() => {
    if (!minimized) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [minimized]);

  useEffect(() => {
    if (!minimized?.sessionId) return;
    refreshProgress();
    const poll = setInterval(() => { refreshProgress(); }, 5000);
    return () => clearInterval(poll);
  }, [minimized?.sessionId, refreshProgress]);

  if (!minimized) return null;

  const elapsed = minimized.baseElapsedSeconds + Math.floor((now - minimized.minimizedAtMs) / 1000);
  const restLeft = remainingRestSeconds(minimized.restEndsAtMs, now);
  const restActive = restLeft != null;

  const expand = () => {
    hapticSelect();
    const params: Record<string, string> = {
      planId: String(minimized.planId ?? 0),
      planName: minimized.name,
      resumeSessionId: String(minimized.sessionId),
    };
    // Pass wall-clock deadline + ring denominator so active.tsx can resume
    // mid-rest with the correct RestRing fill even if context is cleared first.
    if (minimized.restEndsAtMs != null && restActive) {
      params.resumeRestEndsAtMs = String(minimized.restEndsAtMs);
      if (minimized.restRingSeconds != null) {
        params.resumeRestRingSeconds = String(minimized.restRingSeconds);
      }
    }
    router.push({ pathname: '/workout/active', params });
  };

  const applyRest = (deltaOrSkip: number | 'skip') => {
    hapticSelect();
    if (deltaOrSkip === 'skip') {
      cancelRestEndNotification().catch(() => {});
      adjustMinimizedRest('skip');
      return;
    }
    if (deltaOrSkip < 0 && (restLeft ?? 0) <= 10) return;
    const next = Math.max(0, (restLeft ?? 0) + deltaOrSkip);
    adjustMinimizedRest(deltaOrSkip);
    if (next > 0) scheduleRestEndNotification(next, '').catch(() => {});
    else cancelRestEndNotification().catch(() => {});
  };

  const quickFinish = () => {
    Alert.alert('Concluir treino?', `Guardar "${minimized.name}" com as ${minimized.doneSets} séries já registadas.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Concluir', onPress: async () => {
          hapticSuccess();
          await finishSessionAsIs(minimized.sessionId).catch(() => {});
          clearMinimized();
          router.push({ pathname: '/workout/summary', params: { sessionId: String(minimized.sessionId) } });
        },
      },
    ]);
  };

  return (
    <View
      style={[styles.wrap, {
        bottom: bottomOffset,
        backgroundColor: isOled ? colors.surface : colors.surfaceHighlight,
        borderColor: restActive ? colors.primary : (isOled ? colors.primary + '40' : colors.border),
        borderWidth: isOled ? 1 : StyleSheet.hairlineWidth,
      }]}
    >
      <TouchableOpacity
        style={styles.mainRow}
        onPress={expand}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Treino minimizado: ${minimized.name}, ${formatTime(elapsed)} decorridos${restActive ? `, descanso ${restLeft}s` : ''}, toca para expandir`}
      >
        <View style={[styles.progressDot, { backgroundColor: restActive ? colors.primary : colors.secondary }]} />
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{minimized.name}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            {restActive
              ? `Descanso ${formatTime(restLeft!)} · ${minimized.currentExerciseName}`
              : `${minimized.currentExerciseName} · ${formatTime(elapsed)}${minimized.totalPlannedSets > 0 ? ` · ${minimized.doneSets}/${minimized.totalPlannedSets} séries` : ''}`}
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

      {restActive && (
        <View style={[styles.restRow, { borderTopColor: colors.border }]}>
          <View style={[styles.restChip, { backgroundColor: colors.primaryContainer }]}>
            <Timer size={14} color={colors.primary} />
            <Text style={[styles.restChipText, { color: colors.primary }]}>{restLeft}s</Text>
          </View>
          <TouchableOpacity
            style={[styles.restBtn, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => applyRest(-10)}
            accessibilityRole="button"
            accessibilityLabel="Menos 10 segundos de descanso"
          >
            <Text style={[styles.restBtnText, { color: colors.text }]}>−10</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.restBtn, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => applyRest('skip')}
            accessibilityRole="button"
            accessibilityLabel="Saltar descanso"
          >
            <Text style={[styles.restBtnText, { color: colors.text }]}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.restBtn, { backgroundColor: colors.primaryContainer }]}
            onPress={() => applyRest(30)}
            accessibilityRole="button"
            accessibilityLabel="Mais 30 segundos de descanso"
          >
            <Text style={[styles.restBtnText, { color: colors.primary }]}>+30</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 8, right: 8,
    borderRadius: 14, borderWidth: 1,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: -2 },
    overflow: 'hidden',
  },
  mainRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  progressDot: { width: 8, height: 8, borderRadius: 4 },
  info: { flex: 1 },
  name: { fontFamily: 'Inter-Bold', fontSize: 13 },
  sub: { fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 15, marginTop: 1 },
  restRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingBottom: 10, paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  restChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  restChipText: { fontFamily: 'Inter-Bold', fontSize: 12 },
  restBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  restBtnText: { fontFamily: 'Inter-Bold', fontSize: 12 },
  actionBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
