/**
 * Body metrics input modal — weight, body fat, measurements
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { recordBodyMetric, getLatestBodyMetric } from '@/db/bodyMetricsDao';
import type { BodyMetric } from '@/types';
import { X, Check, TrendingUp } from 'lucide-react-native';

export interface BodyMetricsInputProps {
  visible: boolean;
  onClose: () => void;
  onSave?: (metric: BodyMetric) => void;
}

export function BodyMetricsInput({ visible, onClose, onSave }: BodyMetricsInputProps) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [arm, setArm] = useState('');
  const [thigh, setThigh] = useState('');
  const [showMeasurements, setShowMeasurements] = useState(false);

  // Load latest on open
  useEffect(() => {
    if (visible) {
      loadLatest();
    }
  }, [visible]);

  const loadLatest = async () => {
    try {
      const latest = await getLatestBodyMetric();
      if (latest) {
        if (latest.weight) setWeight(String(latest.weight));
        if (latest.body_fat) setBodyFat(String(latest.body_fat));
        if (latest.chest) setChest(String(latest.chest));
        if (latest.waist) setWaist(String(latest.waist));
        if (latest.arm) setArm(String(latest.arm));
        if (latest.thigh) setThigh(String(latest.thigh));
      }
    } catch (err) {
      console.error('Failed to load latest metrics:', err);
    }
  };

  const handleSave = async () => {
    if (!weight && !bodyFat && !chest && !waist && !arm && !thigh) {
      Alert.alert('Vazio', 'Preenche pelo menos um campo.');
      return;
    }

    setLoading(true);
    try {
      const metric = await recordBodyMetric({
        date: Math.floor(Date.now() / 1000),
        weight: weight ? parseFloat(weight) : undefined,
        body_fat: bodyFat ? parseFloat(bodyFat) : undefined,
        chest: chest ? parseFloat(chest) : undefined,
        waist: waist ? parseFloat(waist) : undefined,
        arm: arm ? parseFloat(arm) : undefined,
        thigh: thigh ? parseFloat(thigh) : undefined,
      });

      onSave?.(metric);
      Alert.alert('Guardado!', 'Métricas corporais gravadas com sucesso.');
      onClose();
    } catch (err) {
      console.error('Failed to save metrics:', err);
      Alert.alert('Erro', 'Não foi possível guardar as métricas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
          >
            <X size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Métricas Corporais</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={loading}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Guardar"
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Check size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Weight Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Peso</Text>
            <View style={[styles.inputGroup, { borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Peso (kg)"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                value={weight}
                onChangeText={setWeight}
              />
              <Text style={[styles.unit, { color: colors.textSecondary }]}>kg</Text>
            </View>
          </View>

          {/* Body Fat Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Gordura Corporal</Text>
            <View style={[styles.inputGroup, { borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Gordura corporal (%)"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                value={bodyFat}
                onChangeText={setBodyFat}
              />
              <Text style={[styles.unit, { color: colors.textSecondary }]}>%</Text>
            </View>
          </View>

          {/* Toggle Measurements */}
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              {
                backgroundColor: showMeasurements ? colors.primaryContainer : colors.surface,
                borderColor: showMeasurements ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setShowMeasurements(!showMeasurements)}
          >
            <TrendingUp
              size={18}
              color={showMeasurements ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.toggleText,
                {
                  color: showMeasurements ? colors.primary : colors.text,
                },
              ]}
            >
              {showMeasurements ? 'Ocultar' : 'Adicionar'} Circunferências
            </Text>
          </TouchableOpacity>

          {/* Measurements Section */}
          {showMeasurements && (
            <View style={styles.measurementsSection}>
              <Text style={[styles.measurementsTitle, { color: colors.textSecondary }]}>
                Todas em centímetros (cm)
              </Text>

              <View style={[styles.inputGroup, { borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Peito"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  value={chest}
                  onChangeText={setChest}
                />
                <Text style={[styles.unit, { color: colors.textSecondary }]}>cm</Text>
              </View>

              <View style={[styles.inputGroup, { borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Cintura"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  value={waist}
                  onChangeText={setWaist}
                />
                <Text style={[styles.unit, { color: colors.textSecondary }]}>cm</Text>
              </View>

              <View style={[styles.inputGroup, { borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Braço"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  value={arm}
                  onChangeText={setArm}
                />
                <Text style={[styles.unit, { color: colors.textSecondary }]}>cm</Text>
              </View>

              <View style={[styles.inputGroup, { borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Coxa"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  value={thigh}
                  onChangeText={setThigh}
                />
                <Text style={[styles.unit, { color: colors.textSecondary }]}>cm</Text>
              </View>
            </View>
          )}

          {/* Info */}
          <View style={[styles.infoCard, { backgroundColor: colors.primaryContainer }]}>
            <Text style={[styles.infoTitle, { color: colors.primary }]}>
              💡 Dica
            </Text>
            <Text style={[styles.infoText, { color: colors.primary }]}>
              Regista o teu peso regularmente (de manhã, sem roupa, após ir à casa de banho) para melhor precisão. As circunferências são opcionais.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    marginBottom: 10,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
  },
  unit: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 20,
  },
  toggleText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  measurementsSection: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    gap: 12,
  },
  measurementsTitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    marginBottom: 4,
  },
  infoCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  infoTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    marginBottom: 6,
  },
  infoText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 16,
  },
});
