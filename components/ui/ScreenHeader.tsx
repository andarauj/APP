import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  /** Override default router.back() — needed for hidden tabs like Histórico. */
  onBack?: () => void;
  right?: React.ReactNode;
  className?: string;
}

export function ScreenHeader({ title, subtitle, showBack, onBack, right, className }: ScreenHeaderProps) {
  const { colors } = useTheme();
  // Imperative router — avoids useRouter() hook failures if this header is
  // ever painted during a brief NavigationContainer gap (fonts / NativeWind).

  return (
    <View
      className={`flex-row items-center justify-between gap-3 border-b px-4 pb-3 pt-3 ${className ?? ''}`}
      style={{ backgroundColor: colors.background, borderBottomColor: colors.border }}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        {showBack && (
          <TouchableOpacity
            onPress={() => (onBack ? onBack() : router.back())}
            className="p-1"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
        )}
        <View className="min-w-0 flex-1">
          <Text
            className="font-sans-bold text-[22px]"
            style={{ color: colors.text }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              className="mt-0.5 font-sans text-[13px] leading-[17px]"
              style={{ color: colors.textSecondary }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {right && <View className="shrink-0 flex-row items-center gap-2">{right}</View>}
    </View>
  );
}
