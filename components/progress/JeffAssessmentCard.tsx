import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/ui/Card';
import type { JeffAssessmentResult } from '@/utils/jeffAssessment';
import { Activity, Radar } from 'lucide-react-native';

export function JeffAssessmentCard({ assessment }: { assessment: JeffAssessmentResult }) {
  const { colors } = useTheme();
  const router = useRouter();
  const tint = assessment.score >= 70 ? colors.success : assessment.score >= 40 ? colors.warning : colors.error;

  return (
    <Card>
      <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>JEFF ASSESSMENT</Text>
      <View style={styles.row}>
        <View style={[styles.ring, { borderColor: tint }]}>
          <Text style={[styles.score, { color: tint }]}>{assessment.score}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Equilíbrio e strain</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{assessment.summary}</Text>
        </View>
      </View>
      <View style={styles.metrics}>
        <Text style={[styles.metric, { color: colors.textSecondary }]}>Equilíbrio {assessment.balance}</Text>
        <Text style={[styles.metric, { color: colors.textSecondary }]}>Strain {assessment.strain}</Text>
      </View>
      <View style={styles.links}>
        <TouchableOpacity style={styles.link} onPress={() => router.push('/progress/balance')} accessibilityRole="button">
          <Radar size={14} color={colors.primary} />
          <Text style={[styles.linkText, { color: colors.primary }]}>Muscle breakdown</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.link} onPress={() => router.push('/fatigue-radar')} accessibilityRole="button">
          <Activity size={14} color={colors.primary} />
          <Text style={[styles.linkText, { color: colors.primary }]}>Sinais de fadiga</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 1, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ring: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  score: { fontFamily: 'Inter-Black', fontSize: 18 },
  title: { fontFamily: 'Inter-Bold', fontSize: 16 },
  body: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 18, marginTop: 4 },
  metrics: { flexDirection: 'row', gap: 16, marginTop: 12 },
  metric: { fontFamily: 'Inter-SemiBold', fontSize: 12 },
  links: { flexDirection: 'row', gap: 16, marginTop: 12 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { fontFamily: 'Inter-SemiBold', fontSize: 13 },
});
