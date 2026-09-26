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

export default function PassengerScreen() {
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
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      {/* Top Header - Premium Minimalist */}
      <View style={tw`bg-white px-5 py-4 flex-row items-center justify-between border-b border-gray-100 shadow-sm`}>
        <View>
          <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-widest`}>La Paz Transit</Text>
          <Text style={tw`text-base font-extrabold text-[#00327d] tracking-tight`}>Buscar Ruta / Parada</Text>
        </View>
        <TouchableOpacity 
          onPress={signOut}
          style={tw`px-4 py-2 rounded-full border border-gray-200 bg-gray-50`}
        >
          <Text style={tw`text-gray-600 font-bold text-xs uppercase tracking-wider`}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Layout */}
      <ScrollView style={tw`flex-1 p-4`} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Helper Instructions Banner */}
        <View style={tw`bg-blue-50/50 rounded-2xl p-5 border border-blue-100 mb-4`}>
          <Text style={tw`text-[#00327d] font-bold mb-1.5 text-sm`}>🧭 Monitoreo en Tiempo Real</Text>
          <Text style={tw`text-blue-900/80 text-xs leading-relaxed`}>
            Selecciona tu línea a continuación para conectarte automáticamente a la transmisión satelital de los minibuses en tiempo real.
          </Text>
        </View>

        {/* Route Selector with Search Input */}
        <View style={tw`mb-4`}>
          <Text style={tw`text-gray-500 font-bold text-xs uppercase tracking-wider mb-2.5 ml-1`}>
            Buscar Línea de Minibús
          </Text>
          <View style={tw`flex-row items-center border border-gray-200 rounded-xl px-3.5 bg-white mb-3 shadow-sm`}>
            <Text style={tw`text-gray-400 mr-2 text-sm`}>🔍</Text>
            <TextInput
              placeholder="Buscar línea (Ej. 2, 201, Litoral, Avaroa...)"
              placeholderTextColor="#9ca3af"
              style={tw`flex-1 py-3 text-sm text-gray-900 font-semibold`}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={tw`text-gray-400 font-bold text-xs px-2`}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color="#00327d" size="small" style={tw`my-4`} />
          ) : (
            <View style={tw`flex-row flex-wrap mb-2`}>
              {filteredRoutes.slice(0, 15).map((route) => {
                const isSelected = selectedRoute?.id === route.id;
                return (
                  <TouchableOpacity
                    key={route.id}
                    onPress={() => setSelectedRoute(route)}
                    style={tw`mr-2.5 mb-2.5 px-4.5 py-2.5 rounded-full border ${
                      isSelected
                        ? 'bg-[#00327d] border-[#00327d] shadow-sm'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <Text
                      style={tw`font-bold text-xs ${
                        isSelected ? 'text-white' : 'text-gray-600'
                      }`}
                    >
                      Línea {route.line_code}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {filteredRoutes.length > 15 && (
                <Text style={tw`text-gray-400 text-[10px] font-semibold self-center mb-2.5 ml-1`}>
                  y {filteredRoutes.length - 15} líneas más. Filtra para reducir la lista.
                </Text>
              )}
              {filteredRoutes.length === 0 && (
                <Text style={tw`text-gray-400 text-xs italic ml-1`}>
                  No se encontraron rutas con ese nombre.
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Selected Route Info Panel */}
        {selectedRoute && (
          <View style={tw`bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-4`}>
            <View style={tw`flex-row items-center justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={tw`text-[10px] font-bold uppercase text-blue-600 tracking-wider`}>
                  Ruta Seleccionada
                </Text>
                <Text style={tw`text-gray-800 font-black text-lg mt-1`} numberOfLines={1}>
                  Línea {selectedRoute.line_code} - {selectedRoute.name}
                </Text>
              </View>
              <View style={tw`w-10 h-10 rounded-xl bg-blue-50 items-center justify-center border border-blue-100`}>
                <Text style={tw`text-lg`}>🚌</Text>
              </View>
            </View>
            <View style={tw`flex-row items-center justify-between mt-4 pt-3.5 border-t border-gray-50`}>
              <View style={tw`flex-1`}>
                <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Origen</Text>
                <Text style={tw`text-gray-700 text-xs font-semibold mt-0.5`} numberOfLines={1}>{selectedRoute.start_point}</Text>
              </View>
              <View style={tw`w-8 items-center`}>
                <Text style={tw`text-gray-300`}>➔</Text>
              </View>
              <View style={tw`flex-1 items-end`}>
                <Text style={tw`text-[10px] font-bold text-gray-400 uppercase tracking-wider`}>Destino</Text>
                <Text style={tw`text-gray-700 text-xs font-semibold mt-0.5`} numberOfLines={1}>{selectedRoute.end_point}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Live Interactive Map */}
        {selectedRoute && (
          <View style={tw`w-full h-80 bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden`}>
            <LiveMapWeb 
              markers={liveLocations.map((loc: any) => ({
                id: loc.driver_id,
                lat: loc.latitude,
                lng: loc.longitude,
                title: loc.is_off_route ? '⚠️ TRAMEAJE DETECTADO' : 'Minibús Activo',
                isDriver: false,
                isOffRoute: loc.is_off_route
              }))} 
            />
          </View>
        )}

        {/* Subscribed Active Vehicles List */}
        <Text style={tw`text-gray-500 font-bold text-xs uppercase tracking-wider mb-2.5 ml-1`}>
          Minibuses en Ruta ({liveLocations.length})
        </Text>

        {liveLocations.length === 0 ? (
          <View style={tw`bg-orange-50 border border-orange-200 rounded-2xl p-6 items-center justify-center`}>
            <Text style={tw`text-orange-950 font-bold text-center`}>No hay unidades transmitiendo</Text>
            <Text style={tw`text-orange-900 text-xs text-center mt-2 leading-relaxed px-4`}>
              Actualmente no hay choferes en turno enviando GPS en esta ruta. Inicia sesión en el panel del Chofer para simular y ver actualizaciones en tiempo real instantáneas.
            </Text>
          </View>
        ) : (
          <View style={tw`gap-2`}>
            {liveLocations.map((item: any) => {
              const passengerLat = coords?.latitude ?? -16.5000;
              const passengerLng = coords?.longitude ?? -68.1500;
              const distMeters = getDistance(item.latitude, item.longitude, passengerLat, passengerLng);
              const distKm = distMeters / 1000;
              const speedMPS = 5.5; // ~20 km/h en tránsito paceño
              const etaMinutes = Math.max(1, Math.round(distMeters / speedMPS / 60));
              const isOffRoute = item.is_off_route || false;
              
              return (
                <View 
                  key={item.driver_id} 
                  style={tw`bg-white rounded-2xl p-4 shadow-sm border ${isOffRoute ? 'border-red-200 bg-red-50/10' : 'border-gray-100'} flex-row items-center justify-between mb-3`}
                >
                  <View style={tw`flex-row items-center gap-3.5 flex-1 pr-2`}>
                    <View style={tw`${isOffRoute ? 'bg-red-100 border-red-200' : 'bg-blue-50 border-blue-100'} p-2.5 rounded-xl border`}>
                      <Text style={tw`text-sm`}>{isOffRoute ? '⚠️' : '📡'}</Text>
                    </View>
                    <View style={tw`flex-1`}>
                      <View style={tw`flex-row items-center gap-2`}>
                        <Text style={tw`text-gray-800 font-black text-sm`}>
                          Minibús Activo
                        </Text>
                        {isOffRoute && (
                          <View style={tw`bg-red-500 px-2 py-0.5 rounded-full`}>
                            <Text style={tw`text-[8px] font-black text-white uppercase`}>TRAMEAJE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={tw`text-gray-400 text-[10px] font-semibold mt-0.5`} numberOfLines={1}>
                        Placa: {item.placa || 'En tránsito'} {isOffRoute ? `• Desvío: +${item.distance_from_path?.toFixed(0)}m` : ''}
                      </Text>
                      
                      {/* QR Payment Trigger Button */}
                      <TouchableOpacity
                        onPress={() => startPaymentFlow(item.driver_id, item.placa || 'En tránsito')}
                        style={tw`bg-[#006e0a] px-3.5 py-2 rounded-xl mt-2.5 self-start flex-row items-center gap-1.5`}
                      >
                        <Text style={tw`text-[10px] text-white font-extrabold uppercase tracking-widest`}>💳 Pagar QR</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={tw`items-end justify-between h-full`}>
                    <View style={tw`items-end`}>
                      <Text style={tw`${isOffRoute ? 'text-red-600' : 'text-[#006e0a]'} font-extrabold text-sm`}>
                        ~{etaMinutes} min
                      </Text>
                      <Text style={tw`text-[10px] text-gray-400 font-medium mt-0.5`}>
                        {distKm.toFixed(1)} km
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* QR Payment Modal (Drawer) */}
      <Modal
        visible={isPayModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsPayModalVisible(false)}
      >
        <View style={tw`flex-1 bg-black/60 justify-end`}>
          <View style={tw`bg-white rounded-t-3xl p-6 min-h-[500px]`}>
            {/* Header */}
            <View style={tw`flex-row justify-between items-center pb-4 border-b border-gray-100`}>
              <View>
                <Text style={tw`text-xs font-bold text-gray-400 uppercase tracking-widest`}>Pago de Pasaje</Text>
                <Text style={tw`text-lg font-black text-[#0f172a]`}>Código QR Simpli</Text>
              </View>
              <TouchableOpacity 
                onPress={() => setIsPayModalVisible(false)}
                style={tw`w-8 h-8 rounded-full bg-slate-100 items-center justify-center`}
              >
                <Text style={tw`text-gray-500 font-bold`}>✕</Text>
              </TouchableOpacity>
            </View>

            {paymentStatus === 'idle' && (
              <View style={tw`py-5 flex-1`}>
                <Text style={tw`text-xs text-gray-400 font-bold mb-2`}>Unidad a pagar: Placa {payDriverPlaca}</Text>
                
                {/* Monto selector */}
                <Text style={tw`text-slate-700 text-xs font-extrabold uppercase mb-2 mt-4`}>Monto a Cobrar (BOB)</Text>
                <View style={tw`flex-row gap-3 mb-4`}>
                  {[2.00, 2.50, 3.00].map((val) => {
                    const isSelected = payAmount === val;
                    return (
                      <TouchableOpacity
                        key={val}
                        onPress={() => setPayAmount(val)}
                        style={tw`flex-1 py-3 rounded-2xl border items-center ${
                          isSelected ? 'bg-[#00327d] border-[#00327d]' : 'bg-white border-slate-200'
                        }`}
                      >
                        <Text style={tw`font-extrabold text-sm ${isSelected ? 'text-white' : 'text-slate-600'}`}>
                          Bs. {val.toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Input celular pasajero */}
                <Text style={tw`text-slate-700 text-xs font-extrabold uppercase mb-2`}>Tu Número de Celular</Text>
                <TextInput
                  placeholder="Ej. 72845625"
                  keyboardType="phone-pad"
                  maxLength={8}
                  style={tw`border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold bg-slate-50 text-slate-900 mb-6`}
                  value={payPassengerPhone}
                  onChangeText={setPayPassengerPhone}
                />

                <TouchableOpacity
                  onPress={handleGenerateQR}
                  style={tw`w-full bg-[#00327d] py-4 rounded-full items-center shadow-md`}
                >
                  <Text style={tw`text-white font-extrabold text-sm uppercase tracking-widest`}>Generar QR Simpli</Text>
                </TouchableOpacity>
              </View>
            )}

            {paymentStatus === 'pending' && (
              <View style={tw`py-6 items-center flex-1 justify-center`}>
                <Text style={tw`text-sm font-bold text-gray-500 mb-1.5`}>Escanea con tu App Bancaria</Text>
                <Text style={tw`text-xl font-black text-slate-800 mb-6`}>Bs. {payAmount.toFixed(2)}</Text>
                
                {/* Beautiful Mock QR Code Visual */}
                <View style={tw`w-52 h-52 bg-slate-50 border border-slate-200 rounded-2xl p-4 items-center justify-center mb-6`}>
                  {/* Faux QR grid details */}
                  <View style={tw`w-full h-full flex-col justify-between`}>
                    {[1, 2, 3, 4, 5, 6].map((rowIdx) => (
                      <View key={rowIdx} style={tw`flex-row justify-between h-5`}>
                        {[1, 2, 3, 4, 5, 6].map((colIdx) => {
                          // Draw a nice structured QR visual with solid boxes at corners
                          const isCorner = (rowIdx <= 2 && colIdx <= 2) || (rowIdx <= 2 && colIdx >= 5) || (rowIdx >= 5 && colIdx <= 2);
                          const isRandomDark = (rowIdx + colIdx) % 3 === 0;
                          return (
                            <View 
                              key={colIdx} 
                              style={tw`w-5 h-5 rounded ${
                                isCorner || isRandomDark ? 'bg-slate-800' : 'bg-transparent'
                              } border border-slate-100/50`}
                            />
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </View>

                <ActivityIndicator color="#00327d" size="large" style={tw`mb-2`} />
                <Text style={tw`text-gray-400 text-xs font-semibold mb-6 animate-pulse`}>
                  Esperando confirmación del banco...
                </Text>

                {/* Simulator Action Button */}
                <TouchableOpacity
                  onPress={simulateSuccessfulPayment}
                  disabled={isSimulatingPayment}
                  style={tw`w-full bg-[#006e0a] py-3.5 rounded-full items-center shadow-sm`}
                >
                  {isSimulatingPayment ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={tw`text-white font-extrabold text-xs uppercase tracking-widest`}>
                      ⚡ Simular Pago (Banco Unión)
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {paymentStatus === 'completed' && (
              <View style={tw`py-10 items-center flex-1 justify-center`}>
                <View style={tw`w-20 h-20 rounded-full bg-green-50 items-center justify-center border-2 border-green-200 mb-6`}>
                  <Text style={tw`text-3xl text-green-600 font-bold`}>✓</Text>
                </View>
                <Text style={tw`text-2xl font-black text-slate-800`}>¡Pago Exitoso!</Text>
                <Text style={tw`text-gray-400 text-xs font-bold mt-2 text-center leading-relaxed px-6`}>
                  Tu pasaje de Bs. {payAmount.toFixed(2)} ha sido transferido directamente a la unidad de la Placa {payDriverPlaca}.
                </Text>
                <Text style={tw`text-[10px] text-green-600 font-black uppercase mt-6 tracking-widest bg-green-50 px-3 py-1 rounded-full`}>
                  Transacción Simpli Confirmada
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Haversine function
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Returns meters
}
