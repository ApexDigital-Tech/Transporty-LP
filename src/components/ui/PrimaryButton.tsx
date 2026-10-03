import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, ViewStyle, StyleProp } from 'react-native';
import tw from 'twrnc';
import { useTheme } from '@/theme';

interface PrimaryButtonProps {
  /** Texto que se muestra en el botón */
  label: string;
  /** Texto alternativo cuando isLoading=true */
  loadingLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  /** 'primary' = naranja sólido | 'ghost' = borde naranja sin fill | 'danger' = rojo */
  variant?: 'primary' | 'ghost' | 'danger';
  style?: StyleProp<ViewStyle>;
}

/**
 * PrimaryButton — Botón pill shape del design system Transporty OS.
 * Usa el acento del tema activo (naranja en dark, naranja oscuro en light).
 * Siempre rounded-full para coincidir con la estética InDrive/Uber de referencia.
 */
export default function PrimaryButton({
  label,
  loadingLabel,
  onPress,
  disabled = false,
  isLoading = false,
  variant = 'primary',
  style,
}: PrimaryButtonProps) {
  const { theme, isDark } = useTheme();

  const isDisabled = disabled || isLoading;

  const getBackground = (): string => {
    if (disabled && !isLoading) {
      return isDark ? theme.cardElevated : '#E2E8F0';
    }
    if (variant === 'danger') return theme.statusDanger;
    if (variant === 'ghost') return 'transparent';
    return theme.accent; // primary: naranja
  };

  const getBorderColor = (): string => {
    if (variant === 'ghost') return theme.accent;
    if (variant === 'danger') return theme.statusDanger;
    return 'transparent';
  };

  const getTextColor = (): string => {
    if (disabled && !isLoading) return isDark ? theme.textSubtle : '#94A3B8';
    if (variant === 'ghost') return theme.accent;
    return '#FFFFFF';
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        tw`py-4 rounded-full flex-row items-center justify-center`,
        {
          backgroundColor: getBackground(),
          borderWidth: variant === 'ghost' ? 1.5 : 0,
          borderColor: getBorderColor(),
          opacity: isLoading ? 0.85 : 1,
          shadowColor: variant === 'primary' && !disabled ? theme.accent : 'transparent',
          shadowOpacity: variant === 'primary' && !disabled ? 0.35 : 0,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: variant === 'primary' && !disabled ? 6 : 0,
        },
        style,
      ]}
    >
      {isLoading && (
        <ActivityIndicator
          color={variant === 'ghost' ? theme.accent : '#FFFFFF'}
          size="small"
          style={tw`mr-2`}
        />
      )}
      <Text
        style={[
          tw`font-bold text-sm uppercase tracking-wider`,
          { color: getTextColor() },
        ]}
      >
        {isLoading ? (loadingLabel ?? 'Cargando...') : label}
      </Text>
    </TouchableOpacity>
  );
}
