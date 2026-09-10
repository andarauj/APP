import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.text, { color: colors.text }]}>Ecrã não encontrado.</Text>
        <Link href="/" style={styles.link}>
          <Text style={{ color: colors.primary, fontFamily: 'Inter-SemiBold', fontSize: 16 }}>Voltar ao início</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  text: { fontSize: 20, fontFamily: 'Inter-Bold' },
  link: { marginTop: 15, paddingVertical: 15 },
});
