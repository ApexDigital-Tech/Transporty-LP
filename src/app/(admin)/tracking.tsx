import React, { useState, useEffect } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import tw from 'twrnc';
import { supabase, LiveLocation } from '../../services/supabase';
import LiveMapWeb from '../../components/LiveMapWeb';
import { useStore } from '../../hooks/useStore';

export default function FleetTrackingScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const { liveLocations, fetchInitialLocations, subscribeToLocations, unsubscribeFromLocations, refreshTrigger, selectedImpersonatedOrg } = useStore();
  const [driverInfoDict, setDriverInfoDict] = useState<Record<string, {name: string; placa: string}>>({});

  useEffect(() => {
    async function initTracking() {
      // 0. Obtener usuario autenticado y su teléfono
      const { data: { user } } = await supabase.auth.getUser();
      const phone = user?.phone || '';

      const { data: adminProfile } = await supabase
        .from('admin_profiles')
        .select('organization_id, role')
        .maybeSingle();

      let orgId = adminProfile?.organization_id || null;
      let role = adminProfile?.role || 'admin';

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

      const activeOrgId = role === 'superadmin' ? (selectedImpersonatedOrg || undefined) : orgId;
      if (role !== 'superadmin' && !orgId) {
        setDriverInfoDict({});
        return;
      }

      // 2. Cargar choferes correspondientes a la organización
      let driversQuery = supabase.from('drivers').select('id, name, placa');
      if (activeOrgId) {
        driversQuery = driversQuery.eq('organization_id', activeOrgId);
      }
      const { data: driversData } = await driversQuery;
      
      if (driversData) {
        const dict: Record<string, {name: string; placa: string}> = {};
        driversData.forEach(d => {
          dict[d.id] = { name: d.name || 'Chofer', placa: d.placa || 'S/P' };
        });
        setDriverInfoDict(dict);
      }

      // 3. Conectar al Zustand store para cargar posiciones y suscribirse
      await fetchInitialLocations(undefined, activeOrgId);
      subscribeToLocations(undefined, activeOrgId);
    }

    initTracking();

    return () => {
      unsubscribeFromLocations();
    };
  }, [refreshTrigger, selectedImpersonatedOrg]);

  // Mock static active units translated to Spanish
  const mockUnits = [
    { id: 'u1', unit: 'Móvil PK-102', line: 'Línea: PumaKatari Verde', speed: '34 km/h', nextStop: 'Plaza Abaroa', status: 'A TIEMPO', statusColor: 'bg-green-100 text-green-700 border-green-200', isAlert: false },
    { id: 'u2', unit: 'Móvil WB-409', line: 'Línea: Wayna Bus Azul', speed: '12 km/h', nextStop: 'Terminal El Alto', status: '+4 MIN', statusColor: 'bg-amber-100 text-amber-700 border-amber-200', isAlert: false },
    { id: 'u3', unit: 'Móvil TF-332', line: 'Línea: Teleférico Rojo', speed: 'Estacionario', nextStop: 'Falla de geocerca', status: 'FUERA DE RUTA', statusColor: 'bg-red-100 text-red-700 border-red-200', isAlert: true }
  ];

  return (
    <SafeAreaView style={tw`flex-1 bg-[#1e293b] flex-row`}>
      {/* Main Map View (Left Side) */}
      <View style={tw`flex-1 relative`}>
        <View style={tw`absolute inset-0 bg-[#0f172a]`}>
          <LiveMapWeb 
            centerLat={-16.5000}
            centerLng={-68.1193}
            markers={liveLocations.map((loc: any) => ({
              id: loc.driver_id,
              lat: loc.latitude,
              lng: loc.longitude,
              title: `Unidad: ${driverInfoDict[loc.driver_id]?.placa || 'Minibús'} ${loc.is_off_route ? '⚠️ (DESVIADO)' : ''}`,
              isDriver: true,
              isOffRoute: loc.is_off_route
            }))}
          />
        </View>

        {/* Map Control Overlays */}
        <View style={tw`absolute bottom-6 left-6 flex-col gap-3 z-20`}>
          <TouchableOpacity style={tw`bg-white w-10 h-10 rounded-full items-center justify-center shadow-lg`}>
            <Text style={tw`text-lg font-bold`}>🎯</Text>
          </TouchableOpacity>
          <TouchableOpacity style={tw`bg-white w-10 h-10 rounded-full items-center justify-center shadow-lg`}>
            <Text style={tw`text-lg font-bold`}>🗺️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={tw`bg-blue-600 w-10 h-10 rounded-full items-center justify-center shadow-lg`}>
            <Text style={tw`text-white text-lg font-bold`}>▶️</Text>
          </TouchableOpacity>
        </View>

        {/* Status Indicators overlay (Bottom-Left) */}
        <View style={tw`absolute bottom-6 right-6 bg-white/90 border border-gray-200 rounded-2xl p-3 z-20 flex-row gap-4 shadow-md`}>
          <View style={tw`flex-row items-center gap-1.5`}>
            <View style={tw`w-2 h-2 rounded-full bg-green-500`} />
            <Text style={tw`text-[10px] font-bold text-slate-800 uppercase`}>A Tiempo (42)</Text>
          </View>
          <View style={tw`flex-row items-center gap-1.5`}>
            <View style={tw`w-2 h-2 rounded-full bg-amber-500`} />
            <Text style={tw`text-[10px] font-bold text-slate-800 uppercase`}>Con Retraso (8)</Text>
          </View>
          <View style={tw`flex-row items-center gap-1.5`}>
            <View style={tw`w-2 h-2 rounded-full bg-red-500`} />
            <Text style={tw`text-[10px] font-bold text-slate-800 uppercase`}>Fuera de Ruta (3)</Text>
          </View>
        </View>
      </View>

      {/* Sidebar Active Units (Right Side) */}
      {isDesktop && (
        <View style={tw`w-80 bg-[#f8fafc] border-l border-gray-200 flex-col justify-between h-full`}>
          <View style={tw`flex-1`}>
            {/* Header */}
            <View style={tw`p-5 border-b border-gray-200 bg-white`}>
              <Text style={tw`text-lg font-black text-slate-900`}>Unidades Activas</Text>
              <Text style={tw`text-xs text-gray-400 font-semibold mt-0.5`}>
                {liveLocations.length > 0 ? `${liveLocations.length} unidades transmitiendo` : 'No hay unidades transmitiendo'}
              </Text>
            </View>

            {/* Units list */}
            <ScrollView style={tw`flex-1 p-4`} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* If no live locations exist, show the gorgeous mockup cards */}
              {liveLocations.length === 0 ? (
                <View style={tw`flex-col gap-4`}>
                  {mockUnits.map((item) => (
                    <View key={item.id} style={tw`bg-white border border-gray-200 rounded-2xl p-4 shadow-sm`}>
                      <View style={tw`flex-row justify-between items-center mb-2`}>
                        <Text style={tw`font-extrabold text-slate-900 text-sm`}>{item.unit}</Text>
                        <View style={tw`px-2 py-0.5 border rounded-md ${item.statusColor}`}>
                          <Text style={tw`text-[8px] font-black uppercase tracking-wider`}>{item.status}</Text>
                        </View>
                      </View>
                      <Text style={tw`text-xs text-gray-500 font-semibold`}>{item.line}</Text>
                      
                      {item.isAlert ? (
                        <View style={tw`bg-red-50/50 border border-red-100 rounded-xl p-2.5 my-3`}>
                          <Text style={tw`text-[9px] font-black text-red-700 uppercase tracking-widest`}>Alerta</Text>
                          <Text style={tw`text-[10px] text-red-600 font-bold mt-0.5`}>{item.nextStop} • Estacionario</Text>
                        </View>
                      ) : (
                        <View style={tw`flex-row justify-between my-3`}>
                          <View>
                            <Text style={tw`text-[9px] font-bold text-gray-400 uppercase tracking-wider`}>Velocidad</Text>
                            <Text style={tw`text-xs font-black text-slate-800 mt-0.5`}>{item.speed}</Text>
                          </View>
                          <View style={tw`items-end`}>
                            <Text style={tw`text-[9px] font-bold text-gray-400 uppercase tracking-wider`}>Sig. Parada</Text>
                            <Text style={tw`text-xs font-black text-slate-800 mt-0.5`}>{item.nextStop}</Text>
                          </View>
                        </View>
                      )}

                      <View style={tw`flex-row gap-2`}>
                        {item.isAlert ? (
                          <>
                            <TouchableOpacity style={tw`flex-1 border border-red-500 py-2 rounded-xl items-center`}>
                              <Text style={tw`text-red-500 font-black text-[10px] uppercase tracking-wider`}>⚠️ Alertar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={tw`flex-1 border border-gray-200 py-2 rounded-xl items-center`}>
                              <Text style={tw`text-slate-600 font-black text-[10px] uppercase tracking-wider`}>Ubicar</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <TouchableOpacity style={tw`flex-1 bg-blue-600 py-2 rounded-xl items-center shadow-md shadow-blue-900/10`}>
                              <Text style={tw`text-white font-black text-[10px] uppercase tracking-wider`}>📞 Llamar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={tw`flex-1 border border-gray-200 py-2 rounded-xl items-center`}>
                              <Text style={tw`text-slate-600 font-black text-[10px] uppercase tracking-wider`}>Detalles</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                /* Dynamic items from database */
                <View style={tw`flex-col gap-4`}>
                  {liveLocations.map((loc: any) => {
                    const info = driverInfoDict[loc.driver_id] || { name: 'Chofer', placa: 'S/P' };
                    const isOffRoute = loc.is_off_route || false;
                    return (
                      <View key={loc.driver_id} style={tw`bg-white border ${isOffRoute ? 'border-red-200 bg-red-50/10' : 'border-gray-200'} rounded-2xl p-4 shadow-sm`}>
                        <View style={tw`flex-row justify-between items-center mb-2`}>
                          <Text style={tw`font-extrabold text-slate-900 text-sm`}>Unidad {info.placa}</Text>
                          <View style={tw`px-2 py-0.5 border ${isOffRoute ? 'border-red-200 bg-red-100' : 'border-green-200 bg-green-50'} rounded-md`}>
                            <Text style={tw`text-[8px] font-black uppercase tracking-wider ${isOffRoute ? 'text-red-700' : 'text-green-700'}`}>
                              {isOffRoute ? '⚠️ TRAMEAJE' : 'A TIEMPO'}
                            </Text>
                          </View>
                        </View>
                        <Text style={tw`text-xs text-gray-500 font-semibold`}>Línea {loc.route_id?.substring(0, 5).toUpperCase() || 'S/R'} ({info.name})</Text>
                        
                        {isOffRoute ? (
                          <View style={tw`bg-red-50/50 border border-red-100 rounded-xl p-2.5 my-3`}>
                            <Text style={tw`text-[9px] font-black text-red-700 uppercase tracking-widest`}>Alerta de Desvío</Text>
                            <Text style={tw`text-[10px] text-red-600 font-bold mt-0.5`}>Desviado +{loc.distance_from_path?.toFixed(0)} metros de su ruta asignada.</Text>
                          </View>
                        ) : (
                          <View style={tw`flex-row justify-between my-3`}>
                            <View>
                              <Text style={tw`text-[9px] font-bold text-gray-400 uppercase tracking-wider`}>Velocidad</Text>
                              <Text style={tw`text-xs font-black text-slate-800 mt-0.5`}>32 km/h</Text>
                            </View>
                            <View style={tw`items-end`}>
                              <Text style={tw`text-[9px] font-bold text-gray-400 uppercase tracking-wider`}>Coordenadas</Text>
                              <Text style={tw`text-xs font-black text-slate-800 mt-0.5`}>{loc.latitude?.toFixed(3)}, {loc.longitude?.toFixed(3)}</Text>
                            </View>
                          </View>
                        )}

                        <View style={tw`flex-row gap-2`}>
                          <TouchableOpacity style={tw`flex-1 ${isOffRoute ? 'bg-red-600' : 'bg-blue-600'} py-2 rounded-xl items-center`} onPress={() => alert(`Llamando al chofer: ${info.name}`)}>
                            <Text style={tw`text-white font-black text-[10px] uppercase tracking-wider`}>📞 Llamar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={tw`flex-1 border border-gray-200 py-2 rounded-xl items-center`}>
                            <Text style={tw`text-slate-600 font-black text-[10px] uppercase tracking-wider`}>Detalles</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>

          {/* System Health Status Footer */}
          <View style={tw`p-5 border-t border-gray-200 bg-white flex-row justify-between items-center`}>
            <Text style={tw`text-xs text-gray-400 font-bold uppercase`}>Estado del Sistema</Text>
            <View style={tw`flex-row items-center gap-1.5`}>
              <View style={tw`w-2.5 h-2.5 rounded-full bg-green-500`} />
              <Text style={tw`text-[10px] font-black text-green-700 uppercase tracking-widest`}>OPERATIVO</Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
