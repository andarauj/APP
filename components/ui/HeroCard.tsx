import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { AlertTriangle, Play, Sparkles, Dumbbell, Clock, ListChecks } from 'lucide-react-native';
import { formatTime } from '@/utils/format';
import { formatMinutes } from '@/utils/workoutTime';
import { hapticSelect } from '@/utils/haptics';
import type { TodayWorkoutStatus } from '@/hooks/useTodayWorkoutStatus';

/** Small filled circle that pulses — the only place in this card that
 *  moves, and only for the one state (a session genuinely running right
 *  now) where "this is live" is worth signalling. */
function LiveDot({ color }: { color: string }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) })), -1, false);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.liveDot, { backgroundColor: color }, style]} />;
}

/** Fixed-height placeholder shown while useTodayWorkoutStatus resolves, so
 *  the hero card's arrival doesn't shove the rest of the dashboard down —
 *  same footprint as the real card regardless of which of the 4 states
 *  eventually renders. */
export function HeroCardSkeleton() {
  const { colors } = useTheme();
  return <View style={[styles.card, styles.skeleton, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]} />;
}

export function HeroCard({ status }: { status: TodayWorkoutStatus }) {
  const { colors } = useTheme();
  const router = useRouter();

  if (!status.loaded) return <HeroCardSkeleton />;

  if (status.priority === 'active' && status.active) {
    const a = status.active;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.accentContainer, borderColor: colors.accentContainer }]}
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
        <View style={styles.headerRow}>
          <LiveDot color={colors.accent} />
          <Text style={[styles.eyebrow, { color: colors.text }]}>EM CURSO</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{a.name}</Text>
        <Text style={[styles.subtitle, { color: colors.text }]} numberOfLines={1}>
          {formatTime(a.elapsedSeconds)}{a.currentExerciseName ? ` · ${a.currentExerciseName}` : ''} · {a.completedSets} série{a.completedSets === 1 ? '' : 's'}
        </Text>
        <View style={[styles.ctaBtn, { backgroundColor: colors.accent }]}>
          <Play size={16} color={colors.onAccent} />
          <Text style={[styles.ctaText, { color: colors.onAccent }]}>Retomar Treino</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (status.priority === 'overdue' && status.scheduled) {
    const s = status.scheduled;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.errorContainer, borderColor: colors.errorContainer }]}
        activeOpacity={0.85}
        onPress={() => {
          hapticSelect();
          router.push({ pathname: '/workout/active', params: { planId: String(s.planId), planName: `${s.planName} · ${s.dayLabel}`, dayIndex: String(s.dayIndex) } });
        }}
        accessibilityRole="button"
        accessibilityLabel={`Treino em atraso: ${s.dayLabel}, ${s.muscles.join(', ')}. Toca para recuperar.`}
      >
        {/* BUGFIX (WCAG AA audit): colors.error itself measures only
            ~2.97:1 against errorContainer — under even the 3:1 icon
            threshold, let alone 4.5:1 for text. The icon gets its own
            small solid-error badge instead (white-on-solid-error clears
            3:1), and all text here uses colors.text, not colors.error or
            colors.textSecondary (textSecondary measures ~2.7:1 on this
            background — also a fail). */}
        <View style={styles.headerRow}>
          <View style={[styles.iconBadge, { backgroundColor: colors.error }]}>
            <AlertTriangle size={13} color={colors.onError} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.text }]}>TREINO EM ATRASO</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{s.dayLabel}</Text>
        <Text style={[styles.subtitle, { color: colors.text }]} numberOfLines={1}>
          {s.muscles.join(', ')}
        </Text>
        {/* onError-on-solid-error is ~3.5:1 — fails 4.5:1 for normal text,
            but clears 3:1 for "large text" (≥18.66dp bold per WCAG 1.4.3),
            which is why this label alone is sized up from the other CTAs. */}
        <View style={[styles.ctaBtn, { backgroundColor: colors.error }]}>
          <Play size={18} color={colors.onError} />
          <Text style={[styles.ctaText, styles.ctaTextLarge, { color: colors.onError }]}>Recuperar Treino</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (status.priority === 'today' && status.scheduled) {
    const s = status.scheduled;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.primary, borderColor: colors.primary }]}
        activeOpacity={0.85}
        onPress={() => {
          hapticSelect();
          router.push({ pathname: '/workout/active', params: { planId: String(s.planId), planName: `${s.planName} · ${s.dayLabel}`, dayIndex: String(s.dayIndex) } });
        }}
        accessibilityRole="button"
        accessibilityLabel={`Treino de hoje: ${s.dayLabel}, ${s.exerciseCount} exercícios, cerca de ${s.estimatedMinutes} minutos. Toca para iniciar.`}
      >
        <View style={styles.headerRow}>
          <Sparkles size={16} color={colors.onPrimary} />
          <Text style={[styles.eyebrow, { color: colors.onPrimary }]}>TREINO DE HOJE</Text>
        </View>
        <Text style={[styles.title, { color: colors.onPrimary }]} numberOfLines={1}>{s.dayLabel}</Text>
        <View style={styles.metaRow}>
          <Clock size={13} color={colors.onPrimary} />
          <Text style={[styles.metaText, { color: colors.onPrimary }]}>~{formatMinutes(s.estimatedMinutes)}</Text>
          <ListChecks size={13} color={colors.onPrimary} style={{ marginLeft: 10 }} />
          <Text style={[styles.metaText, { color: colors.onPrimary }]}>{s.exerciseCount} exercícios</Text>
        </View>
        <View style={[styles.ctaBtn, { backgroundColor: colors.onPrimary }]}>
          <Play size={16} color={colors.primary} />
          <Text style={[styles.ctaText, { color: colors.primary }]}>Iniciar Treino de Hoje</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Rest day / no active plan.
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>Dia de descanso</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Nada agendado para hoje. Aproveita para recuperar, ou treina na mesma.
      </Text>
      <TouchableOpacity
        style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
        onPress={() => {
          hapticSelect();
          router.push({ pathname: '/workout/active', params: { planId: 0, planName: 'Treino Livre' } });
        }}
        accessibilityRole="button"
        accessibilityLabel="Iniciar treino livre"
      >
        <Dumbbell size={16} color={colors.onPrimary} />
        <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Iniciar Treino Livre</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 18, borderWidth: 1, gap: 6, minHeight: 150 },
  skeleton: { minHeight: 150 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  iconBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: 'Inter-Bold', fontSize: 11, letterSpacing: 1 },
  title: { fontFamily: 'Inter-ExtraBold', fontSize: 20, marginTop: 2 },
  subtitle: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  metaText: { fontFamily: 'Inter-SemiBold', fontSize: 12 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, marginTop: 10 },
  ctaText: { fontFamily: 'Inter-Bold', fontSize: 15 },
  ctaTextLarge: { fontSize: 19 },
});
