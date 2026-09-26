import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import tw from 'twrnc';
import { supabase, Route } from '../../services/supabase';
import LiveMapWeb from '../../components/LiveMapWeb';
import { useStore } from '../../hooks/useStore';

export default function RoutesManagementScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Zustand State
  const { refreshTrigger, selectedImpersonatedOrg } = useStore();

  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All'); // All, MICROBUS, MINIBUS, Trufis

  // Sindicato Filter States
  const [role, setRole] = useState<'admin' | 'superadmin'>('admin');
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(selectedImpersonatedOrg || 'All');
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);

  useEffect(() => {
    if (selectedImpersonatedOrg) {
      setSelectedOrgId(selectedImpersonatedOrg);
    } else {
      setSelectedOrgId('All');
    }
  }, [selectedImpersonatedOrg]);

  const fallbackRoutes: Route[] = [
    { id: '1', line_code: '201', name: 'Villa Fátima - Calacoto', start_point: 'Villa Fátima', end_point: 'Calacoto', vehicle_type: 'MICROBUS' },
    { id: '2', line_code: '212', name: 'El Alto (Ceja) - San Pedro', start_point: 'El Alto (Ceja)', end_point: 'San Pedro', vehicle_type: 'MINIBUS' },
    { id: '3', line_code: '300', name: 'Achumani - Irpavi II', start_point: 'Achumani', end_point: 'Irpavi II', vehicle_type: 'TRUFI' },
    { id: '4', line_code: '158', name: 'Mallasa - Center', start_point: 'Mallasa', end_point: 'Center', vehicle_type: 'MINIBUS' },
  ];

  const fetchRoutes = async () => {
    setLoading(true);
    let userRole = 'admin';
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
      userRole = adminProfile?.role || 'admin';

      // Fallback/Override manual para números de prueba
      if (phone.endsWith('72845621')) {
        userRole = 'superadmin';
      } else if (phone.endsWith('72845620')) {
        userRole = 'admin';
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

      setRole(userRole as any);

      if (userRole === 'superadmin') {
        const { data: orgsData } = await supabase
          .from('organizations')
          .select('id, name')
          .order('name');
        if (orgsData) {
          setOrganizations(orgsData);
        }
      }

      let query = supabase.from('routes').select('*');
      if (userRole !== 'superadmin') {
        if (orgId) {
          query = query.eq('organization_id', orgId);
        } else {
          setRoutes([]);
          setLoading(false);
          return;
        }
      } else {
        // Para superadmin, si hay un sindicato seleccionado en el dropdown, filtrar por él
        if (selectedOrgId && selectedOrgId !== 'All') {
          query = query.eq('organization_id', selectedOrgId);
        }
      }

      const { data, error } = await query.order('line_code', { ascending: true });
      
      if (error) throw error;
      if (data && data.length > 0) {
        setRoutes(data as Route[]);
      } else {
        // Enlazar fallback solo para superadmin como demo si la DB está vacía
        if (userRole === 'superadmin') {
          setRoutes(fallbackRoutes);
        } else {
          setRoutes([]);
        }
      }
    } catch (e) {
      console.warn('Error fetching routes:', e);
      if (userRole === 'superadmin') {
        setRoutes(fallbackRoutes);
      } else {
        setRoutes([]);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRoutes();
  }, [refreshTrigger, selectedImpersonatedOrg, selectedOrgId]);

  // Filter routes based on search query and category tab
  const filteredRoutes = routes.filter(r => {
    const matchesSearch = 
      r.line_code.toLowerCase().includes(search.toLowerCase()) ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.start_point.toLowerCase().includes(search.toLowerCase()) ||
      r.end_point.toLowerCase().includes(search.toLowerCase());

    const matchesType = 
      filterType === 'All' || 
      (filterType === 'Micro' && (r.vehicle_type === 'MICROBUS' || r.vehicle_type === 'MICRO')) ||
      (filterType === 'Minibus' && r.vehicle_type === 'MINIBUS') ||
      (filterType === 'Trufis' && r.vehicle_type === 'TRUFI');

    return matchesSearch && matchesType;
  });

  // KPIs translated to Spanish
  const kpis = [
    { title: 'Rutas Totales', value: `${routes.length} Activas`, icon: '🛤️', color: 'text-blue-600', border: 'border-gray-100' },
    { title: 'Flota Asignada', value: '584 Unidades', icon: '🚌', color: 'text-green-600', border: 'border-gray-100' },
    { title: 'Frecuencia Promedio', value: '6.5 min', icon: '⏱️', color: 'text-amber-600', border: 'border-gray-100' },
    { title: 'Incidentes de Tránsito', value: '3 Alertas', icon: '⚠️', color: 'text-red-600', border: 'border-red-100 bg-red-50/20' },
  ];

  const types = ['All', 'Micro', 'Minibus', 'Trufis'];
  const typeLabels: Record<string, string> = {
    'All': 'Todas las Rutas',
    'Micro': 'Micros',
    'Minibus': 'Minibuses',
    'Trufis': 'Trufis'
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-[#f8fafc]`}>
      {/* Top Header Bar */}
      <View style={tw`bg-white border-b border-gray-200 px-6 py-4 flex-row justify-between items-center z-10 shadow-sm`}>
        <View>
          <Text style={tw`text-xs font-bold text-gray-400 uppercase tracking-widest`}>La Paz Transit Admin</Text>
          <Text style={tw`text-2xl font-black text-[#0f172a] tracking-tight`}>Gestión de Rutas</Text>
          <Text style={tw`text-xs text-gray-400 font-medium mt-0.5`}>Configura y monitorea todas las líneas de transporte metropolitano y sus frecuencias.</Text>
        </View>
        {isDesktop && (
          <TouchableOpacity 
            onPress={() => alert('Nueva ruta...')}
            style={tw`bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-xl flex-row items-center gap-2 shadow-md shadow-blue-900/10`}
          >
            <Text style={tw`text-white font-bold text-xs uppercase tracking-wider`}>➕ Agregar Nueva Ruta</Text>
          </TouchableOpacity>
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
              </View>
              <View style={tw`bg-slate-50 p-3 rounded-xl`}>
                <Text style={tw`text-xl ${kpi.color}`}>{kpi.icon}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Filters and Search */}
        <View style={tw`bg-white border border-gray-200 rounded-3xl p-5 mb-6 shadow-sm flex-col md:flex-row gap-4 items-center justify-between z-20`}>
          <View style={tw`flex-row gap-2 flex-wrap`}>
            {types.map((type) => {
              const isSel = filterType === type;
              return (
                <TouchableOpacity
                  key={type}
                  onPress={() => setFilterType(type)}
                  style={tw`${isSel ? 'bg-blue-600' : 'bg-slate-100'} px-4 py-2 rounded-full`}
                >
                  <Text style={tw`${isSel ? 'text-white' : 'text-slate-600'} font-bold text-xs`}>
                    {typeLabels[type]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={tw`flex-col md:flex-row gap-3 w-full md:w-auto items-stretch md:items-center`}>
            {role === 'superadmin' && (
              <View style={tw`relative w-full md:w-64`}>
                <TouchableOpacity
                  onPress={() => setShowOrgDropdown(!showOrgDropdown)}
                  style={tw`bg-slate-50 border border-gray-200 flex-row justify-between items-center rounded-xl px-4 py-2.5`}
                >
                  <Text style={tw`text-gray-800 text-xs font-semibold`} numberOfLines={1}>
                    🏢 {selectedOrgId === 'All' ? 'Todos los Sindicatos' : organizations.find(o => o.id === selectedOrgId)?.name || 'Todos los Sindicatos'}
                  </Text>
                  <Text style={tw`text-gray-400 text-xs`}>{showOrgDropdown ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {showOrgDropdown && (
                  <View style={tw`absolute top-11 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-60 overflow-scroll`}>
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedOrgId('All');
                        setShowOrgDropdown(false);
                      }}
                      style={tw`px-4 py-2.5 border-b border-gray-100 hover:bg-slate-50`}
                    >
                      <Text style={tw`text-xs font-bold text-slate-700`}>Todos los Sindicatos</Text>
                    </TouchableOpacity>
                    {organizations.map(org => (
                      <TouchableOpacity
                        key={org.id}
                        onPress={() => {
                          setSelectedOrgId(org.id);
                          setShowOrgDropdown(false);
                        }}
                        style={tw`px-4 py-2.5 border-b border-gray-50 hover:bg-slate-50`}
                      >
                        <Text style={tw`text-xs font-semibold text-gray-700`} numberOfLines={1}>
                          {org.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View style={tw`w-full md:w-72 bg-slate-50 border border-gray-200 flex-row items-center rounded-xl px-4 py-2.5`}>
              <Text style={tw`text-gray-400 mr-2 text-sm`}>🔍</Text>
              <TextInput
                style={tw`flex-1 text-gray-800 text-xs font-semibold`}
                placeholder="Buscar por línea o destino..."
                placeholderTextColor="#9ca3af"
                value={search}
                onChangeText={setSearch}
              />
            </View>
          </View>
        </View>

        {/* Live Network Coverage Map - Full Width / Panoramic */}
        <View style={tw`bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm mb-6 z-10`}>
          <View style={tw`px-5 py-4 border-b border-gray-100 flex-row items-center gap-2 bg-[#f8fafc]`}>
            <Text style={tw`text-base`}>🗺️</Text>
            <Text style={tw`font-extrabold text-[#0f172a] text-sm uppercase tracking-wider`}>Cobertura de Red en Vivo</Text>
          </View>
          <View style={tw`w-full ${isDesktop ? 'h-[500px]' : 'h-80'} bg-gray-100`}>
            <LiveMapWeb 
              centerLat={-16.5000}
              centerLng={-68.1193}
              markers={[]}
            />
          </View>
        </View>

        {/* Routes Table & Insights Split */}
        <View style={tw`flex-col ${isDesktop ? 'flex-row' : 'flex-col'} gap-6`}>
          {/* Routes Table */}
          <View style={tw`flex-1 bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm`}>
            {loading ? (
              <ActivityIndicator color="#2563eb" size="large" style={tw`p-10`} />
            ) : filteredRoutes.length === 0 ? (
              <View style={tw`p-10 items-center justify-center`}>
                <Text style={tw`text-gray-400 text-sm font-semibold`}>Ninguna ruta coincide con la búsqueda.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={tw`min-w-full`}>
                  <View style={tw`flex-row bg-[#f8fafc] px-5 py-3.5 border-b border-gray-200`}>
                    <Text style={tw`w-48 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Nombre de Ruta</Text>
                    <Text style={tw`w-64 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Origen - Destino</Text>
                    <Text style={tw`w-28 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Unidades</Text>
                    <Text style={tw`w-28 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Frecuencia</Text>
                    <Text style={tw`w-28 text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Estado</Text>
                  </View>

                  {filteredRoutes.map((r, idx) => (
                    <View key={r.id} style={tw`flex-row px-5 py-4 border-b border-gray-50 items-center`}>
                      <View style={tw`w-48`}>
                        <View style={tw`flex-row items-center gap-2`}>
                          <View style={tw`bg-blue-600 px-2 py-0.5 rounded`}>
                            <Text style={tw`text-white font-extrabold text-[9px]`}>Línea {r.line_code}</Text>
                          </View>
                          <Text style={tw`text-[10px] text-gray-400 font-bold uppercase tracking-wider`}>
                            {r.vehicle_type || 'Minibus'}
                          </Text>
                        </View>
                      </View>
                      <Text style={tw`w-64 font-bold text-[#0f172a] text-sm`}>
                        {r.name || `${r.start_point} - ${r.end_point}`}
                      </Text>
                      <Text style={tw`w-28 text-xs text-gray-500 font-semibold`}>
                        {idx === 0 ? '24' : idx === 1 ? '45' : idx === 2 ? '12' : '30'} Unidades
                      </Text>
                      <Text style={tw`w-28 text-xs text-gray-500 font-semibold`}>
                        {idx === 0 ? '5' : idx === 1 ? '3' : idx === 2 ? '12' : '8'} min
                      </Text>
                      <View style={tw`w-28`}>
                        <View style={tw`self-start px-2.5 py-0.5 rounded-full ${idx === 2 ? 'bg-slate-100' : 'bg-green-50'}`}>
                          <Text style={tw`text-[9px] font-black uppercase tracking-widest ${idx === 2 ? 'text-slate-500' : 'text-green-700'}`}>
                            {idx === 2 ? 'Inactiva' : 'Activa'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          {/* Route Insights Card (Right Side) */}
          <View style={tw`w-full ${isDesktop ? 'w-80' : 'w-full'} bg-white border border-gray-200 rounded-3xl p-5 shadow-sm`}>
            <Text style={tw`font-extrabold text-[#0f172a] text-sm uppercase tracking-wider mb-5 pb-2 border-b border-gray-100`}>
              Análisis de Tráfico
            </Text>
            
            {/* Insights Metrics Bars */}
            <View style={tw`flex-col gap-4 mb-6`}>
              <View>
                <View style={tw`flex-row justify-between mb-1.5`}>
                  <Text style={tw`text-xs text-gray-500 font-bold uppercase`}>Índice de Congestión</Text>
                  <Text style={tw`text-xs font-extrabold text-red-600`}>Alto (82%)</Text>
                </View>
                <View style={tw`w-full bg-slate-100 h-2 rounded-full overflow-hidden`}>
                  <View style={tw`bg-red-500 h-full w-[82%] rounded-full`} />
                </View>
              </View>

              <View>
                <View style={tw`flex-row justify-between mb-1.5`}>
                  <Text style={tw`text-xs text-gray-500 font-bold uppercase`}>Puntualidad General</Text>
                  <Text style={tw`text-xs font-extrabold text-green-600`}>Buena (94%)</Text>
                </View>
                <View style={tw`w-full bg-slate-100 h-2 rounded-full overflow-hidden`}>
                  <View style={tw`bg-green-500 h-full w-[94%] rounded-full`} />
                </View>
              </View>

              <View>
                <View style={tw`flex-row justify-between mb-1.5`}>
                  <Text style={tw`text-xs text-gray-500 font-bold uppercase`}>Disponibilidad de Flota</Text>
                  <Text style={tw`text-xs font-extrabold text-blue-600`}>Óptima (88%)</Text>
                </View>
                <View style={tw`w-full bg-slate-100 h-2 rounded-full overflow-hidden`}>
                  <View style={tw`bg-blue-600 h-full w-[88%] rounded-full`} />
                </View>
              </View>
            </View>

            {/* Generate Analytics Button */}
            <TouchableOpacity 
              onPress={() => alert('Generando reporte completo...')}
              style={tw`border border-gray-200 bg-white hover:bg-slate-50 px-4 py-3 rounded-xl items-center`}
            >
              <Text style={tw`text-[#0f172a] font-bold text-xs uppercase tracking-wider`}>Generar Analíticas de Ruta</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
