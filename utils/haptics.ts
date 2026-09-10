import * as Haptics from 'expo-haptics';

// A tiny wrapper so haptic usage stays consistent across the app (same
// intensity for the same kind of moment everywhere) and never crashes on a
// device/platform where haptics aren't supported — every call is
// fire-and-forget and silently no-ops on failure.

/** A set logged, a step forward in a list, a toggle flipped. */
export function hapticTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A more deliberate action: adding an exercise, saving a plan. */
export function hapticAction() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** A genuine win: a PR, a finished workout, a generated plan. */
export function hapticSuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** A destructive or cautionary action: deleting, discarding. */
export function hapticWarning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

/** Moving between options: tabs, chips, day selectors. */
export function hapticSelect() {
  Haptics.selectionAsync().catch(() => {});
}
