import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { supabase } from '../services/supabase';

export type UserRole = 'chofer' | 'pasajero' | 'admin';

export interface UserSession {
  id: string;
  phone: string;
  role: UserRole;
  routeId?: string; // Optional: Si queremos vincular un pasajero directamente a una ruta
}

interface AuthContextType {
  session: UserSession | null;
  isLoading: boolean;
  sendOtp: (phone: string) => Promise<{ error: any }>;
  verifyOtp: (phone: string, token: string, role: UserRole) => Promise<{ error: any; isProfileComplete?: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  isLoading: true,
  sendOtp: async () => ({ error: null }),
  verifyOtp: async () => ({ error: null }),
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Cargar sesión de Supabase al iniciar la aplicación
    const loadSession = async () => {
      try {
        const { data: { session: sbSession } } = await supabase.auth.getSession();
        
        if (sbSession?.user) {
          const storedRole = await AsyncStorage.getItem('auth_session_role') as UserRole || 'pasajero';
          const phone = sbSession.user.phone?.replace('+591', '') || '';
          
          setSession({
            id: sbSession.user.id,
            phone,
            role: storedRole,
          });
        } else {
          setSession(null);
          await AsyncStorage.removeItem('auth_session_role');
        }
      } catch (e) {
        console.error('Failed to load session', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadSession();

    // Sincronizar reactivamente cuando cambie la sesión en Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sbSession) => {
      if (sbSession?.user) {
        const storedRole = await AsyncStorage.getItem('auth_session_role') as UserRole || 'pasajero';
        const phone = sbSession.user.phone?.replace('+591', '') || '';
        setSession({
          id: sbSession.user.id,
          phone,
          role: storedRole,
        });
      } else {
        setSession(null);
        await AsyncStorage.removeItem('auth_session_role');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const sendOtp = async (phone: string) => {
    try {
      // Enviar OTP a Supabase Auth
      const { error } = await supabase.auth.signInWithOtp({
        phone: '+591' + phone,
      });

      // Si es un número de prueba conocido, permitir continuar sin fallar si Supabase no tiene SMS configurado
      if (error && (phone === '72845621' || phone === '72845620' || phone.startsWith('7000') || phone.startsWith('7123'))) {
        console.warn('Modo demo/test activo para número:', phone);
        return { error: null };
      }

      return { error };
    } catch (err: any) {
      console.error('Error sending OTP:', err);
      if (phone === '72845621' || phone === '72845620' || phone.startsWith('7000') || phone.startsWith('7123')) {
        return { error: null };
      }
      return { error: err };
    }
  };

  const verifyOtp = async (phone: string, token: string, role: UserRole) => {
    try {
      let userId = '';
      let isProfileComplete = false;

      // Soporte para bypass de prueba con código 123456 / 000000
      if (token === '123456' || token === '000000') {
        const demoId = phone === '72845621' 
          ? '00000000-0000-0000-0000-000000000001' 
          : phone === '72845620'
          ? '00000000-0000-0000-0000-000000000002'
          : `00000000-0000-0000-0000-${phone.padStart(12, '0')}`;
        userId = demoId;
        isProfileComplete = true;
      } else {
        const { data, error } = await supabase.auth.verifyOtp({
          phone: '+591' + phone,
          token: token,
          type: 'sms',
        });

        if (error) throw error;
        if (!data.user) throw new Error('No se pudo obtener el usuario autenticado');
        userId = data.user.id;
      }

      if (role === 'chofer') {
        // Verificar si el chofer ya existe por su ID (UUID)
        const { data: driverInfo, error: fetchError } = await supabase
          .from('drivers')
          .select('id, is_profile_complete')
          .eq('id', userId)
          .maybeSingle();
        
        if (fetchError) {
          console.error('Error fetching driver profile:', fetchError.message);
        }

        if (driverInfo) {
          isProfileComplete = !!driverInfo.is_profile_complete;
        } else if (token !== '123456' && token !== '000000') {
          // Crear registro inicial en la DB con el UUID real de auth.users
          const { error: insertError } = await supabase.from('drivers').insert({
            id: userId,
            phone: phone,
            status: 'offline',
            is_profile_complete: false
          });

          if (insertError) {
            console.error('Error creating driver profile:', insertError.message);
          }
        }
      }

      await AsyncStorage.setItem('auth_session_role', role);
      
      const newSession: UserSession = { id: userId, phone, role };
      setSession(newSession);

      return { error: null, isProfileComplete };
    } catch (err: any) {
      console.error('Error in verifyOtp:', err);
      return { error: err };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.removeItem('auth_session_role');
      setSession(null);
      router.replace('/(auth)/login');
    } catch (e) {
      console.error('Error signing out:', e);
    }
  };

  return (
    <AuthContext.Provider value={{ session, isLoading, sendOtp, verifyOtp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

