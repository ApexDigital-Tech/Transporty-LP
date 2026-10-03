import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, SafeAreaView,
  KeyboardAvoidingView, Platform, Alert, ScrollView, Animated
} from 'react-native';
import tw from 'twrnc';
import { useAuth, UserRole } from '@/hooks/useAuth';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import PrimaryButton from '@/components/ui/PrimaryButton';

// ────────────────────────────────────────────────────────────────
//  Role Selector Card
// ────────────────────────────────────────────────────────────────
interface RoleOption {
  id: UserRole;
  label: string;
  sublabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeColor: string;
  activeBg: string;
}

const ROLES: RoleOption[] = [
  { id: 'pasajero', label: 'Pasajero', sublabel: 'Ver rutas', icon: 'navigate', activeColor: '#38BDF8', activeBg: 'rgba(56,189,248,0.12)' },
  { id: 'chofer', label: 'Chofer', sublabel: 'GPS en vivo', icon: 'speedometer', activeColor: '#34D399', activeBg: 'rgba(52,211,153,0.12)' },
  { id: 'admin', label: 'Administrador', sublabel: 'Panel de Flota', icon: 'shield-checkmark', activeColor: '#A78BFA', activeBg: 'rgba(167,139,250,0.12)' },
];

export default function LoginScreen() {
  const { defaultRole } = useLocalSearchParams<{ defaultRole?: UserRole }>();
  const [role, setRole] = useState<UserRole>(defaultRole || 'pasajero');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [otpToken, setOtpToken] = useState('');
  const { sendOtp, verifyOtp, isLoading } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  const handleSendOtp = async () => {
    if (phone.trim().length < 8) {
      Alert.alert('Error', 'Ingresa un número válido de Bolivia (Ej. 70012345).');
      return;
    }
    const { error } = await sendOtp(phone);
    if (error) {
      Alert.alert('Error', 'No se pudo enviar OTP: ' + (error.message || error));
      return;
    }
    setStep('otp');
  };

  const handleVerifyOtp = async () => {
    if (otpToken.trim().length < 6) {
      Alert.alert('Error', 'Ingresa el código de 6 dígitos.');
      return;
    }
    const { error, isProfileComplete } = await verifyOtp(phone, otpToken, role);
    if (error) {
      Alert.alert('Error', 'Código inválido o expirado: ' + (error.message || error));
      return;
    }
    if (role === 'admin') {
      router.replace('/(admin)/dashboard');
    } else if (role === 'chofer') {
      router.replace(isProfileComplete ? '/(app)/driver' : '/(app)/driver-setup');
    } else {
      router.replace('/(app)/passenger');
    }
  };

  const activeRole = ROLES.find(r => r.id === role)!;

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
      {/* Theme Toggle */}
      <View style={tw`absolute top-14 right-5 z-20`}>
        <TouchableOpacity
          onPress={toggleTheme}
          style={[
            tw`w-10 h-10 rounded-full items-center justify-center`,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }
          ]}
        >
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={isDark ? '#FBBF24' : '#475569'} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={tw`flex-1`}>
        <ScrollView
          contentContainerStyle={tw`flex-grow justify-start pt-8 pb-12 px-6`}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Logo & Brand */}
            <View style={tw`items-center mb-8 mt-8`}>
              <View
                style={[
                  tw`w-16 h-16 rounded-2xl items-center justify-center mb-4`,
                  { backgroundColor: activeRole.activeBg, borderWidth: 1, borderColor: activeRole.activeColor + '30' }
                ]}
              >
                <Ionicons name="bus" size={32} color={theme.accent} />
              </View>
              <Text style={[tw`text-2xl font-extrabold tracking-tight`, { color: theme.text }]}>
                Transporty OS
              </Text>
              <Text style={[tw`text-xs font-medium mt-1`, { color: theme.textMuted }]}>
                Acceso seguro al sistema de transporte
              </Text>
            </View>

            {step === 'phone' ? (
              <>
                {/* Step 1: Role Selection */}
                <Text style={[tw`text-[11px] font-bold uppercase tracking-[0.15em] mb-3 ml-1`, { color: theme.textSubtle }]}>
                  1. ¿Cómo viajas hoy?
                </Text>

                <View style={tw`flex-row gap-2 mb-3`}>
                  {ROLES.filter(r => r.id !== 'admin').map((r) => {
                    const isSelected = role === r.id;
                    return (
                      <TouchableOpacity
                        key={r.id}
                        onPress={() => setRole(r.id)}
                        style={[
                          tw`flex-1 p-3.5 rounded-2xl flex-row items-center gap-3`,
                          {
                            backgroundColor: isSelected ? r.activeBg : (isDark ? theme.card : theme.card),
                            borderWidth: isSelected ? 2 : 1,
                            borderColor: isSelected ? r.activeColor : theme.border,
                          }
                        ]}
                      >
                        <View
                          style={[
                            tw`w-10 h-10 rounded-xl items-center justify-center`,
                            { backgroundColor: isSelected ? r.activeColor + '20' : (isDark ? theme.cardElevated : theme.cardElevated) }
                          ]}
                        >
                          <Ionicons name={r.icon} size={20} color={isSelected ? r.activeColor : theme.textSubtle} />
                        </View>
                        <View>
                          <Text style={[tw`font-bold text-xs`, { color: isSelected ? (isDark ? '#fff' : theme.text) : theme.textMuted }]}>
                            {r.label}
                          </Text>
                          <Text style={[tw`text-[9px]`, { color: theme.textSubtle }]}>{r.sublabel}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Admin Option — Full Width */}
                <TouchableOpacity
                  onPress={() => setRole('admin')}
                  style={[
                    tw`w-full p-3.5 rounded-2xl flex-row items-center gap-3 mb-7`,
                    {
                      backgroundColor: role === 'admin'
                        ? (isDark ? '#1A1033' : '#F5F3FF')
                        : (isDark ? theme.card : theme.card),
                      borderWidth: role === 'admin' ? 2 : 1,
                      borderColor: role === 'admin' ? '#A78BFA' : theme.border,
                    }
                  ]}
                >
                  <View
                    style={[
                      tw`w-10 h-10 rounded-xl items-center justify-center`,
                      { backgroundColor: role === 'admin' ? 'rgba(167,139,250,0.2)' : (isDark ? theme.cardElevated : theme.cardElevated) }
                    ]}
                  >
                    <Ionicons name="shield-checkmark" size={20} color={role === 'admin' ? '#A78BFA' : theme.textSubtle} />
                  </View>
                  <View>
                    <Text style={[tw`font-bold text-xs`, { color: role === 'admin' ? (isDark ? '#E9DFFF' : '#5B21B6') : theme.textMuted }]}>
                      Administrador
                    </Text>
                    <Text style={[tw`text-[9px]`, { color: theme.textSubtle }]}>Monitoreo y Flotas (SaaS)</Text>
                  </View>
                </TouchableOpacity>

                {/* Step 2: Phone Input */}
                <Text style={[tw`text-[11px] font-bold uppercase tracking-[0.15em] mb-3 ml-1`, { color: theme.textSubtle }]}>
                  2. Tu número de celular
                </Text>

                <View
                  style={[
                    tw`flex-row items-center rounded-2xl px-4 py-3.5 mb-7`,
                    { backgroundColor: theme.inputBg, borderWidth: 1.5, borderColor: theme.inputBorder }
                  ]}
                >
                  <Text style={[tw`font-bold text-base mr-2`, { color: theme.text }]}>+591</Text>
                  <View style={[tw`w-px h-6 mr-3`, { backgroundColor: theme.border }]} />
                  <TextInput
                    style={[tw`flex-1 text-lg font-semibold`, { color: theme.text }]}
                    placeholder="70012345"
                    placeholderTextColor={theme.textSubtle}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={(val) => setPhone(val.replace(/\D/g, ''))}
                    maxLength={8}
                  />
                </View>

                {/* Send OTP Button */}
                <PrimaryButton
                  label="Enviar Código"
                  loadingLabel="Enviando..."
                  onPress={handleSendOtp}
                  disabled={phone.length < 8}
                  isLoading={isLoading}
                />
              </>
            ) : (
              <>
                {/* OTP Step */}
                <Text style={[tw`text-[11px] font-bold uppercase tracking-[0.15em] mb-2 ml-1`, { color: theme.textSubtle }]}>
                  Código de verificación
                </Text>
                <Text style={[tw`text-sm mb-5 ml-1`, { color: theme.textMuted }]}>
                  Celular: <Text style={[tw`font-bold`, { color: theme.text }]}>+591 {phone}</Text>
                </Text>

                {/* Pilot/Test Banner */}
                <View
                  style={[
                    tw`rounded-2xl p-3.5 mb-5`,
                    {
                      backgroundColor: isDark ? 'rgba(251,191,36,0.08)' : '#FFFBEB',
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(251,191,36,0.2)' : '#FDE68A'
                    }
                  ]}
                >
                  <Text style={[tw`text-xs font-semibold text-center mb-2`, { color: isDark ? '#FBBF24' : '#92400E' }]}>
                    💡 Piloto La Paz: código <Text style={tw`font-extrabold`}>123456</Text>
                  </Text>
                  <TouchableOpacity
                    onPress={() => setOtpToken('123456')}
                    style={[
                      tw`py-1.5 px-4 rounded-xl items-center self-center`,
                      { backgroundColor: isDark ? 'rgba(251,191,36,0.15)' : '#FDE68A' }
                    ]}
                  >
                    <Text style={[tw`font-bold text-xs`, { color: isDark ? '#FBBF24' : '#78350F' }]}>
                      ⚡ Autocompletar 123456
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* OTP Input */}
                <View
                  style={[
                    tw`flex-row items-center rounded-2xl px-4 py-4 mb-6`,
                    { backgroundColor: theme.inputBg, borderWidth: 1.5, borderColor: theme.inputBorder }
                  ]}
                >
                  <TextInput
                    style={[tw`flex-1 text-2xl font-bold text-center tracking-[0.3em]`, { color: theme.text }]}
                    placeholder="• • • • • •"
                    placeholderTextColor={theme.textSubtle}
                    keyboardType="number-pad"
                    value={otpToken}
                    onChangeText={(val) => setOtpToken(val.replace(/\D/g, ''))}
                    maxLength={6}
                    autoFocus
                  />
                </View>

                {/* Verify Button */}
                <PrimaryButton
                  label="Verificar Código"
                  loadingLabel="Verificando..."
                  onPress={handleVerifyOtp}
                  disabled={otpToken.length < 6}
                  isLoading={isLoading}
                  style={tw`mb-4`}
                />

                {/* Back Link */}
                <TouchableOpacity
                  onPress={() => { setStep('phone'); setOtpToken(''); }}
                  style={tw`py-2 items-center`}
                >
                  <Text style={[tw`font-bold text-xs uppercase tracking-wider`, { color: theme.accent }]}>
                    ← Volver a ingresar número
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
