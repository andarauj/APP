import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { Card } from '@/components/ui/Card';
import { getTrainingTips, type TrainingTip } from '@/db/workoutDao';
import { AlertTriangle, Info, CheckCircle2, BookOpen } from 'lucide-react-native';

const TIP_ICON = { warning: AlertTriangle, info: Info, positive: CheckCircle2 } as const;

// Evergreen coaching notes — the "Discover" tab has no social/feed back-end,
// so this is a small always-available library instead of a live feed.
const LESSONS: { title: string; body: string }[] = [
  {
    title: 'Sobrecarga progressiva',
    body: 'Ficas mais forte quando pedes um pouco mais aos músculos ao longo do tempo — mais peso, mais repetições, ou mais séries. Sobe devagar e de forma consistente; saltos grandes só trazem lesões e falhas.',
  },
  {
    title: 'Semanas de descarga (deload)',
    body: 'A cada 4–6 semanas, corta o volume para metade durante uma semana. Não é fraqueza: é quando o corpo absorve o trabalho e volta mais forte. Quem nunca desanda acaba por estagnar.',
  },
  {
    title: 'Técnica antes de carga',
    body: 'Uma repetição limpa vale mais do que três a puxar com as costas. Se a forma parte, o peso é demasiado. Filma-te de lado de vez em quando.',
  },
  {
    title: 'Descanso entre séries',
    body: 'Para força, descansa 2–3 min entre séries pesadas. Para hipertrofia, 60–90 s chega. Cardio e resistência, 30–45 s. O temporizador da app já ajusta por tipo de plano.',
  },
  {
    title: 'Consistência > intensidade',
    body: 'Três treinos por semana durante um ano batem seis por semana durante um mês. Aparecer é 80% do resultado — o resto é ajustar pelo caminho.',
  },
];

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const [tips, setTips] = useState<TrainingTip[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setTips(await getTrainingTips());
    } catch (err) {
      console.error('Failed to load discover tips:', err);
    }
  }, []);

  useFocusEffect(useCallback(() => { if (isReady) load(); }, [isReady, load]));

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Descobrir</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {tips.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DICAS PARA TI</Text>
            {tips.map((tip, i) => {
              const Icon = TIP_ICON[tip.type];
              const tint = tip.type === 'warning' ? colors.warning : tip.type === 'positive' ? colors.success : colors.primary;
              return (
                <Card key={i} style={styles.tipCard}>
                  <View style={styles.tipHead}>
                    <View style={[styles.tipIcon, { backgroundColor: colors.surfaceVariant }]}>
                      <Icon size={16} color={tint} />
                    </View>
                    <Text style={[styles.tipTitle, { color: colors.text }]}>{tip.title}</Text>
                  </View>
                  <Text style={[styles.tipDetail, { color: colors.textSecondary }]}>{tip.detail}</Text>
                </Card>
              );
            })}
          </>
        )}

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>APRENDE</Text>
        {LESSONS.map(lesson => (
          <Card key={lesson.title} style={styles.tipCard}>
            <View style={styles.tipHead}>
              <View style={[styles.tipIcon, { backgroundColor: colors.primaryContainer }]}>
                <BookOpen size={16} color={colors.primary} />
              </View>
              <Text style={[styles.tipTitle, { color: colors.text }]}>{lesson.title}</Text>
            </View>
            <Text style={[styles.tipDetail, { color: colors.textSecondary }]}>{lesson.body}</Text>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Inter-ExtraBold', fontSize: 28 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  sectionTitle: { fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 1, marginTop: 8 },
  tipCard: { gap: 8 },
  tipHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tipTitle: { flex: 1, fontFamily: 'Inter-Bold', fontSize: 15 },
  tipDetail: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 21 },
});
