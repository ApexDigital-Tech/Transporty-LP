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
import { useTheme } from '../../theme';

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
  const { theme, isDark } = useTheme();
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
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
      {/* Real-time Payment Notification Banner */}
      {newPaymentAlert && (
        <View style={[
          tw`absolute top-20 left-4 right-4 p-4 rounded-2xl flex-row items-center gap-3.5 z-50`,
          {
            backgroundColor: isDark ? '#0F2A0F' : '#F0FDF4',
            borderWidth: 1,
            borderColor: isDark ? '#22C55E40' : '#86EFAC',
            shadowColor: '#22C55E',
            shadowOpacity: 0.2,
            shadowRadius: 12,
            elevation: 8,
          }
        ]}>
          <View style={[
            tw`w-10 h-10 rounded-full items-center justify-center`,
            { backgroundColor: '#22C55E20' }
          ]}>
            <Text style={{ color: '#22C55E', fontSize: 18 }}>✓</Text>
          </View>
          <View style={tw`flex-1`}>
            <Text style={[tw`text-[10px] font-black uppercase tracking-widest`, { color: theme.statusActive }]}>
              Pago QR Recibido
            </Text>
            <Text style={[tw`font-black text-sm mt-0.5`, { color: theme.text }]}>
              Bs. {newPaymentAlert.amount.toFixed(2)}
            </Text>
            <Text style={[tw`text-[10px] mt-0.5`, { color: theme.textMuted }]}>
              +591 {newPaymentAlert.phone}
            </Text>
          </View>
        </View>
      )}

      {/* Top Header */}
      <View style={[
        tw`px-5 py-4 flex-row items-center justify-between`,
        {
          backgroundColor: theme.headerBg,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        }
      ]}>
        <View>
          <Text style={[tw`text-[10px] font-bold uppercase tracking-widest`, { color: theme.textSubtle }]}>
            Transporty OS
          </Text>
          <Text style={[tw`text-base font-extrabold tracking-tight`, { color: theme.text }]}>
            Cabina del Conductor
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleLogout}
          style={[
            tw`px-4 py-2 rounded-full`,
            { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }
          ]}
        >
          <Text style={[tw`font-bold text-xs uppercase tracking-wider`, { color: theme.textMuted }]}>Salir</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={[tw`p-4`, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Driver Profile Card */}
        <View style={[
          tw`rounded-2xl p-5 mb-4`,
          { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }
        ]}>
          <View style={tw`flex-row items-center justify-between`}>
            <View style={tw`flex-row items-center gap-3.5`}>
              {/* Avatar */}
              <View style={[
                tw`w-12 h-12 rounded-2xl items-center justify-center`,
                { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent + '30' }
              ]}>
                <Text style={[tw`text-lg font-black`, { color: theme.accent }]}>
                  {driverInfo?.name?.substring(0, 2).toUpperCase() || 'CH'}
                </Text>
              </View>
              <View style={tw`flex-1 pr-2`}>
                <Text style={[tw`font-black text-base`, { color: theme.text }]} numberOfLines={1}>
                  {driverInfo?.name || 'Cargando...'}
                </Text>
                <Text style={[tw`text-xs font-semibold mt-0.5`, { color: theme.textMuted }]} numberOfLines={1}>
                  Placa {driverInfo?.placa || '—'} • {driverInfo?.organization?.name || 'Sindicato'}
                </Text>
              </View>
            </View>
            {/* Status Badge */}
            <View style={[
              tw`px-3 py-1.5 rounded-full flex-row items-center gap-1.5`,
              {
                backgroundColor: isTracking
                  ? (isDark ? '#22C55E18' : '#F0FDF4')
                  : (isDark ? theme.cardElevated : theme.cardElevated),
                borderWidth: 1,
                borderColor: isTracking ? '#22C55E40' : theme.border,
              }
            ]}>
              <View style={[
                tw`w-2 h-2 rounded-full`,
                { backgroundColor: isTracking ? theme.statusActive : theme.statusInactive }
              ]} />
              <Text style={[
                tw`text-[10px] font-black uppercase tracking-widest`,
                { color: isTracking ? theme.statusActive : theme.textMuted }
              ]}>
                {isTracking ? 'En Ruta' : 'Inactivo'}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={[tw`mt-5 pt-4 flex-row justify-between items-center`, { borderTopWidth: 1, borderTopColor: theme.border }]}>
            <View>
              <Text style={[tw`text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Nivel de Conductor</Text>
              <Text style={[tw`text-xs font-bold mt-1`, { color: theme.textMuted }]}>Plata • 9 pts para bono</Text>
            </View>
            <View style={[tw`w-28 rounded-full h-2 overflow-hidden`, { backgroundColor: theme.cardElevated }]}>
              <View style={[tw`h-full rounded-full`, { width: '70%', backgroundColor: theme.accent }]} />
            </View>
          </View>
        </View>

        {/* Route Selector Card */}
        <View style={[
          tw`rounded-2xl p-5 mb-4`,
          { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }
        ]}>
          <Text style={[tw`text-[10px] font-bold uppercase tracking-wider mb-3`, { color: theme.textSubtle }]}>
            1. Ruta de Operación
          </Text>

          {loading ? (
            <ActivityIndicator color={theme.accent} size="small" style={tw`py-4`} />
          ) : selectedRoute && !showRoutePicker ? (
            <TouchableOpacity
              onPress={() => !isTracking && setShowRoutePicker(true)}
              disabled={isTracking}
              style={[
                tw`flex-row items-center justify-between p-4 rounded-xl`,
                {
                  backgroundColor: theme.cardElevated,
                  borderWidth: 1,
                  borderColor: theme.border,
                  opacity: isTracking ? 0.8 : 1,
                }
              ]}
            >
              <View style={tw`flex-1 pr-3`}>
                <View style={tw`flex-row items-center gap-2 mb-1.5`}>
                  <View style={[tw`px-2 py-0.5 rounded`, { backgroundColor: theme.accent }]}>
                    <Text style={tw`text-white text-[10px] font-black uppercase`}>Línea {selectedRoute.line_code}</Text>
                  </View>
                  <Text style={[tw`font-extrabold text-sm`, { color: theme.text }]} numberOfLines={1}>
                    {selectedRoute.name}
                  </Text>
                </View>
                <Text style={[tw`text-xs`, { color: theme.textMuted }]} numberOfLines={1}>
                  {selectedRoute.start_point} ➔ {selectedRoute.end_point}
                </Text>
              </View>
              {!isTracking && (
                <Text style={[tw`text-xs font-black uppercase tracking-wider`, { color: theme.accent }]}>Cambiar</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View>
              <View style={[
                tw`flex-row items-center rounded-xl px-3.5 mb-3`,
                { backgroundColor: theme.cardElevated, borderWidth: 1, borderColor: theme.border }
              ]}>
                <Text style={[tw`mr-2 text-sm`, { color: theme.textSubtle }]}>🔍</Text>
                <TextInput
                  placeholder="Buscar línea o destino..."
                  placeholderTextColor={theme.textSubtle}
                  style={[tw`flex-1 py-3 text-sm font-semibold`, { color: theme.text }]}
                  value={routeSearchQuery}
                  onChangeText={setRouteSearchQuery}
                  autoFocus
                />
                {routeSearchQuery !== '' && (
                  <TouchableOpacity onPress={() => setRouteSearchQuery('')}>
                    <Text style={[tw`font-bold text-xs px-2`, { color: theme.textMuted }]}>✕</Text>
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
                        tw`p-3 flex-row items-center justify-between`,
                        {
                          borderBottomWidth: 1,
                          borderBottomColor: theme.border,
                          backgroundColor: isCurrent ? theme.accentSoft : 'transparent',
                        }
                      ]}
                    >
                      <View style={tw`flex-1 pr-3`}>
                        <Text style={[tw`text-[10px] font-black uppercase tracking-wider mb-1`, { color: theme.accent }]}>
                          Línea {route.line_code}
                        </Text>
                        <Text style={[tw`font-bold text-sm`, { color: theme.text }]} numberOfLines={1}>{route.name}</Text>
                        <Text style={[tw`text-xs mt-0.5`, { color: theme.textMuted }]} numberOfLines={1}>
                          {route.start_point} ➔ {route.end_point}
                        </Text>
                      </View>
                      {isCurrent && <Text style={[tw`font-bold text-sm`, { color: theme.accent }]}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
                {filteredRoutes.length === 0 && (
                  <View style={tw`py-6 items-center`}>
                    <Text style={[tw`text-xs font-semibold`, { color: theme.textMuted }]}>No se encontraron rutas</Text>
                  </View>
                )}
              </ScrollView>

              {selectedRoute && (
                <TouchableOpacity
                  onPress={() => { setShowRoutePicker(false); setRouteSearchQuery(''); }}
                  style={tw`mt-3 py-2 items-center`}
                >
                  <Text style={[tw`text-xs font-bold uppercase tracking-wider`, { color: theme.textMuted }]}>Cancelar</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {isTracking && (
            <Text style={[tw`text-[10px] font-bold mt-2.5 text-center uppercase tracking-wider`, { color: theme.statusWarning }]}>
              * Finaliza el turno para cambiar de ruta
            </Text>
          )}
        </View>

        {/* Live GPS Control Card */}
        <View style={[
          tw`rounded-2xl p-5 mb-4`,
          { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }
        ]}>
          <View style={tw`flex-row justify-between items-center mb-3`}>
            <Text style={[tw`text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>
              2. Transmisión GPS en Vivo
            </Text>
            {coords && (
              <TouchableOpacity
                onPress={() => setIsMapExpanded(!isMapExpanded)}
                style={[
                  tw`px-3.5 py-1.5 rounded-lg`,
                  { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent + '30' }
                ]}
              >
                <Text style={[tw`text-[10px] font-extrabold uppercase tracking-wider`, { color: theme.accent }]}>
                  {isMapExpanded ? '↙ Reducir' : '↗ Expandir'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[tw`text-xs leading-relaxed mb-4`, { color: theme.textMuted }]}>
            Al iniciar el turno, tu posición GPS se compartirá en tiempo real con los pasajeros.
          </Text>

          {coords && (
            <View style={[
              tw`rounded-xl p-3 flex-row justify-around mb-4`,
              { backgroundColor: theme.cardElevated, borderWidth: 1, borderColor: theme.border }
            ]}>
              <View style={tw`items-center`}>
                <Text style={[tw`text-[9px] uppercase font-bold tracking-wider`, { color: theme.textSubtle }]}>Latitud</Text>
                <Text style={[tw`font-black text-xs mt-0.5`, { color: theme.text }]}>
                  {coords.latitude.toFixed(5)}
                </Text>
              </View>
              <View style={[tw`w-px`, { backgroundColor: theme.border }]} />
              <View style={tw`items-center`}>
                <Text style={[tw`text-[9px] uppercase font-bold tracking-wider`, { color: theme.textSubtle }]}>Longitud</Text>
                <Text style={[tw`font-black text-xs mt-0.5`, { color: theme.text }]}>
                  {coords.longitude.toFixed(5)}
                </Text>
              </View>
              <View style={[tw`w-px`, { backgroundColor: theme.border }]} />
              <View style={tw`items-center`}>
                <Text style={[tw`text-[9px] uppercase font-bold tracking-wider`, { color: theme.textSubtle }]}>Velocidad</Text>
                <Text style={[tw`font-black text-xs mt-0.5`, { color: theme.accent }]}>
                  {coords.speed !== null ? `${Math.round((coords.speed || 0) * 3.6)} km/h` : '— km/h'}
                </Text>
              </View>
            </View>
          )}

          {/* Map */}
          {coords && (
            <View style={[
              tw`w-full mb-4 rounded-xl overflow-hidden`,
              { height: isMapExpanded ? 480 : 280, borderWidth: 1, borderColor: theme.border }
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
            <Text style={[tw`text-xs font-bold mb-3.5 text-center uppercase tracking-wider`, { color: theme.statusDanger }]}>
              ⚠ {errorMsg}
            </Text>
          )}

          {/* Primary CTA */}
          <TouchableOpacity
            onPress={toggleTurnType}
            style={[
              tw`w-full py-4 rounded-2xl items-center flex-row justify-center`,
              {
                backgroundColor: isTracking ? theme.statusDanger : theme.accent,
                shadowColor: isTracking ? theme.statusDanger : theme.accent,
                shadowOpacity: 0.35,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 4 },
                elevation: 6,
              }
            ]}
          >
            <View style={[
              tw`w-2.5 h-2.5 rounded-full mr-2.5`,
              { backgroundColor: isTracking ? '#fff' : '#fff' }
            ]} />
            <Text style={tw`text-white font-extrabold text-sm uppercase tracking-widest`}>
              {isTracking ? 'Finalizar Turno' : 'Iniciar Turno'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Performance Metrics */}
        <View style={[
          tw`rounded-2xl p-5`,
          { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }
        ]}>
          <Text style={[tw`text-[10px] font-bold uppercase tracking-wider mb-3.5`, { color: theme.textSubtle }]}>
            Resumen del Turno
          </Text>
          <View style={tw`flex-row gap-3`}>
            {/* Vueltas */}
            <View style={[
              tw`rounded-xl p-3 items-center flex-1`,
              { backgroundColor: theme.cardElevated, borderWidth: 1, borderColor: theme.border }
            ]}>
              <Text style={[tw`text-[9px] uppercase font-bold tracking-wider text-center`, { color: theme.textSubtle }]}>Vueltas</Text>
              <Text style={[tw`text-base font-black mt-1`, { color: theme.text }]}>{routesCompleted}</Text>
            </View>
            {/* Activo */}
            <View style={[
              tw`rounded-xl p-3 items-center flex-1`,
              { backgroundColor: theme.cardElevated, borderWidth: 1, borderColor: theme.border }
            ]}>
              <Text style={[tw`text-[9px] uppercase font-bold tracking-wider text-center`, { color: theme.textSubtle }]}>Activo</Text>
              <Text style={[tw`text-base font-black mt-1`, { color: theme.text }]}>{hoursActive}</Text>
            </View>
            {/* Ganado */}
            <View style={[
              tw`rounded-xl p-3 items-center flex-1`,
              {
                backgroundColor: isDark ? '#0F2A0F' : '#F0FDF4',
                borderWidth: 1,
                borderColor: isDark ? '#22C55E30' : '#86EFAC',
              }
            ]}>
              <Text style={[tw`text-[9px] uppercase font-bold tracking-wider text-center`, { color: theme.statusActive }]}>Ganado</Text>
              <Text style={[tw`text-base font-black mt-1`, { color: theme.statusActive }]}>
                {accumulatedEarnings.toFixed(0)} Bs
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
