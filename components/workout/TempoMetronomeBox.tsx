import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Timer } from 'lucide-react-native';
import { parseTempo, tempoSecondsPerRep } from '@/utils/calculators';
import { useTempoMetronome, PHASE_LABELS } from '@/hooks/useTempoMetronome';

interface TempoMetronomeBoxProps {
  tempo: string;
  isRunning: boolean;
  vibrateEnabled: boolean;
  onStart: () => void;
  onStop: () => void;
  colors: any;
}

/**
 * Cadence metronome for a single exercise.
 *
 * PERF: kept as its own component so the 100ms tick only re-renders this
 * small box rather than the whole workout screen. Every exercise card with a
 * cadence renders one; useTempoMetronome's interval only actually runs for
 * the instance where isRunning is true, the rest early-return inside the
 * hook.
 *
 * Takes `colors` as a prop rather than calling useTheme itself, so it stays
 * a pure render of what the parent passes — the parent already has the
 * theme, and threading it through avoids a second context subscription on
 * every card.
 */
export function TempoMetronomeBox({
  tempo,
  isRunning,
  vibrateEnabled,
  onStart,
  onStop,
  colors,
}: TempoMetronomeBoxProps) {
  const parsed = parseTempo(tempo);
  const { phase, phaseRemaining, repCount } = useTempoMetronome(parsed, isRunning, vibrateEnabled);
  if (!parsed) return null;

  return (
    <View style={[styles.tempoBox, {
      backgroundColor: isRunning ? colors.primaryContainer : colors.surfaceVariant,
      borderColor: isRunning ? colors.primary : colors.border,
    }]}>
      {isRunning ? (
        <>
          <View style={styles.tempoActive}>
            <Text style={[styles.tempoPhase, { color: colors.primary }]}>
              {PHASE_LABELS[phase]}
            </Text>
            <Text style={[styles.tempoCount, { color: colors.text }]}>{phaseRemaining}</Text>
          </View>
          <Text style={[styles.tempoMeta, { color: colors.textSecondary }]}>
            {repCount} reps · {tempo}
          </Text>
          <TouchableOpacity
            style={[styles.tempoBtn, { backgroundColor: colors.error }]}
            onPress={onStop}
            accessibilityRole="button"
            accessibilityLabel="Parar metronomo de cadencia"
          >
            <Text style={styles.tempoBtnText}>Parar</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Timer size={16} color={colors.textSecondary} />
          <Text style={[styles.tempoMeta, { color: colors.textSecondary, flex: 1 }]}>
            Cadência {tempo} · {tempoSecondsPerRep(parsed)}s/rep
          </Text>
          <TouchableOpacity
            style={[styles.tempoBtn, { backgroundColor: colors.primary }]}
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel="Iniciar metronomo de cadencia"
          >
            <Text style={styles.tempoBtnText}>Iniciar</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tempoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8 },
  tempoActive: { alignItems: 'center', minWidth: 70 },
  tempoPhase: { fontFamily: 'Inter-SemiBold', fontSize: 12, lineHeight: 16 },
  tempoCount: { fontFamily: 'Inter-Bold', fontSize: 26, lineHeight: 30 },
  tempoMeta: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, flex: 1 },
  tempoBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  tempoBtnText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 13, lineHeight: 17 },
});
