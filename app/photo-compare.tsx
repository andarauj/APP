import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { useDatabase } from '@/hooks/useDatabase';
import { Card } from '@/components/ui/Card';
import { getBodyMetricsWithPhotos } from '@/db/bodyMetricsDao';
import { computeMetricDeltas, type MetricSnapshot } from '@/utils/photoCompare';
import { formatDate } from '@/utils/format';
import type { BodyMetric } from '@/types';
import { ChevronLeft, MoveHorizontal } from 'lucide-react-native';

const FIELD_LABELS: Record<string, string> = {
  weight: 'Peso', body_fat: '% Gordura', chest: 'Peito', back: 'Costas', waist: 'Cintura', hips: 'Ancas', arm: 'Braço', thigh: 'Coxa',
};
const FIELD_UNITS: Record<string, string> = {
  weight: 'kg', body_fat: '%', chest: 'cm', back: 'cm', waist: 'cm', hips: 'cm', arm: 'cm', thigh: 'cm',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDER_SIZE = SCREEN_WIDTH - 32;

export default function PhotoCompareScreen() {
  const { colors } = useTheme();
  const { isReady } = useDatabase();
  const router = useRouter();

  const [entries, setEntries] = useState<BodyMetric[]>([]);
  const [beforeIdx, setBeforeIdx] = useState(0);
  const [afterIdx, setAfterIdx] = useState(0);

  const load = useCallback(async () => {
    if (!isReady) return;
    try {
      const withPhotos = await getBodyMetricsWithPhotos(); // already oldest-first
      setEntries(withPhotos);
      if (withPhotos.length >= 2) {
        setBeforeIdx(0);
        setAfterIdx(withPhotos.length - 1); // oldest vs. newest is the most useful default
      }
    } catch (err) {
      console.error('Failed to load photos for comparison:', err);
    }
  }, [isReady]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dividerX = useSharedValue(SLIDER_SIZE / 2);

  const panGesture = Gesture.Pan()
    .onChange(e => {
      const next = Math.min(SLIDER_SIZE, Math.max(0, dividerX.value + e.changeX));
      dividerX.value = next;
    });

  const clipStyle = useAnimatedStyle(() => ({ width: dividerX.value }));
  const handleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dividerX.value - 18 }] }));

  const before = entries[beforeIdx];
  const after = entries[afterIdx];
  const deltas = before && after ? computeMetricDeltas(before as MetricSnapshot, after as MetricSnapshot) : [];

  if (entries.length < 2) {
    return (
      <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar">
            <ChevronLeft size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Comparar Fotos</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={{ color: colors.text, fontFamily: 'Inter-Bold', fontSize: 17, textAlign: 'center' }}>
            Precisas de pelo menos 2 fotos
          </Text>
          <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
            Adiciona fotos ao registares medidas em Perfil → Corpo.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar">
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Comparar Fotos</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Date pickers */}
        <View style={styles.dateRow}>
          <DateSelector label="Antes" entries={entries} selectedIdx={beforeIdx} onSelect={setBeforeIdx} colors={colors} />
          <DateSelector label="Depois" entries={entries} selectedIdx={afterIdx} onSelect={setAfterIdx} colors={colors} />
        </View>

        {/* Slider comparison */}
        <View style={[styles.sliderContainer, { width: SLIDER_SIZE, height: SLIDER_SIZE * 1.3 }]}>
          {/* Bottom layer: "before" photo, fills the whole frame */}
          <Image source={{ uri: before.photo_uri! }} style={styles.sliderImage} resizeMode="cover" />
          {/* Top layer: "after" photo, clipped to reveal only up to the divider */}
          <Animated.View style={[styles.clipLayer, clipStyle]}>
            <Image source={{ uri: after.photo_uri! }} style={[styles.sliderImage, { width: SLIDER_SIZE }]} resizeMode="cover" />
          </Animated.View>
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.handle, handleStyle]}>
              <View style={[styles.handleLine, { backgroundColor: '#fff' }]} />
              <View style={[styles.handleGrip, { backgroundColor: '#fff' }]}>
                <MoveHorizontal size={16} color={colors.text} />
              </View>
            </Animated.View>
          </GestureDetector>
          <View style={styles.dateLabelLeft}><Text style={styles.dateLabelText}>{formatDate(before.date)}</Text></View>
          <View style={styles.dateLabelRight}><Text style={styles.dateLabelText}>{formatDate(after.date)}</Text></View>
        </View>

        {/* Measurement deltas between the two selected dates */}
        {deltas.length > 0 && (
          <Card>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Diferença no Período</Text>
            {deltas.map((d, i) => (
              <View key={d.field} style={[styles.deltaRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <Text style={[styles.deltaLabel, { color: colors.textSecondary }]}>{FIELD_LABELS[d.field]}</Text>
                <Text style={[styles.deltaValue, { color: colors.textTertiary }]}>{d.before}{FIELD_UNITS[d.field]} → {d.after}{FIELD_UNITS[d.field]}</Text>
                <Text style={[styles.deltaChange, { color: d.delta === 0 ? colors.textTertiary : d.delta > 0 ? colors.warning : colors.success }]}>
                  {d.delta > 0 ? '+' : ''}{d.delta}{FIELD_UNITS[d.field]}
                </Text>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DateSelector({ label, entries, selectedIdx, onSelect, colors }: {
  label: string; entries: BodyMetric[]; selectedIdx: number; onSelect: (i: number) => void; colors: any;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.dateSelectorLabel, { color: colors.textSecondary }]}>{label.toUpperCase()}</Text>
      <TouchableOpacity
        style={[styles.dateSelectorBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
        accessibilityLabel={`Escolher data de ${label}`}
      >
        <Text style={[styles.dateSelectorText, { color: colors.text }]}>{formatDate(entries[selectedIdx].date)}</Text>
      </TouchableOpacity>
      {open && (
        <View style={[styles.dateDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {entries.map((e, i) => (
            <TouchableOpacity key={e.id} style={styles.dateOption} onPress={() => { onSelect(i); setOpen(false); }}>
              <Text style={{ color: i === selectedIdx ? colors.primary : colors.text, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>
                {formatDate(e.date)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  content: { padding: 16, gap: 16, paddingBottom: 32, alignItems: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  dateRow: { flexDirection: 'row', gap: 10, width: '100%' },
  dateSelectorLabel: { fontFamily: 'Inter-SemiBold', fontSize: 11, letterSpacing: 1, marginBottom: 6 },
  dateSelectorBtn: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  dateSelectorText: { fontFamily: 'Inter-SemiBold', fontSize: 13, textAlign: 'center' },
  dateDropdown: { position: 'absolute', top: 62, left: 0, right: 0, borderRadius: 10, borderWidth: 1, maxHeight: 200, zIndex: 10, elevation: 10 },
  dateOption: { paddingHorizontal: 12, paddingVertical: 10 },
  sliderContainer: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  sliderImage: { position: 'absolute', top: 0, left: 0, width: SLIDER_SIZE, height: '100%' },
  clipLayer: { position: 'absolute', top: 0, left: 0, height: '100%', overflow: 'hidden' },
  handle: { position: 'absolute', top: 0, bottom: 0, width: 36, alignItems: 'center' },
  handleLine: { position: 'absolute', width: 2, top: 0, bottom: 0, left: 17 },
  handleGrip: { position: 'absolute', top: '50%', marginTop: -16, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dateLabelLeft: { position: 'absolute', bottom: 10, left: 10, backgroundColor: '#00000099', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  dateLabelRight: { position: 'absolute', bottom: 10, right: 10, backgroundColor: '#00000099', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  dateLabelText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 11 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 15, marginBottom: 8 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  deltaLabel: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 13 },
  deltaValue: { fontFamily: 'Inter-Regular', fontSize: 12 },
  deltaChange: { fontFamily: 'Inter-Bold', fontSize: 13, minWidth: 55, textAlign: 'right' },
});
