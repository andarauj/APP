import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Weekday numbers used across the app's settings: 0=Domingo ... 6=Sábado
export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** Full weekday names, for accessibility labels and headers that spell the
 *  day out rather than abbreviating it. */
export const WEEKDAY_FULL_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

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
