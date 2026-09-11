import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { DatabaseProvider } from '@/hooks/useDatabase';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();
  const colorScheme = useColorScheme();

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
    // JeFit-parity: heading weight. Question titles and hero numbers use
    // this (see constants/typography.ts).
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

  if (!fontsLoaded && !fontError) return null;

  // SafeAreaProvider is required for react-native-safe-area-context's
  // SafeAreaView/useSafeAreaInsets to report real insets. Without it, screens
  // used React Native's own SafeAreaView, which is a no-op on Android — so on
  // devices with a punch-hole camera (e.g. Galaxy S24 Ultra) headers rendered
  // underneath the status bar and the icons appeared to overlap.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DatabaseProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="workout/active" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="workout/summary" />
            <Stack.Screen name="plan/[id]" />
            <Stack.Screen name="plan/create" />
            <Stack.Screen name="plan/auto" />
            <Stack.Screen name="exercise/[id]" />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        </DatabaseProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
