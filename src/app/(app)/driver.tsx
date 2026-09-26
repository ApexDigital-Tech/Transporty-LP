import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import tw from 'twrnc';
import { useLocation, Coords } from '../../hooks/useLocation';
import { supabase, Route } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';
import LiveMapWeb from '../../components/LiveMapWeb';
import { useStore } from '../../hooks/useStore';

interface DriverInfo {
  id: string;
  phone: string;
  name: string;
  placa: string;
  organization_id: string;
  propietario: string;
  numero_afiliacion: string | null;
  is_profile_complete: boolean;
  status: 'active' | 'inactive' | 'offline';
  foto_url?: string;
  organization?: {
    name: string;
  } | null;
}

export default function DriverScreen() {
  const router = useRouter();
  const { coords, errorMsg, startTracking, stopTracking } = useLocation();
  const wakeLockRef = React.useRef<any>(null);

  // Zustand Store
  const {
    isTracking,
    setDriverTracking,
    setDriverStatus,
    startDriverTracking,
    updateDriverLocation,
    stopDriverTrackingAndCleanup
  } = useStore();

  const requestWakeLock = async () => {
    try {
      if (typeof window !== 'undefined' && 'wakeLock' in navigator) {
        wakeLockRef.current = await (navigator.wakeLock as any).request('screen');
        console.log('Screen Wake Lock acquired');
      }
    } catch (err) {
      console.warn('Failed to acquire screen wake lock:', err);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('Screen Wake Lock released');
      }
    } catch (err) {
      console.warn('Failed to release screen wake lock:', err);
    }
  };

  useEffect(() => {
    return () => {
      releaseWakeLock();
    };
  }, []);
  
  // Local state
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showRoutePicker, setShowRoutePicker] = useState<boolean>(false);
  const [routeSearchQuery, setRouteSearchQuery] = useState<string>('');
  const [isMapExpanded, setIsMapExpanded] = useState<boolean>(false);
  
  // Payments States
  const [accumulatedEarnings, setAccumulatedEarnings] = useState(450.00);
  const [newPaymentAlert, setNewPaymentAlert] = useState<{ amount: number; phone: string } | null>(null);

  // Driver Session Details
  const { session, signOut } = useAuth();
  const driverId = session?.id || 'mock-id'; 
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);

  useEffect(() => {
    if (driverId !== 'mock-id') {
      supabase
        .from('drivers')
        .select('*, organization:organizations(name)')
        .eq('id', driverId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching driver profile:', error.message);
            return;
          }
          if (data) {
            if (!data.is_profile_complete) {
              router.replace('/(app)/driver-setup');
            } else {
              setDriverInfo(data as DriverInfo);
              // Sincronizar estado inicial en Zustand con el perfil de la DB
              setDriverStatus(data.status);
              setDriverTracking(data.status === 'active');
            }
          } else {
            // Record doesn't exist, force them to setup
            router.replace('/(app)/driver-setup');
          }
        });
    }
  }, [driverId, router]);

  // Subscribe to QR Payments for the current driver in real-time
  useEffect(() => {
    if (driverId === 'mock-id') return;

    console.log('Chofer: Suscribiendo a cobros QR en tiempo real para driver_id:', driverId);
    const channel = supabase
      .channel(`driver-payments-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qr_payments',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          const { eventType, new: newRecord } = payload;
          if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord.status === 'completed') {
            triggerPaymentBanner(parseFloat(newRecord.amount || '0'), newRecord.passenger_phone);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId]);

  const triggerPaymentBanner = (amount: number, phone: string) => {
    setNewPaymentAlert({ amount, phone });
    setAccumulatedEarnings((prev) => prev + amount);
    
    // Auto clear banner after 5 seconds
    setTimeout(() => {
      setNewPaymentAlert(null);
    }, 5000);
  };

  // Stats
  const routesCompleted = 8;
  const hoursActive = '6h 30m';

  // Fallback mock routes in case Supabase table is empty
  const fallbackRoutes: Route[] = [
    { id: 'b2049e7b-f9f6-4ef3-b4cd-3c3f9154a37a', line_code: '201', name: 'Pérez Velasco - Chasquipampa', start_point: 'Pérez Velasco', end_point: 'Chasquipampa' },
    { id: 'a3487c6b-d8e2-45e1-a3f2-1b2c456df98a', line_code: '284', name: 'San Francisco - El Alto', start_point: 'Plaza San Francisco', end_point: 'Ceja El Alto' },
    { id: 'c5364b4c-e7c1-48d2-c5e3-4c5b657e891c', line_code: '2', name: 'Plaza Murillo - Obrajes', start_point: 'Plaza Murillo', end_point: 'Obrajes' },
  ];

  // Fetch routes from Supabase during mount
  useEffect(() => {
    async function loadRoutes() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('routes')
          .select('*')
          .order('line_code', { ascending: true });
        
        if (error) throw error;
        if (data && data.length > 0) {
          setRoutes(data);
          setSelectedRoute(data[0]); // Select first by default
        } else {
          setRoutes(fallbackRoutes);
          setSelectedRoute(fallbackRoutes[0]);
        }
      } catch (err) {
        const error = err as Error;
        console.warn('Usando rutas de prueba debido a un error en Supabase:', error.message);
        setRoutes(fallbackRoutes);
        setSelectedRoute(fallbackRoutes[0]);
      } finally {
        setLoading(false);
      }
    }
    loadRoutes();
  }, []);

  // Sync update with Supabase whenever location updates
  const handleLocationUpdate = async (newCoords: Coords) => {
    if (!selectedRoute) return;
    await updateDriverLocation(driverId, selectedRoute.id, newCoords.latitude, newCoords.longitude);
  };

  const toggleTurnType = async () => {
    if (!selectedRoute) {
      Alert.alert('Atención', 'Por favor selecciona una ruta primero.');
      return;
    }

    if (isTracking) {
      stopTracking();
      await releaseWakeLock();
      await stopDriverTrackingAndCleanup(driverId);
      Alert.alert('Turno Terminado', 'La transmisión de GPS se ha detenido correctamente.');
    } else {
      // Start real-time GPS stream
      await requestWakeLock();
      await startTracking(handleLocationUpdate);
      await startDriverTracking(driverId, selectedRoute.id);
      Alert.alert(
        'Turno Activo',
        `Compartiendo ubicación en tiempo real para la Línea ${selectedRoute.line_code} - ${selectedRoute.name}`
      );
    }
  };

  const handleLogout = async () => {
    try {
      if (isTracking) {
        stopTracking();
        await releaseWakeLock();
      }
      await stopDriverTrackingAndCleanup(driverId);
    } catch (e) {
      console.error('Error durante el cierre de sesión:', e);
    } finally {
      await signOut();
    }
  };
  const filteredRoutes = routes.filter(r => 
    r.line_code.toLowerCase().includes(routeSearchQuery.toLowerCase()) ||
    r.name.toLowerCase().includes(routeSearchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      {/* Real-time Payment Notification Banner */}
      {newPaymentAlert && (
        <View style={tw`absolute top-20 left-4 right-4 bg-[#00327d] border border-blue-400 p-4 rounded-2xl flex-row items-center gap-3.5 z-50 shadow-lg`}>
          <View style={tw`w-10 h-10 rounded-full bg-[#32cd32] items-center justify-center`}>
            <Text style={tw`text-white font-bold text-base`}>✓</Text>
          </View>
          <View style={tw`flex-1`}>
            <Text style={tw`text-[10px] font-black text-[#32cd32] uppercase tracking-widest`}>
              Pago QR Simpli Recibido
            </Text>
            <Text style={tw`text-white font-black text-sm mt-0.5`}>
              Monto: Bs. {newPaymentAlert.amount.toFixed(2)}
            </Text>
            <Text style={tw`text-blue-200 text-[10px] mt-0.5`}>
              Celular: +591 {newPaymentAlert.phone}
            </Text>
          </View>
        </View>
      )}

      {/* Top Header - Premium Minimalist */}
      <View style={tw`bg-white px-5 py-4 flex-row items-center justify-between border-b border-gray-100 shadow-sm`}>
        <View>
          <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-widest`}>La Paz Transit</Text>
          <Text style={tw`text-base font-extrabold text-[#00327d] tracking-tight`}>Panel del Conductor</Text>
        </View>
        <TouchableOpacity 
          onPress={handleLogout}
          style={tw`px-4 py-2 rounded-full border border-gray-200 bg-gray-50`}
        >
          <Text style={tw`text-gray-600 font-bold text-xs uppercase tracking-wider`}>Salir</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={tw`flex-1 p-4`} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Driver Profile Card */}
        <View style={tw`bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-4`}>
          <View style={tw`flex-row items-center justify-between`}>
            <View style={tw`flex-row items-center gap-3.5`}>
              <View style={tw`w-12 h-12 rounded-2xl bg-blue-50 items-center justify-center border border-blue-100`}>
                <Text style={tw`text-lg font-black text-[#00327d]`}>
                  {driverInfo?.name?.substring(0, 2).toUpperCase() || 'CH'}
                </Text>
              </View>
              <View style={tw`flex-1 pr-2`}>
                <Text style={tw`text-gray-900 font-black text-base`} numberOfLines={1}>
                  {driverInfo?.name || 'Cargando...'}
                </Text>
                <Text style={tw`text-gray-400 text-xs font-semibold mt-0.5`} numberOfLines={1}>
                  Placa {driverInfo?.placa || '...'} • {driverInfo?.organization?.name || 'Sindicato'}
                </Text>
              </View>
            </View>
            <View style={[
              tw`px-3 py-1.5 rounded-full flex-row items-center gap-1.5`,
              isTracking ? tw`bg-green-50` : tw`bg-gray-100`
            ]}>
              <View style={[tw`w-2 h-2 rounded-full`, isTracking ? tw`bg-[#32cd32]` : tw`bg-gray-400`]} />
              <Text style={[
                tw`text-[10px] font-black uppercase tracking-widest`,
                isTracking ? tw`text-green-700` : tw`text-gray-500`
              ]}>
                {isTracking ? 'En Ruta' : 'Inactivo'}
              </Text>
            </View>
          </View>
          
          <View style={tw`mt-5 pt-4 border-t border-gray-50 flex-row justify-between items-center`}>
            <View>
              <Text style={tw`text-gray-400 text-[10px] font-bold uppercase tracking-wider`}>Nivel de Conductor</Text>
              <Text style={tw`text-gray-700 text-xs font-bold mt-1`}>Plata • 9 pts para bono</Text>
            </View>
            <View style={tw`w-28 bg-gray-100 rounded-full h-2 overflow-hidden`}>
              <View style={[tw`bg-[#00327d] h-full rounded-full`, { width: '70%' }]} />
            </View>
          </View>
        </View>

        {/* Route Selector Card - Collapsible Searchable */}
        <View style={tw`bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-4`}>
          <Text style={tw`text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-3`}>1. Ruta de Operación</Text>
          
          {loading ? (
            <ActivityIndicator color="#00327d" size="small" style={tw`py-4`} />
          ) : selectedRoute && !showRoutePicker ? (
            <TouchableOpacity
              onPress={() => !isTracking && setShowRoutePicker(true)}
              disabled={isTracking}
              style={[
                tw`flex-row items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100`,
                isTracking && tw`opacity-80`
              ]}
            >
              <View style={tw`flex-1 pr-3`}>
                <View style={tw`flex-row items-center gap-2 mb-1.5`}>
                  <View style={tw`bg-[#00327d] px-2 py-0.5 rounded`}>
                    <Text style={tw`text-white text-[10px] font-black uppercase`}>Línea {selectedRoute.line_code}</Text>
                  </View>
                  <Text style={tw`text-gray-800 font-extrabold text-sm`} numberOfLines={1}>{selectedRoute.name}</Text>
                </View>
                <Text style={tw`text-gray-500 text-xs`} numberOfLines={1}>
                  {selectedRoute.start_point} ➔ {selectedRoute.end_point}
                </Text>
              </View>
              {!isTracking && (
                <Text style={tw`text-[#00327d] text-xs font-black uppercase tracking-wider`}>Cambiar</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View>
              <View style={tw`flex-row items-center border border-gray-200 rounded-xl px-3.5 bg-gray-50 mb-3`}>
                <Text style={tw`text-gray-400 mr-2 text-sm`}>🔍</Text>
                <TextInput
                  placeholder="Buscar línea o destino..."
                  placeholderTextColor="#9ca3af"
                  style={tw`flex-1 py-3 text-sm text-gray-900 font-semibold`}
                  value={routeSearchQuery}
                  onChangeText={setRouteSearchQuery}
                  autoFocus
                />
                {routeSearchQuery !== '' && (
                  <TouchableOpacity onPress={() => setRouteSearchQuery('')}>
                    <Text style={tw`text-gray-400 font-bold text-xs px-2`}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView style={tw`max-h-60`} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {filteredRoutes.map((route) => {
                  const isCurrent = selectedRoute?.id === route.id;
                  return (
                    <TouchableOpacity
                      key={route.id}
                      onPress={() => {
                        setSelectedRoute(route);
                        setShowRoutePicker(false);
                        setRouteSearchQuery('');
                      }}
                      style={[
                        tw`p-3 border-b border-gray-50 flex-row items-center justify-between`,
                        isCurrent && tw`bg-blue-50/50`
                      ]}
                    >
                      <View style={tw`flex-1 pr-3`}>
                        <Text style={tw`text-[#00327d] text-[10px] font-black uppercase tracking-wider mb-1`}>
                          Línea {route.line_code}
                        </Text>
                        <Text style={tw`text-gray-800 font-bold text-sm`} numberOfLines={1}>{route.name}</Text>
                        <Text style={tw`text-gray-400 text-xs mt-0.5`} numberOfLines={1}>{route.start_point} ➔ {route.end_point}</Text>
                      </View>
                      {isCurrent && <Text style={tw`text-[#00327d] font-bold text-sm`}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
                {filteredRoutes.length === 0 && (
                  <View style={tw`py-6 items-center`}>
                    <Text style={tw`text-gray-400 text-xs font-semibold`}>No se encontraron rutas</Text>
                  </View>
                )}
              </ScrollView>
              
              {selectedRoute && (
                <TouchableOpacity 
                  onPress={() => {
                    setShowRoutePicker(false);
                    setRouteSearchQuery('');
                  }}
                  style={tw`mt-3 py-2 items-center`}
                >
                  <Text style={tw`text-gray-400 text-xs font-bold uppercase tracking-wider`}>Cancelar</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {isTracking && (
            <Text style={tw`text-[10px] text-amber-600 font-bold mt-2.5 text-center uppercase tracking-wider`}>
              * Finaliza el turno para poder cambiar de ruta
            </Text>
          )}
        </View>

        {/* Live GPS Control Card */}
        <View style={tw`bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-4`}>
          <View style={tw`flex-row justify-between items-center mb-3`}>
            <Text style={tw`text-gray-400 text-[10px] font-bold uppercase tracking-wider`}>
              2. Transmisión GPS en Vivo
            </Text>
            {coords && (
              <TouchableOpacity 
                onPress={() => setIsMapExpanded(!isMapExpanded)}
                style={tw`bg-blue-50 px-3.5 py-1.5 rounded-lg border border-blue-100`}
              >
                <Text style={tw`text-[#00327d] text-[10px] font-extrabold uppercase tracking-wider`}>
                  {isMapExpanded ? '↙ Reducir Mapa' : '↗ Expandir Mapa'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={tw`text-gray-500 text-xs leading-relaxed mb-4`}>
            Al iniciar el turno, tu posición GPS se compartirá en tiempo real con los pasajeros suscritos en el mapa.
          </Text>

          {coords && (
            <View style={tw`bg-gray-50 rounded-xl p-3 border border-gray-100 flex-row justify-around mb-4`}>
              <View style={tw`items-center`}>
                <Text style={tw`text-gray-400 text-[9px] uppercase font-bold tracking-wider`}>Latitud</Text>
                <Text style={tw`text-gray-800 font-black text-xs mt-0.5`}>
                  {coords.latitude.toFixed(6)}
                </Text>
              </View>
              <View style={tw`items-center`}>
                <Text style={tw`text-gray-400 text-[9px] uppercase font-bold tracking-wider`}>Longitud</Text>
                <Text style={tw`text-gray-800 font-black text-xs mt-0.5`}>
                  {coords.longitude.toFixed(6)}
                </Text>
              </View>
              <View style={tw`items-center`}>
                <Text style={tw`text-gray-400 text-[9px] uppercase font-bold tracking-wider`}>Velocidad</Text>
                <Text style={tw`text-gray-800 font-black text-xs mt-0.5`}>
                  {coords.speed !== null ? `${Math.round((coords.speed || 0) * 3.6)} km/h` : '0 km/h'}
                </Text>
              </View>
            </View>
          )}

          {/* Interactive Web Map */}
          {coords && (
            <View style={[
              tw`w-full mb-4 rounded-xl overflow-hidden border border-gray-200 shadow-sm`,
              { height: isMapExpanded ? 480 : 280 }
            ]}>
              <LiveMapWeb 
                centerLat={coords.latitude} 
                centerLng={coords.longitude} 
                zoom={16}
                markers={[{
                  id: driverId,
                  lat: coords.latitude,
                  lng: coords.longitude,
                  title: 'Mi Ubicación Actual',
                  isDriver: true
                }]} 
              />
            </View>
          )}

          {errorMsg && (
            <Text style={tw`text-red-500 text-xs font-bold mb-3.5 text-center uppercase tracking-wider`}>
              ⚠ {errorMsg}
            </Text>
          )}

          <TouchableOpacity
            onPress={toggleTurnType}
            style={[
              tw`w-full py-4 rounded-full items-center flex-row justify-center shadow-md`,
              isTracking ? tw`bg-red-500 shadow-red-100` : tw`bg-[#00327d] shadow-blue-100`
            ]}
          >
            <View style={[tw`w-2.5 h-2.5 rounded-full mr-2`, isTracking ? tw`bg-white` : tw`bg-green-400`]} />
            <Text style={tw`text-white font-extrabold text-sm uppercase tracking-widest`}>
              {isTracking ? 'Finalizar Turno' : 'Iniciar Turno'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Turn Performance Metrics */}
        <View style={tw`bg-white rounded-2xl p-5 border border-gray-100 shadow-sm`}>
          <Text style={tw`text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-3.5`}>Resumen de Rendimiento</Text>
          <View style={tw`flex-row gap-3 justify-between`}>
            <View style={tw`bg-gray-50 rounded-xl p-3 items-center flex-1 mx-0.5 border border-gray-100`}>
              <Text style={tw`text-gray-400 text-[9px] uppercase font-bold tracking-wider text-center`}>Vueltas</Text>
              <Text style={tw`text-gray-900 text-base font-black mt-1`}>{routesCompleted}</Text>
            </View>
            <View style={tw`bg-gray-50 rounded-xl p-3 items-center flex-1 mx-0.5 border border-gray-100`}>
              <Text style={tw`text-gray-400 text-[9px] uppercase font-bold tracking-wider text-center`}>Activo</Text>
              <Text style={tw`text-gray-900 text-base font-black mt-1`}>{hoursActive}</Text>
            </View>
            <View style={tw`bg-green-50/50 rounded-xl p-3 items-center flex-1 mx-0.5 border border-green-100`}>
              <Text style={tw`text-[#006e0a] text-[9px] uppercase font-bold tracking-wider text-center`}>Ganado</Text>
              <Text style={tw`text-green-800 text-base font-black mt-1`}>{accumulatedEarnings.toFixed(2)} BOB</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
