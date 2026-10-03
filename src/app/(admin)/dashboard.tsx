import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, useWindowDimensions, Modal, TextInput, Image, ActivityIndicator, Alert } from 'react-native';
import tw from 'twrnc';
import { supabase, LiveLocation, uploadOrgBranding } from '../../services/supabase';
import LiveMapWeb from '../../components/LiveMapWeb';
import { useStore } from '../../hooks/useStore';
import { useTheme } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

interface Organization {
  id: string;
  name: string;
  logo_url?: string;
  banner_url?: string;
  theme_color?: string;
  billing_plan?: 'weekly' | 'monthly' | 'unpaid';
  billing_status?: 'active' | 'suspended' | 'trial';
  contact_phone?: string;
  billing_amount?: number;
}

// ────────────────────────────────────────────────────────────────
//  KPI Card Component
// ────────────────────────────────────────────────────────────────
interface KpiCardProps {
  title: string;
  value: string;
  change: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  isCritical?: boolean;
  isDark: boolean;
  theme: ReturnType<typeof useTheme>['theme'];
}

const KpiCard = ({ title, value, change, icon, iconColor, isCritical, isDark, theme }: KpiCardProps) => (
  <View
    style={[
      tw`p-5 rounded-2xl flex-1 min-w-[160px]`,
      {
        backgroundColor: theme.card,
        borderWidth: 1,
        borderColor: isCritical ? (isDark ? 'rgba(248,113,113,0.3)' : 'rgba(239,68,68,0.15)') : theme.border,
      }
    ]}
  >
    <View style={tw`flex-row items-center justify-between mb-3`}>
      <Text style={[tw`text-[10px] font-bold uppercase tracking-[0.12em]`, { color: theme.textSubtle }]}>{title}</Text>
      <View
        style={[
          tw`w-9 h-9 rounded-xl items-center justify-center`,
          { backgroundColor: iconColor + '15' }
        ]}
      >
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
    </View>
    <Text style={[tw`text-3xl font-extrabold`, { color: theme.text }]}>{value}</Text>
    <Text
      style={[
        tw`text-[10px] font-semibold mt-1.5`,
        { color: isCritical ? theme.statusDanger : theme.textSubtle }
      ]}
    >
      {change}
    </Text>
  </View>
);

