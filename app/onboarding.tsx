import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { setSetting } from '@/db/settingsDao';
import { hapticSelect, hapticSuccess } from '@/utils/haptics';
import { Sparkles, TrendingUp, ShieldCheck, Dumbbell } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    icon: Dumbbell,
    title: 'Bem-vindo à Changes',
    body: 'A tua app de treino, sem tretas. Regista séries, acompanha progresso, e vê-te a ficar mais forte ao longo do tempo.',
  },
  {
    icon: Sparkles,
    title: 'Treino Inteligente',
    body: 'Chega ao ginásio e a app decide o que treinar hoje — olhando para o que já treinaste recentemente, nunca repetindo o mesmo dia duas vezes seguidas.',
  },
  {
    icon: TrendingUp,
    title: 'Vê o teu progresso a sério',
    body: 'Recordes pessoais, evolução de medidas, distribuição muscular, resumo mensal — tudo calculado a partir do que realmente treinaste, sem adivinhações.',
  },
  {
    icon: ShieldCheck,
    title: 'Sem anúncios. Sem subscrição.',
    body: 'Tudo fica no teu telemóvel. Sem conta, sem internet necessária, sem ninguém a ver os teus dados a não ser tu.',
  },
];

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const isLastSlide = pageIndex === SLIDES.length - 1;

  const finish = async () => {
    hapticSuccess();
    await setSetting('onboardingComplete', '1').catch(() => {});
    router.replace('/(tabs)');
  };

  const goToNext = () => {
    if (isLastSlide) {
      finish();
      return;
    }
    hapticSelect();
    const next = pageIndex + 1;
    scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
    setPageIndex(next);
  };

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setPageIndex(next);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <TouchableOpacity style={styles.skip} onPress={finish} accessibilityRole="button" accessibilityLabel="Saltar introdução">
        <Text style={{ color: colors.textTertiary, fontFamily: 'Inter-SemiBold', fontSize: 14 }}>Saltar</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => {
          const Icon = slide.icon;
          return (
            <View key={i} style={[styles.slide, { width: SCREEN_WIDTH }]}>
              <Animated.View entering={FadeIn.delay(100).duration(400)} style={[styles.iconRing, { backgroundColor: colors.primaryContainer }]}>
                <Icon size={44} color={colors.primary} />
              </Animated.View>
              <Text style={[styles.title, { color: colors.text }]}>{slide.title}</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>{slide.body}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === pageIndex ? colors.primary : colors.border, width: i === pageIndex ? 22 : 8 },
              ]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary }]}
          onPress={goToNext}
          accessibilityRole="button"
          accessibilityLabel={isLastSlide ? 'Começar' : 'Seguinte'}
        >
          <Text style={styles.nextBtnText}>{isLastSlide ? 'Começar' : 'Seguinte'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  skip: { position: 'absolute', top: 16, right: 20, zIndex: 10, padding: 8 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  iconRing: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  title: { fontFamily: 'Inter-Black', fontSize: 26, textAlign: 'center', marginBottom: 14 },
  body: { fontFamily: 'Inter-Regular', fontSize: 15, lineHeight: 23, textAlign: 'center' },
  footer: { paddingHorizontal: 24, paddingBottom: 24, gap: 20 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  nextBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 16 },
});
