import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useRouter } from 'expo-router';
import { Home as HomeIcon, Dumbbell, Clock, Flame } from 'lucide-react-native';
import type { MuscleGroup } from '@/types';
import { generateHomeWorkout } from '@/utils/planGenerator';
import { hapticSuccess, hapticSelect } from '@/utils/haptics';

const BODY_PARTS: { key: string; label: string; muscles: MuscleGroup[] }[] = [
  { key: 'chest', label: 'Peito', muscles: ['chest'] },
  { key: 'back', label: 'Costas', muscles: ['back', 'lats'] },
  { key: 'legs', label: 'Pernas', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
  { key: 'shoulders', label: 'Ombros', muscles: ['shoulders', 'traps'] },
  { key: 'arms', label: 'Braços', muscles: ['biceps', 'triceps', 'forearms'] },
  { key: 'abs', label: 'Abdominais', muscles: ['abs'] },
  { key: 'full', label: 'Corpo Inteiro', muscles: ['chest', 'back', 'quads', 'shoulders', 'abs'] },
];

const MINUTES_OPTIONS = [20, 30, 45, 60];

export default function HomeWorkoutScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [bodyPartKey, setBodyPartKey] = useState<string>('full');
  const [minutes, setMinutes] = useState(30);
  const [includeCardio, setIncludeCardio] = useState(false);
  const [generating, setGenerating] = useState(false);

  const bodyPart = BODY_PARTS.find(b => b.key === bodyPartKey) ?? BODY_PARTS[BODY_PARTS.length - 1];

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const planId = await generateHomeWorkout(bodyPart.muscles, minutes, includeCardio);
      hapticSuccess();
      Alert.alert('Treino gerado!', 'O teu treino em casa está pronto.', [
        { text: 'Ver treino', onPress: () => router.replace({ pathname: '/plan/[id]', params: { id: planId } }) },
      ]);
    } catch (err) {
      console.error('Failed to generate home workout:', err);
      Alert.alert('Erro', 'Não foi possível gerar o treino. Tenta novamente.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Treino em Casa" showBack />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: colors.secondary }]}>
          <HomeIcon size={36} color="#fff" />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Só o que tens em casa</Text>
            <Text style={styles.heroDesc}>
              Halteres, banco inclinado e tapete — sem depender de máquinas ou barra.
            </Text>
          </View>
        </View>

        <Card>
          <View style={styles.optionHeader}>
            <Dumbbell size={20} color={colors.primary} />
            <Text style={[styles.optionTitle, { color: colors.text }]}>Que parte do corpo queres treinar?</Text>
          </View>
          <View style={styles.chips}>
            {BODY_PARTS.map(b => (
              <Chip key={b.key} label={b.label} selected={bodyPartKey === b.key} onPress={() => { hapticSelect(); setBodyPartKey(b.key); }} />
            ))}
          </View>
        </Card>

        <Card>
          <View style={styles.optionHeader}>
            <Clock size={20} color={colors.primary} />
            <Text style={[styles.optionTitle, { color: colors.text }]}>Quanto tempo tens?</Text>
          </View>
          <View style={styles.chips}>
            {MINUTES_OPTIONS.map(m => (
              <Chip key={m} label={`${m}min`} selected={minutes === m} onPress={() => { hapticSelect(); setMinutes(m); }} />
            ))}
          </View>
        </Card>

        <Card>
          <View style={styles.optionHeader}>
            <Flame size={20} color={colors.primary} />
            <Text style={[styles.optionTitle, { color: colors.text }]}>Incluir cardio no final?</Text>
          </View>
          <View style={styles.chips}>
            <Chip label="Sim" selected={includeCardio} onPress={() => { hapticSelect(); setIncludeCardio(true); }} />
            <Chip label="Não" selected={!includeCardio} onPress={() => { hapticSelect(); setIncludeCardio(false); }} />
          </View>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Um finisher de cardio sem equipamento, no fim do treino de força.
          </Text>
        </Card>

        <Button
          title="Gerar Treino"
          onPress={handleGenerate}
          loading={generating}
          icon={<HomeIcon size={20} color="#fff" />}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 20 },
  heroText: { flex: 1 },
  heroTitle: { fontFamily: 'Inter-Bold', fontSize: 20, color: '#fff' },
  heroDesc: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 17, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  optionTitle: { fontFamily: 'Inter-Bold', fontSize: 16, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 17, marginTop: 10 },
});
