import { View, Text } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View className={`flex-1 items-center justify-center gap-3 p-10 ${className ?? ''}`}>
      {icon && <View className="mb-2">{icon}</View>}
      <Text className="text-center font-sans-bold text-xl" style={{ color: colors.text }}>{title}</Text>
      {description && (
        <Text className="text-center font-sans text-[15px] leading-[22px]" style={{ color: colors.textSecondary }}>
          {description}
        </Text>
      )}
      {action && <View className="mt-2">{action}</View>}
    </View>
  );
}
