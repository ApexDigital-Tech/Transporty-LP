import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useColorScheme } from 'react-native';

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const isRoot = !segments[0];
    
    if (!session && !inAuthGroup && !isRoot) {
      // Redirect to login if not authenticated and not at root/auth
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Redirect to correct dashboard if already authenticated
      if (session.role === 'admin') {
        router.replace('/(admin)/dashboard');
      } else if (session.role === 'chofer') {
        router.replace('/(app)/driver');
      } else {
        router.replace('/(app)/passenger');
      }
    }
  }, [session, isLoading, segments]);

  if (isLoading) {
    return null; // Or a splash screen component
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
