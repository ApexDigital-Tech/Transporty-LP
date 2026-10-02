import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions, Modal, Image } from 'react-native';
import tw from 'twrnc';
import { supabase, Driver } from '../../services/supabase';
import { useStore } from '../../hooks/useStore';

type JoinedDriver = Driver & {
  organization?: {
    name: string;
  } | null;
  license_status?: string;
  rating?: number;
  shift?: string;
  zone?: string;
};

export default function DriverManagementScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Zustand State
  const { refreshTrigger, selectedImpersonatedOrg } = useStore();

  const [drivers, setDrivers] = useState<JoinedDriver[]>([]);
  const [filteredDrivers, setFilteredDrivers] = useState<JoinedDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('Directory'); // Directory, Fleet
  const [statusFilter, setStatusFilter] = useState('All'); // All, On Shift, Off Duty
  const [selectedDriver, setSelectedDriver] = useState<JoinedDriver | null>(null); // All, On Shift, Off Duty

  const fallbackDrivers: JoinedDriver[] = [
    { id: 'd1', name: 'Alejandro Mamani', phone: '70612345', placa: 'LP-8821', status: 'active', organization_id: 'org1', organization: { name: 'Sindicato Simón Bolívar' }, license_status: 'VALIDA (CAT. C)', rating: 4.9, shift: '06:00 - 14:00', zone: 'Zona Sur (Línea 12)' },
    { id: 'd2', name: 'Sofia Quispe', phone: '71567890', placa: 'LP-5542', status: 'inactive', organization_id: 'org2', organization: { name: 'Sindicato San Cristóbal' }, license_status: 'VALIDA (CAT. C)', rating: 4.7, shift: 'Descanso', zone: 'Centro (Línea 3)' },
    { id: 'd3', name: 'Roberto Condori', phone: '72233445', placa: 'LP-1190', status: 'active', organization_id: 'org3', organization: { name: 'Sindicato Litoral' }, license_status: 'POR VENCER (12D)', rating: 4.8, shift: '14:00 - 22:00', zone: 'El Alto (Línea 45)' }
  ];

  const fetchDrivers = async () => {
    setLoading(true);
    let role = 'admin';
    let orgId: string | null = null;
    try {
      // 0. Obtener usuario autenticado y su teléfono
      const { data: { user } } = await supabase.auth.getUser();
      const phone = user?.phone || '';

      const { data: adminProfile } = await supabase
        .from('admin_profiles')
        .select('organization_id, role')
        .maybeSingle();

      orgId = adminProfile?.organization_id || null;
      role = adminProfile?.role || 'admin';

      // Fallback/Override manual para números de prueba
      if (phone.endsWith('72845621') || phone.endsWith('78756107')) {
        role = 'superadmin';
        orgId = selectedImpersonatedOrg || null;
      } else if (phone.endsWith('72845620')) {
        role = 'admin';
        if (!orgId) {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('id')
            .eq('name', 'SINDICATO 14 DE SEPTIEMBRE')
            .limit(1)
            .maybeSingle();
          if (orgData) {
            orgId = orgData.id;
          }
        }
      }

      let query = supabase
        .from('drivers')
        .select('*, organization:organizations(name)')
        .eq('is_profile_complete', true);

      if (role !== 'superadmin') {
        if (orgId) {
          query = query.eq('organization_id', orgId);
        } else {
          setDrivers([]);
          setLoading(false);
          return;
        }
      } else {
        // Para superadmin, si hay un sindicato seleccionado por impersonación, filtrar por él
        if (orgId) {
          query = query.eq('organization_id', orgId);
        }
      }

      const { data, error } = await query.order('name', { ascending: true });
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        // Enlazar datos realistas para los campos extra no existentes en el MVP base
        const mapped: JoinedDriver[] = (data as any[]).map((d, index) => ({
          ...d,
          license_status: index % 3 === 2 ? 'POR VENCER (12D)' : 'VALIDA (CAT. C)',
          rating: 4.5 + (index % 5) * 0.1,
          shift: d.status === 'active' 
             ? (index % 2 === 0 ? '06:00 - 14:00' : '14:00 - 22:00') 
             : 'Descanso',
          zone: d.status === 'active' 
             ? `Zona Sur (Línea ${index + 1})`
             : 'Centro (Inactivo)'
        }));
        setDrivers(mapped);
      } else {
        setDrivers([]);
      }
    } catch (e) {
      console.warn('Error fetching drivers:', e);
      setDrivers([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDrivers();
  }, [refreshTrigger, selectedImpersonatedOrg]);

  useEffect(() => {
    let result = drivers;

    // Search query
    if (search.trim() !== '') {
      const q = search.toLowerCase();
      result = result.filter(d => 
        (d.name && d.name.toLowerCase().includes(q)) || 
        (d.placa && d.placa.toLowerCase().includes(q)) ||
        (d.organization?.name && d.organization.name.toLowerCase().includes(q))
      );
    }

    // Status Filter
    if (statusFilter === 'On Shift') {
      result = result.filter(d => d.status === 'active');
    } else if (statusFilter === 'Off Duty') {
      result = result.filter(d => d.status !== 'active');
    }

    setFilteredDrivers(result);
  }, [search, drivers, statusFilter]);

  // KPIs translated to Spanish
  const kpis = [
    { title: 'Choferes Activos', value: '142', change: '📈 +12% desde ayer', border: 'border-gray-100', color: 'text-blue-600' },
    { title: 'Flota en Línea', value: '98%', change: '✅ Operación estable', border: 'border-gray-100', color: 'text-green-600' },
    { title: 'Calificación Chofer', value: '4.8/5', change: '⭐ Nivel de satisfacción alto', border: 'border-gray-100', color: 'text-amber-600' },
    { title: 'En Mantenimiento', value: '4', change: '⚠️ Requiere acción', border: 'border-red-100 bg-red-50/10', color: 'text-red-600' },
  ];

  return (
    <SafeAreaView style={tw`flex-1 bg-[#f8fafc]`}>
      {/* Top Header Bar */}
      <View style={tw`bg-white border-b border-gray-200 px-6 py-4 flex-row justify-between items-center z-10 shadow-sm`}>
        <View style={tw`flex-1 pr-4`}>
          <Text style={tw`text-xs font-bold text-gray-400 uppercase tracking-widest`}>La Paz Transit Admin</Text>
          <Text style={tw`text-2xl font-black text-[#0f172a] tracking-tight`}>Gestión de Choferes</Text>
          <Text style={tw`text-xs text-gray-400 font-medium mt-0.5`} numberOfLines={1}>
            Monitorea el estado del personal y la logística de vehículos en el transporte metropolitano.
          </Text>
        </View>
        
        {isDesktop && (
          <View style={tw`flex-row gap-3`}>
            <TouchableOpacity 
              onPress={() => alert('Exportando a CSV...')}
              style={tw`border border-gray-200 bg-white hover:bg-slate-50 px-4 py-2.5 rounded-xl flex-row items-center gap-2`}
            >
              <Text style={tw`text-slate-700 font-bold text-xs uppercase tracking-wider`}>📤 Exportar CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => alert('Agregar entrada...')}
              style={tw`bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-xl flex-row items-center gap-2 shadow-md shadow-blue-900/10`}
            >
              <Text style={tw`text-white font-bold text-xs uppercase tracking-wider`}>➕ Agregar Registro</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView style={tw`flex-1 p-6`} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* KPI Cards */}
        <View style={tw`flex-row flex-wrap justify-between gap-4 mb-6`}>
          {kpis.map((kpi, idx) => (
            <View 
              key={idx} 
              style={tw`bg-white border ${kpi.border} p-5 rounded-2xl flex-1 min-w-[200px] shadow-sm flex-row items-center justify-between`}
            >
              <View>
                <Text style={tw`text-gray-400 text-xs font-bold uppercase tracking-wider mb-1`}>{kpi.title}</Text>
                <Text style={tw`text-2xl font-black text-[#0f172a]`}>{kpi.value}</Text>
                <Text style={tw`text-[10px] font-semibold mt-1 text-gray-400`}>{kpi.change}</Text>
              </View>
              <View style={tw`bg-slate-50 p-3 rounded-xl`}>
                <Text style={tw`text-xl ${kpi.color}`}>{idx === 0 ? '👥' : idx === 1 ? '🚌' : idx === 2 ? '⭐' : '🔧'}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Directory/Fleet Subtabs */}
        <View style={tw`flex-row border-b border-gray-200 mb-6 gap-6`}>
          {['Directory', 'Fleet'].map((tab) => {
            const isSel = activeSubTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveSubTab(tab)}
                style={tw`pb-3 border-b-2 ${isSel ? 'border-blue-600' : 'border-transparent'} px-1`}
              >
                <Text style={tw`font-extrabold text-sm ${isSel ? 'text-blue-600' : 'text-gray-400'}`}>
                  {tab === 'Directory' ? 'Directorio de Choferes' : 'Flota de Vehículos'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Filters and Search Bar */}
        <View style={tw`bg-white border border-gray-200 rounded-3xl p-5 mb-6 shadow-sm flex-col md:flex-row gap-4 items-center justify-between`}>
          <View style={tw`flex-row gap-2 flex-wrap`}>
            {[
              { id: 'All', label: 'Todos' },
              { id: 'On Shift', label: 'En Turno' },
              { id: 'Off Duty', label: 'Inactivos' }
            ].map((f) => {
              const isSel = statusFilter === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => setStatusFilter(f.id)}
                  style={tw`${isSel ? 'bg-blue-600' : 'bg-slate-100'} px-4 py-2 rounded-full`}
                >
                  <Text style={tw`${isSel ? 'text-white' : 'text-slate-600'} font-bold text-xs`}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={tw`w-full md:w-80 bg-slate-50 border border-gray-200 flex-row items-center rounded-xl px-4 py-2.5`}>
            <Text style={tw`text-gray-400 mr-2 text-sm`}>🔍</Text>
            <TextInput
              style={tw`flex-1 text-gray-800 text-xs font-semibold`}
              placeholder="Buscar por Nombre, Placa o Sindicato..."
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>

        {/* Drivers Directory Tab Content */}
        {activeSubTab === 'Directory' ? (
          <View style={tw`bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm`}>
            {loading ? (
              <ActivityIndicator color="#2563eb" size="large" style={tw`p-10`} />
            ) : filteredDrivers.length === 0 ? (
              <View style={tw`p-10 items-center justify-center`}>
                <Text style={tw`text-gray-400 text-sm font-semibold`}>No se encontraron choferes registrados.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={tw`min-w-full`}>
                  {/* Table Header */}
                  <View style={tw`flex-row bg-[#f8fafc] px-5 py-3.5 border-b border-gray-200`}>
                    <Text style={tw`w-52 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Perfil del Chofer</Text>
                    <Text style={tw`w-40 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Estado de Licencia</Text>
                    <Text style={tw`w-24 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Calificación</Text>
                    <Text style={tw`w-36 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Horario de Turno</Text>
                    <Text style={tw`w-48 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Zona de Operación</Text>
                  </View>

                  {/* Table Rows */}
                  {filteredDrivers.map((driver) => {
                    const isExp = driver.license_status?.includes('VENCER');
                    return (
                      <TouchableOpacity 
                        key={driver.id} 
                        style={tw`flex-row px-5 py-4 border-b border-gray-50 items-center`}
                        onPress={() => setSelectedDriver(driver)}
                      >
                        {/* Driver Profile */}
                        <View style={tw`w-52 flex-row items-center gap-3`}>
                          <View style={tw`w-9 h-9 rounded-full bg-blue-50 items-center justify-center overflow-hidden`}>
                            {driver.foto_url ? (
                              <Image source={{ uri: driver.foto_url }} style={tw`w-full h-full`} />
                            ) : (
                              <Text style={tw`text-[#2563eb] text-sm font-extrabold`}>
                                {driver.name ? driver.name.substring(0, 2).toUpperCase() : 'CH'}
                              </Text>
                            )}
                          </View>
                          <View>
                            <Text style={tw`font-bold text-[#0f172a] text-sm`}>{driver.name}</Text>
                            <Text style={tw`text-[10px] text-gray-400 font-semibold`}>ID: {driver.id.substring(0, 8)} • Placa: {driver.placa}</Text>
                          </View>
                        </View>

                        {/* License Status */}
                        <View style={tw`w-40`}>
                          <View style={tw`self-start px-2.5 py-0.5 rounded-md ${isExp ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
                            <Text style={tw`text-[9px] font-black tracking-wider ${isExp ? 'text-amber-700' : 'text-green-700'}`}>
                              {driver.license_status}
                            </Text>
                          </View>
                        </View>

                        {/* Rating */}
                        <Text style={tw`w-24 text-xs font-bold text-[#0f172a]`}>⭐ {driver.rating?.toFixed(1)}</Text>

                        {/* Current Shift */}
                        <View style={tw`w-36 flex-row items-center gap-2`}>
                          <View style={tw`w-1.5 h-1.5 rounded-full ${driver.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                          <Text style={tw`text-xs text-gray-600 font-semibold`}>{driver.shift}</Text>
                        </View>

                        {/* Zone */}
                        <Text style={tw`w-48 text-xs text-gray-500 font-bold`} numberOfLines={1}>
                          {driver.zone}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        ) : (
          /* Vehicle Fleet Tab Content */
          <View style={tw`bg-white border border-gray-200 rounded-3xl p-8 items-center justify-center shadow-sm`}>
            <Text style={tw`text-2xl mb-2`}>🚛</Text>
            <Text style={tw`text-gray-900 font-extrabold text-base`}>Gestión de Flota de Vehículos</Text>
            <Text style={tw`text-gray-400 text-xs text-center mt-1 max-w-sm`}>
              Visualización de vehículos, inspecciones técnicas de placas y alertas de emisiones.
            </Text>
          </View>
        )}

      </ScrollView>

      {/* Modal de Detalle de Chofer y Adjuntos */}
      <Modal
        visible={selectedDriver !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedDriver(null)}
      >
        <View style={tw`flex-1 justify-center items-center bg-black/50 p-4`}>
          <View style={tw`bg-white rounded-3xl w-full max-w-2xl max-h-[90%] overflow-hidden shadow-2xl`}>
            {/* Modal Header */}
            <View style={tw`flex-row justify-between items-center px-6 py-4 border-b border-gray-100 bg-[#f8fafc]`}>
              <View>
                <Text style={tw`text-xs font-bold text-gray-400 uppercase tracking-widest`}>Ficha de Chofer</Text>
                <Text style={tw`text-lg font-black text-[#0f172a]`}>{selectedDriver?.name}</Text>
              </View>
              <TouchableOpacity 
                onPress={() => setSelectedDriver(null)}
                style={tw`bg-gray-100 p-2.5 rounded-full`}
              >
                <Text style={tw`font-extrabold text-gray-600 text-xs`}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Modal Content */}
            <ScrollView contentContainerStyle={tw`p-6`}>
              {/* Info General */}
              <View style={tw`flex-row flex-wrap gap-4 mb-6 border-b border-gray-100 pb-6`}>
                <View style={tw`flex-1 min-w-[200px]`}>
                  <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1`}>Sindicato / Cooperativa</Text>
                  <Text style={tw`text-sm font-bold text-gray-800`}>{selectedDriver?.organization?.name || 'No asignado'}</Text>
                </View>
                <View style={tw`w-32`}>
                  <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1`}>Placa</Text>
                  <Text style={tw`text-sm font-bold text-gray-800`}>{selectedDriver?.placa}</Text>
                </View>
                <View style={tw`w-32`}>
                  <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1`}>Nº Afiliación</Text>
                  <Text style={tw`text-sm font-bold text-gray-800`}>{selectedDriver?.numero_afiliacion || 'N/A'}</Text>
                </View>
                <View style={tw`w-32`}>
                  <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1`}>Teléfono</Text>
                  <Text style={tw`text-sm font-bold text-gray-800`}>{selectedDriver?.phone}</Text>
                </View>
                <View style={tw`w-32`}>
                  <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1`}>Propietario</Text>
                  <Text style={tw`text-sm font-bold text-gray-800`}>{selectedDriver?.propietario || 'El mismo'}</Text>
                </View>
              </View>

              {/* Grid de Imágenes Adjuntas */}
              <Text style={tw`text-sm font-bold text-gray-800 mb-4`}>Fotos y Documentación Sindicada</Text>
              
              <View style={tw`flex-row flex-wrap gap-4`}>
                {/* Foto Perfil */}
                <View style={tw`flex-1 min-w-[240px] bg-slate-50 border border-gray-100 p-4 rounded-2xl items-center`}>
                  <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3`}>Foto de Perfil</Text>
                  <View style={tw`w-24 h-24 rounded-full bg-slate-200 justify-center items-center overflow-hidden mb-2`}>
                    {selectedDriver?.foto_url ? (
                      <Image source={{ uri: selectedDriver.foto_url }} style={tw`w-full h-full`} resizeMode="cover" />
                    ) : (
                      <Text style={tw`text-4xl`}>👤</Text>
                    )}
                  </View>
                  {!selectedDriver?.foto_url && (
                    <Text style={tw`text-[10px] text-gray-400 font-semibold`}>Sin foto cargada</Text>
                  )}
                </View>

                {/* Foto Vehículo */}
                <View style={tw`flex-1 min-w-[240px] bg-slate-50 border border-gray-100 p-4 rounded-2xl items-center`}>
                  <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3`}>Foto del Vehículo</Text>
                  <View style={tw`w-full h-24 bg-slate-200 rounded-xl justify-center items-center overflow-hidden mb-2`}>
                    {selectedDriver?.foto_vehiculo_url ? (
                      <Image source={{ uri: selectedDriver.foto_vehiculo_url }} style={tw`w-full h-full`} resizeMode="cover" />
                    ) : (
                      <Text style={tw`text-3xl`}>🚗</Text>
                    )}
                  </View>
                  {!selectedDriver?.foto_vehiculo_url && (
                    <Text style={tw`text-[10px] text-gray-400 font-semibold`}>Sin foto del vehículo</Text>
                  )}
                </View>

                {/* Licencia de Conducir */}
                <View style={tw`flex-1 min-w-[240px] bg-slate-50 border border-gray-100 p-4 rounded-2xl items-center`}>
                  <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3`}>Licencia de Conducir</Text>
                  <View style={tw`w-full h-32 bg-slate-200 rounded-xl justify-center items-center overflow-hidden mb-2`}>
                    {selectedDriver?.documentacion_urls?.license ? (
                      <Image source={{ uri: selectedDriver.documentacion_urls.license }} style={tw`w-full h-full`} resizeMode="contain" />
                    ) : (
                      <Text style={tw`text-3xl`}>🪪</Text>
                    )}
                  </View>
                  {!selectedDriver?.documentacion_urls?.license && (
                    <Text style={tw`text-[10px] text-gray-400 font-semibold`}>Licencia no cargada</Text>
                  )}
                </View>

                {/* SOAT */}
                <View style={tw`flex-1 min-w-[240px] bg-slate-50 border border-gray-100 p-4 rounded-2xl items-center`}>
                  <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3`}>SOAT Vigente</Text>
                  <View style={tw`w-full h-32 bg-slate-200 rounded-xl justify-center items-center overflow-hidden mb-2`}>
                    {selectedDriver?.documentacion_urls?.soat ? (
                      <Image source={{ uri: selectedDriver.documentacion_urls.soat }} style={tw`w-full h-full`} resizeMode="contain" />
                    ) : (
                      <Text style={tw`text-3xl`}>📄</Text>
                    )}
                  </View>
                  {!selectedDriver?.documentacion_urls?.soat && (
                    <Text style={tw`text-[10px] text-gray-400 font-semibold`}>SOAT no cargado</Text>
                  )}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
