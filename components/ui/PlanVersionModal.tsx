import { View, Text, TouchableOpacity, FlatList, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import type { WorkoutPlan } from '@/types';
import type { PlanGroup } from '@/utils/planGrouping';
import { formatDate } from '@/utils/format';
import { Copy, Trash2, X, Play } from 'lucide-react-native';

/**
 * Picker shown when a plan name has more than one saved version — lets the
 * person open, duplicate, delete, or quick-start a specific version. Shared
 * by the standalone Planos screen and the "Meus Planos" sub-tab in Treino.
 */
export function PlanVersionModal({
  group, onClose, onDuplicate, onDelete, onQuickStart,
}: {
  group: PlanGroup | null;
  onClose: () => void;
  onDuplicate: (plan: WorkoutPlan) => void;
  onDelete: (plan: WorkoutPlan) => void;
  onQuickStart: (plan: WorkoutPlan) => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Modal visible={group !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalScreen, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{group?.name}</Text>
          <TouchableOpacity onPress={onClose}><X size={24} color={colors.text} /></TouchableOpacity>
        </View>
        <FlatList
          data={group?.plans ?? []}
          keyExtractor={p => String(p.id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.versionRow, { borderColor: colors.border }]}
              onPress={() => { onClose(); router.push({ pathname: '/plan/[id]', params: { id: item.id } }); }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.versionDate, { color: colors.textTertiary }]}>Atualizado {formatDate(item.updated_at)}</Text>
              </View>
              <TouchableOpacity
                style={[styles.startBtnSmall, { backgroundColor: colors.primary }]}
                onPress={() => { onClose(); onQuickStart(item); }}
                accessibilityRole="button"
                accessibilityLabel={`Iniciar treino ${item.name}`}
              >
                <Play size={14} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDuplicate(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Duplicar versão de ${item.name}`}>
                <Copy size={18} color={colors.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Eliminar versão de ${item.name}`}>
                <Trash2 size={18} color={colors.error} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 16, gap: 10 }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalScreen: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { fontFamily: 'Inter-Bold', fontSize: 20 },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  versionDate: { fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 4 },
  startBtnSmall: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
