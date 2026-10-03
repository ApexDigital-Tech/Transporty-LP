import React, { useState, useEffect } from 'react';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { View, Text, TouchableOpacity, useWindowDimensions, ScrollView, Platform, Image } from 'react-native';
import tw from 'twrnc';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from '@/hooks/useStore';
import { useTheme } from '@/theme';
import { supabase } from '../../services/supabase';
import { Ionicons } from '@expo/vector-icons';

interface MenuItem {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

export default function AdminLayout() {
  const { width } = useWindowDimensions();
  const { signOut } = useAuth();
  const { triggerRefresh, refreshTrigger, selectedImpersonatedOrg } = useStore();
  const router = useRouter();
  const segments = useSegments();
  const { theme, isDark, toggleTheme } = useTheme();
  
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
        
        // Fallback/Override para números de prueba
        if (phone.endsWith('72845621') || phone.endsWith('78756107')) {
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
          if (orgData) orgId = orgData.id;
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
          if (orgBranding) setCurrentOrgBranding(orgBranding);
        } else if (role === 'superadmin' && selectedImpersonatedOrg) {
          const { data: orgBranding } = await supabase
            .from('organizations')
            .select('name, logo_url, banner_url')
            .eq('id', selectedImpersonatedOrg)
            .maybeSingle();
          if (orgBranding) setCurrentOrgBranding(orgBranding);
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
    return () => { subscription.unsubscribe(); };
  }, [refreshTrigger, selectedImpersonatedOrg]);

  const menuItems: MenuItem[] = [
    { name: 'dashboard', label: 'Panel de Control', icon: 'grid-outline', route: '/(admin)/dashboard' },
    { name: 'routes', label: 'Gestión de Rutas', icon: 'map-outline', route: '/(admin)/routes' },
    { name: 'drivers', label: 'Gestión de Choferes', icon: 'people-outline', route: '/(admin)/drivers' },
    { name: 'tracking', label: 'Monitoreo en Vivo', icon: 'locate-outline', route: '/(admin)/tracking' },
    { name: 'reports', label: 'Reportes', icon: 'stats-chart-outline', route: '/(admin)/reports' },
  ];

