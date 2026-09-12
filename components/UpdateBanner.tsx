import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { useTheme } from '@/hooks/useTheme';
import { RefreshCw } from 'lucide-react-native';

/**
 * Tells the person a new version has already downloaded in the background
 * and is just waiting for a restart to take effect — expo-updates always
 * applies on the NEXT cold start, never the one that downloaded it, and
 * without this the app just silently looked "out of date" until someone
 * happened to close and reopen it (reported: "não está como vejo no Pixel
 * 8"). Tap-to-restart only, never automatic — a silent reload could lose
 * whatever's half-typed in a set the person is mid-workout on.
 */
export function UpdateBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // useUpdates() is safe to call even when expo-updates isn't active (dev
  // client, Expo Go) — isUpdatePending just stays false — but guard on
  // isEnabled too so this never renders anything outside a real build.
  const { isUpdatePending } = Updates.useUpdates();

  if (!Updates.isEnabled || !isUpdatePending) return null;

  return (
    <TouchableOpacity
      style={[styles.banner, { top: insets.top + 8, backgroundColor: colors.primary }]}
      onPress={() => Updates.reloadAsync()}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Nova versão disponível, toca para atualizar"
    >
      <RefreshCw size={16} color="#fff" />
      <Text style={styles.text}>Nova versão disponível — toca para atualizar</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  text: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    flexShrink: 1,
  },
});
