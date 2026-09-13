import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, FlatList, Modal, Platform, Vibration, BackHandler, KeyboardAvoidingView, Keyboard } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedReaction, withSequence, withTiming, withSpring, ZoomIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useAppMode } from '@/hooks/useAppMode';
import { useActiveWorkout, remainingRestSeconds, resumeRestSeed } from '@/hooks/useActiveWorkout';
import { useStopwatch, useCountdown } from '@/hooks/useTimers';
import { getPlanExercisesWithDetails } from '@/db/planDao';
import { getAdaptiveStatus } from '@/utils/adaptiveService';
import { getExerciseStates, getWeekById, type AdaptiveExerciseStateRow } from '@/db/adaptiveDao';
import { applySnapshotToPlanExercises } from '@/utils/plannedWorkout';
import { parsePlannedDays } from '@/utils/mesocycleMaterialize';
import { PHASE_LABEL_PT, PHASE_COLOR, phaseSpec } from '@/utils/adaptivePlan';
import type { AdaptiveGoal, AdaptivePhase } from '@/utils/nspi';
import { createSession, updateSession, discardSession, addSet, updateWorkoutSet, getLastSetForExercise, getLastSessionSetsByIndex, getHistoricalRpeAtWeight , getProgressionSuggestion, getSessionTemplate, getSessionById, getSessionSetsWithExercise } from '@/db/workoutDao';
import { searchExercises, getAlternativeExercises, setExerciseUserNotes } from '@/db/exerciseDao';
import { getSettingWithDefault, DEFAULT_SETTINGS } from '@/db/settingsDao';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { scheduleRestEndNotification, cancelRestEndNotification } from '@/utils/restNotification';
import type { Exercise, SetType, MuscleGroup, Equipment } from '@/types';
import { MUSCLE_GROUPS_PT, EQUIPMENT_PT, SET_TYPE_PT } from '@/types';
import type { Theme } from '@/constants/colors';
import { nextSetType, setTypeBadgeLabel, REST_PRESETS_SECONDS, adjustRestRemaining, normalizeRepsTarget, parseLoggedReps, plannedSetType } from '@/utils/workoutSetUi';
import { SearchBar } from '@/components/ui/SearchBar';
import { ExerciseTile } from '@/components/ui/ExerciseTile';
import { formatTime, formatVolume } from '@/utils/format';
import { setVolume, shouldPreferRepsKpi } from '@/utils/loadVolume';
import { getLatestBodyWeightKg } from '@/db/bodyMetricsDao';
import { parseTempo, calculatePlates, calculate1RM } from '@/utils/calculators';
import { hapticTap, hapticSuccess, hapticWarning, hapticSelect } from '@/utils/haptics';
import { playRestEndSound } from '@/utils/sound';
import { findSupersetPartner } from '@/utils/supersets';
import { isSetLocked } from '@/utils/setLocking';
import { restSecondsFor } from '@/utils/planGenerator';
import { formatRirHint } from '@/utils/trainingDose';
import { suggestSetAdjustment, type AutoRegulationSuggestion } from '@/utils/autoRegulation';
import { moveExerciseInSession } from '@/utils/workoutSessionUtils';
import { TempoMetronomeBox } from '@/components/workout/TempoMetronomeBox';
import { RestRing } from '@/components/ui/RestRing';
import { generateLiveCoachingTips, type CoachingTip } from '@/utils/livCoachingTips';
import { LiveCoachingStack } from '@/components/ui/LiveCoachingTip';
import { X, Plus, Check, Timer, RotateCcw, ChevronDown, ChevronUp, Trophy, StickyNote, Repeat, TrendingUp, Pause, Play, Gauge, Star, Lock, ArrowUp, ArrowDown } from 'lucide-react-native';
import { ExerciseMedia } from '@/components/ui/ExerciseMedia';

interface ActiveExercise {
  planExerciseId?: number;
  exerciseId: number;
  name: string;
  primaryMuscle: string;
  equipment: string;
  sets: {
    reps: string; weight: string; rpe: number | null; setType: SetType; done: boolean; isPr?: boolean;
    /** workout_sets.id once logged — needed to persist a correction made
     *  after the fact (see updateWorkoutSet in db/workoutDao.ts). */
    dbId?: number | null;
    /** What THIS set position (same set_index) actually was last session —
     *  see getLastSessionSetsByIndex. The ANTERIOR column reads these, not
     *  reps/weight above, which are the live editable fields for the set
     *  being logged right now and would otherwise echo back whatever the
     *  person just typed instead of showing real history. Undefined for a
     *  set with no prior-session counterpart (e.g. manually added beyond
     *  what was logged last time) — rendered as "–". */
    previousReps?: string;
    previousWeight?: string;
  }[];
  defaultSets: number;
  defaultRepsTarget: string;
  defaultWeight: number;
  restSeconds: number;
  /** Rep cadence like "3-1-2-0" (down-pause-up-pause, seconds). */
  tempo?: string;
  expanded: boolean;
  /** Sticky notes the user keeps for this exercise (grip, seat position...). */
  userNotes?: string;
  /** Double-progression hint based on the previous session. */
  progression?: { suggestedWeight: number; reason: string } | null;
  /** Exercises sharing this value are a superset — see completeSet's
   *  pairing logic below for what that actually changes during execution. */
  supersetGroup?: number | null;
  /** Illustration for the movement, when the exercise row has one. */
  imageUrl?: string;
  /** Prescribed RIR for this exercise (logged effort stays RPE). */
  targetRir?: number | null;
}

const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

/** Material OLED surfaces for the gym floor — true black + elevated cards. */
const WORKOUT_OLED = {
  background: '#000000',
  surface: '#121212',
  surfaceVariant: '#1E1E1E',
  surfaceHighlight: '#2A2A2A',
  text: '#FFFFFF',
  textSecondary: '#D0D0D0',
  textTertiary: '#8E8E8E',
  border: '#2C2C2C',
  borderLight: '#3A3A3A',
  chip: '#1E1E1E',
  primary: '#3D8BFF',
  primaryContainer: '#15305F',
  onPrimary: '#FFFFFF',
  rest: '#3D8BFF',
  secondary: '#22C55E',
  success: '#22C55E',
  secondaryContainer: '#0E3A22',
  onSecondary: '#04150C',
  overlay: 'rgba(0,0,0,0.78)',
} as const;

const REST_BAR_RESERVE = 96;
const PROGRESS_BAR_RESERVE = 58;

/** Row shape returned by db/workoutDao.ts's getSessionSetsWithExercise. */
interface LoggedSetRow {
  id: number; exercise_id: number; set_index: number; reps: number; weight: number;
  rpe: number | null; set_type: SetType; is_pr: number;
  exercise_name: string; primary_muscle: string; equipment: string;
}

/**
 * Rebuilds one exercise card entirely from what's already logged for it —
 * used when resuming a session for an exercise that isn't part of the
 * plan day being loaded (added manually via "Adicionar Exercício" before
 * the session was minimized or interrupted, or the exercise list of a
 * "Treino Livre" session that had no plan at all). Every set it produces
 * is done:true, since by definition every row here came from a completed
 * addSet() call — there is nothing "next" to suggest weight/reps for.
 */
function rebuildExerciseFromLoggedSets(exerciseId: number, sets: LoggedSetRow[], expanded: boolean): ActiveExercise {
  const sorted = [...sets].sort((a, b) => a.set_index - b.set_index);
  const first = sorted[0];
  return {
    exerciseId,
    name: first.exercise_name,
    primaryMuscle: first.primary_muscle,
    equipment: first.equipment,
    sets: sorted.map(s => ({
      reps: String(s.reps), weight: String(s.weight), rpe: s.rpe,
      setType: s.set_type, done: true, dbId: s.id, isPr: !!s.is_pr,
    })),
    defaultSets: sorted.length,
    defaultRepsTarget: String(first.reps),
    defaultWeight: first.weight,
    restSeconds: Number(DEFAULT_SETTINGS.defaultRestSeconds),
    expanded,
    imageUrl: '',
  };
}

