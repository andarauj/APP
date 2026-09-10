import * as Notifications from 'expo-notifications';
import { requestReminderPermission } from './reminders';

const REST_NOTIFICATION_ID = 'changes-rest-timer';

/**
 * Schedules a one-off local notification for when the rest period ends.
 * The single most requested thing across competitor apps' reviews (Hevy,
 * SettoTrack, HeavySet...) is being able to step away from the phone during
 * rest without missing the timer. A true "live countdown" notification
 * (Android's equivalent of a Live Activity) needs a foreground service —
 * not available in an Expo managed app without a custom dev client — but a
 * notification that fires exactly when rest ends covers the actual need:
 * you get pinged even if you've locked the phone or switched app.
 *
 * Any previously scheduled rest notification is cancelled first, since
 * starting a new rest period (or adjusting one) should replace, not stack.
 */
export async function scheduleRestEndNotification(seconds: number, exerciseName: string): Promise<void> {
  await cancelRestEndNotification();
  if (seconds <= 0) return;

  const granted = await requestReminderPermission();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    identifier: REST_NOTIFICATION_ID,
    content: {
      title: 'Descanso terminado 💪',
      body: `Hora da próxima série${exerciseName ? ` — ${exerciseName}` : ''}`,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.round(seconds)),
    },
  });
}

export async function cancelRestEndNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REST_NOTIFICATION_ID).catch(() => {});
}
