import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getQuoteForDate } from './motivationalQuotes';

// Weekday numbers used across the app's settings: 0=Domingo ... 6=Sábado
export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const REMINDER_CATEGORY = 'changes-workout-reminder';

export async function requestReminderPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function cancelAllWorkoutReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.category === REMINDER_CATEGORY) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/**
 * Schedules a repeating local notification for each selected weekday at the
 * given time. No internet/account needed — these are purely local/offline.
 */
export async function scheduleWorkoutReminders(days: number[], time: string): Promise<boolean> {
  await cancelAllWorkoutReminders();

  const granted = await requestReminderPermission();
  if (!granted) return false;

  const [hourStr, minuteStr] = time.split(':');
  const hour = Math.min(23, Math.max(0, parseInt(hourStr, 10) || 18));
  const minute = Math.min(59, Math.max(0, parseInt(minuteStr, 10) || 0));

  for (const weekday of days) {
    // expo-notifications uses 1=Sunday..7=Saturday for calendar triggers
    const expoWeekday = weekday + 1;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Hora de treinar 💪',
        body: 'Não te esqueças do teu treino de hoje!',
        data: { category: REMINDER_CATEGORY },
        sound: Platform.OS === 'ios' ? 'default' : undefined,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: expoWeekday,
        hour,
        minute,
      },
    });
  }
  return true;
}

const MOTIVATIONAL_CATEGORY = 'changes-motivational-quote';

export async function cancelMotivationalNotification(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.category === MOTIVATIONAL_CATEGORY) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/**
 * A daily local notification with a rotating motivational phrase, at
 * whatever time the person sets. Uses a DAILY trigger (fires every day at
 * this time indefinitely) rather than a one-off — but a DAILY trigger keeps
 * whatever text it was scheduled with, so on its own it would repeat the
 * same phrase forever. Re-scheduling it here (called again whenever the
 * settings change, and from the Home screen on each app open — see
 * app/(tabs)/index.tsx) refreshes it to the current day's phrase each time,
 * so it stays varied for anyone opening the app roughly daily, which is the
 * realistic case for their own gym-tracking app.
 */
export async function scheduleMotivationalNotification(time: string): Promise<boolean> {
  await cancelMotivationalNotification();

  const granted = await requestReminderPermission();
  if (!granted) return false;

  const [hourStr, minuteStr] = time.split(':');
  const hour = Math.min(23, Math.max(0, parseInt(hourStr, 10) || 7));
  const minute = Math.min(59, Math.max(0, parseInt(minuteStr, 10) || 0));

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Bom dia 💪',
      body: getQuoteForDate(new Date()),
      data: { category: MOTIVATIONAL_CATEGORY },
      sound: Platform.OS === 'ios' ? 'default' : undefined,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  return true;
}