export default function AdminDashboardScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { theme, isDark } = useTheme();

  // Zustand State
  const { liveLocations, fetchInitialLocations, subscribeToLocations, unsubscribeFromLocations, refreshTrigger, selectedImpersonatedOrg, setSelectedImpersonatedOrg } = useStore();
  
  // React State
  const [role, setRole] = useState<'admin' | 'superadmin'>('admin');
  const [adminOrgId, setAdminOrgId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeTab, setActiveTab] = useState<'monitor' | 'crm'>('monitor');

  // Stats / Counts
  const [driversCount, setDriversCount] = useState(0);
  const [driverInfoDict, setDriverInfoDict] = useState<Record<string, {name: string; placa: string; orgName: string; status: string}>>({});
  const [driverCountsByOrg, setDriverCountsByOrg] = useState<Record<string, number>>({});
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Custom Branding
  const [currentOrgBranding, setCurrentOrgBranding] = useState<Organization | null>(null);

  // Modals / Alerts
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [newAlertTitle, setNewAlertTitle] = useState('');
  const [newAlertMessage, setNewAlertMessage] = useState('');
  const [newAlertSeverity, setNewAlertSeverity] = useState<'info' | 'warning' | 'critical'>('warning');
  const [sendingAlert, setSendingAlert] = useState(false);

  // CRM Modals
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [editPlan, setEditPlan] = useState<'weekly' | 'monthly'>('monthly');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended' | 'trial'>('active');
  const [savingCrm, setSavingCrm] = useState(false);
  const [currentUserPhone, setCurrentUserPhone] = useState<string>('');

  useEffect(() => {
    updateTimestamp();
    initDashboard();
    return () => { unsubscribeFromLocations(); };
  }, [refreshTrigger, selectedImpersonatedOrg]);

  async function initDashboard() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userPhone = user?.phone || '';
      setCurrentUserPhone(userPhone);

      const { data: adminProfile } = await supabase
        .from('admin_profiles')
        .select('organization_id, role')
        .maybeSingle();

      let userRole = adminProfile?.role || 'admin';
      let userOrgId = adminProfile?.organization_id || null;

      if (userPhone.endsWith('72845621') || userPhone.endsWith('78756107')) {
        userRole = 'superadmin';
        userOrgId = null;
      } else if (userPhone.endsWith('72845620')) {
        userRole = 'admin';
        if (!userOrgId) {
          const { data: orgData } = await supabase
            .from('organizations').select('id').eq('name', 'SINDICATO 14 DE SEPTIEMBRE').limit(1).maybeSingle();
          if (orgData) userOrgId = orgData.id;
        }
      }

      setRole(userRole as any);
      setAdminOrgId(userOrgId);

      const activeOrgId = userRole === 'superadmin' ? (selectedImpersonatedOrg || undefined) : (userOrgId || undefined);

      if (userRole === 'superadmin') {
        const { data: orgsData } = await supabase.from('organizations').select('*').order('name');
        if (orgsData) setOrganizations(orgsData);
      }

      const { data: allDrivers } = await supabase.from('drivers').select('id, organization_id');
      if (allDrivers) {
        const counts: Record<string, number> = {};
        allDrivers.forEach(d => { if (d.organization_id) counts[d.organization_id] = (counts[d.organization_id] || 0) + 1; });
        setDriverCountsByOrg(counts);
      }

      const brandingId = activeOrgId || userOrgId;
      if (brandingId) {
        const { data: orgBranding } = await supabase.from('organizations').select('*').eq('id', brandingId).maybeSingle();
        if (orgBranding) setCurrentOrgBranding(orgBranding);
      } else {
        setCurrentOrgBranding(null);
      }

      let driversCountQuery = supabase.from('drivers').select('id', { count: 'exact', head: true });
      if (activeOrgId) driversCountQuery = driversCountQuery.eq('organization_id', activeOrgId);
      const { count } = await driversCountQuery;
      setDriversCount(count || 0);

      let driversQuery = supabase.from('drivers').select('id, name, placa, status, organization:organizations(name)');
      if (activeOrgId) driversQuery = driversQuery.eq('organization_id', activeOrgId);
      const { data: driversData } = await driversQuery;
      
      if (driversData) {
        const dict: Record<string, {name: string; placa: string; orgName: string; status: string}> = {};
        driversData.forEach(d => {
          dict[d.id] = {
            name: d.name || 'Sin Nombre',
            placa: d.placa || 'S/P',
            orgName: (d.organization as any)?.name || 'Sindicato',
            status: d.status || 'inactive'
          };
        });
        setDriverInfoDict(dict);
      }

      await fetchInitialLocations(undefined, activeOrgId);
      subscribeToLocations(undefined, activeOrgId);
    } catch (e) {
      console.error("Error inicializando panel:", e);
    } finally {
      setLoading(false);
    }
  }

  const updateTimestamp = () => {
    setLastUpdatedTime(new Date().toTimeString().split(' ')[0]);
  };

  const handleSendAlert = async () => {
    if (!newAlertTitle || !newAlertMessage) {
      Alert.alert('Incompleto', 'Ingresa título y mensaje para la alerta.');
      return;
    }
    setSendingAlert(true);
    try {
      const activeOrgId = role === 'superadmin' ? (selectedImpersonatedOrg || null) : adminOrgId;
      const { error } = await supabase.from('alerts').insert({
        organization_id: activeOrgId,
        title: newAlertTitle,
        message: newAlertMessage,
        severity: newAlertSeverity,
      });
      if (error) throw error;
      Alert.alert('Éxito', 'Alerta enviada correctamente.');
      setNewAlertTitle('');
      setNewAlertMessage('');
      setAlertModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', 'Problema enviando alerta: ' + err.message);
    } finally {
      setSendingAlert(false);
    }
  };

  const handleUpdateBranding = async (orgId: string, type: 'logo' | 'banner') => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Denegado', 'Se requiere acceso para cargar imágenes.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'logo' ? [1, 1] : [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const uri = result.assets[0].uri;
      setLoading(true);
      try {
        const { publicUrl, error } = await uploadOrgBranding(orgId, type, uri);
        if (error) throw error;
        if (publicUrl) {
          const updateField = type === 'logo' ? { logo_url: publicUrl } : { banner_url: publicUrl };
          const { error: updateError } = await supabase.from('organizations').update(updateField).eq('id', orgId);
          if (updateError) throw updateError;
          Alert.alert('Éxito', `${type === 'logo' ? 'Logo' : 'Banner'} actualizado.`);
          initDashboard();
        }
      } catch (err: any) {
        Alert.alert('Error', 'No se pudo subir la imagen: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSaveCrmSettings = async () => {
    if (!editingOrg) return;
    setSavingCrm(true);
    try {
      const { error } = await supabase.from('organizations').update({ billing_plan: editPlan, billing_status: editStatus }).eq('id', editingOrg.id);
      if (error) throw error;
      Alert.alert('Éxito', 'Configuración guardada.');
      setEditingOrg(null);
      initDashboard();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingCrm(false);
    }
  };

  // KPI Data
  const offRouteCount = liveLocations.filter(l => l.is_off_route).length;
  const kpis = [
    { title: 'Unidades Activas', value: liveLocations.length.toString(), change: 'Transmitiendo GPS', icon: 'bus' as const, iconColor: theme.accent, isCritical: false },
    { title: 'Choferes Registrados', value: driversCount.toString(), change: 'Capacidad asignada', icon: 'people' as const, iconColor: theme.statusWarning, isCritical: false },
    { title: 'Factura Mes', value: `Bs. ${(driversCount * 3 * 30).toLocaleString()}`, change: `Bs.3/día × ${driversCount}`, icon: 'wallet' as const, iconColor: theme.statusActive, isCritical: false },
    { title: 'Infracciones', value: offRouteCount.toString(), change: 'Desvíos de ruta', icon: 'warning' as const, iconColor: theme.statusDanger, isCritical: offRouteCount > 0 },
  ];

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
      {/* ─── Top Header Bar ─── */}
      <View
        style={[
          tw`px-6 py-4 flex-row justify-between items-center z-10`,
          { backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border }
        ]}
      >
        <View style={tw`flex-row items-center gap-3.5`}>
          {currentOrgBranding?.logo_url ? (
            <Image source={{ uri: currentOrgBranding.logo_url }} style={tw`w-11 h-11 rounded-xl`} />
          ) : (
            <View style={[tw`w-11 h-11 rounded-xl items-center justify-center`, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name={role === 'superadmin' ? 'shield-checkmark' : 'bus'} size={22} color={theme.accent} />
            </View>
          )}
          <View>
            <Text style={[tw`text-[10px] font-bold uppercase tracking-[0.12em]`, { color: theme.textSubtle }]}>
              {role === 'superadmin' ? 'Operaciones Centrales' : (currentOrgBranding?.name || 'Portal Sindicato')} • Transporty OS
            </Text>
            <Text style={[tw`text-xl font-extrabold tracking-tight`, { color: theme.text }]}>
              {role === 'superadmin' ? 'SuperAdministrador' : 'Vista General'}
            </Text>
          </View>
        </View>

        <View style={tw`flex-row items-center gap-3`}>
          {role === 'superadmin' && (
            <View
              style={[
                tw`flex-row rounded-xl p-1 gap-1`,
                { backgroundColor: isDark ? theme.cardElevated : '#F1F5F9' }
              ]}
            >
              {(['monitor', 'crm'] as const).map(tab => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[
                    tw`px-3.5 py-1.5 rounded-lg`,
                    {
                      backgroundColor: activeTab === tab ? theme.card : 'transparent',
                      ...(activeTab === tab ? { shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 2 } : {})
                    }
                  ]}
                >
                  <Text style={[tw`text-xs font-bold`, { color: activeTab === tab ? theme.text : theme.textSubtle }]}>
                    {tab === 'monitor' ? 'Monitoreo' : 'CRM'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Live Badge */}
          <View
            style={[
              tw`flex-row items-center rounded-full px-3 py-1.5`,
              { backgroundColor: isDark ? 'rgba(74,222,128,0.08)' : 'rgba(22,163,74,0.06)', borderWidth: 1, borderColor: isDark ? 'rgba(74,222,128,0.2)' : 'rgba(22,163,74,0.12)' }
            ]}
          >
            <View style={[tw`w-2 h-2 rounded-full mr-2`, { backgroundColor: theme.statusActive }]} />
            <Text style={[tw`text-[9px] font-bold uppercase tracking-wider`, { color: theme.statusActive }]}>En Vivo</Text>
          </View>
        </View>
      </View>

      {/* ─── Org Filter (SuperAdmin) ─── */}
      {role === 'superadmin' && activeTab === 'monitor' && (
        <View
          style={[
            tw`px-6 py-3 flex-row items-center gap-3`,
            { backgroundColor: theme.card, borderBottomWidth: 1, borderBottomColor: theme.border }
          ]}
        >
          <Text style={[tw`text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Sindicato:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`gap-1.5`}>
            <TouchableOpacity
              onPress={() => setSelectedImpersonatedOrg(null)}
              style={[
                tw`px-3 py-1.5 rounded-lg`,
                { backgroundColor: !selectedImpersonatedOrg ? theme.accent : (isDark ? theme.cardElevated : '#F1F5F9') }
              ]}
            >
              <Text style={[tw`text-[10px] font-bold`, { color: !selectedImpersonatedOrg ? '#FFF' : theme.textMuted }]}>Todos</Text>
            </TouchableOpacity>
            {organizations.map(o => (
              <TouchableOpacity
                key={o.id}
                onPress={() => setSelectedImpersonatedOrg(o.id)}
                style={[
                  tw`px-3 py-1.5 rounded-lg`,
                  { backgroundColor: selectedImpersonatedOrg === o.id ? theme.accent : (isDark ? theme.cardElevated : '#F1F5F9') }
                ]}
              >
                <Text style={[tw`text-[10px] font-bold`, { color: selectedImpersonatedOrg === o.id ? '#FFF' : theme.textMuted }]} numberOfLines={1}>
                  {o.name.length > 18 ? o.name.substring(0, 18) + '…' : o.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ─── Main Content ─── */}
      <ScrollView style={tw`flex-1 p-5`} contentContainerStyle={{ paddingBottom: 40 }}>
        {loading ? (
          <ActivityIndicator color={theme.accent} size="large" style={tw`my-20`} />
        ) : activeTab === 'monitor' ? (
          <>
            {/* Banner */}
            {currentOrgBranding?.banner_url && (
              <View style={[tw`w-full h-32 rounded-2xl overflow-hidden mb-5 relative`, { borderWidth: 1, borderColor: theme.border }]}>
                <Image source={{ uri: currentOrgBranding.banner_url }} style={tw`w-full h-full`} resizeMode="cover" />
                <View style={tw`absolute inset-0 bg-black/40 p-5 justify-end`}>
                  <Text style={tw`text-white font-extrabold text-lg`}>{currentOrgBranding.name}</Text>
                </View>
              </View>
            )}

            {/* Billing Card (Normal Admin) */}
            {role === 'admin' && currentOrgBranding && (
              <View
                style={[
                  tw`p-5 rounded-2xl mb-5 flex-row flex-wrap justify-between items-center`,
                  { backgroundColor: isDark ? '#0C1A3A' : '#EFF6FF', borderWidth: 1, borderColor: isDark ? '#1E3A6B' : '#BFDBFE' }
                ]}
              >
                <View>
                  <Text style={[tw`text-[10px] font-bold uppercase tracking-wider`, { color: theme.accent }]}>Facturación CRM</Text>
                  <Text style={[tw`font-extrabold text-base mt-1`, { color: theme.text }]}>
                    Plan {currentOrgBranding.billing_plan === 'weekly' ? 'Semanal' : 'Mensual'} — {currentOrgBranding.billing_status === 'active' ? '✓ Al Día' : '✕ Atrasado'}
                  </Text>
                  <Text style={[tw`text-xs mt-1 font-medium`, { color: theme.textMuted }]}>
                    Bs.3/día × {driversCount} afiliados
                  </Text>
                </View>
                <TouchableOpacity
                  style={[tw`px-5 py-2.5 rounded-xl mt-3`, { backgroundColor: theme.accent }]}
                  onPress={() => alert('Pasarela de pagos en desarrollo...')}
                >
                  <Text style={tw`text-white font-bold text-xs uppercase tracking-wider`}>Pagar Cuota</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* KPI Grid */}
            <View style={tw`flex-row flex-wrap gap-4 mb-5`}>
              {kpis.map((kpi, idx) => (
                <KpiCard key={idx} {...kpi} isDark={isDark} theme={theme} />
              ))}
            </View>

            {/* Live Fleet Map */}
            <View
              style={[
                tw`rounded-2xl overflow-hidden mb-5`,
                { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }
              ]}
            >
              <View
                style={[
                  tw`px-5 py-4 flex-row justify-between items-center`,
                  { borderBottomWidth: 1, borderBottomColor: theme.border }
                ]}
              >
                <View style={tw`flex-row items-center gap-2.5`}>
                  <Ionicons name="map" size={18} color={theme.accent} />
                  <Text style={[tw`font-extrabold text-sm uppercase tracking-wider`, { color: theme.text }]}>
                    Estado de Flota en Vivo
                  </Text>
                </View>
                <View style={tw`flex-row items-center gap-2`}>
                  <View style={[tw`w-2 h-2 rounded-full`, { backgroundColor: theme.statusActive }]} />
                  <Text style={[tw`text-[9px] font-bold uppercase tracking-wider`, { color: theme.statusActive }]}>
                    {lastUpdatedTime}
                  </Text>
                </View>
              </View>
              <View style={tw`w-full ${isDesktop ? 'h-[500px]' : 'h-80'}`}>
                <LiveMapWeb 
                  centerLat={-16.5000}
                  centerLng={-68.1193}
                  markers={liveLocations.map((loc: any) => ({
                    id: loc.driver_id,
                    lat: loc.latitude,
                    lng: loc.longitude,
                    title: `${driverInfoDict[loc.driver_id]?.name || 'Conductor'} ${loc.is_off_route ? '⚠️ DESVIADO' : ''}`,
                    isDriver: true,
                    isOffRoute: loc.is_off_route
                  }))}
                />
              </View>
            </View>

            {/* Active Drivers Table + Activity Sidebar */}
            <View style={tw`flex-col ${isDesktop ? 'flex-row' : 'flex-col'} gap-5`}>
              {/* Drivers Table */}
              <View style={tw`flex-1`}>
                <View
                  style={[
                    tw`rounded-2xl overflow-hidden`,
                    { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }
                  ]}
                >
                  <View style={[tw`px-5 py-4`, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                    <Text style={[tw`font-extrabold text-sm uppercase tracking-wider`, { color: theme.text }]}>
                      Choferes Activos
                    </Text>
                  </View>
                  {liveLocations.length === 0 ? (
                    <View style={tw`p-10 items-center`}>
                      <Ionicons name="car-outline" size={32} color={theme.textSubtle} />
                      <Text style={[tw`text-sm font-semibold mt-3`, { color: theme.textMuted }]}>Sin choferes activos</Text>
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={tw`min-w-full`}>
                        {/* Table Header */}
                        <View style={[tw`flex-row px-5 py-3`, { backgroundColor: isDark ? theme.cardElevated : '#F8FAFC', borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                          <Text style={[tw`w-48 text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Chofer</Text>
                          <Text style={[tw`w-36 text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Ruta</Text>
                          <Text style={[tw`w-28 text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Placa</Text>
                          <Text style={[tw`w-28 text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Estado</Text>
                        </View>

                        {liveLocations.map((loc: any) => {
                          const info = driverInfoDict[loc.driver_id] || { name: 'Chofer', placa: 'S/P', orgName: 'Sindicato', status: 'active' };
                          const isOff = loc.is_off_route || false;
                          return (
                            <View key={loc.driver_id} style={[tw`flex-row px-5 py-3.5 items-center`, { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(30,45,66,0.5)' : '#F1F5F9' }]}>
                              <View style={tw`w-48 flex-row items-center gap-2.5`}>
                                <View style={[tw`w-8 h-8 rounded-full items-center justify-center`, { backgroundColor: theme.accentSoft }]}>
                                  <Text style={[tw`text-xs font-bold`, { color: theme.accent }]}>{info.name.substring(0, 2).toUpperCase()}</Text>
                                </View>
                                <View>
                                  <Text style={[tw`font-bold text-sm`, { color: theme.text }]}>{info.name}</Text>
                                  <Text style={[tw`text-[10px] font-medium`, { color: theme.textSubtle }]}>{info.orgName}</Text>
                                </View>
                              </View>
                              <Text style={[tw`w-36 text-xs font-medium`, { color: theme.textMuted }]}>
                                Línea {loc.route_id?.substring(0, 5).toUpperCase() || 'S/R'}
                              </Text>
                              <View style={tw`w-28`}>
                                <View style={[tw`self-start px-2 py-0.5 rounded`, { backgroundColor: isDark ? theme.cardElevated : '#F1F5F9', borderWidth: 1, borderColor: theme.border }]}>
                                  <Text style={[tw`text-xs font-mono font-bold tracking-wider`, { color: theme.text }]}>{info.placa}</Text>
                                </View>
                              </View>
                              <View style={tw`w-28`}>
                                <View
                                  style={[
                                    tw`self-start px-2.5 py-0.5 rounded-full`,
                                    {
                                      backgroundColor: isOff
                                        ? (isDark ? 'rgba(248,113,113,0.1)' : 'rgba(239,68,68,0.06)')
                                        : (isDark ? 'rgba(74,222,128,0.1)' : 'rgba(22,163,74,0.06)')
                                    }
                                  ]}
                                >
                                  <Text style={[tw`text-[9px] font-bold uppercase tracking-wider`, { color: isOff ? theme.statusDanger : theme.statusActive }]}>
                                    {isOff ? '⚠ TRAMEAJE' : 'A TIEMPO'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </ScrollView>
                  )}
                </View>
              </View>

              {/* Right Column — Activity + Actions */}
              <View style={tw`${isDesktop ? 'w-80' : 'w-full'} gap-5`}>
                {/* Recent Activity */}
                <View
                  style={[
                    tw`rounded-2xl p-5`,
                    { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }
                  ]}
                >
                  <Text style={[tw`font-extrabold text-sm uppercase tracking-wider mb-4`, { color: theme.text }]}>
                    Actividad Reciente
                  </Text>
                  {[
                    { title: 'Ruta Completada', desc: 'Minibús arribó a parada final.', time: 'Hace 2 min', icon: 'checkmark-circle' as const, color: theme.statusActive },
                    { title: 'Desviación Detectada', desc: 'Chofer fuera de ruta normal.', time: 'Hace 14 min', icon: 'alert-circle' as const, color: theme.statusDanger },
                  ].map((act, idx) => (
                    <View key={idx} style={tw`flex-row gap-3 items-start ${idx > 0 ? 'mt-4' : ''}`}>
                      <View style={[tw`w-9 h-9 rounded-xl items-center justify-center`, { backgroundColor: act.color + '15' }]}>
                        <Ionicons name={act.icon} size={18} color={act.color} />
                      </View>
                      <View style={tw`flex-1`}>
                        <Text style={[tw`font-bold text-sm`, { color: theme.text }]}>{act.title}</Text>
                        <Text style={[tw`text-xs mt-0.5 leading-relaxed`, { color: theme.textMuted }]}>{act.desc}</Text>
                        <Text style={[tw`text-[10px] font-bold mt-1 uppercase`, { color: theme.textSubtle }]}>{act.time}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Quick Actions */}
                <View
                  style={[
                    tw`rounded-2xl p-5`,
                    { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }
                  ]}
                >
                  <Text style={[tw`font-extrabold text-sm uppercase tracking-wider mb-4`, { color: theme.text }]}>Acciones Rápidas</Text>
                  <TouchableOpacity
                    style={[tw`py-3.5 rounded-xl items-center flex-row justify-center gap-2`, { backgroundColor: theme.accent }]}
                    onPress={() => setAlertModalVisible(true)}
                  >
                    <Ionicons name="megaphone" size={16} color="#FFF" />
                    <Text style={tw`text-white font-bold text-xs uppercase tracking-wider`}>Enviar Alerta</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </>
        ) : (
          /* ─── CRM View (SuperAdmin) ─── */
          <View style={tw`gap-5`}>
            {/* CRM KPIs */}
            <View style={tw`flex-row flex-wrap gap-4 mb-2`}>
              <KpiCard title="Sindicatos" value={organizations.length.toString()} change="Afiliados activos" icon="business" iconColor={theme.accent} isDark={isDark} theme={theme} />
              <KpiCard title="Choferes Total" value={Object.values(driverCountsByOrg).reduce((a, b) => a + b, 0).toString()} change="Registrados" icon="people" iconColor={theme.statusWarning} isDark={isDark} theme={theme} />
              <KpiCard title="Ingresos Proyectados" value={`Bs. ${(Object.values(driverCountsByOrg).reduce((a, b) => a + b, 0) * 3 * 30).toLocaleString()}`} change="Mensual estimado" icon="trending-up" iconColor={theme.statusActive} isDark={isDark} theme={theme} />
            </View>

            {/* Tenants Table */}
            <View
              style={[
                tw`rounded-2xl overflow-hidden`,
                { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }
              ]}
            >
              <View style={[tw`px-5 py-4`, { backgroundColor: isDark ? theme.cardElevated : '#F8FAFC', borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <Text style={[tw`font-extrabold text-sm uppercase tracking-wider`, { color: theme.text }]}>CRM de Cuentas</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={tw`min-w-full`}>
                  <View style={[tw`flex-row px-5 py-3`, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                    <Text style={[tw`w-64 text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Sindicato</Text>
                    <Text style={[tw`w-24 text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Afiliados</Text>
                    <Text style={[tw`w-28 text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Cobro Sem.</Text>
                    <Text style={[tw`w-28 text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Cobro Mes</Text>
                    <Text style={[tw`w-24 text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Estado</Text>
                    <Text style={[tw`w-56 text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Acciones</Text>
                  </View>

                  {organizations.map(org => {
                    const count = driverCountsByOrg[org.id] || 0;
                    const isActive = org.billing_status === 'active';
                    return (
                      <View key={org.id} style={[tw`flex-row px-5 py-3.5 items-center`, { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(30,45,66,0.5)' : '#F1F5F9' }]}>
                        <View style={tw`w-64 flex-row items-center gap-3`}>
                          <TouchableOpacity onPress={() => handleUpdateBranding(org.id, 'logo')}>
                            {org.logo_url ? (
                              <Image source={{ uri: org.logo_url }} style={tw`w-8 h-8 rounded-lg`} />
                            ) : (
                              <View style={[tw`w-8 h-8 rounded-lg items-center justify-center`, { backgroundColor: theme.accentSoft }]}>
                                <Ionicons name="camera" size={14} color={theme.accent} />
                              </View>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => { setSelectedImpersonatedOrg(org.id); setActiveTab('monitor'); }}>
                            <Text style={[tw`font-bold text-xs`, { color: theme.accent }]} numberOfLines={1}>{org.name}</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={[tw`w-24 text-xs font-semibold`, { color: theme.textMuted }]}>{count}</Text>
                        <Text style={[tw`w-28 text-xs font-bold`, { color: theme.text }]}>Bs. {count * 3 * 7}</Text>
                        <Text style={[tw`w-28 text-xs font-bold`, { color: theme.text }]}>Bs. {count * 3 * 30}</Text>
                        <View style={tw`w-24`}>
                          <View
                            style={[
                              tw`self-start px-2.5 py-0.5 rounded-full`,
                              { backgroundColor: isActive ? (isDark ? 'rgba(74,222,128,0.1)' : 'rgba(22,163,74,0.06)') : (isDark ? 'rgba(248,113,113,0.1)' : 'rgba(239,68,68,0.06)') }
                            ]}
                          >
                            <Text style={[tw`text-[9px] font-bold uppercase`, { color: isActive ? theme.statusActive : theme.statusDanger }]}>
                              {isActive ? 'ACTIVO' : 'SUSPENDIDO'}
                            </Text>
                          </View>
                        </View>
                        <View style={tw`w-56 flex-row gap-2`}>
                          <TouchableOpacity
                            onPress={() => { setEditingOrg(org); setEditPlan(org.billing_plan as any || 'monthly'); setEditStatus(org.billing_status as any || 'active'); }}
                            style={[tw`px-3 py-1.5 rounded-xl`, { backgroundColor: theme.accent }]}
                          >
                            <Text style={tw`text-white font-bold text-[10px] uppercase tracking-wider`}>Configurar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleUpdateBranding(org.id, 'banner')}
                            style={[tw`px-3 py-1.5 rounded-xl`, { backgroundColor: isDark ? theme.cardElevated : '#F1F5F9', borderWidth: 1, borderColor: theme.border }]}
                          >
                            <Text style={[tw`font-bold text-[10px] uppercase tracking-wider`, { color: theme.textMuted }]}>Banner</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ─── Alert Modal ─── */}
      <Modal visible={alertModalVisible} animationType="fade" transparent onRequestClose={() => setAlertModalVisible(false)}>
        <View style={tw`flex-1 justify-center items-center bg-black/60 p-4`}>
          <View style={[tw`rounded-2xl w-full max-w-md p-6`, { backgroundColor: theme.card }]}>
            <Text style={[tw`text-lg font-extrabold mb-4`, { color: theme.text }]}>Enviar Alerta a Flota</Text>

            <Text style={[tw`text-[10px] font-bold uppercase mb-2 ml-1`, { color: theme.textSubtle }]}>Título</Text>
            <TextInput
              style={[tw`rounded-xl px-4 py-3 text-sm font-semibold mb-4`, { backgroundColor: theme.inputBg, borderWidth: 1, borderColor: theme.inputBorder, color: theme.text }]}
              placeholder="Ej. Bloqueo en Av. Mariscal"
              placeholderTextColor={theme.textSubtle}
              value={newAlertTitle}
              onChangeText={setNewAlertTitle}
            />

            <Text style={[tw`text-[10px] font-bold uppercase mb-2 ml-1`, { color: theme.textSubtle }]}>Mensaje</Text>
            <TextInput
              style={[tw`rounded-xl px-4 py-3 text-sm font-semibold mb-4 h-24`, { backgroundColor: theme.inputBg, borderWidth: 1, borderColor: theme.inputBorder, color: theme.text }]}
              placeholder="Detalles..."
              placeholderTextColor={theme.textSubtle}
              multiline
              textAlignVertical="top"
              value={newAlertMessage}
              onChangeText={setNewAlertMessage}
            />

            <Text style={[tw`text-[10px] font-bold uppercase mb-2 ml-1`, { color: theme.textSubtle }]}>Gravedad</Text>
            <View style={tw`flex-row gap-2 mb-6`}>
              {(['info', 'warning', 'critical'] as const).map(lvl => {
                const isSel = newAlertSeverity === lvl;
                const lvlColor = lvl === 'critical' ? theme.statusDanger : lvl === 'warning' ? theme.statusWarning : theme.accent;
                return (
                  <TouchableOpacity
                    key={lvl}
                    onPress={() => setNewAlertSeverity(lvl)}
                    style={[
                      tw`flex-1 py-2.5 rounded-xl items-center`,
                      { backgroundColor: isSel ? lvlColor : 'transparent', borderWidth: 1, borderColor: isSel ? lvlColor : theme.border }
                    ]}
                  >
                    <Text style={[tw`text-[10px] font-bold uppercase tracking-wider`, { color: isSel ? '#FFF' : theme.textMuted }]}>
                      {lvl === 'info' ? 'Info' : lvl === 'warning' ? 'Alerta' : 'Crítica'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={tw`flex-row gap-3`}>
              <TouchableOpacity style={[tw`flex-1 py-3.5 rounded-xl items-center`, { borderWidth: 1, borderColor: theme.border }]} onPress={() => setAlertModalVisible(false)}>
                <Text style={[tw`font-bold text-xs uppercase`, { color: theme.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[tw`flex-1 py-3.5 rounded-xl items-center flex-row justify-center`, { backgroundColor: theme.accent }]}
                onPress={handleSendAlert}
                disabled={sendingAlert}
              >
                {sendingAlert && <ActivityIndicator color="white" style={tw`mr-2`} size="small" />}
                <Text style={tw`text-white font-bold text-xs uppercase`}>Publicar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── CRM Edit Modal ─── */}
      <Modal visible={editingOrg !== null} animationType="fade" transparent onRequestClose={() => setEditingOrg(null)}>
        <View style={tw`flex-1 justify-center items-center bg-black/60 p-4`}>
          <View style={[tw`rounded-2xl w-full max-w-sm p-6`, { backgroundColor: theme.card }]}>
            <Text style={[tw`text-lg font-extrabold mb-1`, { color: theme.text }]}>Facturación</Text>
            <Text style={[tw`text-xs mb-4`, { color: theme.textMuted }]}>{editingOrg?.name}</Text>

            <Text style={[tw`text-[10px] font-bold uppercase mb-2 ml-1`, { color: theme.textSubtle }]}>Plan</Text>
            <View style={tw`flex-row gap-2 mb-4`}>
              {(['weekly', 'monthly'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setEditPlan(p)}
                  style={[
                    tw`flex-1 py-2.5 rounded-xl items-center`,
                    { backgroundColor: editPlan === p ? theme.accent : 'transparent', borderWidth: 1, borderColor: editPlan === p ? theme.accent : theme.border }
                  ]}
                >
                  <Text style={[tw`text-xs font-bold uppercase`, { color: editPlan === p ? '#FFF' : theme.textMuted }]}>
                    {p === 'weekly' ? 'Semanal' : 'Mensual'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[tw`text-[10px] font-bold uppercase mb-2 ml-1`, { color: theme.textSubtle }]}>Estado</Text>
            <View style={tw`flex-row gap-2 mb-6`}>
              {(['active', 'suspended', 'trial'] as const).map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setEditStatus(s)}
                  style={[
                    tw`flex-1 py-2.5 rounded-xl items-center`,
                    { backgroundColor: editStatus === s ? theme.accent : 'transparent', borderWidth: 1, borderColor: editStatus === s ? theme.accent : theme.border }
                  ]}
                >
                  <Text style={[tw`text-xs font-bold uppercase`, { color: editStatus === s ? '#FFF' : theme.textMuted }]}>
                    {s === 'active' ? 'Activo' : s === 'suspended' ? 'Suspendido' : 'Prueba'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={tw`flex-row gap-3`}>
              <TouchableOpacity style={[tw`flex-1 py-3.5 rounded-xl items-center`, { borderWidth: 1, borderColor: theme.border }]} onPress={() => setEditingOrg(null)}>
                <Text style={[tw`font-bold text-xs uppercase`, { color: theme.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[tw`flex-1 py-3.5 rounded-xl items-center flex-row justify-center`, { backgroundColor: theme.accent }]}
                onPress={handleSaveCrmSettings}
                disabled={savingCrm}
              >
                {savingCrm && <ActivityIndicator color="white" style={tw`mr-2`} size="small" />}
                <Text style={tw`text-white font-bold text-xs uppercase`}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
