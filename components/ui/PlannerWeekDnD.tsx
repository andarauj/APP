import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { GripVertical } from 'lucide-react-native';
import type { Theme } from '@/constants/colors';
import type { PlannerEntry, WeeklyPlanner } from '@/db/plannerDao';
import { WEEKDAY_LABELS } from '@/utils/reminders';
import { relocatePlannerEntry, previewRelocatePlanner } from '@/utils/plannerAssign';
import { hapticSelect, hapticSuccess } from '@/utils/haptics';

const SLOT_H = 52;
const SLOT_GAP = 6;
const STRIDE = SLOT_H + SLOT_GAP;
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

type Props = {
  colors: Theme;
  planner: WeeklyPlanner;
  labelFor: (entry: PlannerEntry) => string;
  onPlannerChange: (next: WeeklyPlanner) => void;
  onDragActiveChange?: (active: boolean) => void;
};

/**
 * Compact Mon–Sun strip for weekly planner drag-and-drop.
 * The SQLite planner is weekday-keyed (not calendar-date), so this is the
 * natural surface to reorder slots. Long-press a filled day, drag onto
 * another slot: empty → move, occupied → swap.
 */
export function PlannerWeekDnD({
  colors,
  planner,
  labelFor,
  onPlannerChange,
  onDragActiveChange,
}: Props) {
  const listRef = useRef<View>(null);
  const listTopRef = useRef(0);
  const [hoverWeekday, setHoverWeekday] = useState<number | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<number | null>(null);
  const busyRef = useRef(false);
  const draggingFromRef = useRef<number | null>(null);

  const dragY = useSharedValue(0);

  const weekdayAtY = useCallback((absoluteY: number) => {
    const idx = Math.floor((absoluteY - listTopRef.current) / STRIDE);
    return Math.max(0, Math.min(6, idx));
  }, []);

  const refreshListTop = useCallback((then?: () => void) => {
    listRef.current?.measureInWindow((_x, y) => {
      listTopRef.current = y;
      then?.();
    });
  }, []);

  const beginDrag = useCallback((from: number) => {
    refreshListTop(() => {
      draggingFromRef.current = from;
      setDraggingFrom(from);
      setHoverWeekday(from);
      onDragActiveChange?.(true);
      hapticSelect();
    });
  }, [onDragActiveChange, refreshListTop]);

  const updateHover = useCallback((absoluteY: number) => {
    if (draggingFromRef.current == null) return;
    setHoverWeekday(weekdayAtY(absoluteY));
  }, [weekdayAtY]);

  const endDrag = useCallback(async (from: number, absoluteY: number) => {
    if (draggingFromRef.current !== from) return;

    const to = weekdayAtY(absoluteY);
    draggingFromRef.current = null;
    setDraggingFrom(null);
    setHoverWeekday(null);
    onDragActiveChange?.(false);
    dragY.value = withSpring(0);

    if (busyRef.current || from === to) return;
    const entry = planner[from];
    if (!entry) return;

    busyRef.current = true;
    try {
      const target = planner[to] ?? null;
      await relocatePlannerEntry(from, to, entry, target);
      onPlannerChange(previewRelocatePlanner(planner, from, to, entry));
      hapticSuccess();
    } catch (err) {
      console.error('Failed to relocate planner day:', err);
    } finally {
      busyRef.current = false;
    }
  }, [dragY, onDragActiveChange, onPlannerChange, planner, weekdayAtY]);

  const cancelDrag = useCallback((from: number) => {
    if (draggingFromRef.current !== from) return;
    draggingFromRef.current = null;
    setDraggingFrom(null);
    setHoverWeekday(null);
    onDragActiveChange?.(false);
    dragY.value = withSpring(0);
  }, [dragY, onDragActiveChange]);

  const slots = useMemo(() => WEEKDAYS.map(weekday => ({
    weekday,
    entry: planner[weekday] ?? null,
  })), [planner]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.text }]}>Reorganizar semana</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Mantém premido um dia com treino e arrasta para outro — troca se estiver ocupado
      </Text>
      <View ref={listRef} style={styles.list} collapsable={false}>
        {slots.map(({ weekday, entry }) => (
          <DnDSlot
            key={weekday}
            weekday={weekday}
            entry={entry}
            label={entry ? labelFor(entry) : 'Descanso'}
            colors={colors}
            isDragging={draggingFrom === weekday}
            isHover={hoverWeekday === weekday && draggingFrom != null && draggingFrom !== weekday}
            dragY={dragY}
            disabled={!entry}
            onBegin={() => beginDrag(weekday)}
            onUpdateY={updateHover}
            onEnd={(absY) => { void endDrag(weekday, absY); }}
            onCancel={() => cancelDrag(weekday)}
          />
        ))}
      </View>
    </View>
  );
}

function DnDSlot({
  weekday,
  entry,
  label,
  colors,
  isDragging,
  isHover,
  dragY,
  disabled,
  onBegin,
  onUpdateY,
  onEnd,
  onCancel,
}: {
  weekday: number;
  entry: PlannerEntry | null;
  label: string;
  colors: Theme;
  isDragging: boolean;
  isHover: boolean;
  dragY: SharedValue<number>;
  disabled: boolean;
  onBegin: () => void;
  onUpdateY: (absoluteY: number) => void;
  onEnd: (absoluteY: number) => void;
  onCancel: () => void;
}) {
  const armed = useSharedValue(0);

  const gesture = Gesture.Pan()
    .activateAfterLongPress(350)
    .enabled(!disabled)
    .onStart(() => {
      armed.value = 1;
      runOnJS(onBegin)();
    })
    .onUpdate((e) => {
      if (!armed.value) return;
      dragY.value = e.translationY;
      runOnJS(onUpdateY)(e.absoluteY);
    })
    .onEnd((e) => {
      if (!armed.value) return;
      armed.value = 0;
      runOnJS(onEnd)(e.absoluteY);
    })
    .onFinalize((_e, success) => {
      if (!armed.value) return;
      if (!success) {
        armed.value = 0;
        runOnJS(onCancel)();
      }
    });

  const animStyle = useAnimatedStyle(() => {
    if (!isDragging) {
      return { transform: [{ translateY: 0 }], zIndex: 0, elevation: 0 };
    }
    return {
      transform: [{ translateY: dragY.value }, { scale: 1.03 }],
      zIndex: 20,
      elevation: 8,
      shadowOpacity: 0.2,
    };
  }, [isDragging]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.slot,
          {
            height: SLOT_H,
            marginBottom: SLOT_GAP,
            backgroundColor: isHover ? colors.primaryContainer : colors.surface,
            borderColor: isDragging || isHover ? colors.primary : colors.border,
            opacity: !entry ? 0.9 : 1,
          },
          animStyle,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${WEEKDAY_LABELS[weekday]}: ${label}. Mantém premido para arrastar.`}
        accessibilityHint={entry ? 'Arrasta para outro dia da semana' : undefined}
      >
        {entry ? <GripVertical size={16} color={colors.textTertiary} /> : <View style={{ width: 16 }} />}
        <Text style={[styles.dow, { color: colors.textSecondary }]}>{WEEKDAY_LABELS[weekday]}</Text>
        <Text
          style={[styles.label, { color: entry ? colors.text : colors.textTertiary }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 4 },
  title: { fontFamily: 'Inter-Bold', fontSize: 16, paddingHorizontal: 4 },
  sub: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17, paddingHorizontal: 4, marginBottom: 2 },
  list: {},
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dow: { fontFamily: 'Inter-Bold', fontSize: 12, width: 28 },
  label: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 14 },
});
