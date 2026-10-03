import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator, View, Text, TouchableOpacity, ScrollView,
  SafeAreaView, StyleSheet, Animated, Platform
} from 'react-native';
import tw from 'twrnc';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

// ────────────────────────────────────────────────────────────────
//  Animated background mesh
// ────────────────────────────────────────────────────────────────
const BackgroundMesh = ({ isDark }: { isDark: boolean }) => {
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: 25000, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.6, duration: 4000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 4000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]}>
      <Animated.View
        style={[
          tw`absolute w-[160%] h-[160%] -top-[30%] -left-[30%]`,
          { opacity: pulse, transform: [{ rotate: spin }] }
        ]}
      >
        <View style={tw`absolute top-[8%] left-[15%] w-80 h-80 rounded-full ${isDark ? 'bg-[#3CB8FA]/25' : 'bg-[#037FCD]/12'}`} />
        <View style={tw`absolute bottom-[15%] right-[5%] w-96 h-96 rounded-full ${isDark ? 'bg-[#6366F1]/20' : 'bg-[#818CF8]/10'}`} />
        <View style={tw`absolute top-[45%] right-[25%] w-64 h-64 rounded-full ${isDark ? 'bg-[#06B6D4]/15' : 'bg-[#22D3EE]/8'}`} />
      </Animated.View>
    </View>
  );
};

// ────────────────────────────────────────────────────────────────
//  Portal Card
// ────────────────────────────────────────────────────────────────
interface PortalCardProps {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  gradientBg: string;
  onPress: () => void;
  isDark: boolean;
}

