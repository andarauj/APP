import { View, TextInput, TouchableOpacity } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Search, X } from 'lucide-react-native';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, placeholder = 'Pesquisar...' }: SearchBarProps) {
  const { colors } = useTheme();
  return (
    <View
      className="h-12 flex-row items-center gap-2 rounded-input px-3.5"
      style={{ backgroundColor: colors.surfaceVariant }}
    >
      <Search size={18} color={colors.textTertiary} />
      <TextInput
        className="flex-1 font-sans text-[15px]"
        style={{ color: colors.text }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <X size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      )}
    </View>
  );
}