  return (
    <View style={[tw`flex-1 ${isDesktop ? 'flex-row' : 'flex-col'}`, { backgroundColor: theme.bg }]}>
      {/* ─── Mobile Top Header ─── */}
      {!isDesktop && (
        <View style={[
          tw`px-4 pb-3 flex-row justify-between items-center`,
          {
            backgroundColor: theme.headerBg,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            paddingTop: Platform.OS === 'android' ? 42 : Platform.OS === 'ios' ? 50 : 14
          }
        ]}>
          <View style={tw`flex-row items-center gap-2.5`}>
            {currentOrgBranding?.logo_url ? (
              <Image source={{ uri: currentOrgBranding.logo_url }} style={tw`w-8 h-8 rounded-lg`} />
            ) : (
              <View style={[tw`w-8 h-8 rounded-lg items-center justify-center`, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name="bus" size={18} color={theme.accent} />
              </View>
            )}
            <Text style={[tw`font-extrabold text-xs tracking-tight uppercase max-w-[140px]`, { color: theme.text }]} numberOfLines={1}>
              {currentOrgBranding?.name || 'Transporty OS'}
            </Text>
          </View>
          <View style={tw`flex-row items-center gap-2`}>
            <TouchableOpacity
              onPress={toggleTheme}
              style={[tw`p-2.5 rounded-xl`, { backgroundColor: theme.accentSoft }]}
            >
              <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={16} color={isDark ? '#FBBF24' : '#475569'} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={triggerRefresh}
              style={[tw`p-2.5 rounded-xl`, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }]}
            >
              <Ionicons name="refresh" size={16} color={theme.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={signOut}
              style={[tw`p-2.5 rounded-xl`, { backgroundColor: isDark ? 'rgba(248,113,113,0.1)' : 'rgba(239,68,68,0.06)' }]}
            >
              <Ionicons name="log-out-outline" size={16} color={theme.statusDanger} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Desktop Sidebar ─── */}
      {isDesktop && (
        <View style={[
          tw`w-64 flex-col justify-between p-4 h-full`,
          {
            backgroundColor: isDark ? '#0A1020' : '#FFFFFF',
            borderRightWidth: 1,
            borderRightColor: theme.border,
          }
        ]}>
          <View style={tw`flex-1`}>
            {/* Sidebar Header / Branding */}
            <View style={tw`mb-8 mt-2`}>
              <View style={tw`flex-row items-center gap-3 mb-2`}>
                {currentOrgBranding?.logo_url ? (
                  <Image source={{ uri: currentOrgBranding.logo_url }} style={tw`w-10 h-10 rounded-xl`} />
                ) : (
                  <View style={[tw`w-10 h-10 rounded-xl items-center justify-center`, { backgroundColor: theme.accentSoft }]}>
                    <Ionicons name="bus" size={22} color={theme.accent} />
                  </View>
                )}
                <View style={tw`flex-1`}>
                  <Text style={[tw`font-extrabold text-sm tracking-tight`, { color: theme.text }]} numberOfLines={1}>
                    {currentOrgBranding?.name || 'Transporty OS'}
                  </Text>
                  <Text style={[tw`text-[10px] font-semibold uppercase tracking-wider`, { color: theme.accent }]}>
                    {currentOrgBranding ? 'Portal Sindicato' : 'Operaciones'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Section Label */}
            <Text style={[tw`text-[10px] font-bold uppercase tracking-[0.15em] ml-3 mb-3`, { color: theme.textSubtle }]}>
              Navegación
            </Text>

            {/* Menu Items */}
            <ScrollView showsVerticalScrollIndicator={false} style={tw`flex-1`}>
              {menuItems.map((item) => {
                const isActive = activeTab === item.name;
                return (
                  <TouchableOpacity
                    key={item.name}
                    onPress={() => router.replace(item.route as any)}
                    style={[
                      tw`flex-row items-center gap-3 px-3 py-3 rounded-xl mb-1`,
                      {
                        backgroundColor: isActive ? theme.accentSoft : 'transparent',
                      }
                    ]}
                  >
                    <View
                      style={[
                        tw`w-8 h-8 rounded-lg items-center justify-center`,
                        { backgroundColor: isActive ? theme.accent : 'transparent' }
                      ]}
                    >
                      <Ionicons
                        name={isActive ? (item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : item.icon}
                        size={18}
                        color={isActive ? '#FFFFFF' : theme.textMuted}
                      />
                    </View>
                    <Text style={[
                      tw`text-[13px] font-semibold tracking-wide`,
                      { color: isActive ? theme.accent : theme.textMuted }
                    ]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Bottom Actions */}
          <View style={[tw`pt-4 mt-2`, { borderTopWidth: 1, borderTopColor: theme.border }]}>
            {/* Theme Toggle */}
            <TouchableOpacity
              onPress={toggleTheme}
              style={tw`flex-row items-center gap-3 px-3 py-2.5 rounded-xl mb-2`}
            >
              <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={isDark ? '#FBBF24' : '#475569'} />
              <Text style={[tw`text-xs font-semibold`, { color: theme.textMuted }]}>
                {isDark ? 'Modo Claro' : 'Modo Oscuro'}
              </Text>
            </TouchableOpacity>

            {/* Refresh */}
            <TouchableOpacity
              onPress={triggerRefresh}
              style={tw`flex-row items-center gap-3 px-3 py-2.5 rounded-xl mb-2`}
            >
              <Ionicons name="refresh" size={18} color={theme.textMuted} />
              <Text style={[tw`text-xs font-semibold`, { color: theme.textMuted }]}>Actualizar Datos</Text>
            </TouchableOpacity>

            {/* Sign Out */}
            <TouchableOpacity
              onPress={signOut}
              style={tw`flex-row items-center gap-3 px-3 py-2.5 rounded-xl`}
            >
              <Ionicons name="log-out-outline" size={18} color={theme.statusDanger} />
              <Text style={[tw`text-xs font-semibold`, { color: theme.statusDanger }]}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Screen Container ─── */}
      <View style={tw`flex-1`}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: theme.accent,
            tabBarInactiveTintColor: theme.textSubtle,
            tabBarStyle: isDesktop 
              ? { display: 'none' } 
              : {
                  backgroundColor: isDark ? theme.card : '#FFFFFF',
                  borderTopWidth: 1,
                  borderTopColor: theme.border,
                  height: 64,
                  paddingBottom: 6,
                  paddingTop: 4,
                },
            tabBarLabelStyle: { fontSize: 10, fontWeight: '700' as const },
          }}
        >
          <Tabs.Screen
            name="dashboard"
            options={{
              title: 'Panel',
              tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} />,
            }}
          />
          <Tabs.Screen
            name="routes"
            options={{
              title: 'Rutas',
              tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'map' : 'map-outline'} size={22} color={color} />,
            }}
          />
          <Tabs.Screen
            name="drivers"
            options={{
              title: 'Choferes',
              tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />,
            }}
          />
          <Tabs.Screen
            name="tracking"
            options={{
              title: 'En Vivo',
              tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'locate' : 'locate-outline'} size={22} color={color} />,
            }}
          />
          <Tabs.Screen
            name="reports"
            options={{
              title: 'Reportes',
              tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={22} color={color} />,
            }}
          />
          <Tabs.Screen
            name="directory"
            options={{ href: null }}
          />
        </Tabs>
      </View>
    </View>
  );
}
