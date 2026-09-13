import { useEffect, useRef } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, ListChecks, TrendingUp, User, Compass, Dumbbell, History } from 'lucide-react-native';
import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import { getAllSessions } from '@/db/workoutDao';
import { useDatabase } from '@/hooks/useDatabase';
import { hapticSelect } from '@/utils/haptics';
import { ActiveWorkoutMiniPlayer } from '@/components/workout/ActiveWorkoutMiniPlayer';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';

const REPEAT_LAST_ACTION_ID = 'repeat-last-workout';

/** Workout (index) is the centre of the app — always the launch tab. */
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TabsLayout() {
  const { colors, isOled } = useTheme();
  const router = useRouter();
  const { isReady } = useDatabase();
  const { minimized } = useActiveWorkout();
  const minimizedRef = useRef(minimized);
  minimizedRef.current = minimized;
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);

  useEffect(() => {
    if (!isReady) return;
    QuickActions.setItems([
      {
        id: REPEAT_LAST_ACTION_ID,
        title: 'Repetir Último Treino',
        icon: 'shortcut_repeat',
      },
      {
        id: 'free-workout',
        title: 'Treino Livre',
        icon: 'shortcut_free',
        params: { href: '/workout/active?planId=0&planName=Treino%20Livre' },
      },
    ]).catch(() => {});
  }, [isReady]);

  useQuickActionRouting(async (action) => {
    if (minimizedRef.current) {
      Alert.alert(
        'Treino em curso',
        'Já tens um treino minimizado. Expande-o pela barra em baixo ou conclui-o antes de começar outro.',
      );
      return true;
    }
    if (action.id !== REPEAT_LAST_ACTION_ID) return false;
    try {
      const [last] = await getAllSessions(1, 0);
      if (!last) return true;
      router.push({
        pathname: '/workout/active',
        params: { planId: 0, planName: last.name, repeatSessionId: String(last.id) },
      });
    } catch (err) {
      console.error('Failed to handle repeat-last quick action:', err);
    }
    return true;
  });

  const tabBarHeight = 60 + bottomPad;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenListeners={{
          tabPress: () => hapticSelect(),
        }}
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: isOled ? colors.background : colors.surface,
            borderTopColor: isOled ? colors.primary + '40' : colors.border,
            borderTopWidth: isOled ? 1 : StyleSheet.hairlineWidth,
            height: tabBarHeight,
            paddingBottom: bottomPad,
            paddingTop: 8,
            elevation: isOled ? 0 : 12,
            shadowColor: isOled ? colors.primary : '#000',
            shadowOpacity: isOled ? 0 : 0.14,
            shadowRadius: isOled ? 0 : 16,
            shadowOffset: { width: 0, height: isOled ? 0 : -4 },
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarIconStyle: { width: 26, height: 26 },
          tabBarLabelStyle: {
            fontFamily: 'Inter-SemiBold',
            fontSize: 10,
            lineHeight: 13,
            marginTop: 2,
          },
          tabBarAllowFontScaling: false,
        }}
      >
        {/* Core 4: Discover · Workout · Exercises · Progress */}
        <Tabs.Screen
          name="discover"
          options={{
            title: 'Discover',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? [styles.activeIcon, { backgroundColor: colors.primaryContainer }] : undefined}>
                <Compass size={focused ? 22 : 24} color={color} />
              </View>
            ),
          }}
        />

        <Tabs.Screen
          name="index"
          options={{
            title: 'Workout',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? [styles.activeIcon, { backgroundColor: colors.primaryContainer }] : undefined}>
                <Dumbbell size={focused ? 22 : 24} color={color} />
              </View>
            ),
          }}
        />

        <Tabs.Screen
          name="exercises"
          options={{
            title: 'Exercises',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? [styles.activeIcon, { backgroundColor: colors.primaryContainer }] : undefined}>
                <Search size={focused ? 22 : 24} color={color} />
              </View>
            ),
          }}
        />

        <Tabs.Screen
          name="progress"
          options={{
            title: 'Progress',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? [styles.activeIcon, { backgroundColor: colors.primaryContainer }] : undefined}>
                <TrendingUp size={focused ? 22 : 24} color={color} />
              </View>
            ),
          }}
        />

        {/* Internal — not on the bar */}
        <Tabs.Screen
          name="plans"
          options={{
            title: 'Planos',
            href: null,
            tabBarIcon: ({ color }) => <ListChecks size={24} color={color} />,
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: 'Perfil',
            href: null,
            tabBarIcon: ({ color }) => <User size={24} color={color} />,
          }}
        />

        <Tabs.Screen
          name="history"
          options={{
            title: 'Histórico',
            href: null,
            tabBarIcon: ({ color }) => <History size={24} color={color} />,
          }}
        />
      </Tabs>
      <ActiveWorkoutMiniPlayer bottomOffset={tabBarHeight + 8} />
    </View>
  );
}

const styles = StyleSheet.create({
  activeIcon: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
