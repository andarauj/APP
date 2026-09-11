/**
 * Weekly Recap — what the adaptive engine changed and why (NSPI_ENGINE.md §6).
 * Reached from the phase badge / the NSPI card banner, and right after
 * turning the engine on (app/adaptive/start.tsx).
 */

import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, ArrowRight, Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAdaptiveStatus } from '@/hooks/useAdaptiveStatus';
import { getLatestAdaptivePlanAny } from '@/db/adaptiveDao';
import { PHASE_LABEL_PT, PHASE_COLOR } from '@/utils/adaptivePlan';
import { Card } from '@/components/ui/Card';

export default function AdaptiveRecapScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { status, loaded } = useAdaptiveStatus();

  // status is null both for "never started" and "paused" (getActiveAdaptivePlan
  // filters active=1) — check separately so a paused plan gets a "reativa nas
  // Definições" nudge instead of the generic "liga o plano" copy.
  const [isPaused, setIsPaused] = useState(false);
  useFocusEffect(useCallback(() => {
    if (status) { setIsPaused(false); return; }
    let mounted = true;
    getLatestAdaptivePlanAny().then(p => { if (mounted) setIsPaused(!!p && p.active !== 1); }).catch(() => {});
    return () => { mounted = false; };
  }, [status]));

  const recap = status?.latestRecap;
  const nspi = status?.latestNspi;

  const trendIcon = useMemo(() => {
    if (!nspi?.trend) return null;
    if (nspi.trend === 'up') return <TrendingUp size={16} color={colors.secondary} />;
    if (nspi.trend === 'down') return <TrendingDown size={16} color={colors.error} />;
    return <Minus size={16} color={colors.textSecondary} />;
  }, [nspi?.trend, colors]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Weekly Recap</Text>
        <View style={{ width: 24 }} />
      </View>

      {!loaded ? (
        <View style={[styles.center, { flex: 1 }]}><ActivityIndicator color={colors.primary} /></View>
      ) : !status ? (
        <View style={[styles.center, { flex: 1, paddingHorizontal: 32 }]}>
          <Sparkles size={40} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 16 }]}>
            {isPaused ? 'Plano Adaptativo em pausa' : 'Sem plano adaptativo ativo'}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 8 }]}>
            {isPaused
              ? 'Reativa a Periodização automática em Definições › Plano Adaptativo (NSPI) para continuares o teu ciclo.'
              : 'Liga o Plano Adaptativo em Treino › Explorar para começares a ver o teu Weekly Recap aqui.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.phaseRow}>
            <View style={[styles.phaseDot, { backgroundColor: PHASE_COLOR[status.phase] }]} />
            <Text style={[styles.phaseLabel, { color: colors.text }]}>
              Ciclo {status.cycleIndex} · Semana {status.weekIndex} · {PHASE_LABEL_PT[status.phase]}
              {status.isBridge ? ' (consolidação)' : ''}
            </Text>
          </View>

          {recap ? (
            <>
              {recap.decision !== 'start' && (
                <Card>
                  <View style={styles.transitionRow}>
                    <View style={[styles.phasePill, { backgroundColor: PHASE_COLOR[recap.phaseFrom] + '22' }]}>
                      <Text style={[styles.phasePillText, { color: PHASE_COLOR[recap.phaseFrom] }]}>{PHASE_LABEL_PT[recap.phaseFrom]}</Text>
                    </View>
                    <ArrowRight size={18} color={colors.textSecondary} />
                    <View style={[styles.phasePill, { backgroundColor: PHASE_COLOR[recap.phaseTo] + '22' }]}>
                      <Text style={[styles.phasePillText, { color: PHASE_COLOR[recap.phaseTo] }]}>{PHASE_LABEL_PT[recap.phaseTo]}</Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    <Text style={[styles.decisionText, { color: colors.textSecondary }]}>{DECISION_PT[recap.decision]}</Text>
                  </View>
                </Card>
              )}

              {nspi && (
                <Card>
                  <View style={styles.nspiHeadRow}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>NSPI</Text>
                    <View style={styles.nspiScoreRow}>
                      <Text style={[styles.nspiScore, { color: colors.primary }]}>{Math.round(nspi.score)}</Text>
                      <Text style={[styles.nspiScoreMax, { color: colors.textSecondary }]}>/100</Text>
                      {trendIcon}
                    </View>
                  </View>
                  <View style={styles.axesRow}>
                    <Axis label="Carga" value={nspi.load} color={colors.primary} colors={colors} />
                    <Axis label="Volume" value={nspi.volume} color={colors.secondary} colors={colors} />
                    <Axis label="Equilíbrio" value={nspi.balance} color={colors.accent} colors={colors} />
                  </View>
                </Card>
              )}

              {recap.changed.length > 0 && (
                <Card>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>O que mudou</Text>
                  {recap.changed.map((line, i) => (
                    <Text key={i} style={[styles.listLine, { color: colors.textSecondary }]}>· {line}</Text>
                  ))}
                </Card>
              )}

              {recap.why.length > 0 && (
                <Card>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Porquê</Text>
                  {recap.why.map((line, i) => (
                    <Text key={i} style={[styles.listLine, { color: colors.textSecondary }]}>· {line}</Text>
                  ))}
                </Card>
              )}

              <Card variant="highlight" style={{ backgroundColor: colors.primaryContainer }}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>O que esperar</Text>
                <Text style={[styles.body, { color: colors.text, marginTop: 4 }]}>{recap.expect}</Text>
              </Card>
            </>
          ) : (
            <Card>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                Ainda sem recap — volta no fim da primeira semana de treino.
              </Text>
            </Card>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const DECISION_PT: Record<string, string> = {
  start: 'Início',
  advance: 'Avançou de fase',
  bridge: 'Semana de consolidação',
  hold: 'Manteve a fase',
  deload_early: 'Descarga antecipada',
};

function Axis({ label, value, color, colors }: { label: string; value: number; color: string; colors: any }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[styles.axisLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.axisTrack, { backgroundColor: colors.surfaceVariant }]}>
        <View style={[styles.axisFill, { backgroundColor: color, width: `${Math.max(2, Math.min(100, value))}%` }]} />
      </View>
      <Text style={[styles.axisValue, { color: colors.text }]}>{Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: 18 },
  content: { paddingHorizontal: 12, paddingBottom: 32, gap: 12 },
  emptyTitle: { fontFamily: 'Inter-Bold', fontSize: 17 },
  body: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20 },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, marginBottom: 4 },
  phaseDot: { width: 10, height: 10, borderRadius: 5 },
  phaseLabel: { fontFamily: 'Inter-SemiBold', fontSize: 14 },
  transitionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phasePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  phasePillText: { fontFamily: 'Inter-Bold', fontSize: 12 },
  decisionText: { fontFamily: 'Inter-SemiBold', fontSize: 12 },
  cardTitle: { fontFamily: 'Inter-Bold', fontSize: 15 },
  nspiHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nspiScoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  nspiScore: { fontFamily: 'Inter-ExtraBold', fontSize: 28 },
  nspiScoreMax: { fontFamily: 'Inter-Regular', fontSize: 13 },
  axesRow: { flexDirection: 'row', gap: 16, marginTop: 16 },
  axisLabel: { fontFamily: 'Inter-Regular', fontSize: 11 },
  axisTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  axisFill: { height: 6, borderRadius: 3 },
  axisValue: { fontFamily: 'Inter-Bold', fontSize: 13 },
  listLine: { fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 21, marginTop: 6 },
});
