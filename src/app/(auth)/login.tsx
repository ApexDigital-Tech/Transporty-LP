import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import tw from 'twrnc';
import { useAuth, UserRole } from '@/hooks/useAuth';
import { router, useLocalSearchParams } from 'expo-router';

export default function LoginScreen() {
  const { defaultRole } = useLocalSearchParams<{ defaultRole?: UserRole }>();
  const [role, setRole] = useState<UserRole>(defaultRole || 'pasajero');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [otpToken, setOtpToken] = useState('');
  const { sendOtp, verifyOtp, isLoading } = useAuth();

  const handleSendOtp = async () => {
    if (phone.trim().length < 8) {
      Alert.alert('Error', 'Por favor ingresa un número de celular válido de Bolivia (Ej. 70012345).');
      return;
    }
    
    const { error } = await sendOtp(phone);
    if (error) {
      Alert.alert('Error', 'No se pudo enviar el código OTP: ' + (error.message || error));
      return;
    }
    
    setStep('otp');
  };

  const handleVerifyOtp = async () => {
    if (otpToken.trim().length < 6) {
      Alert.alert('Error', 'Por favor ingresa el código de 6 dígitos.');
      return;
    }

    const { error, isProfileComplete } = await verifyOtp(phone, otpToken, role);
    if (error) {
      Alert.alert('Error', 'Código inválido o expirado: ' + (error.message || error));
      return;
    }

    // El redireccionamiento ahora se maneja directamente aquí de forma segura
    if (role === 'admin') {
      router.replace('/(admin)/dashboard');
    } else if (role === 'chofer') {
      if (isProfileComplete) {
        router.replace('/(app)/driver');
      } else {
        router.replace('/(app)/driver-setup');
      }
    } else {
      router.replace('/(app)/passenger');
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={tw`flex-1 justify-center px-6`}
      >
        <View style={tw`items-center mb-10`}>
          <View style={tw`w-20 h-20 bg-blue-600 rounded-3xl items-center justify-center mb-4 shadow-lg shadow-blue-300`}>
             <Text style={tw`text-white text-4xl`}>🚌</Text>
          </View>
          <Text style={tw`text-3xl font-extrabold text-gray-900 tracking-tighter`}>La Paz Transit</Text>
          <Text style={tw`text-gray-500 mt-2 text-center text-sm font-medium`}>
            Tu red de transporte inteligente y en tiempo real
          </Text>
        </View>

        {step === 'phone' ? (
          <>
            <Text style={tw`text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1`}>
              1. ¿CÓMO VIAJAS HOY?
            </Text>

            <View style={tw`flex-row justify-between mb-3 gap-3`}>
              <TouchableOpacity 
                onPress={() => setRole('pasajero')}
                style={[
                  tw`flex-1 p-4 rounded-2xl border-2 flex-row items-center gap-3`,
                  role === 'pasajero' ? tw`bg-blue-50 border-blue-600 shadow-sm shadow-blue-200` : tw`bg-white border-gray-100`
                ]}
              >
                <View style={[tw`w-10 h-10 rounded-full items-center justify-center`, role === 'pasajero' ? tw`bg-blue-600` : tw`bg-gray-100`]}>
                  <Text style={tw`text-lg`}>🚶</Text>
                </View>
                <View>
                  <Text style={[tw`font-bold`, role === 'pasajero' ? tw`text-blue-900` : tw`text-gray-600`]}>Pasajero</Text>
                  <Text style={tw`text-[10px] text-gray-400`}>Explorar rutas</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => setRole('chofer')}
                style={[
                  tw`flex-1 p-4 rounded-2xl border-2 flex-row items-center gap-3`,
                  role === 'chofer' ? tw`bg-green-50 border-green-500 shadow-sm shadow-green-200` : tw`bg-white border-gray-100`
                ]}
              >
                <View style={[tw`w-10 h-10 rounded-full items-center justify-center`, role === 'chofer' ? tw`bg-green-500` : tw`bg-gray-100`]}>
                  <Text style={tw`text-lg`}>🚐</Text>
                </View>
                <View>
                  <Text style={[tw`font-bold`, role === 'chofer' ? tw`text-green-900` : tw`text-gray-600`]}>Chofer</Text>
                  <Text style={tw`text-[10px] text-gray-400`}>Transmitir GPS</Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              onPress={() => setRole('admin')}
              style={[
                tw`w-full p-4 rounded-2xl border-2 flex-row items-center gap-3 mb-8`,
                role === 'admin' ? tw`bg-gray-900 border-black shadow-sm shadow-gray-500` : tw`bg-white border-gray-100`
              ]}
            >
              <View style={[tw`w-10 h-10 rounded-full items-center justify-center`, role === 'admin' ? tw`bg-black` : tw`bg-gray-100`]}>
                <Text style={tw`text-lg`}>👑</Text>
              </View>
              <View>
                <Text style={[tw`font-bold`, role === 'admin' ? tw`text-white` : tw`text-gray-600`]}>Administrador</Text>
                <Text style={[tw`text-[10px]`, role === 'admin' ? tw`text-gray-300` : tw`text-gray-400`]}>Monitoreo Global de Flotas (SaaS)</Text>
              </View>
            </TouchableOpacity>

            <Text style={tw`text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1`}>
              2. TU NÚMERO DE CELULAR
            </Text>

            <View style={tw`flex-row items-center bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 mb-8`}>
              <Text style={tw`text-gray-500 font-bold text-lg mr-2`}>+591</Text>
              <View style={tw`w-px h-6 bg-gray-300 mr-3`} />
              <TextInput
                style={tw`flex-1 text-gray-900 text-lg font-semibold`}
                placeholder="70012345"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={8}
              />
            </View>

            <TouchableOpacity 
              onPress={handleSendOtp}
              disabled={isLoading || phone.length < 8}
              style={[
                tw`py-4 rounded-2xl items-center shadow-md shadow-blue-300`,
                phone.length >= 8 ? tw`bg-blue-600` : tw`bg-gray-300`
              ]}
            >
              <Text style={tw`text-white font-bold text-base uppercase tracking-wider`}>
                {isLoading ? 'ENVIANDO...' : 'ENVIAR CÓDIGO'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={tw`text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 ml-1`}>
              CÓDIGO DE VERIFICACIÓN
            </Text>
            <Text style={tw`text-gray-500 text-sm mb-6 ml-1`}>
              Ingresa el código de 6 dígitos enviado al celular <Text style={tw`font-bold text-gray-900`}>+591 {phone}</Text>
            </Text>

            <View style={tw`flex-row items-center bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 mb-8`}>
              <TextInput
                style={tw`flex-1 text-gray-900 text-xl font-bold text-center letter-spacing-10`}
                placeholder="000000"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                value={otpToken}
                onChangeText={setOtpToken}
                maxLength={6}
                autoFocus
              />
            </View>

            <TouchableOpacity 
              onPress={handleVerifyOtp}
              disabled={isLoading || otpToken.length < 6}
              style={[
                tw`py-4 rounded-2xl items-center shadow-md shadow-blue-300 mb-4`,
                otpToken.length >= 6 ? tw`bg-blue-600` : tw`bg-gray-300`
              ]}
            >
              <Text style={tw`text-white font-bold text-base uppercase tracking-wider`}>
                {isLoading ? 'VERIFICANDO...' : 'VERIFICAR CÓDIGO'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => {
                setStep('phone');
                setOtpToken('');
              }}
              style={tw`py-2 items-center`}
            >
              <Text style={tw`text-blue-600 font-bold text-xs uppercase tracking-wider`}>
                Volver a ingresar número
              </Text>
            </TouchableOpacity>
          </>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

