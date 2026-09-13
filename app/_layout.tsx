// NativeWind entry CSS (project root). Relative to app/_layout.tsx — NOT
// ./global.css, which would look for app/global.css and fail Metro resolve.
// eslint-disable-next-line import/no-unresolved
import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { DatabaseProvider } from '@/hooks/useDatabase';
import { ActiveWorkoutProvider } from '@/hooks/useActiveWorkout';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { UpdateBanner } from '@/components/UpdateBanner';
import { useTheme } from '@/hooks/useTheme';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
    // Heading weight. Question titles and hero numbers use this (see
    // constants/typography.ts).
    'Inter-ExtraBold': Inter_800ExtraBold,
    // Reserved for hero display numbers (streak, Progress Index score,
    // month-recap stats) — a heavier weight than the rest of the app's
    // text gives them the visual weight a key number deserves, a common
    // premium-app pattern (a stat that LOOKS important, not just reads as
    // important).
    'Inter-Black': Inter_900Black,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Always mount <Stack /> so Expo Router's NavigationContainer context exists
  // on the first paint. Returning null while fonts load can race NativeWind
  // CSS interop and surface a false "Couldn't find a navigation context".
  const fontsReady = fontsLoaded || !!fontError;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DatabaseProvider>
          <ActiveWorkoutProvider>
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
              <Stack.Screen name="workout/active" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="workout/summary" />
              <Stack.Screen name="plan/[id]" />
              <Stack.Screen name="plan/create" />
              <Stack.Screen name="plan/auto" />
              <Stack.Screen name="exercise/[id]" />
              <Stack.Screen name="+not-found" />
            </Stack>
            {fontsReady ? (
              <>
                <ThemedStatusBar />
                <UpdateBanner />
              </>
            ) : null}
          </ActiveWorkoutProvider>
        </DatabaseProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