const PortalCard = ({ title, subtitle, icon, iconColor, gradientBg, onPress, isDark }: PortalCardProps) => (
  <TouchableOpacity
    activeOpacity={0.7}
    onPress={onPress}
    style={[
      tw`rounded-3xl p-5 flex-row items-center justify-between overflow-hidden mb-4`,
      {
        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.85)',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        ...Platform.select({
          web: {
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          } as Record<string, unknown>,
          default: {},
        }),
      }
    ]}
  >
    <View style={tw`flex-row items-center gap-4 flex-1 pr-2`}>
      <View
        style={[
          tw`w-14 h-14 rounded-2xl items-center justify-center`,
          { backgroundColor: gradientBg }
        ]}
      >
        <Ionicons name={icon} size={26} color={iconColor} />
      </View>
      <View style={tw`flex-1`}>
        <Text style={tw`font-extrabold text-base tracking-tight mb-0.5 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {title}
        </Text>
        <Text style={tw`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
    <View style={tw`w-9 h-9 rounded-full items-center justify-center ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
      <Ionicons name="chevron-forward" size={16} color={isDark ? '#6B7280' : '#9CA3AF'} />
    </View>
  </TouchableOpacity>
);

// ────────────────────────────────────────────────────────────────
//  Main Screen
// ────────────────────────────────────────────────────────────────
export default function IndexScreen() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const { theme, isDark, toggleTheme } = useTheme();

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;
  const cardsFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 40, friction: 8, useNativeDriver: true }),
      ]),
      Animated.timing(cardsFade, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  if (isLoading) {
    return (
      <View style={[tw`flex-1 items-center justify-center`, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (session) {
    if (session.role === 'admin') return <Redirect href="/(admin)/dashboard" />;
    if (session.role === 'chofer') return <Redirect href="/(app)/driver" />;
    return <Redirect href="/(app)/passenger" />;
  }

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
      <BackgroundMesh isDark={isDark} />

      {/* Theme Toggle — top right */}
      <View style={tw`absolute top-14 right-5 z-20`}>
        <TouchableOpacity
          onPress={toggleTheme}
          style={[
            tw`w-11 h-11 rounded-full items-center justify-center`,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }
          ]}
        >
          <Ionicons
            name={isDark ? 'sunny-outline' : 'moon-outline'}
            size={20}
            color={isDark ? '#FBBF24' : '#475569'}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={tw`flex-grow justify-between px-6 pb-12 z-10`}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Hero Section ─── */}
        <Animated.View style={[tw`items-center mt-20`, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {/* Logo Mark */}
          <View
            style={[
              tw`w-[88px] h-[88px] rounded-[26px] items-center justify-center mb-7`,
              {
                backgroundColor: isDark ? 'rgba(60,184,250,0.08)' : 'rgba(3,127,205,0.08)',
                borderWidth: 1.5,
                borderColor: isDark ? 'rgba(60,184,250,0.2)' : 'rgba(3,127,205,0.15)',
              }
            ]}
          >
            <Ionicons name="bus" size={42} color={theme.accent} />
          </View>

          {/* Brand Badge */}
          <View
            style={[
              tw`px-5 py-1.5 rounded-full mb-5`,
              {
                backgroundColor: isDark ? 'rgba(60,184,250,0.1)' : 'rgba(3,127,205,0.08)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(60,184,250,0.15)' : 'rgba(3,127,205,0.12)',
              }
            ]}
          >
            <Text style={[tw`text-[10px] font-black uppercase tracking-[0.2em]`, { color: theme.accent }]}>
              Transporty OS
            </Text>
          </View>

          {/* Headline */}
          <Text style={tw`text-4xl font-extrabold tracking-tighter text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Movilidad{'\n'}
            <Text style={{ color: theme.accent }}>Inteligente</Text>
          </Text>

          {/* Subheadline */}
          <Text style={tw`text-sm text-center mt-4 max-w-[300px] leading-relaxed font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Conectamos sindicatos, choferes y pasajeros con telemetría y gestión en tiempo real.
          </Text>
        </Animated.View>

        {/* ─── Portal Cards ─── */}
        <Animated.View style={[tw`mt-12`, { opacity: cardsFade }]}>
          <Text style={tw`font-bold text-[11px] uppercase tracking-[0.2em] ml-2 mb-4 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
            Portales de Acceso
          </Text>

          <PortalCard
            title="Soy Pasajero"
            subtitle="Rutas en vivo, ETA y pagos QR."
            icon="navigate"
            iconColor="#38BDF8"
            gradientBg={isDark ? 'rgba(56,189,248,0.12)' : 'rgba(56,189,248,0.1)'}
            onPress={() => router.push({ pathname: '/(auth)/login', params: { defaultRole: 'pasajero' } })}
            isDark={isDark}
          />

          <PortalCard
            title="Soy Chofer"
            subtitle="GPS, desvíos y gestión de turnos."
            icon="speedometer"
            iconColor="#34D399"
            gradientBg={isDark ? 'rgba(52,211,153,0.12)' : 'rgba(52,211,153,0.1)'}
            onPress={() => router.push({ pathname: '/(auth)/login', params: { defaultRole: 'chofer' } })}
            isDark={isDark}
          />

          <PortalCard
            title="Sindicato / Admin"
            subtitle="Monitoreo y administración de flota."
            icon="shield-checkmark"
            iconColor="#A78BFA"
            gradientBg={isDark ? 'rgba(167,139,250,0.12)' : 'rgba(167,139,250,0.1)'}
            onPress={() => router.push({ pathname: '/(auth)/login', params: { defaultRole: 'admin' } })}
            isDark={isDark}
          />
        </Animated.View>

        {/* ─── Footer ─── */}
        <Animated.View style={[tw`items-center mt-8 mb-4`, { opacity: fadeAnim }]}>
          <Text style={tw`text-[10px] font-bold uppercase tracking-[0.15em] ${isDark ? 'text-gray-700' : 'text-gray-400'}`}>
            La Paz, Bolivia • 2026
          </Text>
          <Text style={tw`text-[9px] mt-1.5 font-semibold tracking-wider ${isDark ? 'text-gray-700' : 'text-gray-400'}`}>
            Transporty OS v2.0
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
