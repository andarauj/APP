import { useEffect } from 'react';
import { View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Compass, ClipboardCheck, Dumbbell, CalendarDays, User, ListChecks, History } from 'lucide-react-native';
import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import { getAllSessions } from '@/db/workoutDao';
import { useDatabase } from '@/hooks/useDatabase';
import { hapticSelect } from '@/utils/haptics';
import { ActiveWorkoutMiniPlayer } from '@/components/workout/ActiveWorkoutMiniPlayer';

// A "repeat last workout" shortcut can't bake a session id into the static
// action definition — the id set today would still be there (and wrong)
// months later. This id is resolved fresh at tap time in the routing
// callback below instead.
const REPEAT_LAST_ACTION_ID = 'repeat-last-workout';

export default function TabsLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const { isReady } = useDatabase();
  // The bottom inset covers the Android gesture bar. Hardcoding 12px meant the
  // labels sat under the gesture pill on devices like the Galaxy S24 Ultra.
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);

  // Long-pressing the app icon on the home screen shows these — a couple of
  // taps saved versus opening the app and navigating to Treinar each time.
  useEffect(() => {
    if (!isReady) return;
    QuickActions.setItems([
      {
        id: REPEAT_LAST_ACTION_ID,
        title: 'Repetir Último Treino',
        // Matches the "shortcut_repeat" key configured in app.json's
        // expo-quick-actions plugin — the symbol:/SF Symbols syntax is
        // iOS-only, this app targets Android.
        icon: 'shortcut_repeat',
      },
      {
        id: 'free-workout',
        title: 'Treino Livre',
        icon: 'shortcut_free',
        params: { href: '/workout/active?planId=0&planName=Treino%20Livre' },
      },
    ]).catch(() => {
      // Quick actions are a nice-to-have shortcut, not core functionality —
      // an unsupported device/OS version should never block the app.
    });
  }, [isReady]);

  useQuickActionRouting(async (action) => {
    if (action.id !== REPEAT_LAST_ACTION_ID) return false; // let the router handle the static href actions

    try {
      const [last] = await getAllSessions(1, 0);
      if (!last) return true; // nothing to repeat — quietly do nothing rather than navigate somewhere confusing
      router.push({
        pathname: '/workout/active',
        params: { planId: 0, planName: last.name, repeatSessionId: String(last.id) },
      });
    } catch (err) {
      console.error('Failed to handle repeat-last quick action:', err);
    }
    return true; // handled manually — don't let the router also try a (nonexistent) static href
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
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: bottomPad,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarIconStyle: {
          width: 26,
          height: 26,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter-SemiBold',
          fontSize: 10, lineHeight: 13,
          marginTop: 2,
        },
        // Large system font sizes previously stretched labels until they
        // collided with the icons; capping the scale keeps them legible.
        tabBarAllowFontScaling: false,
      }}
    >
      {/* Bar: Treino · Exercícios · Progresso · Perfil.
          Descobrir / Planos / Histórico ficam fora da barra (deep-links). */}

      {/* Descobrir — tips library, reached from Progresso. */}
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Descobrir',
          href: null,
          tabBarIcon: ({ color }) => <Compass size={24} color={color} />,
        }}
      />

      {/* Holds the Explorar / Hoje / Instantâneo / Planos top tabs. */}
      <Tabs.Screen
        name="start"
        options={{
          title: 'Treino',
          tabBarIcon: ({ color }) => <ClipboardCheck size={24} color={color} />,
        }}
      />

      <Tabs.Screen
        name="exercises"
        options={{
          title: 'Exercícios',
          tabBarIcon: ({ color }) => <Dumbbell size={24} color={color} />,
        }}
      />

      {/* The main dashboard — streak, volume, consistency heatmap, Progress
          Index — split into Resumo/Corpo/Atividade sub-tabs. Still the
          index route, so it is where the app lands. */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Progresso',
          tabBarIcon: ({ color }) => <CalendarDays size={24} color={color} />,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <User size={24} color={color} />,
        }}
      />

      {/* Off the bar. Reachable from Treino › Planos and plan pickers. */}
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Planos',
          href: null,
          tabBarIcon: ({ color }) => <ListChecks size={24} color={color} />,
        }}
      />

      {/* Off the bar: reached from Progresso and Treino deep links. */}
      <Tabs.Screen
        name="history"
        options={{
          title: 'Histórico',
          href: null,
          tabBarIcon: ({ color }) => <History size={24} color={color} />,
        }}
      />
    </Tabs>
    {/* Sits just above the tab bar so switching tabs never hides it, and it
        never covers the tabs themselves — see hooks/useActiveWorkout.tsx
        for why this needs to live outside any single screen. */}
    <ActiveWorkoutMiniPlayer bottomOffset={tabBarHeight + 8} />
    </View>
  );
}
