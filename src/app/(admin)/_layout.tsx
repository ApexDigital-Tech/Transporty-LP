import React, { useState, useEffect } from 'react';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { View, Text, TouchableOpacity, useWindowDimensions, ScrollView, Platform, Image } from 'react-native';
import tw from 'twrnc';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from '@/hooks/useStore';
import { supabase } from '../../services/supabase';

export default function AdminLayout() {
  const { width } = useWindowDimensions();
  const { signOut } = useAuth();
  const { triggerRefresh, refreshTrigger, selectedImpersonatedOrg } = useStore();
  const router = useRouter();
  const segments = useSegments();
  
  const isDesktop = width >= 768;
  const activeTab = segments[1] || 'dashboard';

  const [currentOrgBranding, setCurrentOrgBranding] = useState<any>(null);
  const [currentUserPhone, setCurrentUserPhone] = useState<string>('');

  useEffect(() => {
    async function loadBranding() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setCurrentOrgBranding(null);
          setCurrentUserPhone('');
          return;
        }
        
        const phone = user.phone || '';
        setCurrentUserPhone(phone);
        
        let orgId = null;
        let role = 'admin';
        
        // Fallback/Override manual para números de prueba
        if (phone.endsWith('72845621')) {
          role = 'superadmin';
          orgId = null;
        } else if (phone.endsWith('72845620')) {
          role = 'admin';
          const { data: orgData } = await supabase
            .from('organizations')
            .select('id')
            .eq('name', 'SINDICATO 14 DE SEPTIEMBRE')
            .limit(1)
            .maybeSingle();
          if (orgData) {
            orgId = orgData.id;
          }
        } else {
          const { data: adminProfile } = await supabase
            .from('admin_profiles')
            .select('organization_id, role')
            .maybeSingle();
          if (adminProfile) {
            orgId = adminProfile.organization_id;
            role = adminProfile.role;
          }
        }
        
        if (role !== 'superadmin' && orgId) {
          const { data: orgBranding } = await supabase
            .from('organizations')
            .select('name, logo_url, banner_url')
            .eq('id', orgId)
            .maybeSingle();
          if (orgBranding) {
            setCurrentOrgBranding(orgBranding);
          }
        } else if (role === 'superadmin' && selectedImpersonatedOrg) {
          const { data: orgBranding } = await supabase
            .from('organizations')
            .select('name, logo_url, banner_url')
            .eq('id', selectedImpersonatedOrg)
            .maybeSingle();
          if (orgBranding) {
            setCurrentOrgBranding(orgBranding);
          }
        } else {
          setCurrentOrgBranding(null);
        }
      } catch (e) {
        console.error("Error cargando branding en layout:", e);
      }
    }
    loadBranding();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadBranding();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshTrigger, selectedImpersonatedOrg]);

  const menuItems = [
    { name: 'dashboard', label: 'Panel de Control', icon: '📊', route: '/(admin)/dashboard' },
    { name: 'routes', label: 'Gestión de Rutas', icon: '🛤️', route: '/(admin)/routes' },
    { name: 'drivers', label: 'Gestión de Choferes', icon: '👥', route: '/(admin)/drivers' },
    { name: 'tracking', label: 'Monitoreo en Vivo', icon: '📍', route: '/(admin)/tracking' },
    { name: 'reports', label: 'Reportes', icon: '📈', route: '/(admin)/reports' },
  ];

  return (
    <View style={tw`flex-1 ${isDesktop ? 'flex-row' : 'flex-col'} bg-gray-50`}>
      {/* Mobile Top Header */}
      {!isDesktop && (
        <View style={[
          tw`bg-slate-900 px-4 pb-3.5 flex-row justify-between items-center border-b border-slate-800`,
          { paddingTop: Platform.OS === 'android' ? 40 : Platform.OS === 'ios' ? 48 : 14 }
        ]}>
          <View style={tw`flex-row items-center gap-2.5`}>
            {currentOrgBranding?.logo_url ? (
              <Image source={{ uri: currentOrgBranding.logo_url }} style={tw`w-8 h-8 rounded-lg`} />
            ) : (
              <Text style={tw`text-lg`}>🚌</Text>
            )}
            <Text style={tw`text-white font-extrabold text-xs tracking-tight uppercase max-w-[140px]`} numberOfLines={1}>
              {currentOrgBranding?.name || 'La Paz Transit'}
            </Text>
          </View>
          <View style={tw`flex-row items-center gap-2`}>
            <TouchableOpacity 
              onPress={triggerRefresh} 
              style={tw`p-2 bg-slate-800/80 rounded-lg border border-slate-700/50`}
              activeOpacity={0.7}
            >
              <Text style={tw`text-slate-200 text-xs font-bold`}>🔄 Actualizar</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={signOut} 
              style={tw`p-2 bg-red-950/40 rounded-lg border border-red-900/30`}
              activeOpacity={0.7}
            >
              <Text style={tw`text-red-400 text-xs font-bold`}>🚪 Salir</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Desktop Sidebar */}
      {isDesktop && (
        <View style={tw`w-68 bg-slate-900 border-r border-slate-800 flex-col justify-between p-5 h-full`}>
          <View style={tw`flex-1`}>
            {/* Header / Branding */}
            <View style={tw`mb-8`}>
              <View style={tw`flex-row items-center gap-3 mb-1`}>
                {currentOrgBranding?.logo_url ? (
                  <Image source={{ uri: currentOrgBranding.logo_url }} style={tw`w-10 h-10 rounded-xl`} />
                ) : (
                  <Text style={tw`text-2xl`}>🚌</Text>
                )}
                <Text style={tw`text-white font-extrabold text-sm tracking-tight uppercase flex-1`} numberOfLines={1}>
                  {currentOrgBranding?.name || 'La Paz Transit'}
                </Text>
              </View>
              <Text style={tw`text-xs text-blue-400 font-semibold uppercase tracking-wider ${currentOrgBranding ? 'pl-13' : 'pl-8'}`}>
                {currentOrgBranding ? 'Portal Sindicato' : 'Operaciones Centrales'}
              </Text>
            </View>

            {/* Sidebar Title */}
            <View style={tw`mb-6 pl-2`}>
              <Text style={tw`text-slate-400 text-xs font-bold uppercase tracking-widest`}>Control de Tránsito</Text>
            </View>

            {/* Menu Items */}
            <ScrollView showsVerticalScrollIndicator={false} style={tw`flex-1`}>
              {menuItems.map((item) => {
                const isActive = activeTab === item.name;
                return (
                  <TouchableOpacity
                    key={item.name}
                    onPress={() => router.replace(item.route as any)}
                    style={tw`flex-row items-center gap-3.5 px-4 py-3 rounded-xl mb-2 ${
                      isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30' : 'bg-transparent text-slate-300 hover:bg-slate-800/40'
                    }`}
                  >
                    <Text style={tw`text-lg`}>{item.icon}</Text>
                    <Text style={tw`text-sm font-semibold tracking-wide ${isActive ? 'text-white' : 'text-slate-300'}`}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Bottom Actions */}
          <View style={tw`pt-6 border-t border-slate-800`}>
            {/* Plan a Trip Button */}
            <TouchableOpacity
              onPress={() => alert('Planificador de viajes cargando...')}
              style={tw`bg-blue-700/80 border border-blue-600 hover:bg-blue-600 px-4 py-3 rounded-xl flex-row items-center justify-center gap-2 mb-4`}
            >
              <Text style={tw`text-white text-xs`}>➕</Text>
              <Text style={tw`text-white font-bold text-xs uppercase tracking-wider`}>Planificar Viaje</Text>
            </TouchableOpacity>

            {/* Help & Logout */}
            <TouchableOpacity
              onPress={() => alert('Ayuda / Soporte Técnico')}
              style={tw`flex-row items-center gap-3 px-4 py-2.5 rounded-lg mb-2`}
            >
              <Text style={tw`text-slate-400`}>❓</Text>
              <Text style={tw`text-slate-300 text-xs font-bold uppercase tracking-wider`}>Ayuda</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={signOut}
              style={tw`flex-row items-center gap-3 px-4 py-2.5 rounded-lg`}
            >
              <Text style={tw`text-red-400`}>🚪</Text>
              <Text style={tw`text-red-400 text-xs font-bold uppercase tracking-wider`}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Screen Container */}
      <View style={tw`flex-1`}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: '#2563eb',
            tabBarInactiveTintColor: '#64748b',
            tabBarStyle: isDesktop 
              ? { display: 'none' } 
              : tw`bg-white border-t border-gray-100 shadow-sm h-16 pb-2`,
            tabBarLabelStyle: tw`text-xs font-bold`,
          }}
        >
          <Tabs.Screen
            name="dashboard"
            options={{
              title: 'Panel',
              tabBarIcon: ({ color }) => <Text style={tw`text-lg`}>📊</Text>,
            }}
          />
          <Tabs.Screen
            name="routes"
            options={{
              title: 'Rutas',
              tabBarIcon: ({ color }) => <Text style={tw`text-lg`}>🛤️</Text>,
            }}
          />
          <Tabs.Screen
            name="drivers"
            options={{
              title: 'Choferes',
              tabBarIcon: ({ color }) => <Text style={tw`text-lg`}>👥</Text>,
            }}
          />
          <Tabs.Screen
            name="tracking"
            options={{
              title: 'En Vivo',
              tabBarIcon: ({ color }) => <Text style={tw`text-lg`}>📍</Text>,
            }}
          />
          <Tabs.Screen
            name="reports"
            options={{
              title: 'Reportes',
              tabBarIcon: ({ color }) => <Text style={tw`text-lg`}>📈</Text>,
            }}
          />
          {/* Hide directory.tsx from tab bar while transitioning */}
          <Tabs.Screen
            name="directory"
            options={{
              href: null,
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}
