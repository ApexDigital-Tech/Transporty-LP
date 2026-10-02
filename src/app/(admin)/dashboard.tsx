import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, useWindowDimensions, Modal, TextInput, Image, ActivityIndicator, Alert } from 'react-native';
import tw from 'twrnc';
import { supabase, LiveLocation, uploadOrgBranding } from '../../services/supabase';
import LiveMapWeb from '../../components/LiveMapWeb';
import { useStore } from '../../hooks/useStore';
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

export default function AdminDashboardScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

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

    return () => {
      unsubscribeFromLocations();
    };
  }, [refreshTrigger, selectedImpersonatedOrg]);

  async function initDashboard() {
    setLoading(true);
    try {
      // 0. Obtener usuario autenticado y su teléfono
      const { data: { user } } = await supabase.auth.getUser();
      const userPhone = user?.phone || '';
      setCurrentUserPhone(userPhone);

      // 1. Obtener perfil de administrador desde la DB
      const { data: adminProfile } = await supabase
        .from('admin_profiles')
        .select('organization_id, role')
        .maybeSingle();

      let userRole = adminProfile?.role || 'admin';
      let userOrgId = adminProfile?.organization_id || null;

      // Fallback/Override manual para números de prueba si no están en admin_profiles en base de datos
      if (userPhone.endsWith('72845621') || userPhone.endsWith('78756107')) {
        userRole = 'superadmin';
        userOrgId = null;
      } else if (userPhone.endsWith('72845620')) {
        userRole = 'admin';
        if (!userOrgId) {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('id')
            .eq('name', 'SINDICATO 14 DE SEPTIEMBRE')
            .limit(1)
            .maybeSingle();
          if (orgData) {
            userOrgId = orgData.id;
          }
        }
      }

      setRole(userRole as any);
      setAdminOrgId(userOrgId);

      // Determinar organización activa para las queries de telemetría
      const activeOrgId = userRole === 'superadmin' ? (selectedImpersonatedOrg || undefined) : (userOrgId || undefined);

      // 2. Si es superadmin, cargar la lista de todas las organizaciones para CRM
      if (userRole === 'superadmin') {
        const { data: orgsData } = await supabase.from('organizations').select('*').order('name');
        if (orgsData) {
          setOrganizations(orgsData);
        }
      }

      // Cargar conteo total de choferes por organización
      const { data: allDrivers } = await supabase.from('drivers').select('id, organization_id');
      if (allDrivers) {
        const counts: Record<string, number> = {};
        allDrivers.forEach(d => {
          if (d.organization_id) {
            counts[d.organization_id] = (counts[d.organization_id] || 0) + 1;
          }
        });
        setDriverCountsByOrg(counts);
      }

      // 3. Obtener marca / personalización de la organización activa
      const brandingId = activeOrgId || userOrgId;
      if (brandingId) {
        const { data: orgBranding } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', brandingId)
          .maybeSingle();
        if (orgBranding) {
          setCurrentOrgBranding(orgBranding);
        }
      } else {
        setCurrentOrgBranding(null);
      }

      // 4. Obtener conteo de choferes de la organización activa
      let driversCountQuery = supabase.from('drivers').select('id', { count: 'exact', head: true });
      if (activeOrgId) {
        driversCountQuery = driversCountQuery.eq('organization_id', activeOrgId);
      }
      const { count } = await driversCountQuery;
      setDriversCount(count || 0);

      // 5. Cargar mapeo de choferes
      let driversQuery = supabase
        .from('drivers')
        .select('id, name, placa, status, organization:organizations(name)');
      if (activeOrgId) {
        driversQuery = driversQuery.eq('organization_id', activeOrgId);
      }
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

      // 6. Conectar al Zustand store para cargar posiciones y suscribirse
      await fetchInitialLocations(undefined, activeOrgId);
      subscribeToLocations(undefined, activeOrgId);
    } catch (e) {
      console.error("Error inicializando panel:", e);
    } finally {
      setLoading(false);
    }
  }

  const updateTimestamp = () => {
    const now = new Date();
    setLastUpdatedTime(now.toTimeString().split(' ')[0]);
  };

  const handleSendAlert = async () => {
    if (!newAlertTitle || !newAlertMessage) {
      Alert.alert('Incompleto', 'Por favor ingresa un título y mensaje para la alerta.');
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
      Alert.alert('Éxito', 'La alerta ha sido enviada y registrada correctamente.');
      setNewAlertTitle('');
      setNewAlertMessage('');
      setAlertModalVisible(false);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', 'Hubo un problema enviando la alerta: ' + err.message);
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

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setLoading(true);
      try {
        const { publicUrl, error } = await uploadOrgBranding(orgId, type, uri);
        if (error) throw error;
        if (publicUrl) {
          const updateField = type === 'logo' ? { logo_url: publicUrl } : { banner_url: publicUrl };
          const { error: updateError } = await supabase
            .from('organizations')
            .update(updateField)
            .eq('id', orgId);
          if (updateError) throw updateError;
          Alert.alert('Éxito', `${type === 'logo' ? 'Logo' : 'Banner'} actualizado.`);
          // Recargar
          initDashboard();
        }
      } catch (err: any) {
        console.error(err);
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
      const { error } = await supabase
        .from('organizations')
        .update({
          billing_plan: editPlan,
          billing_status: editStatus
        })
        .eq('id', editingOrg.id);

      if (error) throw error;
      Alert.alert('Éxito', 'Configuración de facturación guardada.');
      setEditingOrg(null);
      initDashboard();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message);
    } finally {
      setSavingCrm(false);
    }
  };

  // KPIs
  const kpis = [
    { title: 'Unidades Activas', value: liveLocations.length.toString(), change: '+4% vs ayer', color: 'text-blue-600', isCritical: false },
    { title: 'Choferes Registrados', value: driversCount.toString(), change: 'Capacidad asignada', color: 'text-amber-600', isCritical: false },
    { title: 'Factura Estimada (Mes)', value: `Bs. ${(driversCount * 3 * 30).toLocaleString()}`, change: `Bs. 3/día x ${driversCount} choferes`, color: 'text-green-600', isCritical: false },
    { title: 'Infracciones Activas', value: liveLocations.filter(l => l.is_off_route).length.toString(), change: 'Desvíos de ruta (trameaje)', color: 'text-red-600', isCritical: liveLocations.some(l => l.is_off_route) },
  ];

  const recentActivities = [
    { title: 'Ruta Completada', desc: 'Minibús arribó a la parada final.', time: 'Hace 2 min', icon: '✅', color: 'bg-green-100 text-green-800' },
    { title: 'Desviación Detectada', desc: 'Chofer desviado detectado en tiempo real.', time: 'Hace 14 min', icon: '⚠️', color: 'bg-red-100 text-red-800' },
  ];

  return (
    <SafeAreaView style={tw`flex-1 bg-[#f8fafc]`}>
      {/* Top Header Bar */}
      <View style={tw`bg-white border-b border-gray-200 px-6 py-4 flex-row justify-between items-center z-10 shadow-sm`}>
        <View style={tw`flex-row items-center gap-3.5`}>
          {(role === 'superadmin' || currentUserPhone.endsWith('72845621') || currentUserPhone.endsWith('78756107')) ? (
            <View style={tw`w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl items-center justify-center`}>
              <Text style={tw`text-2xl`}>🏢</Text>
            </View>
          ) : currentOrgBranding?.logo_url ? (
            <Image source={{ uri: currentOrgBranding.logo_url }} style={tw`w-12 h-12 rounded-xl`} />
          ) : (
            <View style={tw`w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl items-center justify-center`}>
              <Text style={tw`text-2xl`}>🚌</Text>
            </View>
          )}
          <View>
            <Text style={tw`text-[10px] font-black text-gray-400 uppercase tracking-widest`}>
              {(role === 'superadmin' || currentUserPhone.endsWith('72845621') || currentUserPhone.endsWith('78756107')) ? 'Operaciones Centrales' : (currentOrgBranding?.name || 'Portal Sindicato')} • La Paz Transit
            </Text>
            <Text style={tw`text-2xl font-black text-[#0f172a] tracking-tight`}>
              {role === 'superadmin' ? 'SuperAdministrador' : 'Vista General'}
            </Text>
            {currentUserPhone ? (
              <Text style={tw`text-[10px] text-gray-400 font-bold mt-0.5`}>
                Tel: {currentUserPhone} | Rol: {role === 'superadmin' ? 'SuperAdmin' : 'Sindicato'}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={tw`flex-row items-center gap-4`}>
          {role === 'superadmin' && (
            <View style={tw`flex-row bg-slate-100 rounded-xl p-1 gap-1`}>
              <TouchableOpacity
                onPress={() => setActiveTab('monitor')}
                style={tw`px-3 py-1.5 rounded-lg ${activeTab === 'monitor' ? 'bg-white shadow-sm' : ''}`}
              >
                <Text style={tw`text-xs font-bold ${activeTab === 'monitor' ? 'text-slate-900' : 'text-slate-500'}`}>Monitoreo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab('crm')}
                style={tw`px-3 py-1.5 rounded-lg ${activeTab === 'crm' ? 'bg-white shadow-sm' : ''}`}
              >
                <Text style={tw`text-xs font-bold ${activeTab === 'crm' ? 'text-slate-900' : 'text-slate-500'}`}>CRM Sindicatos</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Sindicato selector for Impersonation (SuperAdmin only) */}
          {role === 'superadmin' && activeTab === 'monitor' && (
            <View style={tw`flex-row items-center gap-2`}>
              <Text style={tw`text-xs text-gray-500 font-bold`}>Filtrar Sindicato:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`gap-1`}>
                <TouchableOpacity
                  onPress={() => setSelectedImpersonatedOrg(null)}
                  style={tw`px-2.5 py-1 rounded-lg border ${!selectedImpersonatedOrg ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
                >
                  <Text style={tw`text-[10px] font-extrabold ${!selectedImpersonatedOrg ? 'text-white' : 'text-gray-600'}`}>Todos</Text>
                </TouchableOpacity>
                {organizations.map(o => (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => setSelectedImpersonatedOrg(o.id)}
                    style={tw`px-2.5 py-1 rounded-lg border ${selectedImpersonatedOrg === o.id ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
                  >
                    <Text style={tw`text-[10px] font-extrabold ${selectedImpersonatedOrg === o.id ? 'text-white' : 'text-gray-600'}`} numberOfLines={1}>
                      {o.name.substring(10, 22) || o.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={tw`hidden md:flex flex-row items-center bg-green-50 border border-green-100 rounded-full px-3 py-1`}>
            <View style={tw`w-2 h-2 rounded-full bg-green-500 mr-2`} />
            <Text style={tw`text-[9px] font-black text-green-700 uppercase tracking-wider`}>En Vivo</Text>
          </View>
        </View>
      </View>

      <ScrollView style={tw`flex-1 p-6`} contentContainerStyle={{ paddingBottom: 40 }}>
        {loading ? (
          <ActivityIndicator color="#3b82f6" size="large" style={tw`my-20`} />
        ) : activeTab === 'monitor' ? (
          <>
            {/* Branding Banner if customized */}
            {currentOrgBranding?.banner_url && (
              <View style={tw`w-full h-32 bg-slate-200 rounded-3xl overflow-hidden mb-6 relative border border-gray-200`}>
                <Image source={{ uri: currentOrgBranding.banner_url }} style={tw`w-full h-full`} resizeMode="cover" />
                <View style={tw`absolute inset-0 bg-slate-900/40 p-5 justify-end`}>
                  <Text style={tw`text-white font-extrabold text-lg`}>{currentOrgBranding.name}</Text>
                  <Text style={tw`text-white/80 text-xs font-semibold`}>Portal Oficial del Sindicato Afiliado</Text>
                </View>
              </View>
            )}

            {/* Custom Sindicato Billing Info (Normal Admin Only) */}
            {role === 'admin' && currentOrgBranding && (
              <View style={tw`bg-blue-900 p-5 rounded-3xl mb-6 flex-row flex-wrap justify-between items-center border border-blue-800 shadow-md shadow-blue-950/20`}>
                <View>
                  <Text style={tw`text-blue-300 font-extrabold text-[10px] uppercase tracking-wider`}>Facturación CRM Sindicato</Text>
                  <Text style={tw`text-white font-black text-base mt-1`}>
                    Plan {currentOrgBranding.billing_plan === 'weekly' ? 'Semanal' : 'Mensual'} - {currentOrgBranding.billing_status === 'active' ? '🟢 Al Día' : '🔴 Atrasado'}
                  </Text>
                  <Text style={tw`text-blue-200 text-xs mt-1 font-medium`}>
                    Tarifa Bs. 3/día por chofer ({driversCount} afiliados). Semanal: Bs. {driversCount * 3 * 7} • Mensual: Bs. {driversCount * 3 * 30}
                  </Text>
                </View>
                <TouchableOpacity style={tw`bg-white px-4 py-2 rounded-xl mt-3 md:mt-0`} onPress={() => alert('Pasarela de pagos en desarrollo...')}>
                  <Text style={tw`text-blue-900 font-black text-xs uppercase tracking-wider`}>Pagar Cuota</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* KPI Grid */}
            <View style={tw`flex-row flex-wrap justify-between gap-4 mb-6`}>
              {kpis.map((kpi, idx) => (
                <View 
                  key={idx} 
                  style={tw`bg-white border border-gray-100 p-5 rounded-2xl flex-1 min-w-[200px] shadow-sm flex-row items-center justify-between`}
                >
                  <View>
                    <Text style={tw`text-gray-400 text-xs font-bold uppercase tracking-wider mb-1`}>{kpi.title}</Text>
                    <Text style={tw`text-3xl font-extrabold text-[#0f172a]`}>{kpi.value}</Text>
                    <Text style={tw`text-[10px] font-semibold mt-1.5 ${kpi.isCritical ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                      {kpi.change}
                    </Text>
                  </View>
                  <View style={tw`bg-slate-50 p-3.5 rounded-2xl`}>
                    <Text style={tw`text-2xl ${kpi.color}`}>{idx === 0 ? '🚌' : idx === 1 ? '👤' : idx === 2 ? '💵' : '🚨'}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Live Fleet Status Map - Full Width / Panoramic */}
            <View style={tw`bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm mb-6`}>
              <View style={tw`px-5 py-4 border-b border-gray-100 flex-row justify-between items-center bg-[#f8fafc]`}>
                <View style={tw`flex-row items-center gap-2`}>
                  <Text style={tw`text-lg`}>🗺️</Text>
                  <Text style={tw`font-extrabold text-[#0f172a] text-sm uppercase tracking-wider`}>Estado de Flota en Vivo</Text>
                </View>
                <View style={tw`flex-row items-center gap-2`}>
                  <View style={tw`w-2 h-2 rounded-full bg-green-500`} />
                  <Text style={tw`text-[10px] font-black text-green-700 uppercase tracking-widest`}>Actualizado en tiempo real • {lastUpdatedTime}</Text>
                </View>
              </View>
              <View style={tw`w-full ${isDesktop ? 'h-[500px]' : 'h-80'} bg-gray-100`}>
                <LiveMapWeb 
                  centerLat={-16.5000}
                  centerLng={-68.1193}
                  markers={liveLocations.map((loc: any) => ({
                    id: loc.driver_id,
                    lat: loc.latitude,
                    lng: loc.longitude,
                    title: `Chofer: ${driverInfoDict[loc.driver_id]?.name || 'Conductor'} ${loc.is_off_route ? '⚠️ (DESVIADO)' : ''}`,
                    isDriver: true,
                    isOffRoute: loc.is_off_route
                  }))}
                />
              </View>
            </View>

            {/* Dashboard Responsive Grid */}
            <View style={tw`flex-col ${isDesktop ? 'flex-row' : 'flex-col'} gap-6`}>
              {/* Left Column (Table Only) */}
              <View style={tw`flex-1 flex-col gap-6`}>
                {/* Active Driver Status Table */}
                <View style={tw`bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm`}>
                  <View style={tw`px-5 py-4 border-b border-gray-100`}>
                    <Text style={tw`font-extrabold text-[#0f172a] text-sm uppercase tracking-wider`}>Estado de Choferes Activos</Text>
                  </View>
                  {liveLocations.length === 0 ? (
                    <View style={tw`p-10 items-center justify-center`}>
                      <Text style={tw`text-gray-400 text-sm font-semibold`}>No hay choferes activos en este momento.</Text>
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={tw`min-w-full`}>
                        <View style={tw`flex-row bg-[#f8fafc] px-5 py-3 border-b border-gray-100`}>
                          <Text style={tw`w-48 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Nombre del Chofer</Text>
                          <Text style={tw`w-36 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Ruta Asignada</Text>
                          <Text style={tw`w-28 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Placa / Móvil</Text>
                          <Text style={tw`w-28 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Estado de Turno</Text>
                        </View>

                        {liveLocations.map((loc: any) => {
                          const info = driverInfoDict[loc.driver_id] || {
                            name: 'Chofer',
                            placa: 'S/P',
                            orgName: 'Sindicato',
                            status: 'active'
                          };
                          const isOffRoute = loc.is_off_route || false;
                          return (
                            <View key={loc.driver_id} style={tw`flex-row px-5 py-3.5 border-b border-gray-50 items-center`}>
                              <View style={tw`w-48 flex-row items-center gap-2.5`}>
                                <View style={tw`w-8 h-8 rounded-full bg-blue-50 items-center justify-center`}>
                                  <Text style={tw`text-[#2563eb] text-xs font-bold`}>{info.name.substring(0, 2).toUpperCase()}</Text>
                                </View>
                                <View>
                                  <Text style={tw`font-bold text-[#0f172a] text-sm`}>{info.name}</Text>
                                  <Text style={tw`text-[10px] text-gray-400 font-semibold`}>{info.orgName}</Text>
                                </View>
                              </View>
                              <Text style={tw`w-36 text-xs text-gray-600 font-medium`}>Línea {loc.route_id?.substring(0, 5).toUpperCase() || 'S/R'}</Text>
                              <View style={tw`w-28`}>
                                <View style={tw`bg-slate-100 border border-slate-200 self-start px-2 py-0.5 rounded`}>
                                  <Text style={tw`text-xs font-mono font-bold text-slate-700 tracking-wider`}>{info.placa}</Text>
                                </View>
                              </View>
                              <View style={tw`w-28`}>
                                <View style={tw`self-start px-2.5 py-0.5 rounded-full ${isOffRoute ? 'bg-red-50' : 'bg-green-50'}`}>
                                  <Text style={tw`text-[9px] font-black uppercase tracking-widest ${isOffRoute ? 'text-red-700' : 'text-green-700'}`}>
                                    {isOffRoute ? '⚠️ TRAMEAJE' : 'A TIEMPO'}
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

              {/* Right Column (Recent Activity & Actions) */}
              <View style={tw`w-full ${isDesktop ? 'w-80' : 'w-full'} flex-col gap-6`}>
                <View style={tw`bg-white border border-gray-200 rounded-3xl p-5 shadow-sm`}>
                  <View style={tw`flex-row justify-between items-center mb-5 pb-3 border-b border-gray-100`}>
                    <Text style={tw`font-extrabold text-[#0f172a] text-sm uppercase tracking-wider`}>Actividad Reciente</Text>
                  </View>
                  <View style={tw`flex-col gap-5`}>
                    {recentActivities.map((act, idx) => (
                      <View key={idx} style={tw`flex-row gap-3.5 items-start`}>
                        <View style={tw`w-9 h-9 rounded-2xl items-center justify-center ${act.color}`}>
                          <Text style={tw`text-base`}>{act.icon}</Text>
                        </View>
                        <View style={tw`flex-1`}>
                          <Text style={tw`font-bold text-[#0f172a] text-sm`}>{act.title}</Text>
                          <Text style={tw`text-gray-500 text-xs mt-0.5 leading-relaxed`}>{act.desc}</Text>
                          <Text style={tw`text-gray-400 text-[10px] font-bold mt-1.5 uppercase`}>{act.time}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Quick Actions Panel */}
                <View style={tw`bg-white border border-gray-200 rounded-3xl p-5 shadow-sm`}>
                  <Text style={tw`font-extrabold text-[#0f172a] text-sm uppercase tracking-wider mb-4`}>Acciones Rápidas</Text>
                  <View style={tw`flex-col gap-3`}>
                    <TouchableOpacity style={tw`bg-slate-900 py-3 rounded-xl items-center`} onPress={() => setAlertModalVisible(true)}>
                      <Text style={tw`text-white font-bold text-xs uppercase tracking-wider`}>Enviar Alerta General</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </>
        ) : (
          /* SuperAdmin CRM View */
          <View style={tw`flex-col gap-6`}>
            {/* CRM KPIs */}
            <View style={tw`flex-row flex-wrap justify-between gap-4 mb-2`}>
              <View style={tw`bg-white border border-gray-100 p-5 rounded-2xl flex-1 min-w-[200px] shadow-sm`}>
                <Text style={tw`text-gray-400 text-xs font-bold uppercase tracking-wider mb-1`}>Sindicatos Afiliados</Text>
                <Text style={tw`text-3xl font-extrabold text-slate-900`}>{organizations.length}</Text>
              </View>
              <View style={tw`bg-white border border-gray-100 p-5 rounded-2xl flex-1 min-w-[200px] shadow-sm`}>
                <Text style={tw`text-gray-400 text-xs font-bold uppercase tracking-wider mb-1`}>Afiliados Totales (Choferes)</Text>
                <Text style={tw`text-3xl font-extrabold text-slate-900`}>
                  {Object.values(driverCountsByOrg).reduce((a, b) => a + b, 0)}
                </Text>
              </View>
              <View style={tw`bg-white border border-gray-100 p-5 rounded-2xl flex-1 min-w-[200px] shadow-sm`}>
                <Text style={tw`text-gray-400 text-xs font-bold uppercase tracking-wider mb-1`}>Ingresos Proyectados (Mes)</Text>
                <Text style={tw`text-3xl font-extrabold text-green-600`}>
                  Bs. {(Object.values(driverCountsByOrg).reduce((a, b) => a + b, 0) * 3 * 30).toLocaleString()}
                </Text>
              </View>
            </View>

            {/* List of Tenants (Sindicatos) */}
            <View style={tw`bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm`}>
              <View style={tw`px-6 py-4 border-b border-gray-100 bg-gray-50 flex-row justify-between items-center`}>
                <Text style={tw`font-extrabold text-slate-900 text-sm uppercase tracking-wider`}>CRM de Cuentas y Facturación</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={tw`min-w-full`}>
                  <View style={tw`flex-row bg-slate-50 px-5 py-3 border-b border-gray-200`}>
                    <Text style={tw`w-64 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Sindicato / Organización</Text>
                    <Text style={tw`w-24 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Afiliados</Text>
                    <Text style={tw`w-28 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Plan</Text>
                    <Text style={tw`w-28 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Cobro Semanal</Text>
                    <Text style={tw`w-28 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Cobro Mensual</Text>
                    <Text style={tw`w-24 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Estado</Text>
                    <Text style={tw`w-72 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Acciones</Text>
                  </View>

                  {organizations.map(org => {
                    const count = driverCountsByOrg[org.id] || 0;
                    return (
                      <View key={org.id} style={tw`flex-row px-5 py-4 border-b border-gray-50 items-center`}>
                        <View style={tw`w-64 flex-row items-center gap-3`}>
                          <TouchableOpacity onPress={() => handleUpdateBranding(org.id, 'logo')}>
                            {org.logo_url ? (
                              <Image source={{ uri: org.logo_url }} style={tw`w-8 h-8 rounded-lg`} />
                            ) : (
                              <View style={tw`w-8 h-8 bg-blue-100 rounded-lg items-center justify-center`}>
                                <Text style={tw`text-[10px]`}>📷</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={() => {
                              setSelectedImpersonatedOrg(org.id);
                              setActiveTab('monitor');
                            }}
                            style={tw`flex-1`}
                          >
                            <Text style={tw`font-bold text-blue-600 hover:text-blue-800 text-xs underline`} numberOfLines={1}>
                              {org.name}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={tw`w-24 text-xs font-semibold text-slate-600`}>{count} choferes</Text>
                        <Text style={tw`w-28 text-xs font-semibold text-slate-600 uppercase`}>{org.billing_plan || 'monthly'}</Text>
                        <Text style={tw`w-28 text-xs font-bold text-slate-800`}>Bs. {count * 3 * 7}</Text>
                        <Text style={tw`w-28 text-xs font-bold text-slate-800`}>Bs. {count * 3 * 30}</Text>
                        <View style={tw`w-24`}>
                          <View style={tw`self-start px-2 py-0.5 rounded-full ${org.billing_status === 'active' ? 'bg-green-50' : 'bg-red-50'}`}>
                            <Text style={tw`text-[9px] font-black uppercase ${org.billing_status === 'active' ? 'text-green-700' : 'text-red-700'}`}>
                              {org.billing_status === 'active' ? 'ACTIVO' : 'SUSPENDIDO'}
                            </Text>
                          </View>
                        </View>
                        <View style={tw`w-72 flex-row gap-2`}>
                          <TouchableOpacity 
                            onPress={() => {
                              setEditingOrg(org);
                              setEditPlan(org.billing_plan as any || 'monthly');
                              setEditStatus(org.billing_status as any || 'active');
                            }}
                            style={tw`bg-slate-900 px-3 py-1.5 rounded-xl`}
                          >
                            <Text style={tw`text-white font-extrabold text-[10px] uppercase tracking-wider`}>⚙️ Configurar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={() => handleUpdateBranding(org.id, 'banner')}
                            style={tw`border border-gray-200 bg-white px-3 py-1.5 rounded-xl`}
                          >
                            <Text style={tw`text-gray-700 font-extrabold text-[10px] uppercase tracking-wider`}>🖼️ Subir Banner</Text>
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

      {/* Modal para Enviar Alerta */}
      <Modal
        visible={alertModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAlertModalVisible(false)}
      >
        <View style={tw`flex-1 justify-center items-center bg-black/50 p-4`}>
          <View style={tw`bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl`}>
            <Text style={tw`text-lg font-black text-slate-900 mb-4`}>Enviar Alerta a Flota</Text>

            <Text style={tw`text-[10px] font-bold text-gray-400 uppercase mb-2 ml-1`}>Título de Alerta</Text>
            <TextInput
              style={tw`bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold mb-4`}
              placeholder="Ej. Desvío por bloqueo en Plaza Murillo"
              placeholderTextColor="#9ca3af"
              value={newAlertTitle}
              onChangeText={setNewAlertTitle}
            />

            <Text style={tw`text-[10px] font-bold text-gray-400 uppercase mb-2 ml-1`}>Mensaje</Text>
            <TextInput
              style={tw`bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold mb-4 h-24`}
              placeholder="Detalles sobre el desvío, retrasos estimados y desvíos aconsejados..."
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
              value={newAlertMessage}
              onChangeText={setNewAlertMessage}
            />

            <Text style={tw`text-[10px] font-bold text-gray-400 uppercase mb-2 ml-1`}>Gravedad / Nivel</Text>
            <View style={tw`flex-row gap-2 mb-6`}>
              {(['info', 'warning', 'critical'] as const).map(lvl => (
                <TouchableOpacity
                  key={lvl}
                  onPress={() => setNewAlertSeverity(lvl)}
                  style={tw`flex-1 py-2 border rounded-xl items-center ${
                    newAlertSeverity === lvl 
                      ? (lvl === 'critical' ? 'bg-red-500 border-red-500' : lvl === 'warning' ? 'bg-amber-500 border-amber-500' : 'bg-blue-500 border-blue-500') 
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <Text style={tw`text-[10px] font-black uppercase tracking-wider ${newAlertSeverity === lvl ? 'text-white' : 'text-gray-500'}`}>
                    {lvl === 'info' ? 'Informativa' : lvl === 'warning' ? 'Alerta' : 'Crítica'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={tw`flex-row gap-3`}>
              <TouchableOpacity 
                style={tw`flex-1 border border-gray-200 py-3.5 rounded-full items-center`} 
                onPress={() => setAlertModalVisible(false)}
              >
                <Text style={tw`text-slate-600 font-bold text-xs uppercase tracking-wider`}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={tw`flex-1 bg-[#0f172a] py-3.5 rounded-full items-center flex-row justify-center`} 
                onPress={handleSendAlert}
                disabled={sendingAlert}
              >
                {sendingAlert && <ActivityIndicator color="white" style={tw`mr-2`} size="small" />}
                <Text style={tw`text-white font-extrabold text-xs uppercase tracking-wider`}>Publicar Alerta</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal para Editar Configuración CRM */}
      <Modal
        visible={editingOrg !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingOrg(null)}
      >
        <View style={tw`flex-1 justify-center items-center bg-black/50 p-4`}>
          <View style={tw`bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl`}>
            <Text style={tw`text-lg font-black text-slate-900 mb-4`}>Facturación de Sindicato</Text>
            <Text style={tw`text-xs text-gray-500 mb-4`}>{editingOrg?.name}</Text>

            <Text style={tw`text-[10px] font-bold text-gray-400 uppercase mb-2 ml-1`}>Plan de Cobro</Text>
            <View style={tw`flex-row gap-2 mb-4`}>
              {(['weekly', 'monthly'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setEditPlan(p)}
                  style={tw`flex-1 py-2 border rounded-xl items-center ${editPlan === p ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
                >
                  <Text style={tw`text-xs font-bold uppercase ${editPlan === p ? 'text-white' : 'text-gray-500'}`}>
                    {p === 'weekly' ? 'Semanal' : 'Mensual'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={tw`text-[10px] font-bold text-gray-400 uppercase mb-2 ml-1`}>Estado de Cuenta</Text>
            <View style={tw`flex-row gap-2 mb-6`}>
              {(['active', 'suspended', 'trial'] as const).map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setEditStatus(s)}
                  style={tw`flex-1 py-2 border rounded-xl items-center ${editStatus === s ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-200'}`}
                >
                  <Text style={tw`text-xs font-bold uppercase ${editStatus === s ? 'text-white' : 'text-gray-500'}`}>
                    {s === 'active' ? 'Activo' : s === 'suspended' ? 'Suspendido' : 'Prueba'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={tw`flex-row gap-3`}>
              <TouchableOpacity 
                style={tw`flex-1 border border-gray-200 py-3.5 rounded-full items-center`} 
                onPress={() => setEditingOrg(null)}
              >
                <Text style={tw`text-slate-600 font-bold text-xs uppercase tracking-wider`}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={tw`flex-1 bg-[#0f172a] py-3.5 rounded-full items-center flex-row justify-center`} 
                onPress={handleSaveCrmSettings}
                disabled={savingCrm}
              >
                {savingCrm && <ActivityIndicator color="white" style={tw`mr-2`} size="small" />}
                <Text style={tw`text-white font-extrabold text-xs uppercase tracking-wider`}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
