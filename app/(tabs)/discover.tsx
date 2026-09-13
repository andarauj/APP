import { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { useTodayWorkoutStatus } from '@/hooks/useTodayWorkoutStatus';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { getTrainingTips, type TrainingTip } from '@/db/workoutDao';
import { generateFullBodyWorkout } from '@/utils/planGenerator';
import { launchTodayFromStatus } from '@/utils/startScheduledWorkout';
import { hapticSelect, hapticSuccess } from '@/utils/haptics';
import {
  AlertTriangle, Info, CheckCircle2, BookOpen, Home, ListChecks,
  History, TrendingUp, Activity, ChevronRight, Dumbbell, CalendarDays,
} from 'lucide-react-native';

const TIP_ICON = { warning: AlertTriangle, info: Info, positive: CheckCircle2 } as const;

// Evergreen coaching notes — Descobrir is tips + lessons only (no social feed).
const LESSONS: { title: string; body: string; actionLabel?: string; route?: string }[] = [
  {
    title: 'Sobrecarga progressiva',
    body: 'Ficas mais forte quando pedes um pouco mais aos músculos ao longo do tempo — mais peso, mais repetições, ou mais séries. Sobe devagar e de forma consistente; saltos grandes só trazem lesões e falhas.',
    actionLabel: 'Ver progressão de força',
    route: '/progress/onerm',
  },
  {
    title: 'Semanas de descarga (deload)',
    body: 'A cada 4–6 semanas, corta o volume para metade durante uma semana. Não é fraqueza: é quando o corpo absorve o trabalho e volta mais forte. Quem nunca desanda acaba por estagnar.',
    actionLabel: 'Sinais de fadiga',
    route: '/fatigue-radar',
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
    actionLabel: 'Ver calendário',
    route: '/(tabs)/history',
  },
];

const EXPLORE: { title: string; subtitle: string; route: string; icon: typeof History }[] = [
  { title: 'Histórico', subtitle: 'Calendário e sessões', route: '/(tabs)/history', icon: History },
  { title: 'Progresso', subtitle: 'Análises e resumos', route: '/progress', icon: TrendingUp },
  { title: 'Sinais de fadiga', subtitle: 'Radar de recuperação', route: '/fatigue-radar', icon: Activity },
  { title: 'Treinos', subtitle: 'Planos e biblioteca', route: '/(tabs)/plans', icon: ListChecks },
];

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();
  const todayStatus = useTodayWorkoutStatus();
  const [tips, setTips] = useState<TrainingTip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [generatingFull, setGeneratingFull] = useState(false);

  const load = useCallback(async () => {
    try {
      setTips(await getTrainingTips());
    } catch (err) {
      console.error('Failed to load discover tips:', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { if (isReady) load(); }, [isReady, load]));

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), todayStatus.refresh()]);
    setRefreshing(false);
  };

  const startHome = () => {
    hapticSelect();
    router.push('/plan/home');
  };

  const startFullBody = async () => {
    if (generatingFull) return;
    hapticSelect();
    setGeneratingFull(true);
    try {
      const planId = await generateFullBodyWorkout();
      hapticSuccess();
      router.push({ pathname: '/plan/[id]', params: { id: String(planId) } });
    } catch (err) {
      console.error('Failed to generate full body workout:', err);
      Alert.alert('Erro', 'Não foi possível gerar o Full Body. Tenta novamente.');
    } finally {
      setGeneratingFull(false);
    }
  };

  const startToday = () => {
    hapticSelect();
    const result = launchTodayFromStatus(router, todayStatus);
    if (result === 'rest') {
      Alert.alert('Dia de descanso', 'Nada agendado para hoje. Abre Workout para um Treino Rápido, ou escolhe Treino em Casa / Full Body.');
    } else if (result === 'completed') {
      Alert.alert('Já treinaste hoje', 'O treino programado para hoje já está concluído.');
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScreenHeader
        title="Descobrir"
        subtitle="Dicas e lições — coaching offline, sem feed social"
        showBack
        onBack={() => router.navigate('/(tabs)')}
      />

      <ScrollView
        contentContainerClassName="gap-3 p-4 pb-8"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Text className="mt-1 font-sans-semibold text-xs tracking-widest" style={{ color: colors.textSecondary }}>
          AÇÕES RÁPIDAS
        </Text>
        <View className="flex-row flex-wrap gap-2.5">
          {([
            { key: 'home', title: 'Treino em Casa', subtitle: 'Halteres e peso corporal', icon: Home, onPress: startHome, busy: false },
            { key: 'full', title: 'Full Body', subtitle: 'Corpo inteiro no ginásio', icon: Dumbbell, onPress: startFullBody, busy: generatingFull },
            { key: 'today', title: 'Treino do Dia', subtitle: todayStatus.scheduled?.dayLabel ?? 'O que está programado', icon: CalendarDays, onPress: startToday, busy: false },
          ] as const).map(item => {
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={item.key}
                className="min-w-[46%] flex-1 flex-row items-center gap-2.5 rounded-[14px] border p-3.5"
                style={{ backgroundColor: colors.primaryContainer, borderColor: colors.primary }}
                onPress={item.onPress}
                disabled={item.busy}
                accessibilityRole="button"
                accessibilityLabel={item.title}
              >
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.primary }}
                >
                  {item.busy ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Icon size={16} color={colors.onPrimary} />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="font-sans-bold text-[13px]" style={{ color: colors.text }}>{item.title}</Text>
                  <Text className="font-sans text-[11px]" style={{ color: colors.textSecondary }} numberOfLines={1}>{item.subtitle}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {loaded && tips.length === 0 && (
          <EmptyState
            icon={<BookOpen size={36} color={colors.textTertiary} />}
            title="Ainda sem dicas personalizadas"
            description="As dicas para ti aparecem com base no teu histórico de treino. Entretanto podes ler as lições abaixo, ou voltar a treinar."
            action={
              <View className="w-full gap-2">
                <TouchableOpacity
                  className="flex-row items-center justify-center gap-2 rounded-xl py-3"
                  style={{ backgroundColor: colors.primary }}
                  onPress={() => router.push('/(tabs)')}
                  accessibilityRole="button"
                  accessibilityLabel="Ir para Hoje"
                >
                  <Home size={16} color={colors.onPrimary} />
                  <Text className="font-sans-bold text-sm" style={{ color: colors.onPrimary }}>Ir para Hoje</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-row items-center justify-center gap-2 rounded-xl border py-3"
                  style={{ borderColor: colors.border }}
                  onPress={() => router.push('/(tabs)/plans')}
                  accessibilityRole="button"
                  accessibilityLabel="Ir para Treinos"
                >
                  <ListChecks size={16} color={colors.text} />
                  <Text className="font-sans-bold text-sm" style={{ color: colors.text }}>Abrir Treinos</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}

        {tips.length > 0 && (
          <>
            <Text className="mt-2 font-sans-semibold text-xs tracking-widest" style={{ color: colors.textSecondary }}>
              DICAS PARA TI
            </Text>
            {tips.map((tip, i) => {
              const Icon = TIP_ICON[tip.type];
              const tint = tip.type === 'warning' ? colors.warning : tip.type === 'positive' ? colors.success : colors.primary;
              return (
                <Card key={i} className="gap-2">
                  <View className="flex-row items-center gap-2.5">
                    <View
                      className="h-8 w-8 items-center justify-center rounded-full"
                      style={{ backgroundColor: colors.surfaceVariant }}
                    >
                      <Icon size={16} color={tint} />
                    </View>
                    <Text className="flex-1 font-sans-bold text-[15px]" style={{ color: colors.text }}>{tip.title}</Text>
                  </View>
                  <Text className="font-sans text-sm leading-[21px]" style={{ color: colors.textSecondary }}>{tip.detail}</Text>
                </Card>
              );
            })}
          </>
        )}

        <Text className="mt-2 font-sans-semibold text-xs tracking-widest" style={{ color: colors.textSecondary }}>
          EXPLORAR
        </Text>
        <Text className="-mt-1 font-sans text-xs leading-[17px]" style={{ color: colors.textTertiary }}>
          Atalhos para o resto da app — Descobrir não é um feed social.
        </Text>
        <View className="flex-row flex-wrap gap-2.5">
          {EXPLORE.map(item => {
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={item.route}
                className="min-w-[46%] flex-1 flex-row items-center gap-2.5 rounded-[14px] border p-3.5"
                style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                onPress={() => router.push(item.route as '/(tabs)/history' | '/progress' | '/fatigue-radar' | '/(tabs)/plans')}
                accessibilityRole="button"
                accessibilityLabel={item.title}
              >
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.primaryContainer }}
                >
                  <Icon size={16} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="font-sans-bold text-[13px]" style={{ color: colors.text }}>{item.title}</Text>
                  <Text className="font-sans text-[11px]" style={{ color: colors.textSecondary }}>{item.subtitle}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text className="mt-2 font-sans-semibold text-xs tracking-widest" style={{ color: colors.textSecondary }}>
          LIÇÕES
        </Text>
        <Text className="-mt-1 font-sans text-xs leading-[17px]" style={{ color: colors.textTertiary }}>
          Notas de coaching sempre disponíveis — não são um feed em tempo real.
        </Text>
        {LESSONS.map(lesson => (
          <Card key={lesson.title} className="gap-2">
            <View className="flex-row items-center gap-2.5">
              <View
                className="h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.primaryContainer }}
              >
                <BookOpen size={16} color={colors.primary} />
              </View>
              <Text className="flex-1 font-sans-bold text-[15px]" style={{ color: colors.text }}>{lesson.title}</Text>
            </View>
            <Text className="font-sans text-sm leading-[21px]" style={{ color: colors.textSecondary }}>{lesson.body}</Text>
            {lesson.route && lesson.actionLabel ? (
              <TouchableOpacity
                className="mt-1 flex-row items-center gap-1 self-start"
                onPress={() => router.push(lesson.route as '/progress/onerm' | '/fatigue-radar' | '/(tabs)/history')}
                accessibilityRole="button"
                accessibilityLabel={lesson.actionLabel}
              >
                <Text className="font-sans-semibold text-[13px]" style={{ color: colors.primary }}>{lesson.actionLabel}</Text>
                <ChevronRight size={14} color={colors.primary} />
              </TouchableOpacity>
            ) : null}
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
