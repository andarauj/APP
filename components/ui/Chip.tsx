import { Text, TouchableOpacity } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  className?: string;
}

export function Chip({ label, selected, onPress, className }: ChipProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      className={`rounded-full border px-3.5 py-1.5 ${className ?? ''}`}
      style={{
        backgroundColor: selected ? colors.primaryContainer : colors.chip,
        borderColor: selected ? colors.primary : 'transparent',
      }}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
    >
      <Text
        className="font-sans-semibold text-xs leading-4"
        style={{ color: selected ? colors.onPrimaryContainer : colors.text }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
