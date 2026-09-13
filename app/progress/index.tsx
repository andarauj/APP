/**
 * Progress hub — one place that lists every analysis screen.
 *
 * These screens were reachable, but scattered: fatigue, achievements and the
 * monthly recap from the home screen, photo comparison from the profile, and
 * muscle balance, 1RM and favourites three levels deep inside the history
 * tab's statistics section. Anyone who did not go poking around the history
 * would never learn half of them existed.
 *
 * This does not replace those entry points; it collects them, so there is a
 * single answer to "where do I see how I'm doing?".
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useAppMode } from '@/hooks/useAppMode';
import {
  ChevronLeft, ChevronRight, Radar, Zap, Star, Activity,
  Trophy, Calendar, Camera, History, Compass,
} from 'lucide-react-native';

interface Entry {
  route: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  /** Hidden in simple mode, where the extra depth is noise rather than help. */
  advanced?: boolean;
}

const SECTIONS: { heading: string; entries: Entry[] }[] = [
  {
    heading: 'Treino',
    entries: [
      {
        route: '/(tabs)/history',
        title: 'Histórico',
        description: 'Calendário, estatísticas e todas as sessões',
        icon: History,
      },
      {
        route: '/progress/onerm',
        title: 'Máximo estimado (1RM)',
        description: 'Progressão de força por exercício',
        icon: Zap,
      },
      {
        route: '/progress/balance',
        title: 'Equilíbrio muscular',
        description: 'Distribuição do volume por grupo muscular',
        icon: Radar,
        advanced: true,
      },
      {
        route: '/fatigue-radar',
        title: 'Sinais de fadiga',
        description: 'Indicadores de acumulação de fadiga',
        icon: Activity,
        advanced: true,
      },
    ],
  },
  {
    heading: 'Corpo',
    entries: [
      {
        route: '/photo-compare',
        title: 'Comparar fotos',
        description: 'Antes e depois lado a lado',
        icon: Camera,
      },
    ],
  },
  {
    heading: 'Resumos',
    entries: [
      {
        route: '/(tabs)/discover',
        title: 'Descobrir',
        description: 'Dicas personalizadas e notas de coaching',
        icon: Compass,
      },
      {
        route: '/monthly-recap',
        title: 'O teu mês',
        description: 'Resumo mensal com comparação ao mês anterior',
        icon: Calendar,
      },
      {
        route: '/achievements',
        title: 'Conquistas',
        description: 'Marcos atingidos',
        icon: Trophy,
      },
      {
        route: '/progress/favorites',
        title: 'Exercícios favoritos',
        description: 'Os que marcaste com estrela',
        icon: Star,
      },
    ],
  },
];

export default function ProgressHubScreen() {
  const { colors } = useTheme();
  const { isSimple } = useAppMode();
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Progresso</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {SECTIONS.map(section => {
          const entries = section.entries.filter(e => !(e.advanced && isSimple));
          if (entries.length === 0) return null;

          return (
            <View key={section.heading} style={styles.section}>
              <Text style={[styles.heading, { color: colors.textSecondary }]}>
                {section.heading.toUpperCase()}
              </Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {entries.map((entry, idx) => {
                  const Icon = entry.icon;
                  return (
                    <TouchableOpacity
                      key={entry.route}
                      style={[
                        styles.row,
                        idx < entries.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      ]}
                      onPress={() => router.push(entry.route as never)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={entry.title}
                      accessibilityHint={entry.description}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: colors.primaryContainer }]}>
                        <Icon size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: colors.text }]}>{entry.title}</Text>
                        <Text style={[styles.rowDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                          {entry.description}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: { fontFamily: 'Inter-SemiBold', fontSize: 18 },
  content: { padding: 16, paddingBottom: 32, gap: 20 },
  section: { gap: 8 },
  heading: { fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  rowDesc: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
});
