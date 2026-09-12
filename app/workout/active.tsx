import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, FlatList, Modal, Platform, Vibration, ActivityIndicator, BackHandler, KeyboardAvoidingView, Keyboard } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedReaction, withSequence, withTiming, withSpring, ZoomIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useAppMode } from '@/hooks/useAppMode';
import { useStopwatch, useCountdown } from '@/hooks/useTimers';
import { getPlanExercisesWithDetails } from '@/db/planDao';
import { getAdaptiveStatus } from '@/utils/adaptiveService';
import { getExerciseStates, type AdaptiveExerciseStateRow } from '@/db/adaptiveDao';
import { PHASE_LABEL_PT, PHASE_COLOR, phaseSpec } from '@/utils/adaptivePlan';
import type { AdaptiveGoal, AdaptivePhase } from '@/utils/nspi';
import { createSession, updateSession, discardSession, addSet, updateWorkoutSet, getLastSetForExercise, getHistoricalRpeAtWeight , getProgressionSuggestion, getSessionTemplate } from '@/db/workoutDao';
import { searchExercises, getAlternativeExercises, setExerciseUserNotes } from '@/db/exerciseDao';
import { getSettingWithDefault, DEFAULT_SETTINGS } from '@/db/settingsDao';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { scheduleRestEndNotification, cancelRestEndNotification } from '@/utils/restNotification';
import type { Exercise, SetType, MuscleGroup } from '@/types';
import { MUSCLE_GROUPS_PT, EQUIPMENT_PT } from '@/types';
import { SearchBar } from '@/components/ui/SearchBar';
import { ExerciseTile } from '@/components/ui/ExerciseTile';
import { formatTime } from '@/utils/format';
import { parseTempo, calculatePlates } from '@/utils/calculators';
import { hapticTap, hapticSuccess, hapticWarning, hapticSelect } from '@/utils/haptics';
import { playRestEndSound } from '@/utils/sound';
import { findSupersetPartner } from '@/utils/supersets';
import { isSetLocked } from '@/utils/setLocking';
import { restSecondsFor } from '@/utils/planGenerator';
import { suggestSetAdjustment, type AutoRegulationSuggestion } from '@/utils/autoRegulation';
import { TempoMetronomeBox } from '@/components/workout/TempoMetronomeBox';
import { RestRing } from '@/components/ui/RestRing';
import { generateLiveCoachingTips, type CoachingTip } from '@/utils/livCoachingTips';
import { LiveCoachingStack } from '@/components/ui/LiveCoachingTip';
import { X, Plus, Check, Timer, RotateCcw, ChevronDown, ChevronUp, Trophy, StickyNote, Repeat, TrendingUp, Pause, Play, Gauge, Star, Image as ImageIcon, Lock } from 'lucide-react-native';
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
}

