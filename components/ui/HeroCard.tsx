import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { AlertTriangle, Play, Sparkles, Dumbbell, Clock, ListChecks, Check } from 'lucide-react-native';
import { formatTime } from '@/utils/format';
import { formatMinutes } from '@/utils/workoutTime';
import { hapticSelect } from '@/utils/haptics';
import type { TodayWorkoutStatus } from '@/hooks/useTodayWorkoutStatus';
import { plannedWorkoutRouteParams } from '@/utils/plannedWorkout';

/** Small filled circle that pulses — the only place in this card that
 *  moves, and only for the one state (a session genuinely running right
 *  now) where "this is live" is worth signalling. */
function LiveDot({ color }: { color: string }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) })), -1, false);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View className="h-2 w-2 rounded-full" style={[{ backgroundColor: color }, style]} />;
}

/** Fixed-height placeholder shown while useTodayWorkoutStatus resolves, so
 *  the hero card's arrival doesn't shove the rest of the dashboard down —
 *  same footprint as the real card regardless of which of the 4 states
 *  eventually renders. */
export function HeroCardSkeleton() {
  const { colors, isOled } = useTheme();
  return (
    <View
      className="min-h-[150px] gap-1.5 rounded-[18px] border p-[18px]"
      style={{
        backgroundColor: colors.surfaceVariant,
        borderColor: isOled ? colors.primary + '33' : colors.border,
      }}
    />
  );
}

