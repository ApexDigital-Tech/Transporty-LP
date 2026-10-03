import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import tw from 'twrnc';
import { supabase, Route, LiveLocation, createQRPayment, updateQRPaymentStatus } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useLocation } from '../../hooks/useLocation';
import { useStore } from '../../hooks/useStore';
import LiveMapWeb from '../../components/LiveMapWeb';
import { useTheme } from '../../theme';

export default function PassengerScreen() {
  const { theme, isDark } = useTheme();
  const { coords } = useLocation();
  const { liveLocations, fetchInitialLocations, subscribeToLocations, unsubscribeFromLocations } = useStore();
  
  // State variables
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // QR Payment States
  const [isPayModalVisible, setIsPayModalVisible] = useState(false);
  const [payDriverId, setPayDriverId] = useState<string | null>(null);
  const [payDriverPlaca, setPayDriverPlaca] = useState<string>('');
  const [payAmount, setPayAmount] = useState<number>(2.00);
  const [payPassengerPhone, setPayPassengerPhone] = useState<string>('');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);

  const { signOut } = useAuth();

  // Fallback mock routes
  const fallbackRoutes: Route[] = [
    { id: 'b2049e7b-f9f6-4ef3-b4cd-3c3f9154a37a', line_code: '201', name: 'Pérez Velasco - Chasquipampa', start_point: 'Pérez Velasco', end_point: 'Chasquipampa' },
    { id: 'a3487c6b-d8e2-45e1-a3f2-1b2c456df98a', line_code: '284', name: 'San Francisco - El Alto', start_point: 'Plaza San Francisco', end_point: 'Ceja El Alto' },
    { id: 'c5364b4c-e7c1-48d2-c5e3-4c5b657e891c', line_code: '2', name: 'Plaza Murillo - Obrajes', start_point: 'Plaza Murillo', end_point: 'Obrajes' },
  ];

  // Load active routes
  useEffect(() => {
    async function loadRoutesAndDefaultSelection() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('routes')
          .select('*')
          .order('line_code', { ascending: true });

        if (error) throw error;
        if (data && data.length > 0) {
          setRoutes(data);
          setSelectedRoute(data[0]); // select line 201 by default
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
    loadRoutesAndDefaultSelection();
  }, []);

  // Subscribe to live locations
  useEffect(() => {
    if (!selectedRoute) return;
    subscribeToLocations(selectedRoute.id, undefined);
    
    return () => {
      unsubscribeFromLocations();
    };
  }, [selectedRoute]);

  // Load initial locations
  useEffect(() => {
    if (!selectedRoute) return;
    const coordsParam = coords ? { latitude: coords.latitude, longitude: coords.longitude } : undefined;
    fetchInitialLocations(selectedRoute.id, undefined, coordsParam);
  }, [selectedRoute, coords?.latitude, coords?.longitude]);

  // Subscribe to payment status updates
  useEffect(() => {
    if (!paymentId || paymentStatus !== 'pending') return;

    console.log('Suscripción reactiva a pago QR:', paymentId);
    const channel = supabase
      .channel(`payment-${paymentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'qr_payments',
          filter: `id=eq.${paymentId}`,
        },
        (payload) => {
          const { new: newRecord } = payload;
          if (newRecord.status === 'completed') {
            setPaymentStatus('completed');
            // Auto close modal after showing success animation
            setTimeout(() => {
              setIsPayModalVisible(false);
              setPaymentStatus('idle');
              setPaymentId(null);
            }, 3000);
          } else if (newRecord.status === 'failed') {
            setPaymentStatus('failed');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [paymentId, paymentStatus]);

  const startPaymentFlow = (driverId: string, placa: string) => {
    setPayDriverId(driverId);
    setPayDriverPlaca(placa);
    setPayAmount(2.00);
    setPaymentStatus('idle');
    setPaymentId(null);
    setIsPayModalVisible(true);
  };

  const handleGenerateQR = async () => {
    if (!payPassengerPhone.trim()) {
      Alert.alert('Atención', 'Por favor introduce tu número de celular para registrar el pago.');
      return;
    }
    if (!payDriverId) return;

    setPaymentStatus('pending');
    try {
      const { data, error } = await createQRPayment(payDriverId, payPassengerPhone, payAmount);
      if (error) throw error;
      if (data) {
        setPaymentId(data.id);
      }
    } catch (e) {
      console.error('Error al generar pago QR:', e);
      Alert.alert('Error', 'No se pudo registrar la transacción. Intenta nuevamente.');
      setPaymentStatus('idle');
    }
  };

  const simulateSuccessfulPayment = async () => {
    if (!paymentId) return;
    setIsSimulatingPayment(true);
    try {
      // Simular evento bancario actualizando el registro en Supabase
      const { error } = await updateQRPaymentStatus(paymentId, 'completed');
      if (error) throw error;
    } catch (e) {
      console.error('Error simulando pago:', e);
      Alert.alert('Error', 'No se pudo completar la simulación del pago.');
    } finally {
      setIsSimulatingPayment(false);
    }
  };

  const filteredRoutes = routes.filter(route => 
    route.line_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    route.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
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
            Radar de Rutas
          </Text>
        </View>
        <TouchableOpacity
          onPress={signOut}
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
        {/* Info Banner */}
        <View style={[
          tw`rounded-2xl p-4 mb-4`,
          {
            backgroundColor: isDark ? '#0D1F33' : '#EFF6FF',
            borderWidth: 1,
            borderColor: isDark ? '#1E3A5F' : '#BFDBFE',
          }
        ]}>
          <Text style={[tw`font-bold mb-1 text-sm`, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>
            🧭 Monitoreo en Tiempo Real
          </Text>
          <Text style={[tw`text-xs leading-relaxed`, { color: isDark ? '#93C5FD' : '#1E40AF' }]}>
            Selecciona tu línea para conectarte a la transmisión en vivo de los minibuses.
          </Text>
        </View>

        {/* Route Search */}
        <View style={tw`mb-4`}>
          <Text style={[tw`font-bold text-xs uppercase tracking-wider mb-2.5 ml-1`, { color: theme.textSubtle }]}>
            Buscar Línea de Miníbus
          </Text>
          <View style={[
            tw`flex-row items-center rounded-xl px-3.5 mb-3`,
            { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }
          ]}>
            <Text style={[tw`mr-2 text-sm`, { color: theme.textSubtle }]}>🔍</Text>
            <TextInput
              placeholder="Buscar línea (Ej. 2, 201, Avaroa...)"
              placeholderTextColor={theme.textSubtle}
              style={[tw`flex-1 py-3 text-sm font-semibold`, { color: theme.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={[tw`font-bold text-xs px-2`, { color: theme.textMuted }]}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color={theme.accent} size="small" style={tw`my-4`} />
          ) : (
            <View style={tw`flex-row flex-wrap mb-2`}>
              {filteredRoutes.slice(0, 15).map((route) => {
                const isSelected = selectedRoute?.id === route.id;
                return (
                  <TouchableOpacity
                    key={route.id}
                    onPress={() => setSelectedRoute(route)}
                    style={[
                      tw`mr-2.5 mb-2.5 px-4 py-2.5 rounded-full`,
                      {
                        backgroundColor: isSelected ? theme.accent : theme.card,
                        borderWidth: 1,
                        borderColor: isSelected ? theme.accent : theme.border,
                      }
                    ]}
                  >
                    <Text style={[
                      tw`font-bold text-xs`,
                      { color: isSelected ? '#fff' : theme.textMuted }
                    ]}>
                      Línea {route.line_code}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {filteredRoutes.length > 15 && (
                <Text style={[tw`text-[10px] font-semibold self-center mb-2.5 ml-1`, { color: theme.textSubtle }]}>
                  y {filteredRoutes.length - 15} líneas más...
                </Text>
              )}
              {filteredRoutes.length === 0 && (
                <Text style={[tw`text-xs italic ml-1`, { color: theme.textMuted }]}>
                  No se encontraron rutas.
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Selected Route Info */}
        {selectedRoute && (
          <View style={[
            tw`rounded-2xl p-5 mb-4`,
            { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }
          ]}>
            <View style={tw`flex-row items-center justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={[tw`text-[10px] font-bold uppercase tracking-wider`, { color: theme.accent }]}>
                  Ruta Seleccionada
                </Text>
                <Text style={[tw`font-black text-lg mt-1`, { color: theme.text }]} numberOfLines={1}>
                  Línea {selectedRoute.line_code} — {selectedRoute.name}
                </Text>
              </View>
              <View style={[
                tw`w-10 h-10 rounded-xl items-center justify-center`,
                { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent + '30' }
              ]}>
                <Text style={tw`text-lg`}>🚌</Text>
              </View>
            </View>
            <View style={[
              tw`flex-row items-center justify-between mt-4 pt-3.5`,
              { borderTopWidth: 1, borderTopColor: theme.border }
            ]}>
              <View style={tw`flex-1`}>
                <Text style={[tw`text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Origen</Text>
                <Text style={[tw`text-xs font-semibold mt-0.5`, { color: theme.text }]} numberOfLines={1}>
                  {selectedRoute.start_point}
                </Text>
              </View>
              <Text style={[tw`w-8 text-center`, { color: theme.border }]}>➔</Text>
              <View style={tw`flex-1 items-end`}>
                <Text style={[tw`text-[10px] font-bold uppercase tracking-wider`, { color: theme.textSubtle }]}>Destino</Text>
                <Text style={[tw`text-xs font-semibold mt-0.5`, { color: theme.text }]} numberOfLines={1}>
                  {selectedRoute.end_point}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Live Map */}
        {selectedRoute && (
          <View style={[
            tw`w-full h-80 rounded-2xl mb-4 overflow-hidden`,
            { borderWidth: 1, borderColor: theme.border }
          ]}>
            <LiveMapWeb
              markers={liveLocations.map((loc: any) => ({
                id: loc.driver_id,
                lat: loc.latitude,
                lng: loc.longitude,
                title: loc.is_off_route ? '⚠️ TRAMEAJE' : 'Miníbus Activo',
                isDriver: false,
                isOffRoute: loc.is_off_route
              }))}
            />
          </View>
        )}

        {/* Vehicles List */}
        <Text style={[tw`font-bold text-xs uppercase tracking-wider mb-2.5 ml-1`, { color: theme.textSubtle }]}>
          Miníbuses en Ruta ({liveLocations.length})
        </Text>

        {liveLocations.length === 0 ? (
          <View style={[
            tw`rounded-2xl p-6 items-center justify-center`,
            {
              backgroundColor: isDark ? '#1A0D00' : '#FFF7ED',
              borderWidth: 1,
              borderColor: isDark ? '#7C2D1240' : '#FED7AA',
            }
          ]}>
            <Text style={[tw`font-bold text-center`, { color: theme.accent }]}>No hay unidades transmitiendo</Text>
            <Text style={[tw`text-xs text-center mt-2 leading-relaxed px-4`, { color: theme.textMuted }]}>
              Actualmente no hay choferes en turno en esta ruta. Inicia sesión como Chofer para simular.
            </Text>
          </View>
        ) : (
          <View style={tw`gap-2`}>
            {liveLocations.map((item: any) => {
              const passengerLat = coords?.latitude ?? -16.5000;
              const passengerLng = coords?.longitude ?? -68.1500;
              const distMeters = getDistance(item.latitude, item.longitude, passengerLat, passengerLng);
              const distKm = distMeters / 1000;
              const speedMPS = 5.5;
              const etaMinutes = Math.max(1, Math.round(distMeters / speedMPS / 60));
              const isOffRoute = item.is_off_route || false;

              return (
                <View
                  key={item.driver_id}
                  style={[
                    tw`rounded-2xl p-4 flex-row items-center justify-between mb-3`,
                    {
                      backgroundColor: isOffRoute
                        ? (isDark ? '#2A0F0F' : '#FEF2F2')
                        : theme.card,
                      borderWidth: 1,
                      borderColor: isOffRoute
                        ? (isDark ? '#F8717140' : '#FECACA')
                        : theme.border,
                    }
                  ]}
                >
                  <View style={tw`flex-row items-center gap-3.5 flex-1 pr-2`}>
                    <View style={[
                      tw`p-2.5 rounded-xl`,
                      {
                        backgroundColor: isOffRoute
                          ? (isDark ? '#7F1D1D30' : '#FEE2E2')
                          : theme.accentSoft,
                        borderWidth: 1,
                        borderColor: isOffRoute
                          ? (isDark ? '#F8717140' : '#FECACA')
                          : theme.accent + '30',
                      }
                    ]}>
                      <Text style={tw`text-sm`}>{isOffRoute ? '⚠️' : '📡'}</Text>
                    </View>
                    <View style={tw`flex-1`}>
                      <View style={tw`flex-row items-center gap-2`}>
                        <Text style={[tw`font-black text-sm`, { color: theme.text }]}>
                          Miníbus Activo
                        </Text>
                        {isOffRoute && (
                          <View style={[tw`px-2 py-0.5 rounded-full`, { backgroundColor: theme.statusDanger }]}>
                            <Text style={tw`text-[8px] font-black text-white uppercase`}>TRAMEAJE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[tw`text-[10px] font-semibold mt-0.5`, { color: theme.textMuted }]} numberOfLines={1}>
                        Placa: {item.placa || 'En tránsito'}
                        {isOffRoute ? ` • Desvío: +${item.distance_from_path?.toFixed(0)}m` : ''}
                      </Text>
                      {/* QR Payment Button */}
                      <TouchableOpacity
                        onPress={() => startPaymentFlow(item.driver_id, item.placa || 'En tránsito')}
                        style={[
                          tw`px-3.5 py-2 rounded-xl mt-2.5 self-start flex-row items-center gap-1.5`,
                          { backgroundColor: theme.statusActive + '20', borderWidth: 1, borderColor: theme.statusActive + '40' }
                        ]}
                      >
                        <Text style={[tw`text-[10px] font-extrabold uppercase tracking-widest`, { color: theme.statusActive }]}>
                          💳 Pagar QR
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={tw`items-end`}>
                    <Text style={[
                      tw`font-extrabold text-sm`,
                      { color: isOffRoute ? theme.statusDanger : theme.statusActive }
                    ]}>
                      ~{etaMinutes} min
                    </Text>
                    <Text style={[tw`text-[10px] font-medium mt-0.5`, { color: theme.textSubtle }]}>
                      {distKm.toFixed(1)} km
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* QR Payment Modal */}
      <Modal
        visible={isPayModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsPayModalVisible(false)}
      >
        <View style={tw`flex-1 bg-black/60 justify-end`}>
          <View style={[
            tw`rounded-t-3xl p-6 min-h-[500px]`,
            { backgroundColor: theme.card }
          ]}>
            {/* Modal Header */}
            <View style={[
              tw`flex-row justify-between items-center pb-4`,
              { borderBottomWidth: 1, borderBottomColor: theme.border }
            ]}>
              <View>
                <Text style={[tw`text-xs font-bold uppercase tracking-widest`, { color: theme.textSubtle }]}>Pago de Pasaje</Text>
                <Text style={[tw`text-lg font-black`, { color: theme.text }]}>Código QR</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsPayModalVisible(false)}
                style={[
                  tw`w-8 h-8 rounded-full items-center justify-center`,
                  { backgroundColor: theme.cardElevated }
                ]}
              >
                <Text style={[tw`font-bold`, { color: theme.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {paymentStatus === 'idle' && (
              <View style={[tw`py-5 flex-1`]}>
                <Text style={[tw`text-xs font-bold mb-2`, { color: theme.textMuted }]}>
                  Unidad a pagar: Placa {payDriverPlaca}
                </Text>

                {/* Amount Selector */}
                <Text style={[tw`text-xs font-extrabold uppercase mb-2 mt-4`, { color: theme.text }]}>Monto (BOB)</Text>
                <View style={tw`flex-row gap-3 mb-4`}>
                  {[2.00, 2.50, 3.00].map((val) => {
                    const isSelected = payAmount === val;
                    return (
                      <TouchableOpacity
                        key={val}
                        onPress={() => setPayAmount(val)}
                        style={[
                          tw`flex-1 py-3 rounded-2xl items-center`,
                          {
                            backgroundColor: isSelected ? theme.accent : theme.cardElevated,
                            borderWidth: 1,
                            borderColor: isSelected ? theme.accent : theme.border,
                          }
                        ]}
                      >
                        <Text style={[tw`font-extrabold text-sm`, { color: isSelected ? '#fff' : theme.textMuted }]}>
                          Bs. {val.toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Phone Input */}
                <Text style={[tw`text-xs font-extrabold uppercase mb-2`, { color: theme.text }]}>Tu Número de Celular</Text>
                <TextInput
                  placeholder="Ej. 72845625"
                  keyboardType="phone-pad"
                  maxLength={8}
                  style={[
                    tw`rounded-2xl px-4 py-3 text-sm font-semibold mb-6`,
                    {
                      backgroundColor: theme.inputBg,
                      borderWidth: 1,
                      borderColor: theme.inputBorder,
                      color: theme.text,
                    }
                  ]}
                  placeholderTextColor={theme.textSubtle}
                  value={payPassengerPhone}
                  onChangeText={setPayPassengerPhone}
                />

                <TouchableOpacity
                  onPress={handleGenerateQR}
                  style={[
                    tw`w-full py-4 rounded-2xl items-center`,
                    {
                      backgroundColor: theme.accent,
                      shadowColor: theme.accent,
                      shadowOpacity: 0.35,
                      shadowRadius: 12,
                      elevation: 5,
                    }
                  ]}
                >
                  <Text style={tw`text-white font-extrabold text-sm uppercase tracking-widest`}>Generar QR</Text>
                </TouchableOpacity>
              </View>
            )}

            {paymentStatus === 'pending' && (
              <View style={tw`py-6 items-center flex-1 justify-center`}>
                <Text style={[tw`text-sm font-bold mb-1.5`, { color: theme.textMuted }]}>Escanea con tu App Bancaria</Text>
                <Text style={[tw`text-xl font-black mb-6`, { color: theme.text }]}>Bs. {payAmount.toFixed(2)}</Text>

                {/* Mock QR */}
                <View style={[
                  tw`w-52 h-52 rounded-2xl p-4 items-center justify-center mb-6`,
                  { backgroundColor: theme.cardElevated, borderWidth: 1, borderColor: theme.border }
                ]}>
                  <View style={tw`w-full h-full flex-col justify-between`}>
                    {[1, 2, 3, 4, 5, 6].map((rowIdx) => (
                      <View key={rowIdx} style={tw`flex-row justify-between h-5`}>
                        {[1, 2, 3, 4, 5, 6].map((colIdx) => {
                          const isCorner = (rowIdx <= 2 && colIdx <= 2) || (rowIdx <= 2 && colIdx >= 5) || (rowIdx >= 5 && colIdx <= 2);
                          const isRandomDark = (rowIdx + colIdx) % 3 === 0;
                          return (
                            <View
                              key={colIdx}
                              style={[
                                tw`w-5 h-5 rounded`,
                                {
                                  backgroundColor: (isCorner || isRandomDark)
                                    ? (isDark ? '#fff' : '#1E293B')
                                    : 'transparent'
                                }
                              ]}
                            />
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </View>

                <ActivityIndicator color={theme.accent} size="large" style={tw`mb-2`} />
                <Text style={[tw`text-xs font-semibold mb-6`, { color: theme.textMuted }]}>
                  Esperando confirmación del banco...
                </Text>

                <TouchableOpacity
                  onPress={simulateSuccessfulPayment}
                  disabled={isSimulatingPayment}
                  style={[
                    tw`w-full py-3.5 rounded-2xl items-center`,
                    {
                      backgroundColor: isDark ? '#0F2A0F' : '#F0FDF4',
                      borderWidth: 1,
                      borderColor: isDark ? '#22C55E40' : '#86EFAC',
                    }
                  ]}
                >
                  {isSimulatingPayment ? (
                    <ActivityIndicator color={theme.statusActive} />
                  ) : (
                    <Text style={[tw`font-extrabold text-xs uppercase tracking-widest`, { color: theme.statusActive }]}>
                      ⚡ Simular Pago (Banco Unión)
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {paymentStatus === 'completed' && (
              <View style={tw`py-10 items-center flex-1 justify-center`}>
                <View style={[
                  tw`w-20 h-20 rounded-full items-center justify-center mb-6`,
                  {
                    backgroundColor: isDark ? '#0F2A0F' : '#F0FDF4',
                    borderWidth: 2,
                    borderColor: theme.statusActive + '60',
                  }
                ]}>
                  <Text style={[tw`text-3xl font-bold`, { color: theme.statusActive }]}>✓</Text>
                </View>
                <Text style={[tw`text-2xl font-black`, { color: theme.text }]}>¡Pago Exitoso!</Text>
                <Text style={[tw`text-xs font-bold mt-2 text-center leading-relaxed px-6`, { color: theme.textMuted }]}>
                  Tu pasaje de Bs. {payAmount.toFixed(2)} ha sido transferido a la Placa {payDriverPlaca}.
                </Text>
                <View style={[
                  tw`px-3 py-1 rounded-full mt-6`,
                  { backgroundColor: theme.statusActive + '18', borderWidth: 1, borderColor: theme.statusActive + '40' }
                ]}>
                  <Text style={[tw`text-[10px] font-black uppercase tracking-widest`, { color: theme.statusActive }]}>
                    Transacción Confirmada
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Haversine distance function
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