const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function ActiveWorkoutScreen() {
  const { planId, planName, dayIndex, repeatSessionId } = useLocalSearchParams<{ planId: string; planName: string; dayIndex?: string; repeatSessionId?: string }>();
  const { colors } = useTheme();
  const { isSimple } = useAppMode();
  const router = useRouter();

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [exercises, setExercises] = useState<ActiveExercise[]>([]);
  const [restActive, setRestActive] = useState(false);
  const [restDuration, setRestDuration] = useState(Number(DEFAULT_SETTINGS.defaultRestSeconds));
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
  const focusedInputRef = useRef<any>(null);
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
  const { elapsed: totalElapsed } = useStopwatch(!workoutPaused);

  // Rest timer
  const { remaining: restRemaining, isFinished: restFinished, addTime: addRestTime, reset: resetRest } = useCountdown(restDuration, restActive, () => {
    if (vibrateEnabled) Vibration.vibrate([0, 300, 100, 300]);
    if (soundEnabled) playRestEndSound();
    // The app is open and already alerting — the scheduled notification for
    // this same rest period becoming redundant, cancel it so it doesn't also
    // pop up a few seconds later (harmless if it already fired, but avoids
    // a lingering duplicate alert while the app is in the foreground).
    cancelRestEndNotification().catch(() => {});
    // BUGFIX (reported: "the rest timer only works on the first rest —
    // every rest after that stays stuck at the default"): completeSet()
    // calls setRestActive(true) to start each new rest period, but if it
    // was ALREADY true from the previous rest (never reset when that one
    // naturally finished), that call is a no-op — React only re-runs an
    // effect when its dependency's VALUE actually changes. useCountdown's
    // interval-creating effect depends on `running`, so with no real
    // false→true transition, no new interval was ever created; resetRest()
    // still correctly set the starting number, it just never ticked down
    // again. Explicitly resetting here guarantees the next start is a real
    // transition.
    setRestActive(false);
  });

  // Five-second warning, distinct from the end-of-rest alert.
  //
  // In a noisy gym the phone is often face-down in a bag; a single buzz at
  // zero is easy to miss and gives no time to get back to the bar. A short
  // double pulse at five seconds is the heads-up. Guarded by a ref so it
  // fires once per rest period rather than on every tick that happens to
  // land on 5, and it reuses the same vibrate setting as the final alert.
  const fiveSecondWarningRef = useRef(false);
  useEffect(() => {
    if (!restActive) {
      fiveSecondWarningRef.current = false;
      return;
    }
    if (restRemaining <= 5 && restRemaining > 0 && !fiveSecondWarningRef.current) {
      fiveSecondWarningRef.current = true;
      if (vibrateEnabled) Vibration.vibrate([0, 120, 80, 120]);
    }
  }, [restActive, restRemaining, vibrateEnabled]);

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
    setRestDuration(parseInt(defaultRest));
    setVibrateEnabled(await getSettingWithDefault('vibrateEnabled', '1') === '1');
    setSoundEnabled(await getSettingWithDefault('soundEnabled', '1') === '1');
    setRestRemindersEnabled(await getSettingWithDefault('restNotifyEnabled', '1') === '1');
    setKeepAwake(await getSettingWithDefault('keepScreenAwake', '1') === '1');

    // Create session
    const sid = await createSession(planName || 'Treino', Number(planId) || null);
    setSessionId(sid);

    // Repeat a previous session: rebuild the same exercises and set counts,
    // pre-filled with the loads used last time.
    if (repeatSessionId) {
      const template = await getSessionTemplate(Number(repeatSessionId));
      const repeated: ActiveExercise[] = await Promise.all(template.map(async (t, i) => {
        const progression = await getProgressionSuggestion(t.exercise_id, String(t.reps));
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
          sets: Array.from({ length: t.sets }, () => ({
            reps: String(t.reps),
            weight,
            rpe: null,
            setType: 'normal' as SetType,
            done: false,
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

    if (Number(planId) > 0) {
      const allPlanExs = await getPlanExercisesWithDetails(Number(planId));
      // Load only the selected training day. Without this, starting a workout
      // from a multi-day plan queued up every exercise of every day at once.
      const planExs = dayIndex !== undefined && dayIndex !== ''
        ? allPlanExs.filter(pe => (pe.day_index ?? 0) === Number(dayIndex))
        : allPlanExs;
      const activeExs: ActiveExercise[] = await Promise.all(
        planExs.map(async (pe, i) => {
          const lastSet = await getLastSetForExercise(pe.exercise_id);
          const reps = pe.reps_target || '8';
          const progression = await getProgressionSuggestion(pe.exercise_id, pe.reps_target || '');
          // Pre-fill with the suggested load when the user cleared the rep
          // range last time, otherwise repeat last session's weight.
          const weight = progression?.shouldProgress
            ? String(progression.suggestedWeight)
            : lastSet ? String(lastSet.weight) : String(pe.weight_target || 0);
          return {
            planExerciseId: pe.id,
            exerciseId: pe.exercise_id,
            name: pe.exercise_name,
            primaryMuscle: pe.primary_muscle,
            equipment: pe.equipment,
            sets: Array.from({ length: pe.sets }, () => ({ reps, weight, rpe: null, setType: pe.set_type as SetType, done: false })),
            defaultSets: pe.sets,
            defaultRepsTarget: pe.reps_target,
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
          };
        })
      );
      setExercises(activeExs);
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
    setExercises(prev => prev.map((e, i) => i === idx ? {
      ...e,
      exerciseId: alt.id,
      name: alt.name,
      primaryMuscle: alt.primary_muscle,
      equipment: alt.equipment,
      userNotes: (alt as any).user_notes || '',
      progression: null,
      imageUrl: alt.image_url || '',
      // Keep the same number of sets, but reset loads to this exercise's own
      // history rather than carrying over the previous exercise's weight.
      sets: e.sets.map(s => ({
        ...s,
        weight: s.done ? s.weight : (lastSet ? String(lastSet.weight) : '0'),
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
    const defaultReps = '8-12';
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
    const reps = lastSet ? String(lastSet.reps) : '10';
    const newEx: ActiveExercise = {
      exerciseId: ex.id,
      name: ex.name,
      primaryMuscle: ex.primary_muscle,
      equipment: ex.equipment,
      sets: [{ reps, weight, rpe: null, setType: 'normal', done: false }],
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
        reps: ex.defaultRepsTarget || '8',
        weight: String(ex.defaultWeight || 0),
        rpe: null,
        setType: 'normal' as SetType,
      };
      return { ...ex, sets: [...ex.sets, { ...base, done: false }] };
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

  const updateSet = (exIdx: number, setIdx: number, field: string, value: any) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      return { ...ex, sets: ex.sets.map((s, si) => si === setIdx ? { ...s, [field]: value } : s) };
    }));
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
    overrides?: { reps?: string; weight?: string; rpe?: number | null },
  ) => {
    const set = exercises[exIdx]?.sets[setIdx];
    if (!set?.done || !set.dbId) return;
    updateWorkoutSet(set.dbId, {
      reps: parseInt(overrides?.reps ?? set.reps) || 0,
      weight: parseFloat(overrides?.weight ?? set.weight) || 0,
      rpe: overrides && 'rpe' in overrides ? overrides.rpe! : set.rpe,
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
    const reps = parseInt(set.reps) || 0;
    const weight = parseFloat(set.weight) || 0;

    const { id: dbId, isPr } = await addSet(
      sessionId, ex.exerciseId, setIdx, reps, weight, set.rpe,
      0, setElapsed, set.setType
    );

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
        lastSetReps: setIdx > 0 ? parseInt(ex.sets[setIdx - 1].reps) || 0 : undefined,
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
    resetRest(restForExercise);
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

  const totalVolume = exercises.reduce((sum, ex) =>
    sum + ex.sets.filter(s => s.done).reduce((v, s) => v + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0), 0
  );
  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.done).length, 0);
  // For the sticky progress bar — every set across every exercise, done or
  // not, so "12 de 20 séries" means what it says.
  const totalPlannedSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);

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
    // opposite of what tapping something called "cancel" should do. Now
    // there are two genuinely different options: discard (deletes the
    // session and its sets entirely — nothing saved) and save-and-exit
    // (the old behavior, for when you actually did some work and just
    // want to stop here rather than finish properly).
    Alert.alert('Sair do treino', 'O que queres fazer?', [
      { text: 'Continuar treino', style: 'cancel' },
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
        text: 'Guardar e sair', onPress: async () => {
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
  }, [sessionId, router, totalElapsed, totalVolume, totalSets]);

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
    <SafeAreaView edges={['top','bottom']} style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleCancel} style={[styles.cancelBtn, { backgroundColor: colors.surfaceVariant }]} accessibilityRole="button" accessibilityLabel="Cancelar treino">
          <X size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={[styles.workoutName, { color: colors.text }]} numberOfLines={1}>{planName}</Text>
          <TouchableOpacity
            onPress={() => setWorkoutPaused(p => !p)}
            style={styles.timerRow}
            accessibilityRole="button"
            accessibilityLabel={workoutPaused ? 'Retomar treino' : 'Pausar treino'}
          >
            <Text style={[styles.totalTimer, { color: workoutPaused ? colors.textTertiary : colors.primary }]}>
              {formatTime(totalElapsed)}
            </Text>
            {workoutPaused ? (
              <Play size={16} color={colors.textTertiary} />
            ) : (
              <Pause size={16} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleFinish} style={[styles.finishBtn, { backgroundColor: colors.secondary }]} accessibilityRole="button" accessibilityLabel="Terminar treino">
          <Text style={styles.finishText}>Terminar</Text>
        </TouchableOpacity>
      </View>

      {/* Paused banner — makes the paused state unmistakable, since the timer
          alone (just not incrementing) is easy to miss mid-workout. */}
      {workoutPaused && (
        <View style={[styles.pausedBanner, { backgroundColor: colors.accentContainer }]}>
          <Pause size={14} color={colors.accent} />
          <Text style={[styles.pausedBannerText, { color: colors.accent }]}>Treino em pausa</Text>
          <TouchableOpacity onPress={() => setWorkoutPaused(false)} accessibilityRole="button" accessibilityLabel="Retomar treino">
            <Text style={[styles.pausedBannerAction, { color: colors.accent }]}>Retomar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Stats bar */}
      <View style={[styles.statsBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>{totalSets}</Text>
          <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Séries</Text>
        </View>
        <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>{Math.round(totalVolume)} kg</Text>
          <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Volume</Text>
        </View>
        <View style={[styles.statDiv, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>{exercises.filter(ex => ex.sets.some(s => s.done)).length}</Text>
          <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Exercícios</Text>
        </View>
      </View>

      {/* Rest timer — circular ring clock (redesigned from a slim text bar
          per a request for a circular countdown instead). Same countdown
          state/notification logic as before; this only changes how it's
          drawn. */}
      {restActive && !restFinished && (
        <View style={[styles.restCard, { backgroundColor: colors.surface, borderColor: restRemaining <= 10 ? colors.error : colors.border }]}>
          <TouchableOpacity
            onPress={() => { setRestActive(false); cancelRestEndNotification().catch(() => {}); }}
            style={styles.restCloseBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Fechar descanso"
          >
            <X size={16} color={colors.textTertiary} />
          </TouchableOpacity>

          <Text style={[styles.restLabel, { color: colors.textSecondary }]}>DESCANSO</Text>

          <View style={styles.restRingRow}>
            <TouchableOpacity
              onPress={() => {
                addRestTime(-15);
                // Keep the scheduled notification's timing in sync with a
                // manual -15s/+15s adjustment, using the post-adjustment
                // remaining time rather than the stale pre-adjustment value.
                if (restRemindersEnabled) scheduleRestEndNotification(Math.max(1, restRemaining - 15), '').catch(() => {});
              }}
              style={[styles.restAdjPill, { backgroundColor: colors.surfaceVariant }]}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Reduzir descanso em 15 segundos"
            >
              <Text style={[styles.restAdjText, { color: colors.text }]}>-15s</Text>
            </TouchableOpacity>

            <RestRing
              remaining={restRemaining}
              duration={restDuration}
              color={restRemaining <= 10 ? colors.error : colors.primary}
              trackColor={colors.surfaceVariant}
            />

            <TouchableOpacity
              onPress={() => {
                addRestTime(15);
                if (restRemindersEnabled) scheduleRestEndNotification(restRemaining + 15, '').catch(() => {});
              }}
              style={[styles.restAdjPill, { backgroundColor: colors.surfaceVariant }]}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Aumentar descanso em 15 segundos"
            >
              <Text style={[styles.restAdjText, { color: colors.text }]}>+15s</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* PR notification */}
      {newPrs.length > 0 && (
        <Animated.View
          entering={ZoomIn.springify().damping(12)}
          exiting={FadeOut.duration(200)}
          style={[styles.prNotif, { backgroundColor: colors.accentContainer }]}
        >
          <Trophy size={16} color={colors.accent} />
          <Text style={[styles.prText, { color: colors.accent }]}>PR: {newPrs[0]}</Text>
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
          style={[styles.adjustNotif, { backgroundColor: colors.primaryContainer }]}
        >
          <Gauge size={16} color={colors.primary} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.adjustText, { color: colors.text }]}>
              {adjustmentSuggestion.exerciseName}: normalmente {adjustmentSuggestion.weight}kg é RPE {adjustmentSuggestion.suggestion.historicalAvgRpe} para ti — hoje sentiu-se diferente.
              {adjustmentSuggestion.suggestion.direction === 'decrease' ? ' Baixar um pouco a próxima série?' : ' Talvez consigas subir um pouco?'}
            </Text>
            <View style={styles.adjustActions}>
              <TouchableOpacity onPress={applyAdjustmentSuggestion} accessibilityRole="button" accessibilityLabel="Aplicar ajuste sugerido">
                <Text style={[styles.adjustActionText, { color: colors.primary }]}>
                  {adjustmentSuggestion.suggestion.direction === 'decrease' ? 'Baixar' : 'Subir'} próxima série
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAdjustmentSuggestion(null)} accessibilityRole="button" accessibilityLabel="Ignorar sugestão">
                <Text style={[styles.adjustActionText, { color: colors.textTertiary }]}>Ignorar</Text>
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
        contentContainerStyle={styles.exerciseList}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {exercises.map((ex, exIdx) => (
          <View
            key={exIdx}
            style={[
              styles.exCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              supersetFocusIdx === exIdx && { borderColor: colors.accent, borderWidth: 2 },
            ]}
          >
            {ex.supersetGroup != null && (
              <View style={[styles.supersetBadge, { backgroundColor: supersetFocusIdx === exIdx ? colors.accent : colors.surfaceVariant }]}>
                <Text style={[styles.supersetBadgeText, { color: supersetFocusIdx === exIdx ? '#fff' : colors.textSecondary }]}>
                  {supersetFocusIdx === exIdx ? 'A SEGUIR — SUPERSET' : `SUPERSET ${ex.supersetGroup}`}
                </Text>
              </View>
            )}
            {/* Exercise header */}
            <TouchableOpacity
              style={styles.exHeader}
              onPress={() => setExercises(prev => prev.map((e, i) => i === exIdx ? { ...e, expanded: !e.expanded } : e))}
              onLongPress={() => removeExerciseFromWorkout(exIdx)}
              delayLongPress={500}
              accessibilityHint="Manter premido para remover este exercício do treino"
            >
              {/* BUGFIX (reported: "só o nome não me diz nada" — a generic
                  muscle-group icon looked the same for every exercise
                  working that muscle, so nothing here actually showed WHICH
                  movement this was). Shows the real illustration as a small
                  thumbnail when the dataset has one; falls back to the
                  muscle icon for the curated exercises that don't. */}
              {ex.imageUrl ? (
                <TouchableOpacity
                  onPress={() => setDemoFor({ name: ex.name, url: ex.imageUrl! })}
                  style={styles.exThumbWrap}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver ilustração de ${ex.name} em ecrã inteiro`}
                >
                  <ExerciseMedia uri={ex.imageUrl} height={38} />
                </TouchableOpacity>
              ) : (
                <ExerciseTile muscle={ex.primaryMuscle as MuscleGroup} equipment={ex.equipment as any} size={38} />
              )}
              <View style={[styles.exDot, { backgroundColor: ex.sets.every(s => s.done) ? colors.secondary : colors.primary }]} />
              <View style={styles.exHeaderInfo}>
                <Text style={[styles.exName, { color: colors.text }]}>{ex.name}</Text>
                <Text style={[styles.exMeta, { color: colors.textSecondary }]}>
                  {MUSCLE_GROUPS_PT[ex.primaryMuscle as MuscleGroup] || ex.primaryMuscle} · {ex.sets.filter(s => s.done).length}/{ex.sets.length} séries
                </Text>
              </View>
              {adaptiveInfo?.states.has(ex.exerciseId) && (
                <TouchableOpacity
                  onPress={() => setWhyTargetFor(exIdx)}
                  hitSlop={8}
                  style={{ marginRight: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Porquê este alvo em ${ex.name}`}
                >
                  <Star size={17} color={colors.accent} fill={colors.accent} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => openSubstitute(exIdx)}
                hitSlop={8}
                style={{ marginRight: 10 }}
                accessibilityRole="button"
                accessibilityLabel={`Substituir ${ex.name} por alternativa`}
              >
                <Repeat size={17} color={colors.textTertiary} />
              </TouchableOpacity>
              {ex.expanded ? <ChevronUp size={18} color={colors.textTertiary} /> : <ChevronDown size={18} color={colors.textTertiary} />}
            </TouchableOpacity>

            {ex.expanded && (
              <View style={styles.exBody}>
                {/* Full-size illustration for the exercise actually open right
                   now — the small header thumbnail is enough to recognise an
                   exercise at a glance, but the one you're about to do
                   deserves to be seen clearly, not just named. Tapping it
                   opens the same view full-screen. */}
                {!!ex.imageUrl && (
                  <TouchableOpacity
                    onPress={() => setDemoFor({ name: ex.name, url: ex.imageUrl! })}
                    activeOpacity={0.85}
                    style={{ marginBottom: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver ilustração de ${ex.name} em ecrã inteiro`}
                  >
                    <ExerciseMedia uri={ex.imageUrl} height={170} />
                  </TouchableOpacity>
                )}
                {/* Double-progression hint from the previous session */}
                {ex.progression && (
                  <View style={[styles.progressHint, { backgroundColor: colors.secondaryContainer }]}>
                    <TrendingUp size={14} color={colors.secondary} />
                    <Text style={[styles.progressHintText, { color: colors.secondary }]}>
                      Sobe para {ex.progression.suggestedWeight}kg · {ex.progression.reason}
                    </Text>
                  </View>
                )}

                {/* Sticky personal notes for this exercise */}
                {editingNotesFor === exIdx ? (
                  <View style={styles.notesEdit}>
                    <TextInput
                      style={[styles.notesInput, { color: colors.text, backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                      value={notesDraft}
                      onChangeText={setNotesDraft}
                      placeholder="Ex: banco na posição 4, pega larga"
                      placeholderTextColor={colors.textTertiary}
                      multiline
                      autoFocus
                    />
                    <TouchableOpacity
                      style={[styles.notesSave, { backgroundColor: colors.primary }]}
                      onPress={() => saveNotes(exIdx)}
                      accessibilityRole="button"
                      accessibilityLabel="Guardar notas do exercicio"
                    >
                      <Check size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.notesRow}
                    onPress={() => { setNotesDraft(ex.userNotes || ''); setEditingNotesFor(exIdx); }}
                    accessibilityRole="button"
                    accessibilityLabel={ex.userNotes ? 'Editar notas do exercicio' : 'Adicionar notas ao exercicio'}
                  >
                    <StickyNote size={14} color={ex.userNotes ? colors.accent : colors.textTertiary} />
                    <Text
                      style={[styles.notesText, { color: ex.userNotes ? colors.text : colors.textTertiary }]}
                      numberOfLines={2}
                    >
                      {ex.userNotes || 'Adicionar nota (posição do banco, pega...)'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Rep cadence (tempo) metronome — isolated component, see PERF
                    note near the top of this file for why. Hidden in Modo
                    Simples along with RPE and auto-regulation — someone who
                    finds those too much clutter doesn't want a metronome
                    box either. */}
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

                {/* Live coaching tips for this exercise */}
                {coachingExerciseIdx === exIdx && coachingTips.length > 0 && (
                  <View style={styles.coachingTipsContainer}>
                    <LiveCoachingStack
                      tips={coachingTips}
                      maxTips={2}
                      onDismiss={(idx) => {
                        setCoachingTips(prev => prev.filter((_, i) => i !== idx));
                      }}
                    />
                  </View>
                )}

                {/* Set header */}
                <View style={styles.setHeaderRow}>
                  <Text style={[styles.setHeaderCell, styles.setNumCell, { color: colors.textTertiary }]}>S</Text>
                  <Text style={[styles.setHeaderCell, styles.setPrevCell, { color: colors.textTertiary }]}>ANTERIOR</Text>
                  <Text style={[styles.setHeaderCell, styles.setRepsCell, { color: colors.textTertiary }]}>REPS</Text>
                  <Text style={[styles.setHeaderCell, styles.setWeightCell, { color: colors.textTertiary }]}>KG</Text>
                  {!isSimple && <Text style={[styles.setHeaderCell, styles.setRpeCell, { color: colors.textTertiary }]}>RPE</Text>}
                  <View style={styles.setDoneCell} />
                </View>

                {/* Only the current (next-to-log) set accepts input; sets
                    further down wait their turn — see isSetLocked. */}
                {ex.sets.map((set, setIdx) => (
                  <SetRow
                    key={setIdx}
                    set={set}
                    setIdx={setIdx}
                    exIdx={exIdx}
                    colors={colors}
                    isSimple={isSimple}
                    locked={isSetLocked(ex.sets, setIdx)}
                    onUpdate={updateSet}
                    onComplete={completeSet}
                    onRemove={removeSet}
                    onCorrect={persistSetCorrection}
                    onFocusInput={ref => { focusedInputRef.current = ref; }}
                  />
                ))}

                <TouchableOpacity style={[styles.addSetBtn, { borderColor: colors.border }]} onPress={() => addSetToExercise(exIdx)} accessibilityRole="button" accessibilityLabel="Adicionar série">
                  <Plus size={16} color={colors.primary} />
                  <Text style={[styles.addSetText, { color: colors.primary }]}>Série</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        {/* Add exercise button */}
        <TouchableOpacity
          style={[styles.addExBtn, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}
          onPress={() => { setPickerQuery(''); setShowAddExercise(true); }}
          accessibilityRole="button"
          accessibilityLabel="Adicionar exercício ao treino"
        >
          <Plus size={20} color={colors.primary} />
          <Text style={[styles.addExText, { color: colors.primary }]}>Adicionar Exercício</Text>
        </TouchableOpacity>


        {/* Set timer */}
        <View style={[styles.setTimerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.setTimerRow}>
            <Timer size={18} color={colors.textSecondary} />
            <Text style={[styles.setTimerLabel, { color: colors.textSecondary }]}>Tempo de série</Text>
            <Text style={[styles.setTimerValue, { color: colors.text }]}>{formatTime(setElapsed)}</Text>
          </View>
          <View style={styles.setTimerButtons}>
            <TouchableOpacity style={[styles.setTimerBtn, { backgroundColor: setTimerActive ? colors.error : colors.secondary }]} onPress={() => setSetTimerActive(!setTimerActive)} accessibilityRole="button" accessibilityLabel={setTimerActive ? 'Parar cronómetro de série' : 'Iniciar cronómetro de série'}>
              <Text style={styles.setTimerBtnText}>{setTimerActive ? 'Parar' : 'Iniciar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.setTimerBtn, { backgroundColor: colors.surfaceVariant }]} onPress={() => { resetSetTimer(); setSetTimerActive(false); }} accessibilityRole="button" accessibilityLabel="Reiniciar cronómetro de série">
              <RotateCcw size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky progress bar — "how much is left" at a glance without
          scrolling back up, for a workout that can run 5+ exercises long. */}
      {totalPlannedSets > 0 && (
        <View style={[styles.progressFooter, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Text style={[styles.progressFooterText, { color: colors.textSecondary }]}>
            {totalSets} de {totalPlannedSets} séries ({Math.round((totalSets / totalPlannedSets) * 100)}%)
          </Text>
          <View style={[styles.progressFooterTrack, { backgroundColor: colors.surfaceVariant }]}>
            <View style={[styles.progressFooterFill, { backgroundColor: colors.secondary, width: `${Math.min(100, (totalSets / totalPlannedSets) * 100)}%` }]} />
          </View>
        </View>
      )}

      {/* Exercise picker */}
      <Modal visible={showAddExercise} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddExercise(false)}>
        <View style={[styles.picker, { backgroundColor: colors.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Adicionar Exercício</Text>
            <TouchableOpacity onPress={() => setShowAddExercise(false)}><X size={24} color={colors.text} /></TouchableOpacity>
          </View>
          <View style={{ padding: 12 }}>
            <SearchBar value={pickerQuery} onChangeText={setPickerQuery} placeholder="Pesquisar..." />
          </View>
          <FlatList
            data={pickerResults}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.pickerItem, { borderBottomColor: colors.border }]} onPress={() => addExerciseToWorkout(item)}>
                {item.image_url ? (
                  <View style={styles.pickerThumbWrap}>
                    <ExerciseMedia uri={item.image_url} height={40} />
                  </View>
                ) : (
                  <ExerciseTile muscle={item.primary_muscle} equipment={item.equipment} size={40} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>{MUSCLE_GROUPS_PT[item.primary_muscle]} · {EQUIPMENT_PT[item.equipment]}</Text>
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
        <View style={styles.finishOverlay}>
          <View style={[styles.finishModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.finishTitle, { color: colors.text }]}>Terminar treino?</Text>
            <View style={styles.finishStats}>
              <View style={styles.finishStat}>
                <Text style={[styles.finishStatVal, { color: colors.primary }]}>{formatTime(totalElapsed)}</Text>
                <Text style={[styles.finishStatLabel, { color: colors.textSecondary }]}>Duração</Text>
              </View>
              <View style={styles.finishStat}>
                <Text style={[styles.finishStatVal, { color: colors.primary }]}>{totalSets}</Text>
                <Text style={[styles.finishStatLabel, { color: colors.textSecondary }]}>Séries</Text>
              </View>
              <View style={styles.finishStat}>
                <Text style={[styles.finishStatVal, { color: colors.primary }]}>{Math.round(totalVolume)} kg</Text>
                <Text style={[styles.finishStatLabel, { color: colors.textSecondary }]}>Volume</Text>
              </View>
            </View>

            {/* "Mark complete" — glide through the rest of the workout using
                the reps/weight already filled in, instead of tapping every
                remaining set (inspired by EvolveYou's mark-complete option). */}
            {totalUndoneSets > 0 && (
              <View style={[styles.undoneNotice, { backgroundColor: colors.surfaceVariant }]}>
                <Text style={[styles.undoneNoticeText, { color: colors.textSecondary }]}>
                  {totalUndoneSets} {totalUndoneSets === 1 ? 'série' : 'séries'} por registar
                </Text>
                <TouchableOpacity onPress={bulkCompleteRemaining} accessibilityRole="button" accessibilityLabel="Concluir séries restantes com os valores atuais">
                  <Text style={[styles.undoneNoticeAction, { color: colors.primary }]}>Concluir tudo</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={[styles.confirmFinishBtn, { backgroundColor: colors.secondary }]} onPress={confirmFinish}>
              <Text style={styles.confirmFinishText}>Guardar Treino</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.continueBtn, { borderColor: colors.border }]} onPress={() => setShowFinish(false)}>
              <Text style={[styles.continueBtnText, { color: colors.textSecondary }]}>Continuar a treinar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Substitute exercise (machine taken / equipment unavailable) */}
      <Modal visible={substituteFor !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSubstituteFor(null)}>
        <View style={[styles.picker, { backgroundColor: colors.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Substituir exercício</Text>
              <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>
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
                style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                onPress={() => applySubstitute(item)}
                accessibilityRole="button"
                accessibilityLabel={`Substituir por ${item.name}`}
              >
                {item.image_url ? (
                  <View style={styles.pickerThumbWrap}>
                    <ExerciseMedia uri={item.image_url} height={40} />
                  </View>
                ) : (
                  <ExerciseTile muscle={item.primary_muscle} equipment={item.equipment} size={40} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.pickerSub, { color: colors.textSecondary }]}>
                    {MUSCLE_GROUPS_PT[item.primary_muscle]} · {EQUIPMENT_PT[item.equipment]}
                  </Text>
                </View>
                <Repeat size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14, padding: 20, textAlign: 'center' }}>
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
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>
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
            <View style={{ padding: 16 }}>
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
          style={styles.whyOverlay}
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
              <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.whyCard, { backgroundColor: colors.surface }]}>
                <View style={styles.whyHeaderRow}>
                  <Star size={18} color={colors.accent} fill={colors.accent} />
                  <Text style={[styles.whyTitle, { color: colors.text }]}>Porquê este alvo</Text>
                </View>
                <Text style={[styles.whyExName, { color: colors.textSecondary }]}>{ex.name}</Text>

                <View style={[styles.whyPhaseRow, { backgroundColor: PHASE_COLOR[adaptiveInfo.phase] + '1A' }]}>
                  <View style={[styles.phaseDotSmall, { backgroundColor: PHASE_COLOR[adaptiveInfo.phase] }]} />
                  <Text style={[styles.whyPhaseText, { color: PHASE_COLOR[adaptiveInfo.phase] }]}>
                    Fase de {PHASE_LABEL_PT[adaptiveInfo.phase]}
                  </Text>
                </View>

                <View style={styles.whyRow}>
                  <Text style={[styles.whyLabel, { color: colors.textSecondary }]}>Peso alvo</Text>
                  <Text style={[styles.whyValue, { color: colors.text }]}>
                    ~{Math.round(spec.intensityPct * 100)}% do teu 1RM estimado
                  </Text>
                </View>
                <View style={styles.whyRow}>
                  <Text style={[styles.whyLabel, { color: colors.textSecondary }]}>Janela de reps</Text>
                  <Text style={[styles.whyValue, { color: colors.text }]}>{state.current_reps_low}–{state.current_reps_high}</Text>
                </View>
                {state.step_stall_count > 0 && (
                  <View style={styles.whyRow}>
                    <Text style={[styles.whyLabel, { color: colors.textSecondary }]}>Sem progressão há</Text>
                    <Text style={[styles.whyValue, { color: colors.text }]}>{state.step_stall_count} semana{state.step_stall_count > 1 ? 's' : ''}</Text>
                  </View>
                )}

                <Text style={[styles.whyExpect, { color: colors.textTertiary }]}>{spec.expect}</Text>

                <TouchableOpacity
                  style={[styles.whyCloseBtn, { backgroundColor: colors.surfaceVariant }]}
                  onPress={() => setWhyTargetFor(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Fechar"
                >
                  <Text style={[styles.whyCloseBtnText, { color: colors.text }]}>Entendido</Text>
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
 */
function SetRow({ set, setIdx, exIdx, colors, isSimple, locked, onUpdate, onComplete, onRemove, onCorrect, onFocusInput }: {
  set: ActiveExercise['sets'][0]; setIdx: number; exIdx: number; colors: any; isSimple: boolean;
  /** True for an undone set that isn't next in line yet — see the
   *  firstUndoneIdx computation where SetRow is rendered. Blocks input and
   *  completing out of order; a done set is never locked, so it can always
   *  be corrected. */
  locked: boolean;
  onUpdate: (exIdx: number, setIdx: number, field: string, value: any) => void;
  onComplete: (exIdx: number, setIdx: number) => void;
  onRemove: (exIdx: number, setIdx: number) => void;
  /** Persists an edit made to an already-done set — see persistSetCorrection. */
  onCorrect: (exIdx: number, setIdx: number, overrides?: { reps?: string; weight?: string; rpe?: number | null }) => void;
  /** Registers whichever input the person just tapped into, so the screen
   *  can scroll it clear of the keyboard once it's done animating in. */
  onFocusInput: (ref: any) => void;
}) {
  // Editable either because it's done (correcting a mistake) or because
  // it's the current set; a future, not-yet-reached set is neither.
  const editable = set.done || !locked;
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
  };

  const adjustReps = (delta: number) => {
    const current = parseInt(set.reps) || 0;
    onUpdate(exIdx, setIdx, 'reps', String(Math.max(0, current + delta)));
  };

  const setTypeColors: Record<SetType, string> = {
    normal: colors.textTertiary,
    warmup: colors.warmup,
    dropset: colors.dropset,
    failure: colors.failure,
    amrap: colors.amrap,
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.setRow, set.done && { opacity: 0.5 }, locked && { opacity: 0.4 }]}
        onLongPress={() => onRemove(exIdx, setIdx)}
        delayLongPress={600}
      >
        <View style={styles.setNumCell}>
          <View style={[styles.setNumBadge, { backgroundColor: setTypeColors[set.setType] + '33' }]}>
            <Text style={[styles.setNumText, { color: setTypeColors[set.setType] }]}>{setIdx + 1}</Text>
          </View>
        </View>
        <View style={styles.setPrevCell}>
          <Text style={[styles.setPrevText, { color: colors.textTertiary }]}>
            {set.reps && set.weight ? `${set.reps}×${set.weight}` : '–'}
          </Text>
        </View>
        <View style={styles.setRepsCell}>
          <TextInput
            ref={repsInputRef}
            style={[styles.setInput, { color: colors.text, backgroundColor: editable ? colors.surfaceVariant : 'transparent', borderColor: colors.border }]}
            value={set.reps}
            onChangeText={v => onUpdate(exIdx, setIdx, 'reps', v)}
            onFocus={() => onFocusInput(repsInputRef.current)}
            onBlur={() => onCorrect(exIdx, setIdx)}
            keyboardType="numeric"
            selectTextOnFocus
            editable={editable}
          />
        </View>
        <View style={[styles.setWeightCell, styles.weightCellRow]}>
          {editable && (
            <TouchableOpacity
              style={styles.weightStepBtn}
              onPress={() => { adjustWeight(-2.5); if (set.done) onCorrect(exIdx, setIdx, { weight: String(Math.max(0, (parseFloat(set.weight) || 0) - 2.5)) }); }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Reduzir peso em 2.5 quilos"
            >
              <Text style={[styles.weightStepText, { color: colors.error }]}>−</Text>
            </TouchableOpacity>
          )}
          <TextInput
            ref={weightInputRef}
            style={[styles.setInput, styles.setInputInRow, { color: colors.text, backgroundColor: editable ? colors.surfaceVariant : 'transparent', borderColor: colors.border }]}
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
              style={styles.weightStepBtn}
              onPress={() => { adjustWeight(2.5); if (set.done) onCorrect(exIdx, setIdx, { weight: String((parseFloat(set.weight) || 0) + 2.5) }); }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Aumentar peso em 2.5 quilos"
            >
              <Text style={[styles.weightStepText, { color: colors.secondary }]}>+</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* A done set stays editable (to fix a mistake), unlike a future,
            not-yet-reached one — see the `editable`/`locked` comments above.
            Correcting RPE persists immediately via onCorrect's override,
            since it fires in the same tap as onUpdate — see
            persistSetCorrection's comment on why reading fresh state there
            would race the update. */}
        {!isSimple && (
          <TouchableOpacity style={styles.setRpeCell} onPress={() => editable && setShowRpe(true)} disabled={!editable}>
            <Text style={[styles.rpeText, { color: set.rpe ? colors.text : colors.textTertiary }]}>
              {set.rpe || '–'}
            </Text>
          </TouchableOpacity>
        )}
        <AnimatedTouchable
          style={[styles.setDoneCell, styles.doneBtn, { backgroundColor: set.done ? colors.secondary : colors.surfaceVariant }, doneAnimatedStyle]}
          // The button is 36pt so the set row stays compact, but this is the
          // control people hit mid-set with sweaty hands and shaky arms.
          // hitSlop brings the effective target to ~48pt, the Android
          // minimum, without changing the layout.
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onPress={() => !set.done && !locked && onComplete(exIdx, setIdx)}
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
            : <Check size={18} color={set.done ? '#fff' : colors.textTertiary} />
          }
        </AnimatedTouchable>
      </TouchableOpacity>

      {/* Quick weight/rep adjust — plate-sized steps, no keyboard needed */}
      {showQuickAdjust && editable && (
        <View style={[styles.quickAdjust, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
          <View style={styles.quickRow}>
            <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Peso</Text>
            {[-5, -2.5, -1.25, 1.25, 2.5, 5].map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.quickBtn, { backgroundColor: colors.surfaceHighlight }]}
                onPress={() => adjustWeight(d)}
                accessibilityRole="button"
                accessibilityLabel={`${d > 0 ? 'Aumentar' : 'Reduzir'} peso em ${Math.abs(d)} quilos`}
              >
                <Text style={[styles.quickBtnText, { color: d > 0 ? colors.secondary : colors.error }]}>
                  {d > 0 ? `+${d}` : d}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Plate breakdown — reuses the already-open quick-adjust panel
              rather than adding a separate button to an already-crowded
              row; calculatePlates already existed (used by the Perfil
              calculator) but was never wired into the actual workout
              screen where it matters most: mid-set, deciding what to load. */}
          {(() => {
            const targetWeight = parseFloat(set.weight) || 0;
            if (targetWeight <= 20) return null; // at or under an empty bar — nothing to break down
            const { plates } = calculatePlates(targetWeight, 'kg');
            if (plates.length === 0) return null;
            return (
              <View style={styles.plateRow}>
                <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Anilhas/lado</Text>
                <Text style={[styles.plateText, { color: colors.text }]}>
                  {plates.map(p => `${p.count}×${p.weight}kg`).join('  +  ')}
                </Text>
              </View>
            );
          })()}

          <View style={styles.quickRow}>
            <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Reps</Text>
            {[-1, 1].map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.quickBtn, { backgroundColor: colors.surfaceHighlight }]}
                onPress={() => adjustReps(d)}
                accessibilityRole="button"
                accessibilityLabel={`${d > 0 ? 'Mais' : 'Menos'} uma repetição`}
              >
                <Text style={[styles.quickBtnText, { color: d > 0 ? colors.secondary : colors.error }]}>
                  {d > 0 ? `+${d}` : d}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.quickClose, { borderColor: colors.border }]}
              onPress={() => setShowQuickAdjust(false)}
              accessibilityRole="button"
              accessibilityLabel="Fechar ajuste rapido"
            >
              <X size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* RPE picker */}
      {showRpe && (
        <View style={[styles.rpePicker, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
          <Text style={[styles.rpeTitle, { color: colors.textSecondary }]}>RPE (Esforço Percebido)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 48 }}>
            <View style={styles.rpeRow}>
              {RPE_VALUES.map(r => (
                <TouchableOpacity key={r} style={[styles.rpeChip, { backgroundColor: set.rpe === r ? colors.primary : colors.surfaceHighlight }]}
                  onPress={() => { onUpdate(exIdx, setIdx, 'rpe', r); if (set.done) onCorrect(exIdx, setIdx, { rpe: r }); setShowRpe(false); }}>
                  <Text style={[styles.rpeChipText, { color: set.rpe === r ? '#fff' : colors.text }]}>{r}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.rpeChip, { backgroundColor: colors.surfaceHighlight }]} onPress={() => { onUpdate(exIdx, setIdx, 'rpe', null); if (set.done) onCorrect(exIdx, setIdx, { rpe: null }); setShowRpe(false); }}>
                <X size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  cancelBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  topCenter: { flex: 1, alignItems: 'center' },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  workoutName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  totalTimer: { fontFamily: 'Inter-Bold', fontSize: 22 },
  finishBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  progressFooter: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, gap: 6 },
  progressFooterText: { fontFamily: 'Inter-SemiBold', fontSize: 12, textAlign: 'center' },
  progressFooterTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFooterFill: { height: '100%', borderRadius: 3 },
  finishText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 14 },
  statsBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
  pausedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  pausedBannerText: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17 },
  pausedBannerAction: { fontFamily: 'Inter-Bold', fontSize: 13, lineHeight: 17 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: 'Inter-Bold', fontSize: 16 },
  statLabel: { fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 14 },
  statDiv: { width: 1, height: 28 },
  restCard: { alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, gap: 8 },
  restCloseBtn: { position: 'absolute', top: 10, right: 12, zIndex: 1, padding: 4 },
  restLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1 },
  restRingRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  restAdjPill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  restAdjText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  prNotif: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  prText: { fontFamily: 'Inter-Bold', fontSize: 14 },
  adjustNotif: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 12, marginTop: 8, borderRadius: 12 },
  adjustText: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 18 },
  adjustActions: { flexDirection: 'row', gap: 18, marginTop: 6 },
  adjustActionText: { fontFamily: 'Inter-Bold', fontSize: 13 },
  exerciseList: { padding: 12, gap: 10 },
  exCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  supersetBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderTopLeftRadius: 13, borderBottomRightRadius: 10 },
  supersetBadgeText: { fontFamily: 'Inter-Bold', fontSize: 10, lineHeight: 13, letterSpacing: 0.5 },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  exThumbWrap: { width: 38, height: 38, borderRadius: 8, overflow: 'hidden' },
  exDot: { width: 10, height: 10, borderRadius: 5 },
  exHeaderInfo: { flex: 1 },
  exName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  exMeta: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  exBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
  coachingTipsContainer: { marginBottom: 12, paddingHorizontal: 0 },
  setHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  setHeaderCell: { fontFamily: 'Inter-SemiBold', fontSize: 10, lineHeight: 13, letterSpacing: 0.5 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 6 },
  setNumCell: { width: 28, alignItems: 'center' },
  setPrevCell: { flex: 1.2, alignItems: 'center' },
  setRepsCell: { flex: 1, alignItems: 'center' },
  setWeightCell: { flex: 1.3, alignItems: 'center' },
  weightCellRow: { flexDirection: 'row', gap: 2 },
  setInputInRow: { width: undefined, flex: 1 },
  weightStepBtn: { width: 18, alignItems: 'center', justifyContent: 'center' },
  weightStepText: { fontFamily: 'Inter-Black', fontSize: 18, lineHeight: 20 },
  setRpeCell: { width: 36, alignItems: 'center' },
  setDoneCell: { width: 36, alignItems: 'center' },
  setNumBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  setNumText: { fontFamily: 'Inter-Bold', fontSize: 12, lineHeight: 16 },
  setPrevText: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16 },
  setInput: { width: '100%', height: 38, borderRadius: 8, textAlign: 'center', fontFamily: 'Inter-SemiBold', fontSize: 15, borderWidth: 1 },
  rpeText: { fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17 },
  doneBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  progressHint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, marginBottom: 8 },
  progressHintText: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16, flex: 1 },
  notesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, marginBottom: 4 },
  notesText: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, flex: 1 },
  notesEdit: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  notesInput: { flex: 1, borderRadius: 8, borderWidth: 1, padding: 10, fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17, minHeight: 44 },
  notesSave: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  quickAdjust: { borderRadius: 10, borderWidth: 1, padding: 8, marginTop: 4, gap: 6 },
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quickLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14, width: 38 },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  plateText: { fontFamily: 'Inter-SemiBold', fontSize: 12, flexShrink: 1 },
  quickBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  quickBtnText: { fontFamily: 'Inter-Bold', fontSize: 13, lineHeight: 17 },
  quickClose: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  rpePicker: { marginTop: 4, borderRadius: 10, borderWidth: 1, padding: 10, gap: 8 },
  rpeTitle: { fontFamily: 'Inter-SemiBold', fontSize: 11, lineHeight: 14 },
  rpeRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  rpeChip: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rpeChipText: { fontFamily: 'Inter-Bold', fontSize: 14 },
  addSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 8, marginTop: 4 },
  addSetText: { fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17 },
  addExBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', paddingVertical: 14 },
  addExText: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  setTimerCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  setTimerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setTimerLabel: { fontFamily: 'Inter-Regular', fontSize: 14, flex: 1 },
  setTimerValue: { fontFamily: 'Inter-Bold', fontSize: 20 },
  setTimerButtons: { flexDirection: 'row', gap: 8 },
  setTimerBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  setTimerBtnText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 14 },
  picker: { flex: 1 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  pickerTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  pickerThumbWrap: { width: 40, height: 40, borderRadius: 8, overflow: 'hidden' },
  pickerName: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  pickerSub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  finishOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  finishModal: { width: '100%', borderRadius: 24, padding: 24, borderWidth: 1, gap: 16 },
  finishTitle: { fontFamily: 'Inter-Bold', fontSize: 22, textAlign: 'center' },
  finishStats: { flexDirection: 'row', justifyContent: 'space-around' },
  undoneNotice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14 },
  undoneNoticeText: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17 },
  undoneNoticeAction: { fontFamily: 'Inter-Bold', fontSize: 13, lineHeight: 17 },
  finishStat: { alignItems: 'center', gap: 4 },
  finishStatVal: { fontFamily: 'Inter-Bold', fontSize: 24 },
  finishStatLabel: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17 },
  confirmFinishBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  confirmFinishText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 17 },
  continueBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  continueBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  whyOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  whyCard: { width: '100%', borderRadius: 20, padding: 20, gap: 10 },
  whyHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  whyTitle: { fontFamily: 'Inter-Bold', fontSize: 17 },
  whyExName: { fontFamily: 'Inter-Regular', fontSize: 13, marginTop: -6, marginBottom: 4 },
  whyPhaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 2 },
  phaseDotSmall: { width: 8, height: 8, borderRadius: 4 },
  whyPhaseText: { fontFamily: 'Inter-Bold', fontSize: 13 },
  whyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  whyLabel: { fontFamily: 'Inter-Regular', fontSize: 13 },
  whyValue: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
  whyExpect: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17, marginTop: 6 },
  whyCloseBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  whyCloseBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
});
