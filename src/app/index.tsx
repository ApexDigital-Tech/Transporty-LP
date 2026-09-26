import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, ScrollView, SafeAreaView, Dimensions, StyleSheet, Animated } from 'react-native';
import tw from 'twrnc';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

// Glowing Orbs for the background mesh gradient effect using standard Animated
const BackgroundOrbs = () => {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 20000,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]}>
      <Animated.View style={[tw`absolute w-[150%] h-[150%] -top-[25%] -left-[25%] opacity-40`, { transform: [{ rotate: spin }] }]}>
        <View style={tw`absolute top-[10%] left-[20%] w-80 h-80 bg-blue-600/40 rounded-full`} />
        <View style={tw`absolute bottom-[20%] right-[10%] w-96 h-96 bg-indigo-900/40 rounded-full`} />
        <View style={tw`absolute top-[40%] right-[30%] w-72 h-72 bg-purple-800/40 rounded-full`} />
      </Animated.View>
    </View>
  );
};

export default function IndexScreen() {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  if (isLoading) {
    return (
      <View style={tw`flex-1 items-center justify-center bg-[#050B14]`}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (session) {
    if (session.role === 'admin') {
      return <Redirect href="/(admin)/dashboard" />;
    } else if (session.role === 'chofer') {
      return <Redirect href="/(app)/driver" />;
    } else {
      return <Redirect href="/(app)/passenger" />;
    }
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-[#050B14]`}>
      <BackgroundOrbs />

      <ScrollView contentContainerStyle={tw`flex-grow justify-between p-6 pb-12 z-10`}>
        {/* Top Logo & Hero Section */}
        <Animated.View style={[tw`items-center mt-16`, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={tw`w-24 h-24 bg-blue-500/10 border border-blue-400/30 rounded-[2rem] items-center justify-center mb-8 shadow-lg shadow-blue-500/20`}>
            <Ionicons name="bus" size={48} color="#60a5fa" />
          </View>
          
          <View style={tw`bg-blue-500/10 px-4 py-1.5 rounded-full border border-blue-500/20 mb-6`}>
            <Text style={tw`text-[10px] font-black text-blue-400 uppercase tracking-widest`}>La Paz Transit SaaS</Text>
          </View>
          
          <Text style={tw`text-4xl font-extrabold text-white mt-1 tracking-tighter text-center`}>
            Movilidad <Text style={tw`text-blue-400`}>Inteligente</Text>
          </Text>
          
          <Text style={tw`text-gray-400 text-sm text-center mt-4 max-w-[280px] leading-relaxed font-medium`}>
            Conectando sindicatos, choferes y pasajeros con telemetría en tiempo real.
          </Text>
        </Animated.View>

        {/* Roles / Portal Selector Section */}
        <Animated.View style={[tw`my-10 gap-5`, { opacity: fadeAnim }]}>
          <Text style={tw`text-gray-500 font-bold text-xs uppercase tracking-[0.2em] mb-2 ml-2`}>
            Portales de Acceso
          </Text>

          {/* Passenger Access Card */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/(auth)/login', params: { defaultRole: 'pasajero' } })}
            style={tw`bg-white/5 border border-white/10 rounded-3xl p-5 flex-row items-center justify-between overflow-hidden`}
          >
            <View style={tw`flex-row items-center gap-5 flex-1 pr-2`}>
              <View style={tw`w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-400/30 items-center justify-center`}>
                <Ionicons name="walk" size={28} color="#38bdf8" />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-white font-extrabold text-base tracking-tight mb-0.5`}>Soy Pasajero</Text>
                <Text style={tw`text-gray-400 text-xs font-medium`} numberOfLines={1}>
                  Rutas en vivo y estimación de ETA.
                </Text>
              </View>
            </View>
            <View style={tw`w-8 h-8 rounded-full bg-white/5 items-center justify-center`}>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </View>
          </TouchableOpacity>

          {/* Driver Access Card */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/(auth)/login', params: { defaultRole: 'chofer' } })}
            style={tw`bg-white/5 border border-white/10 rounded-3xl p-5 flex-row items-center justify-between overflow-hidden`}
          >
            <View style={tw`flex-row items-center gap-5 flex-1 pr-2`}>
              <View style={tw`w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 items-center justify-center`}>
                <Ionicons name="speedometer" size={28} color="#34d399" />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-white font-extrabold text-base tracking-tight mb-0.5`}>Soy Chofer</Text>
                <Text style={tw`text-gray-400 text-xs font-medium`} numberOfLines={1}>
                  GPS, desvíos y gestión de turnos.
                </Text>
              </View>
            </View>
            <View style={tw`w-8 h-8 rounded-full bg-white/5 items-center justify-center`}>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </View>
          </TouchableOpacity>

          {/* Admin Access Card */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/(auth)/login', params: { defaultRole: 'admin' } })}
            style={tw`bg-white/5 border border-white/10 rounded-3xl p-5 flex-row items-center justify-between overflow-hidden`}
          >
            <View style={tw`flex-row items-center gap-5 flex-1 pr-2`}>
              <View style={tw`w-14 h-14 rounded-2xl bg-purple-500/20 border border-purple-400/30 items-center justify-center`}>
                <Ionicons name="business" size={28} color="#a78bfa" />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-white font-extrabold text-base tracking-tight mb-0.5`}>Sindicato</Text>
                <Text style={tw`text-gray-400 text-xs font-medium`} numberOfLines={1}>
                  Monitoreo y administración de flota.
                </Text>
              </View>
            </View>
            <View style={tw`w-8 h-8 rounded-full bg-white/5 items-center justify-center`}>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Footer info */}
        <Animated.View style={[tw`items-center mt-4`, { opacity: fadeAnim }]}>
          <Text style={tw`text-gray-600 text-[10px] font-bold uppercase tracking-widest`}>
            La Paz, Bolivia • 2026
          </Text>
          <Text style={tw`text-gray-700 text-[9px] mt-1.5 font-semibold tracking-wider`}>
            v1.0.0 (SaaS Multi-Tenant)
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