export default function ActiveWorkoutScreen() {
  const { planId, planName, dayIndex, weekId, phase, repeatSessionId, resumeSessionId, resumeRestEndsAtMs, resumeRestRingSeconds } = useLocalSearchParams<{
    planId: string; planName: string; dayIndex?: string; weekId?: string; weekIndex?: string; phase?: string;
    repeatSessionId?: string;
    resumeSessionId?: string; resumeRestEndsAtMs?: string; resumeRestRingSeconds?: string;
  }>();
  const { colors: themeColors } = useTheme();
  const colors = useMemo<Theme>(() => ({ ...themeColors, ...WORKOUT_OLED }), [themeColors]);
  const { isSimple } = useAppMode();
  const router = useRouter();
  const { minimize, clearMinimized, minimized } = useActiveWorkout();

  // Capture rest deadline before clearing the mini-player snapshot so expand
  // resumes mid-countdown instead of resetting FloatingRestBar to full duration.
  // Prefer the route param (set by the mini-player) then the live context.
  // Locked in a ref so clearMinimized() on mount doesn't wipe the value on
  // the next render before FloatingRestBar reads it.
  // `ring` is the original rest length (denominator for RestRing fill).
  const resumedRestRef = useRef<{ endsAt: number; left: number; ring: number } | null>(null);
  if (resumedRestRef.current === null) {
    const fromParam = resumeRestEndsAtMs ? Number(resumeRestEndsAtMs) : NaN;
    const ringFromParam = resumeRestRingSeconds ? Number(resumeRestRingSeconds) : NaN;
    let endsAt: number | null = null;
    let ringHint: number | null = Number.isFinite(ringFromParam) && ringFromParam > 0 ? ringFromParam : null;
    if (Number.isFinite(fromParam) && fromParam > 0) endsAt = fromParam;
    else if (
      resumeSessionId
      && minimized
      && String(minimized.sessionId) === String(resumeSessionId)
      && minimized.restEndsAtMs != null
    ) {
      endsAt = minimized.restEndsAtMs;
      if (ringHint == null && minimized.restRingSeconds != null) ringHint = minimized.restRingSeconds;
    }
    resumedRestRef.current = resumeRestSeed(endsAt, ringHint);
  }
  const resumedRest = resumedRestRef.current;

  // Being on this screen at all — fresh start or resumed — means the
  // session is no longer minimized, regardless of how it got here (tapping
  // the mini-player already clears this itself, but a deep link or the
  // recovery banner's "Continuar Treino" don't go through that).
  useEffect(() => {
    clearMinimized();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [exercises, setExercises] = useState<ActiveExercise[]>([]);
  const [restActive, setRestActive] = useState(() => resumedRest != null);
  const [restDuration, setRestDuration] = useState(() =>
    resumedRest?.left ?? Number(DEFAULT_SETTINGS.defaultRestSeconds)
  );
  /** Wall-clock deadline for the active rest — survives minimize → mini-player. */
  const [restEndsAtMs, setRestEndsAtMs] = useState<number | null>(() =>
    resumedRest?.endsAt ?? null
  );
  /** RestRing denominator — kept across minimize so mid-rest expand isn't 42/42. */
  const [restRingSeconds, setRestRingSeconds] = useState(() =>
    resumedRest?.ring ?? resumedRest?.left ?? Number(DEFAULT_SETTINGS.defaultRestSeconds)
  );
  const [setTimerActive, setSetTimerActive] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<Exercise[]>([]);
  const [newPrs, setNewPrs] = useState<string[]>([]);
  // Which exercise (if any) should be visually highlighted as "do this next"
  // right after completing a superset partner's set — see completeSet.
  const [supersetFocusIdx, setSupersetFocusIdx] = useState<number | null>(null);
  const [adjustmentSuggestion, setAdjustmentSuggestion] = useState<{
    exerciseName: string; exIdx: number; weight: number; suggestion: AutoRegulationSuggestion;
  } | null>(null);
  // BUGFIX: the PR-badge auto-clear timer had no cleanup — if the workout
  // screen unmounted (finished/cancelled) within 3s of hitting a PR, the
  // timeout still fired afterwards and called setState on an unmounted
  // screen. Tracking pending timers so they can all be cleared on unmount.
  const prTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    // Read the Set once, on mount, rather than through the ref at cleanup
    // time. The ref could in principle point at a different Set by then, and
    // the cleanup would clear the wrong one — leaving the real timers to fire
    // against an unmounted screen, which is the exact bug this guards.
    const timers = prTimersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);
  const [showFinish, setShowFinish] = useState(false);
  // The "Vibração" and "Manter ecrã ligado" settings existed in the UI but were
  // never read — the rest timer always vibrated and the screen always dimmed
  // mid-workout. They are now honoured.
  const [tempoRunningFor, setTempoRunningFor] = useState<number | null>(null);
  const [substituteFor, setSubstituteFor] = useState<number | null>(null);
  const [alternatives, setAlternatives] = useState<Exercise[]>([]);
  const [editingNotesFor, setEditingNotesFor] = useState<number | null>(null);
  /** Exercise whose illustration is open in the modal, if any. */
  const [demoFor, setDemoFor] = useState<{ name: string; url: string } | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [vibrateEnabled, setVibrateEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [keepAwake, setKeepAwake] = useState(true);
  const [restRemindersEnabled, setRestRemindersEnabled] = useState(true);
  const [coachingTips, setCoachingTips] = useState<CoachingTip[]>([]);
  const [coachingExerciseIdx, setCoachingExerciseIdx] = useState<number | null>(null);
  const [userBodyweightKg, setUserBodyweightKg] = useState<number | null>(null);

  // BUGFIX (reported: weight/reps for an exercise near the end of a long
  // workout were unreadable, hidden under the keyboard): KeyboardAvoidingView
  // shrinking the list (see 'height' behavior below) helps, but doesn't by
  // itself guarantee the specific field being typed into ends up above the
  // keyboard — a field already near the bottom edge can still land behind it.
  // This tracks the current scroll offset and, whichever set-row input was
  // last focused, nudges the list up just enough to clear the keyboard once
  // it finishes animating in.
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const focusedInputRef = useRef<TextInput | null>(null);
  // Stable identity (a ref write closes over nothing) — passed to every
  // SetRow as onFocusInput; an inline arrow at the call site would get a
  // fresh identity every render of the parent, silently defeating SetRow's
  // memo() below for every row, every time.
  const handleFocusInput = useCallback((ref: TextInput | null) => { focusedInputRef.current = ref; }, []);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', (e) => {
      const input = focusedInputRef.current;
      if (!input) return;
      input.measureInWindow((_x: number, y: number, _width: number, height: number) => {
        const keyboardTop = e.endCoordinates.screenY;
        const inputBottom = y + height;
        const overlap = inputBottom - keyboardTop;
        if (overlap > 0) {
          scrollViewRef.current?.scrollTo({ y: scrollOffsetRef.current + overlap + 24, animated: true });
        }
      });
    });
    return () => sub.remove();
  }, []);

  // Adaptive engine ("porquê este alvo" — NSPI_ENGINE.md §7). Purely
  // additive and read-only: a separate effect from init() below so it can
  // never affect session creation or set logging even if it fails. Only
  // populated when this workout's plan is the one the NSPI engine is
  // actively periodizing.
  const [adaptiveInfo, setAdaptiveInfo] = useState<{
    phase: AdaptivePhase; goal: AdaptiveGoal; states: Map<number, AdaptiveExerciseStateRow>;
  } | null>(null);
  const [whyTargetFor, setWhyTargetFor] = useState<number | null>(null);
  useEffect(() => {
    if (!(Number(planId) > 0)) return;
    let mounted = true;
    (async () => {
      try {
        const status = await getAdaptiveStatus();
        if (!status || !status.active || status.planId !== Number(planId)) return;
        const states = await getExerciseStates(status.adaptivePlanId);
        if (!mounted) return;
        setAdaptiveInfo({
          phase: status.phase,
          goal: status.goal,
          states: new Map(states.map(s => [s.exercise_id, s])),
        });
      } catch (err) {
        console.error('[adaptive] failed to load "porquê este alvo" info:', err);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Total workout timer
  // The total workout timer previously ran unconditionally (useStopwatch(true)
  // with no way to pause it) — "não consigo pausar" was a real gap, not a
  // misunderstanding. useStopwatch already supported a controllable `running`
  // flag; it just wasn't wired to anything in the UI.
  const [workoutPaused, setWorkoutPaused] = useState(false);
  const { elapsed: totalElapsed, setBase: setTotalElapsedBase } = useStopwatch(!workoutPaused);

  // Rest timer — PERF: the countdown itself (useCountdown, ticking every
  // 250ms) used to be called directly here, in ActiveWorkoutScreen's own
  // body. Every tick re-rendered this entire screen — the full exercise
  // list, every SetRow's memo() included, since a state update in a parent
  // re-renders its whole subtree regardless of whether children's props
  // actually changed. It now lives inside FloatingRestBar (below), a
  // sibling component that renders only the floating bar itself, so a tick
  // only re-renders that small subtree. This screen only keeps the coarse,
  // infrequently-changing bits: whether a rest is active at all, and its
  // target duration — both flip once per rest, not four times a second.
  // restResetToken exists for the same reason useCountdown's own reset()
  // does (see FloatingRestBar's effect that calls it): completing a set
  // while the PREVIOUS rest is still actively counting down (very common —
  // nobody waits out the full timer every time) means `restActive` never
  // has a false→true transition to key a restart off of, so an explicit
  // bump is the only reliable "start a fresh rest now" signal.
  const [restResetToken, setRestResetToken] = useState(0);
  const onRestComplete = useCallback(() => {
    if (vibrateEnabled) Vibration.vibrate([0, 300, 100, 300]);
    if (soundEnabled) playRestEndSound();
    // The app is open and already alerting — the scheduled notification for
    // this same rest period becoming redundant, cancel it so it doesn't also
    // pop up a few seconds later (harmless if it already fired, but avoids
    // a lingering duplicate alert while the app is in the foreground).
    cancelRestEndNotification().catch(() => {});
    setRestEndsAtMs(null);
    setRestActive(false);
  }, [vibrateEnabled, soundEnabled]);

  // Set timer
  const { elapsed: setElapsed, reset: resetSetTimer } = useStopwatch(setTimerActive);

  // PERF: the tempo metronome used to live here (top-level screen state),
  // ticking its phase/countdown every 100ms — 10 times a second, this whole
  // 1000+ line screen re-rendered, including every exercise card, every set
  // row, every input. It's now isolated into its own TempoMetronomeBox
  // component below, so only that small box re-renders on each tick; the
  // rest of the screen (and its own render cost) is untouched while a
  // cadence is running.

  // init loads the session once on mount. It closes over route params that
  // do not change for the life of this screen, and re-running it would
  // restart the workout in progress — so the empty dependency array is
  // deliberate rather than an oversight.
  useEffect(() => {
    init();
    getLatestBodyWeightKg().then(setUserBodyweightKg).catch(() => setUserBodyweightKg(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the screen on during a workout when enabled, and always release the
  // lock when leaving the screen so it doesn't drain the battery afterwards.
  useEffect(() => {
    let active = false;
    if (keepAwake) {
      activateKeepAwakeAsync('changes-workout').then(() => { active = true; }).catch(() => {});
    }
    return () => {
      if (active) {
        try { deactivateKeepAwake('changes-workout'); } catch {}
      }
    };
  }, [keepAwake]);

  const pickerSeq = useRef(0);
  useEffect(() => {
    if (!showAddExercise) return;
    // BUGFIX: see app/plan/create.tsx — no request sequencing or error
    // handling meant a slower, stale result could silently overwrite the
    // correct current one.
    const seq = ++pickerSeq.current;
    searchExercises(pickerQuery)
      .then(results => { if (seq === pickerSeq.current) setPickerResults(results); })
      .catch(err => {
        console.error('Failed to search exercises:', err);
        if (seq === pickerSeq.current) setPickerResults([]);
      });
  }, [pickerQuery, showAddExercise]);

  const init = async () => {
    const defaultRest = await getSettingWithDefault('defaultRestSeconds', DEFAULT_SETTINGS.defaultRestSeconds);
    // CRITICAL: never overwrite restDuration while mid-rest expand is active.
    // restEndsAtMs / FloatingRestBar.bindEndsAtMs are the source of truth for
    // the countdown; defaultRest only seeds a *new* rest when there is none.
    // Overwriting duration while useCountdown had a live endTimeRef used to
    // fight the deadline (freeze or jump to full default after minimize→expand).
    if (resumedRestRef.current == null) {
      setRestDuration(parseInt(defaultRest));
    }
    setVibrateEnabled(await getSettingWithDefault('vibrateEnabled', '1') === '1');
    setSoundEnabled(await getSettingWithDefault('soundEnabled', '1') === '1');
    setRestRemindersEnabled(await getSettingWithDefault('restNotifyEnabled', '1') === '1');
    setKeepAwake(await getSettingWithDefault('keepScreenAwake', '1') === '1');

    // Resuming an existing, still-open session (the recovery flow in
    // app/(tabs)/start.tsx, or the minimized mini-player) reuses its row
    // and reloads whatever was already logged for it, instead of
    // createSession() starting a brand new one — that's the whole point of
    // "continue where I left off" rather than "start over from scratch".
    const routeDayIndex = dayIndex !== undefined && dayIndex !== '' ? Number(dayIndex) : null;
    let sid: number;
    // Which plan day to reload — the resumed session's own day_index when
    // resuming (it may differ from whatever this route happened to be
    // opened with), otherwise the route's own param.
    let effectiveDayIndex = routeDayIndex;
    let resumedSets: Awaited<ReturnType<typeof getSessionSetsWithExercise>> = [];
    let originWeekId = weekId ? Number(weekId) : null;
    const originPhase = typeof phase === 'string' && phase.length > 0 ? phase : null;
    if (resumeSessionId) {
      const existing = await getSessionById(Number(resumeSessionId));
      if (existing && !existing.ended_at) {
        sid = existing.id;
        effectiveDayIndex = existing.day_index;
        originWeekId = existing.adaptive_week_id ?? originWeekId;
        resumedSets = await getSessionSetsWithExercise(sid);
        // Jump the clock straight to the last checkpoint instead of
        // recomputing from started_at — see useStopwatch's setBase comment
        // for why that would inflate the duration with absence time.
        if (existing.total_duration > 0) setTotalElapsedBase(existing.total_duration);
      } else {
        // The session vanished, or was already finished elsewhere (e.g.
        // "Concluir o que foi feito" from the recovery banner) between
        // navigating here and this screen mounting — fall back to a
        // normal fresh start rather than resuming nothing.
        sid = await createSession(planName || 'Treino', Number(planId) || null, routeDayIndex, {
          adaptiveWeekId: originWeekId,
          phase: originPhase,
        });
      }
    } else {
      sid = await createSession(planName || 'Treino', Number(planId) || null, routeDayIndex, {
        adaptiveWeekId: originWeekId,
        phase: originPhase,
      });
    }
    setSessionId(sid);

    // Repeat a previous session: rebuild the same exercises and set counts,
    // pre-filled with the loads used last time.
    if (repeatSessionId) {
      const template = await getSessionTemplate(Number(repeatSessionId));
      const repeated: ActiveExercise[] = await Promise.all(template.map(async (t, i) => {
        const progression = await getProgressionSuggestion(t.exercise_id, String(t.reps));
        const previousByIndex = await getLastSessionSetsByIndex(t.exercise_id);
        // BUGFIX (found in a self-audit after a real gap was reported): the
        // suggested weight was already computed here, but only ever shown
        // as the informational "Sobe para Xkg" text — the actual weight
        // FIELD stayed at last session's number regardless, unlike loading
        // from a plan or generating an extra exercise, where the field
        // itself is pre-filled with the progression suggestion. Same
        // underlying data, same suggestion — no reason this one path
        // should behave differently from the other two.
        const weight = progression?.shouldProgress ? String(progression.suggestedWeight) : String(t.weight);
        return {
          exerciseId: t.exercise_id,
          name: t.name,
          primaryMuscle: t.primary_muscle,
          equipment: t.equipment,
          sets: Array.from({ length: t.sets }, (_, si) => ({
            reps: String(t.reps),
            weight,
            rpe: null,
            setType: 'normal' as SetType,
            done: false,
            previousReps: previousByIndex[si] ? String(previousByIndex[si].reps) : undefined,
            previousWeight: previousByIndex[si] ? String(previousByIndex[si].weight) : undefined,
          })),
          defaultSets: t.sets,
          defaultRepsTarget: String(t.reps),
          defaultWeight: t.weight,
          restSeconds: t.rest_seconds,
          // Only the first card opens automatically — with every exercise
          // expanded at once the screen was one long undifferentiated
          // scroll, and it was hard to tell which one you were actually on.
          // Tapping any header still expands/collapses it.
          expanded: i === 0,
          userNotes: '',
          progression: progression?.shouldProgress
            ? { suggestedWeight: progression.suggestedWeight, reason: progression.reason }
            : null,
          imageUrl: t.image_url || '',
        };
      }));
      setExercises(repeated);
      return;
    }

    // Sets already logged for the resumed session, grouped by exercise —
    // consumed (and removed from this map) as each plan exercise below
    // claims its own; whatever's left afterward was added manually mid-
    // workout (not part of this plan day) and gets appended as its own
    // card via rebuildExerciseFromLoggedSets so it isn't silently dropped.
    const resumedByExercise = new Map<number, typeof resumedSets>();
    for (const s of resumedSets) {
      const list = resumedByExercise.get(s.exercise_id) ?? [];
      list.push(s);
      resumedByExercise.set(s.exercise_id, list);
    }

    if (Number(planId) > 0) {
      let allPlanExs = await getPlanExercisesWithDetails(Number(planId));
      let fromSnapshot = false;
      if (originWeekId) {
        const plannedWeek = await getWeekById(originWeekId);
        const snapDay = plannedWeek
          ? parsePlannedDays(plannedWeek.planned_json).find(d =>
            effectiveDayIndex === null || Number(d.dayIndex) === Number(effectiveDayIndex))
          : null;
        if (snapDay && snapDay.exercises.length > 0) {
          allPlanExs = applySnapshotToPlanExercises(allPlanExs, snapDay);
          fromSnapshot = true;
        }
      }
      // Load only the selected training day. Without this, starting a workout
      // from a multi-day plan queued up every exercise of every day at once.
      // effectiveDayIndex (not the raw route param) so a resumed session
      // reloads the day it actually was — not whatever this route happened
      // to be opened with (the mini-player/recovery banner navigate here
      // with no dayIndex at all, since only the session id is known then).
      const planExs = effectiveDayIndex !== null
        ? allPlanExs.filter(pe => (pe.day_index ?? 0) === effectiveDayIndex)
        : allPlanExs;
      const activeExs: ActiveExercise[] = await Promise.all(
        planExs.map(async (pe, i) => {
          const lastSet = await getLastSetForExercise(pe.exercise_id);
          const previousByIndex = await getLastSessionSetsByIndex(pe.exercise_id);
          const reps = normalizeRepsTarget(pe.reps_target);
          const setType = plannedSetType(pe.set_type);
          const progression = fromSnapshot ? null : await getProgressionSuggestion(pe.exercise_id, reps);
          // Planned-week snapshots are the prescription for that week — do
          // not overlay last-session double-progression on top of them.
          const weight = fromSnapshot
            ? String(pe.weight_target || 0)
            : progression?.shouldProgress
              ? String(progression.suggestedWeight)
              : lastSet ? String(lastSet.weight) : String(pe.weight_target || 0);
          const resumedForThisExercise = resumedByExercise.get(pe.exercise_id) ?? [];
          resumedByExercise.delete(pe.exercise_id);
          const resumedByIndex = new Map(resumedForThisExercise.map(s => [s.set_index, s]));
          // At least the plan's own set count, but stretched to cover any
          // logged set beyond it too (e.g. an extra set added before the
          // session was minimized) — otherwise that set's own progress
          // would silently fall off the end of the array on resume.
          const setCount = resumedForThisExercise.length
            ? Math.max(pe.sets, Math.max(...resumedForThisExercise.map(s => s.set_index)) + 1)
            : pe.sets;
          return {
            planExerciseId: pe.id,
            exerciseId: pe.exercise_id,
            name: pe.exercise_name,
            primaryMuscle: pe.primary_muscle,
            equipment: pe.equipment,
            sets: Array.from({ length: setCount }, (_, si) => {
              const resumed = resumedByIndex.get(si);
              if (resumed) {
                return {
                  reps: String(resumed.reps), weight: String(resumed.weight), rpe: resumed.rpe,
                  setType: resumed.set_type as SetType, done: true, dbId: resumed.id, isPr: !!resumed.is_pr,
                  previousReps: previousByIndex[si] ? String(previousByIndex[si].reps) : undefined,
                  previousWeight: previousByIndex[si] ? String(previousByIndex[si].weight) : undefined,
                };
              }
              return {
                reps, weight, rpe: null, setType, done: false,
                previousReps: previousByIndex[si] ? String(previousByIndex[si].reps) : undefined,
                previousWeight: previousByIndex[si] ? String(previousByIndex[si].weight) : undefined,
              };
            }),
            defaultSets: pe.sets,
            defaultRepsTarget: reps,
            defaultWeight: pe.weight_target,
            restSeconds: pe.rest_seconds,
            tempo: pe.tempo || '',
            // Only the first card opens automatically — see the matching
            // comment on the "repeat session" branch above for why.
            expanded: i === 0,
            userNotes: pe.user_notes || '',
            progression: progression?.shouldProgress
              ? { suggestedWeight: progression.suggestedWeight, reason: progression.reason }
              : null,
            supersetGroup: pe.superset_group ?? null,
            imageUrl: pe.image_url || '',
            targetRir: pe.target_rir ?? null,
          };
        })
      );
      const extraExs = Array.from(resumedByExercise.entries()).map(([exerciseId, sets]) =>
        rebuildExerciseFromLoggedSets(exerciseId, sets, false)
      );
      setExercises([...activeExs, ...extraExs]);
    } else if (resumedSets.length > 0) {
      // A "Treino Livre" (no plan) session that was minimized/interrupted —
      // every exercise in it was necessarily added manually, so the whole
      // list is reconstructed straight from what's logged, the same way an
      // unplanned extra exercise is handled above.
      setExercises(
        Array.from(resumedByExercise.entries()).map(([exerciseId, sets], i) =>
          rebuildExerciseFromLoggedSets(exerciseId, sets, i === 0)
        )
      );
    }
  };

  const openSubstitute = async (exIdx: number) => {
    const alts = await getAlternativeExercises(exercises[exIdx].exerciseId);
    setAlternatives(alts);
    setSubstituteFor(exIdx);
  };

  /** Swaps an exercise for an alternative, keeping the planned set structure. */
  const applySubstitute = async (alt: Exercise) => {
    if (substituteFor === null) return;
    const idx = substituteFor;
    const lastSet = await getLastSetForExercise(alt.id);
    const previousByIndex = await getLastSessionSetsByIndex(alt.id);
    setExercises(prev => prev.map((e, i) => i === idx ? {
      ...e,
      exerciseId: alt.id,
      name: alt.name,
      primaryMuscle: alt.primary_muscle,
      equipment: alt.equipment,
      userNotes: alt.user_notes || '',
      progression: null,
      imageUrl: alt.image_url || '',
      // Keep the same number of sets, but reset loads — and ANTERIOR's
      // history — to this (substituted) exercise's own, rather than
      // carrying over the exercise it replaced.
      sets: e.sets.map((s, si) => ({
        ...s,
        weight: s.done ? s.weight : (lastSet ? String(lastSet.weight) : '0'),
        previousReps: previousByIndex[si] ? String(previousByIndex[si].reps) : undefined,
        previousWeight: previousByIndex[si] ? String(previousByIndex[si].weight) : undefined,
      })),
    } : e));
    setSubstituteFor(null);
    setAlternatives([]);
  };

  const saveNotes = async (exIdx: number) => {
    const ex = exercises[exIdx];
    await setExerciseUserNotes(ex.exerciseId, notesDraft.trim());
    setExercises(prev => prev.map((e, i) => i === exIdx ? { ...e, userNotes: notesDraft.trim() } : e));
    setEditingNotesFor(null);
  };

  const addExerciseToWorkout = async (ex: Exercise) => {
    const lastSet = await getLastSetForExercise(ex.id);
    const previousByIndex = await getLastSessionSetsByIndex(ex.id);
    const defaultReps = normalizeRepsTarget('8-12');
    // BUGFIX: this used to only ever repeat the last weight used, never the
    // double-progression suggestion — an exercise loaded as part of a plan
    // already gets the "you hit the top of your rep range, try +2.5kg"
    // suggestion (see the planId branch above); adding the SAME exercise
    // manually or via "Gerar Exercício" silently skipped that, even when
    // real history for it already existed.
    const progression = await getProgressionSuggestion(ex.id, defaultReps);
    const weight = progression?.shouldProgress
      ? String(progression.suggestedWeight)
      : lastSet ? String(lastSet.weight) : '0';
    const reps = defaultReps;
    const newEx: ActiveExercise = {
      exerciseId: ex.id,
      name: ex.name,
      primaryMuscle: ex.primary_muscle,
      equipment: ex.equipment,
      sets: [{
        reps, weight, rpe: null, setType: 'normal', done: false,
        previousReps: previousByIndex[0] ? String(previousByIndex[0].reps) : undefined,
        previousWeight: previousByIndex[0] ? String(previousByIndex[0].weight) : undefined,
      }],
      defaultSets: 3,
      defaultRepsTarget: defaultReps,
      defaultWeight: lastSet?.weight || 0,
      // Grounded per-exercise default (see REST_INTERVAL_RESEARCH.md)
      // instead of inheriting restDuration, which is really just "whatever
      // the last completed exercise's rest happened to be" — an exercise
      // added mid-workout has no such history yet. 'hypertrophy' matches
      // the 8-12 rep default just above.
      restSeconds: restSecondsFor('hypertrophy', ex.name),
      expanded: true,
      progression: progression?.shouldProgress
        ? { suggestedWeight: progression.suggestedWeight, reason: progression.reason }
        : null,
      imageUrl: ex.image_url || '',
    };
    setExercises(prev => [...prev, newEx]);
    setShowAddExercise(false);
  };


  const addSetToExercise = (exIdx: number) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const last = ex.sets[ex.sets.length - 1];
      // BUGFIX: if every set had been removed, `last` was undefined and
      // spreading it silently produced a set missing reps/weight/setType
      // (object-spread of undefined is a no-op, not an error, so this went
      // unnoticed until the malformed row hit the UI). Fall back to the
      // exercise's planned defaults instead.
      const base = last ?? {
        reps: normalizeRepsTarget(ex.defaultRepsTarget),
        weight: String(ex.defaultWeight || 0),
        rpe: null,
        setType: 'normal' as SetType,
      };
      // previousReps/previousWeight belong to the set position being
      // copied from (`last`'s own history), not this new, extra set — an
      // added 4th set has no set-4 history to show, so ANTERIOR must read
      // "–" for it rather than echoing set 3's numbers.
      return { ...ex, sets: [...ex.sets, {
        ...base,
        reps: normalizeRepsTarget(ex.defaultRepsTarget || base.reps),
        setType: base.setType === 'warmup' ? 'normal' : base.setType,
        previousReps: undefined,
        previousWeight: undefined,
        done: false,
      }] };
    }));
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    const ex = exercises[exIdx];
    if (ex && ex.sets.length <= 1) {
      Alert.alert('Não é possível remover', 'Um exercício precisa de pelo menos uma série. Mantém premido o cabeçalho do exercício para o remover por completo.');
      return;
    }
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      // BUGFIX: removing the last remaining set left `sets: []`, which made
      // the exercise header read as "completed" (every() on an empty array
      // is vacuously true) and broke the next "add set" for that exercise.
      // An exercise always needs at least one set.
      if (ex.sets.length <= 1) return ex;
      return { ...ex, sets: ex.sets.filter((_, si) => si !== setIdx) };
    }));
  };

  /**
   * Removes an exercise from the active workout entirely. Only allowed before
   * any of its sets have been logged — completed sets are already written to
   * the database and counted in the session totals, so silently dropping them
   * from the list would hide saved data without actually deleting it.
   */
  const removeExerciseFromWorkout = (exIdx: number) => {
    const ex = exercises[exIdx];
    if (!ex) return;
    if (ex.sets.some(s => s.done)) {
      Alert.alert(
        'Não é possível remover',
        'Este exercício já tem séries registadas nesta sessão. Para o retirar do histórico, apaga o treino depois de o terminares.'
      );
      return;
    }
    Alert.alert('Remover exercício', `Remover "${ex.name}" deste treino?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: () => setExercises(prev => prev.filter((_, i) => i !== exIdx)),
      },
    ]);
  };

  // Purely a display-order change for whatever's left in this session —
  // nothing is written to plan_exercises, and moveExerciseInSession (see
  // utils/workoutSessionUtils.ts) never touches a set's own fields, so
  // every already-logged set (dbId, done, reps/weight) survives untouched.
  const moveExercise = (exIdx: number, direction: -1 | 1) => {
    hapticSelect();
    setExercises(prev => moveExerciseInSession(prev, exIdx, direction));
  };

  // Overloaded (not a single `field: string, value: any`) so a typo'd field
  // name is a compile error instead of silently adding a dead property to
  // the set and updating nothing on screen — and so 'rpe' can take its real
  // number | null value while 'reps'/'weight' stay the strings the text
  // inputs actually hold. The overload signatures live on the `as` cast
  // below rather than on a `function` declaration because this is wrapped
  // in useCallback (stable identity, empty deps — the updater closes over
  // nothing but its own arguments) so SetRow's memo() further down actually
  // holds: this is the highest-frequency prop of all (fires on every
  // keystroke in a weight/reps field), so leaving it unstable would
  // re-render every OTHER set row on the screen on every keystroke,
  // defeating the point of memoizing SetRow at all.
  const updateSet = useCallback((exIdx: number, setIdx: number, field: 'reps' | 'weight' | 'rpe' | 'setType', value: string | number | null) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      return { ...ex, sets: ex.sets.map((s, si) => si === setIdx ? { ...s, [field]: value } : s) };
    }));
  }, []) as {
    (exIdx: number, setIdx: number, field: 'reps' | 'weight', value: string): void;
    (exIdx: number, setIdx: number, field: 'rpe', value: number | null): void;
    (exIdx: number, setIdx: number, field: 'setType', value: SetType): void;
  };

  /**
   * Persists a correction to an already-completed set. Only ever called for
   * a done set with a dbId — updateSet above already covers the undone/
   * in-progress case, which has nothing in the database yet to update
   * (completeSet's addSet() call is what creates that row). Without this,
   * editing reps/weight after the fact would repeat the exact bug the RPE
   * cell used to have: the on-screen value changes, but addSet() already
   * wrote the original number, so the correction silently never saves.
   *
   * `overrides` exists for the RPE picker, which calls onUpdate() and wants
   * to persist right away in the same tap — reading straight from
   * `exercises` there would race the state update and save the value from
   * BEFORE the tap. The reps/weight text inputs persist on blur instead,
   * by which point onChangeText's update has long since landed, so they
   * don't need it.
   */
  const persistSetCorrection = (
    exIdx: number,
    setIdx: number,
    overrides?: { reps?: string; weight?: string; rpe?: number | null; setType?: SetType },
  ) => {
    const set = exercises[exIdx]?.sets[setIdx];
    if (!set?.done || !set.dbId) return;
    updateWorkoutSet(set.dbId, {
      reps: parseLoggedReps(overrides?.reps ?? set.reps),
      weight: parseFloat(overrides?.weight ?? set.weight) || 0,
      rpe: overrides && 'rpe' in overrides ? overrides.rpe! : set.rpe,
      set_type: plannedSetType(overrides?.setType ?? set.setType),
    }).catch(() => {});
  };

  /** Applies an auto-regulation suggestion to the exercise's next undone
   *  set — rounded to a loadable 2.5kg increment, same convention used
   *  throughout the app (plate calculator, 5/3/1). Silently does nothing
   *  if every set for that exercise is already done (the suggestion card
   *  itself gets dismissed either way). */
  const applyAdjustmentSuggestion = () => {
    if (!adjustmentSuggestion) return;
    const { exIdx, weight, suggestion } = adjustmentSuggestion;
    const nextSetIdx = exercises[exIdx]?.sets.findIndex(s => !s.done);
    if (nextSetIdx !== undefined && nextSetIdx !== -1) {
      const delta = weight * (suggestion.suggestedWeightDeltaPercent / 100);
      const newWeight = Math.round((weight + delta) / 2.5) * 2.5;
      updateSet(exIdx, nextSetIdx, 'weight', String(newWeight));
    }
    hapticSelect();
    setAdjustmentSuggestion(null);
  };

  const completeSet = async (exIdx: number, setIdx: number, silent = false) => {
    if (!sessionId) return;
    if (!silent) setSupersetFocusIdx(null); // clears any stale highlight from a previous round
    const ex = exercises[exIdx];
    const set = ex.sets[setIdx];
    const reps = parseLoggedReps(set.reps);
    const weight = parseFloat(set.weight) || 0;
    const setType = plannedSetType(set.setType);

    const { id: dbId, isPr } = await addSet(
      sessionId, ex.exerciseId, setIdx, reps, weight, set.rpe,
      0, setElapsed, setType
    );

    // Checkpoint the real elapsed time after every set — atomic persistence
    // (see finishSessionAsIs/useStopwatch's setBase): if the app is killed
    // before this session is properly finished, whoever resumes or
    // force-finishes it later reads this instead of recomputing from
    // started_at, which would count the entire abandoned gap as workout
    // time. Fire-and-forget: this must never delay the set's own
    // completion feedback (haptics, PR check, rest timer below).
    updateSession({ id: sessionId, total_duration: totalElapsed }).catch(() => {});

    if (isPr) {
      hapticSuccess();
      setNewPrs(prev => [...prev, ex.name]);
      const timer = setTimeout(() => {
        setNewPrs(prev => prev.filter(n => n !== ex.name));
        prTimersRef.current.delete(timer);
      }, 3000);
      prTimersRef.current.add(timer);
    } else if (!silent) {
      hapticTap();
    }

    // Generate live coaching tips based on this set's RPE, reps, and exercise history
    if (!isSimple && !silent && reps > 0) {
      generateLiveCoachingTips({
        exerciseId: ex.exerciseId,
        exerciseName: ex.name,
        reps,
        weight,
        rpe: set.rpe,
        lastSetRpe: setIdx > 0 ? ex.sets[setIdx - 1].rpe : undefined,
        lastSetReps: setIdx > 0 ? parseLoggedReps(ex.sets[setIdx - 1].reps) : undefined,
        lastSetWeight: setIdx > 0 ? parseFloat(ex.sets[setIdx - 1].weight) || 0 : undefined,
      })
        .then(tips => {
          if (tips.length > 0) {
            setCoachingTips(tips);
            setCoachingExerciseIdx(exIdx);
          }
        })
        .catch(() => {});
    }

    // In-session auto-regulation: compares this set's RPE against what this
    // SAME weight has historically cost the person, and — if meaningfully
    // different — surfaces a suggestion for the next set right now, rather
    // than only showing up as a multi-session pattern in the Fatigue Radar
    // days later. Fire-and-forget on purpose: this shouldn't delay the
    // rest timer / superset logic below while the DB query resolves.
    if (!isSimple && !silent && set.rpe !== null && weight > 0) {
      getHistoricalRpeAtWeight(ex.exerciseId, weight, sessionId)
        .then(history => {
          const suggestion = suggestSetAdjustment(set.rpe!, history);
          if (suggestion) setAdjustmentSuggestion({ exerciseName: ex.name, exIdx, weight, suggestion });
        })
        .catch(() => {});
    }

    setExercises(prev => prev.map((e, i) => {
      if (i !== exIdx) return e;
      return { ...e, sets: e.sets.map((s, si) => si === setIdx ? { ...s, done: true, isPr, dbId } : s) };
    }));

    // Bulk-completing every remaining set (via "Concluir tudo") would otherwise
    // restart the rest timer once per set in a rapid burst.
    if (silent) return;

    // BUGFIX: the "Tempo de série" stopwatch (setElapsed) was only ever
    // reset inside the rest-timer branch further below — a superset partner
    // or the final set of the workout returns before reaching it, leaving
    // the NEXT set's timing to start from whatever the previous set's
    // elapsed value was instead of zero. Resetting here, right after every
    // single (non-bulk) set completion, means each set's recorded duration
    // (workout_sets.set_duration, read into addSet() above as setElapsed)
    // is genuinely that set's own time, regardless of what happens next.
    setSetTimerActive(false);
    resetSetTimer();

    // If that was the last undone set in the whole workout, there's nothing
    // left to rest before — skip the rest timer and prompt to finish instead
    // (a common request: several competitor apps auto-suggest finishing once
    // every set is logged, instead of leaving the person to notice and tap
    // "Terminar" themselves).
    const willAllBeDone = exercises.every((e, i) =>
      e.sets.every((s, si) => (i === exIdx && si === setIdx) || s.done)
    );
    if (willAllBeDone) {
      setShowFinish(true);
      return;
    }

    // Superset pairing: if this exercise is grouped with another and that
    // partner still has an undone set for this same round, skip the rest
    // timer entirely and highlight it — that's the whole point of a
    // superset (minimal rest between the paired exercises, real rest only
    // after both are done). Without this, "superset_group" only ever
    // affected how exercises were grouped visually in the plan editor; it
    // had no actual effect on how the workout played out.
    const partnerIdx = findSupersetPartner(exercises, exIdx, setIdx);
    if (partnerIdx !== null) {
      hapticSelect();
      setExercises(prev => prev.map((e, i) => {
        if (i === partnerIdx) return { ...e, expanded: true };
        if (i === exIdx) return { ...e, expanded: false };
        return e;
      }));
      setSupersetFocusIdx(partnerIdx);
      return;
    }

    // Once every set of THIS exercise is done, collapse it and open the
    // next one that still has work left — without this, every exercise
    // stayed expanded for the whole workout and the screen was one long
    // scroll with no sense of "what's next", which made logging (especially
    // finding the weight/reps fields for a later exercise) harder than it
    // needed to be.
    const exNowDone = ex.sets.every((s, si) => si === setIdx || s.done);
    if (exNowDone) {
      const nextIdx = exercises.findIndex((e, i) => i !== exIdx && e.sets.some(s => !s.done));
      if (nextIdx !== -1) {
        setExercises(prev => prev.map((e, i) => {
          if (i === exIdx) return { ...e, expanded: false };
          if (i === nextIdx) return { ...e, expanded: true };
          return e;
        }));
      }
    }

    // Start rest timer. Falls back to the global default rather than a
    // hardcoded 90 — an exercise with no rest set should follow the user's
    // setting, not a number baked in here.
    const restForExercise = ex.restSeconds || Number(DEFAULT_SETTINGS.defaultRestSeconds);
    setRestDuration(restForExercise);
    setRestRingSeconds(restForExercise);
    setRestResetToken(t => t + 1);
    setRestEndsAtMs(Date.now() + restForExercise * 1000);
    setRestActive(true);

    // Schedule a notification for when rest ends, so leaving the phone
    // locked or switching apps during rest doesn't mean missing the timer —
    // the most requested rest-timer improvement across competitor app
    // reviews. Silently ignored if notification permission isn't granted.
    if (restRemindersEnabled) {
      scheduleRestEndNotification(restForExercise, ex.name).catch(() => {});
    }
  };

  const totalUndoneSets = exercises.reduce((sum, ex) => sum + ex.sets.filter(s => !s.done).length, 0);

  /**
   * "Mark complete" — logs every remaining set using its currently prefilled
   * reps/weight without tapping each one individually, for when you'd rather
   * glide through a workout than log with precision (inspired by EvolveYou's
   * "mark workout complete" option). Each exercise's own inputs are still
   * respected, so anything already adjusted or completed is left untouched.
   */
  const bulkCompleteRemaining = async () => {
    for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
      for (let setIdx = 0; setIdx < exercises[exIdx].sets.length; setIdx++) {
        if (!exercises[exIdx].sets[setIdx].done) {
          await completeSet(exIdx, setIdx, true);
        }
      }
    }
    setShowFinish(true);
  };

  const isWorkingSet = (s: ActiveExercise['sets'][0]) => s.setType !== 'warmup';
  const totalVolume = exercises.reduce((sum, ex) =>
    sum + ex.sets.filter(s => s.done && isWorkingSet(s)).reduce(
      (v, s) => v + setVolume(parseLoggedReps(s.reps), parseFloat(s.weight) || 0, ex.equipment, userBodyweightKg),
      0
    ), 0
  );
  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.done && isWorkingSet(s)).length, 0);
  const totalReps = exercises.reduce((sum, ex) =>
    sum + ex.sets.filter(s => s.done && isWorkingSet(s)).reduce((r, s) => r + parseLoggedReps(s.reps), 0), 0
  );
  const bwDoneSets = exercises.reduce((sum, ex) =>
    sum + (ex.equipment === 'bodyweight' ? ex.sets.filter(s => s.done && isWorkingSet(s)).length : 0), 0
  );
  const preferRepsKpi = shouldPreferRepsKpi(bwDoneSets, totalSets);
  // For the sticky progress bar — every set across every exercise, done or
  // not, so "12 de 20 séries" means what it says.
  const totalPlannedSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const progressDoneSets = exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.done).length, 0);

  const handleFinish = () => setShowFinish(true);

  // Whatever exit path is taken (finish, cancel, Android back button...), a
  // rest notification still counting down for this workout must not survive
  // it — otherwise a "rest over" alert can arrive after the session (or the
  // app) has already been left.
  useEffect(() => {
    return () => { cancelRestEndNotification().catch(() => {}); };
  }, []);

  const [confirming, setConfirming] = useState(false);

  const confirmFinish = async () => {
    if (!sessionId || confirming) return;
    setConfirming(true);
    try {
      const endTime = Math.floor(Date.now() / 1000);
      await updateSession({ id: sessionId, ended_at: endTime, total_duration: totalElapsed, total_volume: totalVolume, total_sets: totalSets });
      hapticSuccess();
      router.replace({ pathname: '/workout/summary', params: { sessionId } });
    } catch (err) {
      // BUGFIX: if updateSession threw for any reason, this used to fail
      // silently — the button visibly did nothing, the modal stayed open,
      // and there was no way to tell the workout hadn't actually ended.
      // Now the person always gets a clear message and can retry.
      console.error('Failed to finish workout:', err);
      Alert.alert('Não foi possível terminar', 'Tenta novamente. Se o problema continuar, os teus dados continuam guardados neste ecrã.');
      setConfirming(false);
    }
  };

  // Wrapped in useCallback because the back-button subscription below
  // depends on it: an unstable identity meant that listener was torn down
  // and re-added on every single render of this screen.
  const handleCancel = useCallback(() => {
    // BUGFIX (reported with a screenshot): "Cancelar treino" used to always
    // mark the session as ended and save whatever totals existed — even
    // when literally nothing had been logged (0 sets, 0kg, 0 exercises).
    // The dialog even said "o progresso será guardado", which is the
    // opposite of what tapping something called "cancel" should do.
    //
    // Now offers three genuinely different, non-destructive-by-default
    // paths: minimize (session stays open in the background — the mini-
    // player, see hooks/useActiveWorkout.tsx — nothing is lost or ended),
    // save-and-finish (ends the session now with whatever's logged), and
    // discard (deletes the session and its sets entirely). "Minimizar" is
    // the 'cancel'-styled, safe default — matching what pressing back
    // actually usually means ("get me out of here", not "end my workout").
    Alert.alert('Treino em Curso', 'Queres minimizar, guardar ou descartar?', [
      {
        text: 'Minimizar', style: 'cancel', onPress: () => {
          if (sessionId) {
            const current = exercises.find(e => e.sets.some(s => !s.done)) ?? exercises[0];
            minimize({
              sessionId,
              planId: Number(planId) || null,
              dayIndex: dayIndex !== undefined && dayIndex !== '' ? Number(dayIndex) : null,
              name: planName || 'Treino',
              currentExerciseName: current?.name ?? 'Treino',
              doneSets: totalSets,
              totalPlannedSets,
              baseElapsedSeconds: totalElapsed,
              minimizedAtMs: Date.now(),
              restEndsAtMs: restActive ? restEndsAtMs : null,
              restRingSeconds: restActive ? restRingSeconds : null,
            });
          }
          router.back();
        }
      },
      {
        text: 'Descartar', style: 'destructive', onPress: async () => {
          hapticWarning();
          try {
            if (sessionId) await discardSession(sessionId);
            router.back();
          } catch (err) {
            console.error('Failed to discard workout:', err);
            Alert.alert('Erro', 'Não foi possível descartar o treino. Tenta novamente.');
          }
        }
      },
      {
        text: 'Guardar', onPress: async () => {
          try {
            if (sessionId) {
              const endTime = Math.floor(Date.now() / 1000);
              await updateSession({ id: sessionId, ended_at: endTime, total_duration: totalElapsed, total_volume: totalVolume, total_sets: totalSets });
            }
            router.back();
          } catch (err) {
            console.error('Failed to save workout on exit:', err);
            // Even if saving the final stats failed, still let the person
            // leave the screen — getting stuck on a frozen button is worse
            // than a session with slightly stale totals.
            Alert.alert('Aviso', 'Não foi possível guardar os últimos dados, mas o treino foi encerrado.');
            router.back();
          }
        }
      },
    ]);
  }, [sessionId, router, totalElapsed, totalVolume, totalSets, totalPlannedSets, exercises, planId, planName, dayIndex, minimize, restActive, restEndsAtMs, restRingSeconds]);

  // BUGFIX (reported): the confirmation dialog above only fired from the
  // header's "Cancelar" button — Android's physical/gesture back button
  // bypassed it entirely and left the screen (and an in-progress,
  // unfinished session) with zero warning. useFocusEffect (not a plain
  // useEffect) so the listener is only active while this screen is the one
  // on screen, and is correctly torn down/re-added if the person navigates
  // away and back (e.g. opening the exercise picker doesn't count as
  // leaving this screen, but a real screen change does).
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCancel();
      return true; // we're handling it — don't let the default back action through
    });
    return () => sub.remove();
  }, [handleCancel]));

  return (
    <SafeAreaView edges={['top','bottom']} className="flex-1" style={{ backgroundColor: colors.background }}>
      {/* Top bar */}
      <View className="flex-row items-center justify-between border-b px-3 py-2.5" style={{ borderBottomColor: colors.border }}>
        <TouchableOpacity
          onPress={handleCancel}
          className="h-9 w-9 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: colors.surfaceVariant }}
          accessibilityRole="button"
          accessibilityLabel="Cancelar treino"
        >
          <X size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <Text className="font-sans-semibold text-[15px]" style={{ color: colors.text }} numberOfLines={1}>{planName}</Text>
          <TouchableOpacity
            onPress={() => setWorkoutPaused(p => !p)}
            className="mt-0.5 flex-row items-center gap-1.5"
            accessibilityRole="button"
            accessibilityLabel={workoutPaused ? 'Retomar treino' : 'Pausar treino'}
          >
            <Text className="font-sans-bold text-[22px]" style={{ color: workoutPaused ? colors.textTertiary : colors.primary }}>
              {formatTime(totalElapsed)}
            </Text>
            {workoutPaused ? (
              <Play size={16} color={colors.textTertiary} />
            ) : (
              <Pause size={16} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={handleFinish}
          className="rounded-[10px] px-3.5 py-2"
          style={{ backgroundColor: colors.secondary }}
          accessibilityRole="button"
          accessibilityLabel="Terminar treino"
        >
          <Text className="font-sans-semibold text-sm" style={{ color: colors.onSecondary }}>Terminar</Text>
        </TouchableOpacity>
      </View>

      {/* Paused banner — makes the paused state unmistakable, since the timer
          alone (just not incrementing) is easy to miss mid-workout. */}
      {workoutPaused && (
        <View className="flex-row items-center gap-2 px-4 py-2" style={{ backgroundColor: colors.accentContainer }}>
          <Pause size={14} color={colors.accent} />
          <Text className="flex-1 font-sans-semibold text-[13px] leading-[17px]" style={{ color: colors.accent }}>Treino em pausa</Text>
          <TouchableOpacity onPress={() => setWorkoutPaused(false)} accessibilityRole="button" accessibilityLabel="Retomar treino">
            <Text className="font-sans-bold text-[13px] leading-[17px]" style={{ color: colors.accent }}>Retomar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Stats bar */}
      <View className="flex-row items-center border-b py-2" style={{ backgroundColor: colors.surface, borderBottomColor: colors.border }}>
        <View className="flex-1 items-center">
          <Text className="font-sans-bold text-base" style={{ color: colors.text }}>{totalSets}</Text>
          <Text className="font-sans text-[11px] leading-[14px]" style={{ color: colors.textTertiary }}>Séries</Text>
        </View>
        <View className="h-7 w-px" style={{ backgroundColor: colors.border }} />
        <View className="flex-1 items-center">
          {preferRepsKpi ? (
            <>
              <Text className="font-sans-bold text-base" style={{ color: colors.text }}>{totalReps}</Text>
              <Text className="font-sans text-[11px] leading-[14px]" style={{ color: colors.textTertiary }}>Reps</Text>
            </>
          ) : (
            <>
              <Text className="font-sans-bold text-base" style={{ color: colors.text }}>{Math.round(totalVolume)} kg</Text>
              <Text className="font-sans text-[11px] leading-[14px]" style={{ color: colors.textTertiary }}>Volume</Text>
            </>
          )}
        </View>
        <View className="h-7 w-px" style={{ backgroundColor: colors.border }} />
        <View className="flex-1 items-center">
          <Text className="font-sans-bold text-base" style={{ color: colors.text }}>{exercises.filter(ex => ex.sets.some(s => s.done)).length}</Text>
          <Text className="font-sans text-[11px] leading-[14px]" style={{ color: colors.textTertiary }}>Exercícios</Text>
        </View>
      </View>

      {/* PR notification */}
      {newPrs.length > 0 && (
        <Animated.View
          entering={ZoomIn.springify().damping(12)}
          exiting={FadeOut.duration(200)}
          className="flex-row items-center gap-2 px-3.5 py-2"
          style={{ backgroundColor: colors.accentContainer }}
        >
          <Trophy size={16} color={colors.accent} />
          <Text className="font-sans-bold text-sm" style={{ color: colors.accent }}>PR: {newPrs[0]}</Text>
        </Animated.View>
      )}

      {/* In-session auto-regulation suggestion — see completeSet's
          getHistoricalRpeAtWeight call. Dismissible on purpose: this is a
          suggestion based on your own history, not a rule, so ignoring it
          costs nothing. */}
      {adjustmentSuggestion && (
        <Animated.View
          entering={ZoomIn.springify().damping(12)}
          exiting={FadeOut.duration(200)}
          className="mx-3 mt-2 flex-row items-start gap-2.5 rounded-xl px-3.5 py-2.5"
          style={{ backgroundColor: colors.primaryContainer }}
        >
          <Gauge size={16} color={colors.primary} style={{ marginTop: 1 }} />
          <View className="flex-1">
            <Text className="font-sans text-[13px] leading-[18px]" style={{ color: colors.text }}>
              {adjustmentSuggestion.exerciseName}: normalmente {adjustmentSuggestion.weight}kg é RPE {adjustmentSuggestion.suggestion.historicalAvgRpe} para ti — hoje sentiu-se diferente.
              {adjustmentSuggestion.suggestion.direction === 'decrease' ? ' Baixar um pouco a próxima série?' : ' Talvez consigas subir um pouco?'}
            </Text>
            <View className="mt-1.5 flex-row gap-[18px]">
              <TouchableOpacity onPress={applyAdjustmentSuggestion} accessibilityRole="button" accessibilityLabel="Aplicar ajuste sugerido">
                <Text className="font-sans-bold text-[13px]" style={{ color: colors.primary }}>
                  {adjustmentSuggestion.suggestion.direction === 'decrease' ? 'Baixar' : 'Subir'} próxima série
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAdjustmentSuggestion(null)} accessibilityRole="button" accessibilityLabel="Ignorar sugestão">
                <Text className="font-sans-bold text-[13px]" style={{ color: colors.textTertiary }}>Ignorar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Exercise list.
          Wrapped in KeyboardAvoidingView because the weight/reps inputs sit
          on the same row as the "done" checkmark: with the keyboard up on
          the last set of a card, that button ended up behind it and the set
          could not be completed without dismissing the keyboard first.
          keyboardShouldPersistTaps lets the checkmark be tapped directly
          while an input still has focus, rather than the first tap only
          closing the keyboard.
          BUGFIX (reported: weight/reps for an exercise near the end of a
          long list were unreadable, hidden under the keyboard): `behavior`
          was only ever set for iOS — on Android (the only platform this app
          ships to) it was `undefined`, so the view never shrank for the
          keyboard at all. 'height' does on Android roughly what 'padding'
          does on iOS: the list area shrinks to fit above the keyboard
          instead of being covered by it. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        ref={scrollViewRef}
        onScroll={e => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={32}
        contentContainerClassName="gap-2.5 p-3"
        contentContainerStyle={{
          paddingBottom: 24 + (totalPlannedSets > 0 ? PROGRESS_BAR_RESERVE : 0) + (restActive ? REST_BAR_RESERVE : 0),
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {exercises.map((ex, exIdx) => (
          <View
            key={exIdx}
            className={`overflow-hidden rounded-[14px] border ${supersetFocusIdx === exIdx ? 'border-2' : ''}`}
            style={{
              backgroundColor: colors.surface,
              borderColor: supersetFocusIdx === exIdx ? colors.accent : colors.border,
            }}
          >
            {ex.supersetGroup != null && (
              <View
                className="self-start rounded-br-[10px] rounded-tl-[13px] px-2.5 py-1"
                style={{ backgroundColor: supersetFocusIdx === exIdx ? colors.accent : colors.surfaceVariant }}
              >
                <Text className="font-sans-bold text-[10px] leading-[13px] tracking-wide" style={{ color: supersetFocusIdx === exIdx ? colors.onAccent : colors.textSecondary }}>
                  {supersetFocusIdx === exIdx ? 'A SEGUIR — SUPERSET' : `SUPERSET ${ex.supersetGroup}`}
                </Text>
              </View>
            )}
            {/* Exercise header */}
            <TouchableOpacity
              className="flex-row items-center gap-2.5 p-3.5"
              onPress={() => setExercises(prev => prev.map((e, i) => i === exIdx ? { ...e, expanded: !e.expanded } : e))}
              onLongPress={() => removeExerciseFromWorkout(exIdx)}
              delayLongPress={500}
              accessibilityHint="Manter premido para remover este exercício do treino"
            >
              {ex.imageUrl ? (
                <TouchableOpacity
                  onPress={() => setDemoFor({ name: ex.name, url: ex.imageUrl! })}
                  className="h-[38px] w-[38px] overflow-hidden rounded-lg"
                  accessibilityRole="button"
                  accessibilityLabel={`Ver ilustração de ${ex.name} em ecrã inteiro`}
                >
                  <ExerciseMedia uri={ex.imageUrl} height={38} />
                </TouchableOpacity>
              ) : (
                <ExerciseTile muscle={ex.primaryMuscle as MuscleGroup} equipment={ex.equipment as Equipment} size={38} />
              )}
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ex.sets.every(s => s.done) ? colors.secondary : colors.primary }} />
              <View className="min-w-0 flex-1">
                <Text className="font-sans-semibold text-[15px]" style={{ color: colors.text }}>{ex.name}</Text>
                <Text className="mt-0.5 font-sans text-xs leading-4" style={{ color: colors.textSecondary }} numberOfLines={1}>
                  {MUSCLE_GROUPS_PT[ex.primaryMuscle as MuscleGroup] || ex.primaryMuscle} · {EQUIPMENT_PT[ex.equipment as keyof typeof EQUIPMENT_PT] || ex.equipment} · {ex.sets.filter(s => s.done).length}/{ex.sets.length} séries
                </Text>
              </View>
              {adaptiveInfo?.states.has(ex.exerciseId) && (
                <TouchableOpacity
                  onPress={() => setWhyTargetFor(exIdx)}
                  hitSlop={8}
                  className="mr-2.5"
                  accessibilityRole="button"
                  accessibilityLabel={`Porquê este alvo em ${ex.name}`}
                >
                  <Star size={17} color={colors.accent} fill={colors.accent} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => openSubstitute(exIdx)}
                hitSlop={8}
                className="mr-2.5"
                accessibilityRole="button"
                accessibilityLabel={`Substituir ${ex.name} por alternativa`}
              >
                <Repeat size={17} color={colors.textTertiary} />
              </TouchableOpacity>
              {ex.expanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
            </TouchableOpacity>

            {ex.expanded && (
              <View className="gap-1 px-3 pb-3">
                {exercises.length > 1 && (
                  <View className="mb-2.5 flex-row gap-4">
                    <TouchableOpacity
                      onPress={() => moveExercise(exIdx, -1)}
                      disabled={exIdx === 0}
                      hitSlop={8}
                      className="flex-row items-center gap-1.5"
                      accessibilityRole="button"
                      accessibilityLabel={`Mover ${ex.name} para cima`}
                    >
                      <ArrowUp size={16} color={exIdx === 0 ? colors.textTertiary : colors.textSecondary} />
                      <Text className="font-sans-semibold text-xs" style={{ color: exIdx === 0 ? colors.textTertiary : colors.textSecondary }}>Mover para cima</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveExercise(exIdx, 1)}
                      disabled={exIdx === exercises.length - 1}
                      hitSlop={8}
                      className="flex-row items-center gap-1.5"
                      accessibilityRole="button"
                      accessibilityLabel={`Mover ${ex.name} para baixo`}
                    >
                      <ArrowDown size={16} color={exIdx === exercises.length - 1 ? colors.textTertiary : colors.textSecondary} />
                      <Text className="font-sans-semibold text-xs" style={{ color: exIdx === exercises.length - 1 ? colors.textTertiary : colors.textSecondary }}>Mover para baixo</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {!!ex.imageUrl && (
                  <TouchableOpacity
                    onPress={() => setDemoFor({ name: ex.name, url: ex.imageUrl! })}
                    activeOpacity={0.85}
                    className="mb-2.5"
                    accessibilityRole="button"
                    accessibilityLabel={`Ver ilustração de ${ex.name} em ecrã inteiro`}
                  >
                    <ExerciseMedia uri={ex.imageUrl} height={170} />
                  </TouchableOpacity>
                )}
                {ex.progression && (
                  <View className="mb-2 flex-row items-center gap-1.5 rounded-lg px-2.5 py-2" style={{ backgroundColor: colors.secondaryContainer }}>
                    <TrendingUp size={14} color={colors.secondary} />
                    <Text className="flex-1 font-sans-semibold text-xs leading-4" style={{ color: colors.secondary }}>
                      Sobe para {ex.progression.suggestedWeight}kg · {ex.progression.reason}
                    </Text>
                  </View>
                )}

                {editingNotesFor === exIdx ? (
                  <View className="mb-2 flex-row items-start gap-2">
                    <TextInput
                      className="min-h-11 flex-1 rounded-lg border p-2.5 font-sans text-[13px] leading-[17px]"
                      style={{ color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }}
                      value={notesDraft}
                      onChangeText={setNotesDraft}
                      placeholder="Ex: banco na posição 4, pega larga"
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      autoFocus
                    />
                    <TouchableOpacity
                      className="h-11 w-11 items-center justify-center rounded-lg"
                      style={{ backgroundColor: colors.primary }}
                      onPress={() => saveNotes(exIdx)}
                      accessibilityRole="button"
                      accessibilityLabel="Guardar notas do exercicio"
                    >
                      <Check size={16} color={colors.onPrimary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    className="mb-1 flex-row items-center gap-1.5 py-1.5"
                    onPress={() => { setNotesDraft(ex.userNotes || ''); setEditingNotesFor(exIdx); }}
                    accessibilityRole="button"
                    accessibilityLabel={ex.userNotes ? 'Editar notas do exercicio' : 'Adicionar notas ao exercicio'}
                  >
                    <StickyNote size={14} color={ex.userNotes ? colors.accent : colors.textTertiary} />
                    <Text
                      className="flex-1 font-sans text-xs leading-4"
                      style={{ color: ex.userNotes ? colors.text : colors.textTertiary }}
                      numberOfLines={2}
                    >
                      {ex.userNotes || 'Adicionar nota (posição do banco, pega...)'}
                    </Text>
                  </TouchableOpacity>
                )}

                {parseTempo(ex.tempo || '') && !isSimple && (
                  <TempoMetronomeBox
                    tempo={ex.tempo || ''}
                    isRunning={tempoRunningFor === exIdx}
                    vibrateEnabled={vibrateEnabled}
                    onStart={() => setTempoRunningFor(exIdx)}
                    onStop={() => setTempoRunningFor(null)}
                    colors={colors}
                  />
                )}

                {coachingExerciseIdx === exIdx && coachingTips.length > 0 && (
                  <View className="mb-3">
                    <LiveCoachingStack
                      tips={coachingTips}
                      maxTips={2}
                      onDismiss={(idx) => {
                        setCoachingTips(prev => prev.filter((_, i) => i !== idx));
                      }}
                    />
                  </View>
                )}

                {ex.targetRir != null && !isSimple && (
                  <Text className="mb-1 font-sans text-[11px] leading-[14px]" style={{ color: colors.textSecondary }}>
                    Alvo: {formatRirHint(ex.targetRir)}
                  </Text>
                )}
                <View className="flex-row items-center py-1">
                  <Text className="w-7 text-center font-sans-semibold text-[10px] leading-[13px] tracking-wide" style={{ color: colors.textTertiary }}>S</Text>
                  <Text className="flex-[1.2] text-center font-sans-semibold text-[10px] leading-[13px] tracking-wide" style={{ color: colors.textTertiary }}>ANTERIOR</Text>
                  <Text className="flex-[1.3] text-center font-sans-semibold text-[10px] leading-[13px] tracking-wide" style={{ color: colors.textTertiary }}>KG</Text>
                  <Text className="flex-1 text-center font-sans-semibold text-[10px] leading-[13px] tracking-wide" style={{ color: colors.textTertiary }}>
                    REPS{ex.defaultRepsTarget ? ` · ${ex.defaultRepsTarget}` : ''}
                  </Text>
                  {!isSimple && <Text className="w-11 text-center font-sans-semibold text-[10px] leading-[13px] tracking-wide" style={{ color: colors.textTertiary }}>RPE</Text>}
                  <View className="w-9" />
                </View>

                {ex.sets.map((set, setIdx) => (
                  <SetRow
                    key={setIdx}
                    set={set}
                    setIdx={setIdx}
                    exIdx={exIdx}
                    colors={colors}
                    isSimple={isSimple}
                    locked={isSetLocked(ex.sets, setIdx)}
                    repsTarget={ex.defaultRepsTarget}
                    onUpdate={updateSet}
                    onComplete={completeSet}
                    onRemove={removeSet}
                    onCorrect={persistSetCorrection}
                    onFocusInput={handleFocusInput}
                  />
                ))}

                <TouchableOpacity
                  className="mt-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-dashed py-2"
                  style={{ borderColor: colors.border }}
                  onPress={() => addSetToExercise(exIdx)}
                  accessibilityRole="button"
                  accessibilityLabel="Adicionar série"
                >
                  <Plus size={16} color={colors.primary} />
                  <Text className="font-sans-semibold text-[13px] leading-[17px]" style={{ color: colors.primary }}>Série</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        <TouchableOpacity
          className="flex-row items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3.5"
          style={{ borderColor: colors.border, backgroundColor: colors.surfaceVariant }}
          onPress={() => { setPickerQuery(''); setShowAddExercise(true); }}
          accessibilityRole="button"
          accessibilityLabel="Adicionar exercício ao treino"
        >
          <Plus size={20} color={colors.primary} />
          <Text className="font-sans-semibold text-[15px]" style={{ color: colors.primary }}>Adicionar Exercício</Text>
        </TouchableOpacity>

        <View className="gap-2.5 rounded-[14px] border p-3.5" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
          <View className="flex-row items-center gap-2">
            <Timer size={18} color={colors.textSecondary} />
            <Text className="flex-1 font-sans text-sm" style={{ color: colors.textSecondary }}>Tempo de série</Text>
            <Text className="font-sans-bold text-xl" style={{ color: colors.text }}>{formatTime(setElapsed)}</Text>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-[10px] py-2.5"
              style={{ backgroundColor: setTimerActive ? colors.error : colors.secondary }}
              onPress={() => setSetTimerActive(!setTimerActive)}
              accessibilityRole="button"
              accessibilityLabel={setTimerActive ? 'Parar cronómetro de série' : 'Iniciar cronómetro de série'}
            >
              <Text className="font-sans-semibold text-sm" style={{ color: setTimerActive ? colors.onError : colors.onSecondary }}>{setTimerActive ? 'Parar' : 'Iniciar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-[10px] py-2.5"
              style={{ backgroundColor: colors.surfaceVariant }}
              onPress={() => { resetSetTimer(); setSetTimerActive(false); }}
              accessibilityRole="button"
              accessibilityLabel="Reiniciar cronómetro de série"
            >
              <RotateCcw size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky progress bar — "how much is left" at a glance without
          scrolling back up, for a workout that can run 5+ exercises long. */}
      {totalPlannedSets > 0 && (
        <View className="gap-1.5 border-t px-4 pb-3 pt-2.5" style={{ backgroundColor: colors.surface, borderTopColor: colors.border }}>
          <Text className="text-center font-sans-semibold text-xs" style={{ color: colors.textSecondary }}>
            {progressDoneSets} de {totalPlannedSets} séries ({Math.round((progressDoneSets / totalPlannedSets) * 100)}%)
          </Text>
          <View className="h-1.5 overflow-hidden rounded-sm" style={{ backgroundColor: colors.surfaceVariant }}>
            <View className="h-full rounded-sm" style={{ backgroundColor: colors.secondary, width: `${Math.min(100, (progressDoneSets / totalPlannedSets) * 100)}%` }} />
          </View>
        </View>
      )}

      {/* Floating rest timer — a discreet, non-blocking toast at the bottom
          of the screen instead of an inline card that used to push the
          exercise list down while resting. It floats over the list (which
          keeps scrolling underneath it) so the next sets stay reachable
          during rest instead of waiting for the timer to end. PERF: its own
          component (below) — see the restResetToken comment above for why
          this screen no longer owns the ticking countdown directly. */}
      {restActive && (
        <FloatingRestBar
          restDuration={restDuration}
          restResetToken={restResetToken}
          resumeEndsAtMs={resumedRest?.endsAt ?? null}
          resumeRingSeconds={resumedRest?.ring ?? null}
          totalPlannedSets={totalPlannedSets}
          restRemindersEnabled={restRemindersEnabled}
          vibrateEnabled={vibrateEnabled}
          soundEnabled={soundEnabled}
          colors={colors}
          setRestActive={(active) => {
            if (!active) {
              setRestEndsAtMs(null);
              setRestRingSeconds(Number(DEFAULT_SETTINGS.defaultRestSeconds));
            }
            setRestActive(active);
          }}
          onDeadlineChange={setRestEndsAtMs}
          onRingDurationChange={setRestRingSeconds}
          onRestComplete={onRestComplete}
        />
      )}

      {/* Exercise picker */}
      <Modal visible={showAddExercise} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddExercise(false)}>
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          <View className="flex-row items-center justify-between border-b p-5" style={{ borderBottomColor: colors.border }}>
            <Text className="font-sans-bold text-xl" style={{ color: colors.text }}>Adicionar Exercício</Text>
            <TouchableOpacity onPress={() => setShowAddExercise(false)}><X size={24} color={colors.text} /></TouchableOpacity>
          </View>
          <View className="p-3">
            <SearchBar value={pickerQuery} onChangeText={setPickerQuery} placeholder="Pesquisar..." />
          </View>
          <FlatList
            data={pickerResults}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity className="flex-row items-center justify-between border-b px-4 py-3.5" style={{ borderBottomColor: colors.border }} onPress={() => addExerciseToWorkout(item)}>
                {item.image_url ? (
                  <View className="h-10 w-10 overflow-hidden rounded-lg">
                    <ExerciseMedia uri={item.image_url} height={40} />
                  </View>
                ) : (
                  <ExerciseTile muscle={item.primary_muscle} equipment={item.equipment} size={40} />
                )}
                <View className="ml-3 flex-1">
                  <Text className="font-sans-semibold text-[15px]" style={{ color: colors.text }}>{item.name}</Text>
                  <Text className="mt-0.5 font-sans text-xs leading-4" style={{ color: colors.textSecondary }}>{MUSCLE_GROUPS_PT[item.primary_muscle]} · {EQUIPMENT_PT[item.equipment]}</Text>
                </View>
                <Plus size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        </View>
      </Modal>

      {/* Finish modal */}
      <Modal visible={showFinish} animationType="fade" transparent>
        <View className="flex-1 items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View className="w-full gap-4 rounded-3xl border p-6" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <Text className="text-center font-sans-bold text-[22px]" style={{ color: colors.text }}>Terminar treino?</Text>
            <View className="flex-row justify-around">
              <View className="items-center gap-1">
                <Text className="font-sans-bold text-2xl" style={{ color: colors.primary }}>{formatTime(totalElapsed)}</Text>
                <Text className="font-sans text-[13px] leading-[17px]" style={{ color: colors.textSecondary }}>Duração</Text>
              </View>
              <View className="items-center gap-1">
                <Text className="font-sans-bold text-2xl" style={{ color: colors.primary }}>{totalSets}</Text>
                <Text className="font-sans text-[13px] leading-[17px]" style={{ color: colors.textSecondary }}>Séries</Text>
              </View>
              {preferRepsKpi ? (
                <View className="items-center gap-1">
                  <Text className="font-sans-bold text-2xl" style={{ color: colors.primary }}>{totalReps}</Text>
                  <Text className="font-sans text-[13px] leading-[17px]" style={{ color: colors.textSecondary }}>Reps</Text>
                </View>
              ) : (
                <View className="items-center gap-1">
                  <Text className="font-sans-bold text-2xl" style={{ color: colors.primary }}>{Math.round(totalVolume)} kg</Text>
                  <Text className="font-sans text-[13px] leading-[17px]" style={{ color: colors.textSecondary }}>Volume</Text>
                </View>
              )}
            </View>
            {preferRepsKpi && totalVolume > 0 && (
              <Text className="mb-2 text-center font-sans text-[13px] leading-[17px]" style={{ color: colors.textTertiary }}>
                {formatVolume(totalVolume)} estimados (peso corporal)
              </Text>
            )}

            {totalUndoneSets > 0 && (
              <View className="mt-3.5 flex-row items-center justify-between rounded-[10px] px-3.5 py-2.5" style={{ backgroundColor: colors.surfaceVariant }}>
                <Text className="font-sans text-[13px] leading-[17px]" style={{ color: colors.textSecondary }}>
                  {totalUndoneSets} {totalUndoneSets === 1 ? 'série' : 'séries'} por registar
                </Text>
                <TouchableOpacity onPress={bulkCompleteRemaining} accessibilityRole="button" accessibilityLabel="Concluir séries restantes com os valores atuais">
                  <Text className="font-sans-bold text-[13px] leading-[17px]" style={{ color: colors.primary }}>Concluir tudo</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity className="items-center rounded-[14px] py-4" style={{ backgroundColor: colors.secondary }} onPress={confirmFinish}>
              <Text className="font-sans-bold text-[17px]" style={{ color: colors.onSecondary }}>Guardar Treino</Text>
            </TouchableOpacity>
            <TouchableOpacity className="items-center rounded-[14px] border py-3.5" style={{ borderColor: colors.border }} onPress={() => setShowFinish(false)}>
              <Text className="font-sans-semibold text-[15px]" style={{ color: colors.textSecondary }}>Continuar a treinar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Substitute exercise (machine taken / equipment unavailable) */}
      <Modal visible={substituteFor !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSubstituteFor(null)}>
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          <View className="flex-row items-center justify-between border-b p-5" style={{ borderBottomColor: colors.border }}>
            <View className="flex-1">
              <Text className="font-sans-bold text-xl" style={{ color: colors.text }}>Substituir exercício</Text>
              <Text className="mt-0.5 font-sans text-xs leading-4" style={{ color: colors.textSecondary }}>
                Alternativas para o mesmo músculo
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSubstituteFor(null)} accessibilityRole="button" accessibilityLabel="Fechar">
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={alternatives}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="flex-row items-center justify-between border-b px-4 py-3.5"
                style={{ borderBottomColor: colors.border }}
                onPress={() => applySubstitute(item)}
                accessibilityRole="button"
                accessibilityLabel={`Substituir por ${item.name}`}
              >
                {item.image_url ? (
                  <View className="h-10 w-10 overflow-hidden rounded-lg">
                    <ExerciseMedia uri={item.image_url} height={40} />
                  </View>
                ) : (
                  <ExerciseTile muscle={item.primary_muscle} equipment={item.equipment} size={40} />
                )}
                <View className="ml-3 flex-1">
                  <Text className="font-sans-semibold text-[15px]" style={{ color: colors.text }}>{item.name}</Text>
                  <Text className="mt-0.5 font-sans text-xs leading-4" style={{ color: colors.textSecondary }}>
                    {MUSCLE_GROUPS_PT[item.primary_muscle]} · {EQUIPMENT_PT[item.equipment]}
                  </Text>
                </View>
                <Repeat size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text className="p-5 text-center font-sans text-sm" style={{ color: colors.textSecondary }}>
                Sem alternativas para este músculo.
              </Text>
            }
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        </View>
      </Modal>

      {/* Illustration for the current movement, opened from the exercise
          header. Loads from the dataset CDN on first view, so it needs a
          connection the first time each exercise is opened. */}
      <Modal
        visible={demoFor !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDemoFor(null)}
      >
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
          <View className="flex-row items-center justify-between border-b p-5" style={{ borderBottomColor: colors.border }}>
            <Text className="flex-1 font-sans-bold text-xl" style={{ color: colors.text }} numberOfLines={1}>
              {demoFor?.name}
            </Text>
            <TouchableOpacity
              onPress={() => setDemoFor(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Fechar ilustração"
            >
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          {demoFor && (
            <View className="p-4">
              <ExerciseMedia uri={demoFor.url} height={320} />
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* "Porquê este alvo" — the adaptive engine's explanation for this
          exercise's current sets/reps/weight (NSPI_ENGINE.md §7). Read-only,
          purely informational: never mutates anything here, the plan itself
          was already rewritten when the week closed (utils/adaptiveService).
          transparent + overFullScreen renders as a small centered card
          rather than a full pageSheet, since the content is a few lines. */}
      <Modal
        visible={whyTargetFor !== null}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setWhyTargetFor(null)}
      >
        <TouchableOpacity
          className="flex-1 items-center justify-center p-7"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          onPress={() => setWhyTargetFor(null)}
        >
          {(() => {
            if (whyTargetFor === null || !adaptiveInfo) return null;
            const ex = exercises[whyTargetFor];
            if (!ex) return null;
            const state = adaptiveInfo.states.get(ex.exerciseId);
            if (!state) return null;
            const spec = phaseSpec(adaptiveInfo.phase, adaptiveInfo.goal);
            return (
              <TouchableOpacity activeOpacity={1} onPress={() => {}} className="w-full gap-2.5 rounded-[20px] p-5" style={{ backgroundColor: colors.surface }}>
                <View className="flex-row items-center gap-2">
                  <Star size={18} color={colors.accent} fill={colors.accent} />
                  <Text className="font-sans-bold text-[17px]" style={{ color: colors.text }}>Porquê este alvo</Text>
                </View>
                <Text className="-mt-1.5 mb-1 font-sans text-[13px]" style={{ color: colors.textSecondary }}>{ex.name}</Text>

                <View className="mb-0.5 flex-row items-center gap-2 rounded-[10px] px-2.5 py-2" style={{ backgroundColor: PHASE_COLOR[adaptiveInfo.phase] + '1A' }}>
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: PHASE_COLOR[adaptiveInfo.phase] }} />
                  <Text className="font-sans-bold text-[13px]" style={{ color: PHASE_COLOR[adaptiveInfo.phase] }}>
                    Fase de {PHASE_LABEL_PT[adaptiveInfo.phase]}
                  </Text>
                </View>

                <View className="flex-row items-center justify-between">
                  <Text className="font-sans text-[13px]" style={{ color: colors.textSecondary }}>Peso alvo</Text>
                  <Text className="font-sans-semibold text-[13px]" style={{ color: colors.text }}>
                    ~{Math.round(spec.intensityPct * 100)}% do teu 1RM estimado
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="font-sans text-[13px]" style={{ color: colors.textSecondary }}>Janela de reps</Text>
                  <Text className="font-sans-semibold text-[13px]" style={{ color: colors.text }}>{state.current_reps_low}–{state.current_reps_high}</Text>
                </View>
                {state.step_stall_count > 0 && (
                  <View className="flex-row items-center justify-between">
                    <Text className="font-sans text-[13px]" style={{ color: colors.textSecondary }}>Sem progressão há</Text>
                    <Text className="font-sans-semibold text-[13px]" style={{ color: colors.text }}>{state.step_stall_count} semana{state.step_stall_count > 1 ? 's' : ''}</Text>
                  </View>
                )}

                <Text className="mt-1.5 font-sans text-xs leading-[17px]" style={{ color: colors.textTertiary }}>{spec.expect}</Text>

                <TouchableOpacity
                  className="mt-1.5 items-center rounded-xl py-3"
                  style={{ backgroundColor: colors.surfaceVariant }}
                  onPress={() => setWhyTargetFor(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Fechar"
                >
                  <Text className="font-sans-semibold text-sm" style={{ color: colors.text }}>Entendido</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })()}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * PERF: isolates the rest countdown's 250ms ticking to this small subtree
 * instead of ActiveWorkoutScreen's own body — see that screen's
 * restResetToken comment for the full reasoning. Owns its own
 * useCountdown (still the same tested hook, same behavior) plus the
 * 5-second vibration warning that used to live in the parent, since both
 * only ever needed the per-tick number, never anything else the parent's
 * render depended on.
 *
 * `remaining` also drives a Reanimated shared value (remainingSV) that
 * RestRing animates from, via withTiming, for a smoothly interpolating
 * ring instead of one that visibly steps once per 250ms tick — a genuine
 * use of shared values here, not just a rename of the same state.
 *
 * restResetToken changing is the "start a fresh rest now" signal (see
 * useCountdown's own reset()/resetToken doc comment for why a plain
 * restDuration prop change alone isn't sufficient — completing a set while
 * the PREVIOUS rest is still actively counting down, the common case, is
 * exactly when `restActive` never has a false→true transition to key a
 * restart off of).
 */
function FloatingRestBar({
  restDuration, restResetToken, resumeEndsAtMs, resumeRingSeconds, totalPlannedSets, restRemindersEnabled, vibrateEnabled, soundEnabled, colors, setRestActive, onDeadlineChange, onRingDurationChange, onRestComplete,
}: {
  restDuration: number; restResetToken: number;
  /** Absolute deadline when expanding from mini-player; keeps wall-clock sync. */
  resumeEndsAtMs?: number | null;
  /** Original rest length for RestRing fill when expanding mid-countdown. */
  resumeRingSeconds?: number | null;
  totalPlannedSets: number;
  restRemindersEnabled: boolean; vibrateEnabled: boolean; soundEnabled: boolean; colors: Theme;
  setRestActive: (active: boolean) => void;
  onDeadlineChange: (endsAtMs: number | null) => void;
  onRingDurationChange: (seconds: number) => void;
  onRestComplete: () => void;
}) {
  // bindEndsAtMs seeds endTimeRef on first render so expand mid-rest never
  // arms Date.now()+restDuration (which would drift from the minimize deadline).
  const { remaining, isFinished, addTime, reset, setEndsAt, getEndsAt } = useCountdown(
    restDuration,
    true,
    onRestComplete,
    resumeEndsAtMs ?? null,
  );
  // Ring fill uses this as the denominator — update when presets fire so
  // jumping from 60→120 doesn't clamp the progress ring incorrectly.
  // On resume, prefer the original duration so a mid-rest expand
  // (e.g. 42s left of 90) doesn't make the ring look "full" at 42/42.
  const [ringDuration, setRingDuration] = useState(() =>
    Math.max(restDuration, resumeRingSeconds ?? restDuration)
  );
  const didResumeRef = useRef(false);

  // Publish the wall-clock resume deadline to the parent once (minimize snapshot).
  useEffect(() => {
    if (didResumeRef.current) return;
    if (resumeEndsAtMs != null && remainingRestSeconds(resumeEndsAtMs) != null) {
      didResumeRef.current = true;
      setEndsAt(resumeEndsAtMs);
      onDeadlineChange(resumeEndsAtMs);
      onRingDurationChange(Math.max(restDuration, resumeRingSeconds ?? restDuration));
    } else {
      // Fresh rest (not an expand): parent deadline = hook's armed endTime.
      const ends = getEndsAt();
      if (ends != null) onDeadlineChange(ends);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (restResetToken > 0) {
      reset(restDuration);
      setRingDuration(restDuration);
      onRingDurationChange(restDuration);
      // reset() nulls endTime then the tick effect re-arms; publish after microtask
      // via the same formula completeSet uses so parent minimize snapshot stays honest.
      onDeadlineChange(Date.now() + restDuration * 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restResetToken]);

  // Five-second warning, distinct from the end-of-rest alert. In a noisy
  // gym the phone is often face-down in a bag; a single buzz at zero is
  // easy to miss and gives no time to get back to the bar. A short double
  // pulse at five seconds is the heads-up. Guarded by a ref so it fires
  // once per rest period rather than on every tick that happens to land
  // on 5.
  const fiveSecondWarningRef = useRef(false);
  useEffect(() => {
    if (isFinished) { fiveSecondWarningRef.current = false; return; }
    if (remaining <= 5 && remaining > 0 && !fiveSecondWarningRef.current) {
      fiveSecondWarningRef.current = true;
      if (vibrateEnabled) Vibration.vibrate([0, 120, 80, 120]);
    }
  }, [remaining, isFinished, vibrateEnabled]);

  // Smoothed mirror of `remaining` for the ring's animation only — the
  // countdown's actual state/logic (addTime, reset, isFinished, the
  // notification scheduling below) all still runs on the plain number
  // above, unchanged.
  const remainingSV = useSharedValue(remaining);
  useEffect(() => {
    remainingSV.value = withTiming(remaining, { duration: 240 });
  }, [remaining, remainingSV]);

  if (isFinished) return null;

  // Urgent (<10s left): errorContainer background + error text, not just
  // an error-colored border/ring — a subtle border change is easy to miss
  // mid-set when the phone is only half-glanced at, exactly when the "get
  // back to the bar" signal matters most.
  const isUrgent = remaining <= 10;

  const applyDelta = (delta: number) => {
    // Guard −10 when already ≤10s so it can't double as an accidental skip.
    if (delta === -10 && remaining <= 10) return;
    const next = adjustRestRemaining(remaining, delta);
    addTime(delta);
    // Prefer the hook's absolute deadline (single source of truth) over
    // recomputing Date.now()+next, which drifts from endTimeRef.
    onDeadlineChange(getEndsAt() ?? Date.now() + next * 1000);
    if (delta > 0) {
      setRingDuration((d) => {
        const ring = Math.max(d, remaining + delta);
        onRingDurationChange(ring);
        return ring;
      });
    }
    if (restRemindersEnabled) scheduleRestEndNotification(next, '').catch(() => {});
    hapticSelect();
  };

  const applyPreset = (seconds: number) => {
    setRingDuration(seconds);
    onRingDurationChange(seconds);
    reset(seconds);
    onDeadlineChange(Date.now() + seconds * 1000);
    if (restRemindersEnabled) scheduleRestEndNotification(seconds, '').catch(() => {});
    hapticSelect();
  };

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-3 right-3 flex-row items-center gap-2.5 rounded-2xl border px-3 py-2"
      style={{
        bottom: totalPlannedSets > 0 ? 72 : 16,
        backgroundColor: isUrgent ? colors.errorContainer : colors.surface,
        borderColor: isUrgent ? colors.error : colors.border,
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      <RestRing
        remainingSV={remainingSV}
        duration={ringDuration}
        size={40}
        strokeWidth={4}
        color={isUrgent ? colors.error : colors.primary}
        trackColor={colors.surfaceVariant}
      />
      <Text className="font-sans-semibold text-[11px] tracking-widest" style={{ color: isUrgent ? colors.error : colors.textSecondary }}>DESCANSO</Text>
      <View className="flex-row items-center gap-1">
        {REST_PRESETS_SECONDS.map((secs) => (
          <TouchableOpacity
            key={secs}
            onPress={() => applyPreset(secs)}
            className="min-w-9 items-center rounded-lg px-2 py-1.5"
            style={{
              backgroundColor: ringDuration === secs ? colors.primaryContainer : colors.surfaceVariant,
            }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`Definir descanso para ${secs} segundos`}
          >
            <Text className="font-sans-bold text-[11px]" style={{ color: ringDuration === secs ? colors.primary : colors.text }}>
              {secs}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View className="flex-1" />
      <TouchableOpacity
        onPress={() => applyDelta(-10)}
        className="min-w-11 items-center justify-center rounded-xl px-3.5 py-2.5"
        style={{ backgroundColor: colors.surfaceVariant }}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel="Remover 10 segundos ao descanso"
      >
        <Text className="font-sans-bold text-[13px]" style={{ color: colors.text }}>−10s</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => applyDelta(30)}
        className="min-w-11 items-center justify-center rounded-xl px-3.5 py-2.5"
        style={{ backgroundColor: colors.surfaceVariant }}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel="Adicionar 30 segundos ao descanso"
      >
        <Text className="font-sans-bold text-[13px]" style={{ color: colors.text }}>+30s</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { setRestActive(false); cancelRestEndNotification().catch(() => {}); }}
        className="min-w-11 items-center justify-center rounded-xl px-3.5 py-2.5"
        style={{ backgroundColor: colors.secondary }}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel="Saltar descanso"
      >
        <Text className="font-sans-bold text-[13px]" style={{ color: colors.onSecondary }}>Saltar</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * One row of a set: previous performance, weight, reps, RPE and the done
 * button, plus the plate-increment and RPE popovers.
 *
 * Still lives in this file rather than components/workout/, unlike
 * TempoMetronomeBox. It is self-contained in the sense that everything
 * arrives through props, but it is typed against ActiveExercise and uses the
 * AnimatedTouchable defined here, so moving it means moving those too. That
 * is a mechanical change with no way to verify it short of running a workout
 * on a device — and an untested refactor of this exact file has broken it
 * before. Worth doing once the on-device pass in ESTADO.md is done.
 *
 * Wrapped in memo() below — a workout can have 5+ exercises open with
 * several sets each, and without it, typing into ANY one set's field (or
 * any other state change in the parent screen, e.g. the rest timer's own
 * re-renders) re-rendered every OTHER row too. The screen only passes this
 * stable-identity props for that to actually take effect: `colors` (a
 * module-level constant from useTheme), `onUpdate`/`onFocusInput`
 * (useCallback, empty deps) — `onComplete`/`onRemove`/`onCorrect` are not
 * yet stabilized (see completeSet/removeSet/persistSetCorrection's own
 * closures over `exercises`), so memo() only skips a re-render when NONE
 * of those fired this render; it still fully protects the common case of
 * typing into a field or another row's own set completing.
 */
const SetRow = memo(function SetRow({ set, setIdx, exIdx, colors, isSimple, locked, repsTarget, onUpdate, onComplete, onRemove, onCorrect, onFocusInput }: {
  set: ActiveExercise['sets'][0]; setIdx: number; exIdx: number; colors: Theme; isSimple: boolean;
  /** Prescribed plan range shown as the REPS placeholder (e.g. "12-15"). */
  repsTarget?: string;
  /** True for an undone set that isn't next in line yet — see the
   *  firstUndoneIdx computation where SetRow is rendered. Blocks input and
   *  completing out of order; a done set is never locked, so it can always
   *  be corrected. */
  locked: boolean;
  onUpdate: {
    (exIdx: number, setIdx: number, field: 'reps' | 'weight', value: string): void;
    (exIdx: number, setIdx: number, field: 'rpe', value: number | null): void;
    (exIdx: number, setIdx: number, field: 'setType', value: SetType): void;
  };
  onComplete: (exIdx: number, setIdx: number) => void;
  onRemove: (exIdx: number, setIdx: number) => void;
  /** Persists an edit made to an already-done set — see persistSetCorrection. */
  onCorrect: (exIdx: number, setIdx: number, overrides?: { reps?: string; weight?: string; rpe?: number | null; setType?: SetType }) => void;
  /** Registers whichever input the person just tapped into, so the screen
   *  can scroll it clear of the keyboard once it's done animating in. */
  onFocusInput: (ref: TextInput | null) => void;
}) {
  // Editable either because it's done (correcting a mistake) or because
  // it's the current set; a future, not-yet-reached set is neither.
  const editable = set.done || !locked;
  // Highlights the one set that's actually actionable right now — the first
  // undone, unlocked one — so a glance at a card mid-workout shows exactly
  // where to pick up, instead of every not-yet-done row looking the same.
  const isActive = !set.done && !locked;
  const repsInputRef = useRef<TextInput>(null);
  const weightInputRef = useRef<TextInput>(null);
  const [showRpe, setShowRpe] = useState(false);
  // Typing exact weights on a phone mid-set is fiddly, so tapping the weight
  // field reveals plate-sized increments instead.
  const [showQuickAdjust, setShowQuickAdjust] = useState(false);

  // A quick pop when a set flips to done — the single most repeated action
  // in the whole app during a workout deserves to feel satisfying, not just
  // instant. useAnimatedReaction watches set.done directly instead of an
  // onPress handler, so it also animates for silent bulk-completes.
  const doneScale = useSharedValue(1);
  useAnimatedReaction(
    () => set.done,
    (isDone, wasDone) => {
      if (isDone && !wasDone) {
        doneScale.value = withSequence(
          withTiming(1.25, { duration: 120 }),
          withSpring(1, { damping: 10, stiffness: 300 })
        );
      }
    }
  );
  const doneAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: doneScale.value }] }));

  const adjustWeight = (delta: number) => {
    const current = parseFloat(set.weight) || 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    onUpdate(exIdx, setIdx, 'weight', String(next));
    hapticSelect();
  };

  const adjustReps = (delta: number) => {
    const current = parseLoggedReps(set.reps);
    onUpdate(exIdx, setIdx, 'reps', String(Math.max(0, current + delta)));
  };

  const cycleSetType = () => {
    if (!editable) return;
    const next = nextSetType(set.setType);
    onUpdate(exIdx, setIdx, 'setType', next);
    if (set.done) onCorrect(exIdx, setIdx, { setType: next });
    hapticSelect();
  };

  const setTypeColors: Record<SetType, string> = {
    normal: colors.textTertiary,
    warmup: colors.warmup,
    dropset: colors.dropset,
    failure: colors.failure,
    amrap: colors.amrap,
  };

  const w = parseFloat(set.weight) || 0;
  const r = parseLoggedReps(set.reps);
  const e1rm = set.setType !== 'warmup' && w > 0 && r > 0 ? calculate1RM(w, r) : 0;
  const isWarmup = set.setType === 'warmup';

  return (
    <>
      <TouchableOpacity
        className="flex-row items-center gap-1.5 rounded-[10px] px-1 py-1.5"
        style={[
          {
            backgroundColor: set.done
              ? colors.secondaryContainer
              : isActive
                ? colors.surfaceVariant
                : 'transparent',
          },
          locked && !set.done && { opacity: 0.4 },
        ]}
        onLongPress={() => onRemove(exIdx, setIdx)}
        delayLongPress={600}
      >
        <View className="w-7 items-center">
          <TouchableOpacity
            className="h-6 w-6 items-center justify-center rounded-full"
            style={{ backgroundColor: setTypeColors[set.setType] + '33' }}
            onPress={cycleSetType}
            disabled={!editable}
            accessibilityRole="button"
            accessibilityLabel={`Tipo de série: ${SET_TYPE_PT[set.setType]}. Toca para mudar.`}
          >
            <Text className="font-sans-bold text-xs leading-4" style={{ color: setTypeColors[set.setType] }}>
              {setTypeBadgeLabel(set.setType, setIdx)}
            </Text>
          </TouchableOpacity>
        </View>
        <View className="flex-[1.2] items-center">
          <Text className="font-sans text-xs leading-4" style={{ color: colors.textTertiary }}>
            {set.previousReps && set.previousWeight ? `${set.previousReps}×${set.previousWeight}` : '–'}
          </Text>
          {e1rm > 0 && isActive && !isSimple ? (
            <Text className="mt-px font-sans-semibold text-[10px] leading-3" style={{ color: colors.textTertiary }}>≈{e1rm}kg</Text>
          ) : null}
        </View>
        <View className="flex-[1.3] flex-row gap-0.5">
          {editable && (
            <TouchableOpacity
              className="h-11 w-[26px] items-center justify-center"
              onPress={() => { adjustWeight(-2.5); if (set.done) onCorrect(exIdx, setIdx, { weight: String(Math.max(0, (parseFloat(set.weight) || 0) - 2.5)) }); }}
              hitSlop={{ top: 12, bottom: 12, left: 9, right: 9 }}
              accessibilityRole="button"
              accessibilityLabel="Reduzir peso em 2.5 quilos"
            >
              <Text className="font-sans-black text-lg leading-5" style={{ color: colors.error }}>−</Text>
            </TouchableOpacity>
          )}
          <TextInput
            ref={weightInputRef}
            className="h-11 flex-1 rounded-lg border text-center font-sans-semibold text-[15px]"
            style={{ color: colors.text, backgroundColor: editable ? colors.surfaceHighlight : 'transparent', borderColor: isActive ? colors.primary : colors.border }}
            value={set.weight}
            onChangeText={v => onUpdate(exIdx, setIdx, 'weight', v)}
            onFocus={() => { setShowQuickAdjust(true); onFocusInput(weightInputRef.current); }}
            onBlur={() => onCorrect(exIdx, setIdx)}
            keyboardType="decimal-pad"
            selectTextOnFocus
            editable={editable}
          />
          {editable && (
            <TouchableOpacity
              className="h-11 w-[26px] items-center justify-center"
              onPress={() => { adjustWeight(2.5); if (set.done) onCorrect(exIdx, setIdx, { weight: String((parseFloat(set.weight) || 0) + 2.5) }); }}
              hitSlop={{ top: 12, bottom: 12, left: 9, right: 9 }}
              accessibilityRole="button"
              accessibilityLabel="Aumentar peso em 2.5 quilos"
            >
              <Text className="font-sans-black text-lg leading-5" style={{ color: colors.secondary }}>+</Text>
            </TouchableOpacity>
          )}
        </View>
        <View className="flex-1 items-center">
          <TextInput
            ref={repsInputRef}
            className="h-11 w-full rounded-lg border text-center font-sans-semibold text-[15px]"
            style={{ color: colors.text, backgroundColor: editable ? colors.surfaceHighlight : 'transparent', borderColor: isActive ? colors.primary : colors.border }}
            value={set.reps}
            onChangeText={v => onUpdate(exIdx, setIdx, 'reps', v)}
            onFocus={() => onFocusInput(repsInputRef.current)}
            onBlur={() => onCorrect(exIdx, setIdx)}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            placeholder={repsTarget || '12-15'}
            placeholderTextColor={colors.textTertiary}
            selectTextOnFocus
            editable={editable}
            accessibilityLabel={isWarmup ? `Reps de aquecimento, alvo ${repsTarget || set.reps}` : `Reps de trabalho, alvo ${repsTarget || set.reps}`}
          />
        </View>
        {!isSimple && (
          <TouchableOpacity className="w-11 items-center justify-center" onPress={() => editable && setShowRpe(true)} disabled={!editable}>
            <Text className="font-sans-semibold text-[13px] leading-[17px]" style={{ color: set.rpe ? colors.text : colors.textTertiary }}>
              {set.rpe || '–'}
            </Text>
          </TouchableOpacity>
        )}
        <AnimatedTouchable
          className="h-9 w-9 items-center justify-center rounded-[10px]"
          style={[{ backgroundColor: set.done ? colors.secondary : colors.surfaceHighlight }, doneAnimatedStyle]}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onPress={() => { if (!set.done && !locked) { setShowQuickAdjust(false); onComplete(exIdx, setIdx); } }}
          disabled={locked}
          accessibilityRole="button"
          accessibilityLabel={
            set.done ? `Série ${setIdx + 1} concluída`
              : locked ? `Série ${setIdx + 1} bloqueada até chegar a vez`
                : `Marcar série ${setIdx + 1} como concluída`
          }
          accessibilityState={{ checked: set.done, disabled: locked }}
        >
          {locked
            ? <Lock size={15} color={colors.textTertiary} />
            : <Check size={18} color={set.done ? colors.onSecondary : colors.textTertiary} />
          }
        </AnimatedTouchable>
      </TouchableOpacity>

      {showQuickAdjust && editable && (
        <View className="mt-1 gap-1.5 rounded-[10px] border p-2" style={{ backgroundColor: colors.surfaceVariant, borderColor: colors.border }}>
          <View className="flex-row items-center gap-1.5">
            <Text className="w-[38px] font-sans-semibold text-[11px] leading-[14px]" style={{ color: colors.textSecondary }}>Peso</Text>
            {[-5, -2.5, -1.25, 1.25, 2.5, 5].map(d => (
              <TouchableOpacity
                key={d}
                className="flex-1 items-center rounded-lg py-2"
                style={{ backgroundColor: colors.surfaceHighlight }}
                onPress={() => adjustWeight(d)}
                accessibilityRole="button"
                accessibilityLabel={`${d > 0 ? 'Aumentar' : 'Reduzir'} peso em ${Math.abs(d)} quilos`}
              >
                <Text className="font-sans-bold text-[13px] leading-[17px]" style={{ color: d > 0 ? colors.secondary : colors.error }}>
                  {d > 0 ? `+${d}` : d}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {(() => {
            const targetWeight = parseFloat(set.weight) || 0;
            if (targetWeight <= 20) return null;
            const { plates } = calculatePlates(targetWeight, 'kg');
            if (plates.length === 0) return null;
            return (
              <View className="flex-row flex-wrap items-center gap-1.5">
                <Text className="w-[38px] font-sans-semibold text-[11px] leading-[14px]" style={{ color: colors.textSecondary }}>Anilhas/lado</Text>
                <Text className="shrink font-sans-semibold text-xs" style={{ color: colors.text }}>
                  {plates.map(p => `${p.count}×${p.weight}kg`).join('  +  ')}
                </Text>
              </View>
            );
          })()}

          <View className="flex-row items-center gap-1.5">
            <Text className="w-[38px] font-sans-semibold text-[11px] leading-[14px]" style={{ color: colors.textSecondary }}>Reps</Text>
            {[-1, 1].map(d => (
              <TouchableOpacity
                key={d}
                className="flex-1 items-center rounded-lg py-2"
                style={{ backgroundColor: colors.surfaceHighlight }}
                onPress={() => adjustReps(d)}
                accessibilityRole="button"
                accessibilityLabel={`${d > 0 ? 'Mais' : 'Menos'} uma repetição`}
              >
                <Text className="font-sans-bold text-[13px] leading-[17px]" style={{ color: d > 0 ? colors.secondary : colors.error }}>
                  {d > 0 ? `+${d}` : d}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              className="items-center rounded-lg border px-2.5 py-2"
              style={{ borderColor: colors.border }}
              onPress={() => setShowQuickAdjust(false)}
              accessibilityRole="button"
              accessibilityLabel="Fechar ajuste rapido"
            >
              <X size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showRpe && (
        <View className="mt-1 gap-2 rounded-[10px] border p-2.5" style={{ backgroundColor: colors.surfaceVariant, borderColor: colors.border }}>
          <Text className="font-sans-semibold text-[11px] leading-[14px]" style={{ color: colors.textSecondary }}>RPE (Esforço Percebido)</Text>
          <Text className="font-sans text-[11px] leading-[15px]" style={{ color: colors.textTertiary }}>
            RPE 10 = até à falha · cada ponto abaixo ≈ +1 rep em reserva (ex.: RPE 8 ≈ 2 reps em reserva)
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 48 }}>
            <View className="flex-row items-center gap-1.5">
              {RPE_VALUES.map(r => (
                <TouchableOpacity
                  key={r}
                  className="h-10 w-10 items-center justify-center rounded-[10px]"
                  style={{ backgroundColor: set.rpe === r ? colors.primary : colors.surfaceHighlight }}
                  onPress={() => { onUpdate(exIdx, setIdx, 'rpe', r); if (set.done) onCorrect(exIdx, setIdx, { rpe: r }); setShowRpe(false); }}
                >
                  <Text className="font-sans-bold text-sm" style={{ color: set.rpe === r ? colors.onPrimary : colors.text }}>{r}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                className="h-10 w-10 items-center justify-center rounded-[10px]"
                style={{ backgroundColor: colors.surfaceHighlight }}
                onPress={() => { onUpdate(exIdx, setIdx, 'rpe', null); if (set.done) onCorrect(exIdx, setIdx, { rpe: null }); setShowRpe(false); }}
              >
                <X size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}
    </>
  );
});
