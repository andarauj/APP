import { View, Text, StyleSheet } from 'react-native';
import { MUSCLE_GROUPS_PT } from '@/types';
import type { DoseAuditRow } from '@/utils/trainingDose';

type Colors = {
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  error: string;
  accent: string;
  border: string;
  surfaceVariant: string;
};

function statusColor(status: DoseAuditRow['status'], colors: Colors): string {
  if (status === 'low') return colors.accent;
  if (status === 'high') return colors.error;
  return colors.primary;
}

function statusLabel(status: DoseAuditRow['status']): string {
  if (status === 'low') return 'abaixo';
  if (status === 'high') return 'acima';
  return 'ok';
}

export function VolumeDoseAudit({
  rows,
  colors,
  disclaimer = 'Estimativa habitual de séries duras por músculo — não é um valor científico exacto.',
}: {
  rows: DoseAuditRow[];
  colors: Colors;
  disclaimer?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.textSecondary }]}>Séries / semana (estimativa)</Text>
      {rows.map(row => (
        <View key={row.muscle} style={[styles.row, { borderColor: colors.border }]}>
          <Text style={[styles.muscle, { color: colors.text }]}>{MUSCLE_GROUPS_PT[row.muscle]}</Text>
          <Text style={[styles.meta, { color: colors.textTertiary }]}>
            {row.planned} séries · {row.frequency}×/sem
          </Text>
          <Text style={[styles.status, { color: statusColor(row.status, colors) }]}>
            {statusLabel(row.status)}
          </Text>
        </View>
      ))}
      <Text style={[styles.disclaimer, { color: colors.textTertiary }]}>{disclaimer}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 8 },
  title: { fontFamily: 'Inter-SemiBold', fontSize: 12, letterSpacing: 0.4, marginBottom: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  muscle: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 13 },
  meta: { fontFamily: 'Inter-Regular', fontSize: 12 },
  status: { fontFamily: 'Inter-SemiBold', fontSize: 11, textTransform: 'uppercase' },
  disclaimer: { fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 15, marginTop: 4 },
});