export function HeroCard({ status }: { status: TodayWorkoutStatus }) {
  const { colors, isOled } = useTheme();
  const router = useRouter();

  if (!status.loaded) return <HeroCardSkeleton />;

  if (status.priority === 'active' && status.active) {
    const a = status.active;
    return (
      <TouchableOpacity
        className="min-h-[150px] gap-1.5 rounded-[18px] border p-[18px]"
        style={{ backgroundColor: colors.accentContainer, borderColor: colors.accentContainer }}
        activeOpacity={0.85}
        onPress={() => {
          hapticSelect();
          router.push({ pathname: '/workout/active', params: { planId: String(a.planId ?? 0), planName: a.name, resumeSessionId: String(a.sessionId) } });
        }}
        accessibilityRole="button"
        accessibilityLabel={`Sessão em curso: ${a.name}, ${formatTime(a.elapsedSeconds)} decorridos, ${a.completedSets} séries feitas. Toca para retomar.`}
      >
        {/* BUGFIX (WCAG AA audit): onAccent (white) measures ~1.2:1 on the
            light accentContainer background — near-invisible. Container
            backgrounds pair with colors.text here, same fix already
            applied to onSecondary/secondaryContainer in constants/colors.ts;
            colors.accent itself stays reserved for icon-level content,
            which only needs the 3:1 non-text threshold. */}
        <View className="flex-row items-center gap-[7px]">
          <LiveDot color={colors.accent} />
          <Text className="font-sans-bold text-[11px] tracking-widest" style={{ color: colors.text }}>EM CURSO</Text>
        </View>
        <Text className="mt-0.5 font-sans-extrabold text-xl" style={{ color: colors.text }} numberOfLines={1}>{a.name}</Text>
        <Text className="font-sans text-[13px] leading-[18px]" style={{ color: colors.text }} numberOfLines={1}>
          {formatTime(a.elapsedSeconds)}{a.currentExerciseName ? ` · ${a.currentExerciseName}` : ''} · {a.completedSets} série{a.completedSets === 1 ? '' : 's'}
        </Text>
        <View className="mt-2.5 flex-row items-center justify-center gap-2 rounded-xl py-3" style={{ backgroundColor: colors.accent }}>
          <Play size={16} color={colors.onAccent} />
          <Text className="font-sans-bold text-[15px]" style={{ color: colors.onAccent }}>Retomar Treino</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (status.priority === 'overdue' && status.scheduled) {
    const s = status.scheduled;
    return (
      <TouchableOpacity
        className="min-h-[150px] gap-1.5 rounded-[18px] border p-[18px]"
        style={{ backgroundColor: colors.errorContainer, borderColor: colors.errorContainer }}
        activeOpacity={0.85}
        onPress={() => {
          hapticSelect();
          router.push({
            pathname: '/workout/active',
            params: plannedWorkoutRouteParams({
              planId: s.planId,
              planName: `${s.planName} · ${s.dayLabel}`,
              dayIndex: s.dayIndex,
              weekId: s.weekId,
              weekIndex: s.weekIndex,
              phase: s.phase,
            }),
          });
        }}
        accessibilityRole="button"
        accessibilityLabel={`Treino em atraso: ${s.dayLabel}, ${s.muscles.join(', ')}. Toca para recuperar.`}
      >
        <View className="flex-row items-center gap-[7px]">
          <View className="h-[22px] w-[22px] items-center justify-center rounded-full" style={{ backgroundColor: colors.error }}>
            <AlertTriangle size={13} color={colors.onError} />
          </View>
          <Text className="font-sans-bold text-[11px] tracking-widest" style={{ color: colors.text }}>TREINO EM ATRASO</Text>
        </View>
        <Text className="mt-0.5 font-sans-extrabold text-xl" style={{ color: colors.text }} numberOfLines={1}>{s.dayLabel}</Text>
        <Text className="font-sans text-[13px] leading-[18px]" style={{ color: colors.text }} numberOfLines={1}>
          {s.muscles.join(', ')}
        </Text>
        <View className="mt-2.5 flex-row items-center justify-center gap-2 rounded-xl py-3" style={{ backgroundColor: colors.error }}>
          <Play size={18} color={colors.onError} />
          <Text className="font-sans-bold text-[19px]" style={{ color: colors.onError }}>Recuperar Treino</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (status.priority === 'today' && status.scheduled) {
    const s = status.scheduled;
    return (
      <TouchableOpacity
        className="min-h-[150px] gap-1.5 rounded-[18px] border p-[18px]"
        style={{ backgroundColor: colors.primary, borderColor: colors.primary }}
        activeOpacity={0.85}
        onPress={() => {
          hapticSelect();
          router.push({
            pathname: '/workout/active',
            params: plannedWorkoutRouteParams({
              planId: s.planId,
              planName: `${s.planName} · ${s.dayLabel}`,
              dayIndex: s.dayIndex,
              weekId: s.weekId,
              weekIndex: s.weekIndex,
              phase: s.phase,
            }),
          });
        }}
        accessibilityRole="button"
        accessibilityLabel={`Treino de hoje: ${s.dayLabel}, ${s.exerciseCount} exercícios, cerca de ${s.estimatedMinutes} minutos. Toca para iniciar.`}
      >
        <View className="flex-row items-center gap-[7px]">
          <Sparkles size={16} color={colors.onPrimary} />
          <Text className="font-sans-bold text-[11px] tracking-widest" style={{ color: colors.onPrimary }}>TREINO DE HOJE</Text>
        </View>
        <Text className="mt-0.5 font-sans-extrabold text-xl" style={{ color: colors.onPrimary }} numberOfLines={1}>{s.dayLabel}</Text>
        <View className="mt-0.5 flex-row items-center gap-[5px]">
          <Clock size={13} color={colors.onPrimary} />
          <Text className="font-sans-semibold text-xs" style={{ color: colors.onPrimary }}>~{formatMinutes(s.estimatedMinutes)}</Text>
          <ListChecks size={13} color={colors.onPrimary} style={{ marginLeft: 10 }} />
          <Text className="font-sans-semibold text-xs" style={{ color: colors.onPrimary }}>{s.exerciseCount} exercícios</Text>
        </View>
        <View className="mt-2.5 flex-row items-center justify-center gap-2 rounded-xl py-3" style={{ backgroundColor: colors.onPrimary }}>
          <Play size={16} color={colors.primary} />
          <Text className="font-sans-bold text-[15px]" style={{ color: colors.primary }}>Iniciar Treino de Hoje</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (status.priority === 'completed' && status.completed) {
    const c = status.completed;
    return (
      <View
        className="min-h-[150px] gap-1.5 rounded-[18px] border p-[18px]"
        style={{ backgroundColor: colors.secondaryContainer, borderColor: colors.secondaryContainer }}
        accessibilityLabel={`Treino concluído: ${c.name}`}
      >
        <View className="flex-row items-center gap-[7px]">
          <View className="h-[22px] w-[22px] items-center justify-center rounded-full" style={{ backgroundColor: colors.secondary }}>
            <Check size={13} color={colors.onSecondary} />
          </View>
          <Text className="font-sans-bold text-[11px] tracking-widest" style={{ color: colors.text }}>CONCLUÍDO</Text>
        </View>
        <Text className="mt-0.5 font-sans-extrabold text-xl" style={{ color: colors.text }} numberOfLines={1}>{c.name}</Text>
        <Text className="font-sans text-[13px] leading-[18px]" style={{ color: colors.textSecondary }}>
          {c.totalSets} série{c.totalSets === 1 ? '' : 's'}
          {c.totalVolume > 0 ? ` · ${Math.round(c.totalVolume)} kg` : ''}
        </Text>
        <TouchableOpacity
          className="mt-2.5 flex-row items-center justify-center gap-2 rounded-xl py-3"
          style={{ backgroundColor: colors.primary }}
          onPress={() => {
            hapticSelect();
            router.push({ pathname: '/workout/active', params: { planId: 0, planName: 'Treino Livre' } });
          }}
          accessibilityRole="button"
          accessibilityLabel="Iniciar treino livre adicional"
        >
          <Dumbbell size={16} color={colors.onPrimary} />
          <Text className="font-sans-bold text-[15px]" style={{ color: colors.onPrimary }}>Treino Livre</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Rest day / no active plan.
  return (
    <View
      className="min-h-[150px] gap-1.5 rounded-[18px] border p-[18px]"
      style={{
        backgroundColor: colors.surfaceVariant,
        borderColor: isOled ? colors.primary + '33' : colors.border,
      }}
    >
      <Text className="mt-0.5 font-sans-extrabold text-xl" style={{ color: colors.text }}>Dia de descanso</Text>
      <Text className="font-sans text-[13px] leading-[18px]" style={{ color: colors.textSecondary }}>
        Nada agendado para hoje. Aproveita para recuperar, ou treina na mesma.
      </Text>
      <TouchableOpacity
        className="mt-2.5 flex-row items-center justify-center gap-2 rounded-xl py-3"
        style={{ backgroundColor: colors.primary }}
        onPress={() => {
          hapticSelect();
          router.push({ pathname: '/workout/active', params: { planId: 0, planName: 'Treino Livre' } });
        }}
        accessibilityRole="button"
        accessibilityLabel="Iniciar treino livre"
      >
        <Dumbbell size={16} color={colors.onPrimary} />
        <Text className="font-sans-bold text-[15px]" style={{ color: colors.onPrimary }}>Iniciar Treino Livre</Text>
      </TouchableOpacity>
    </View>
  );
}
