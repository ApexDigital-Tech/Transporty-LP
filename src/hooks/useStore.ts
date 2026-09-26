import { create } from 'zustand';
import { supabase, LiveLocation } from '../services/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface TransitState {
  liveLocations: LiveLocation[];
  driverInfoDict: Record<string, {name: string; placa: string; orgName?: string; status?: string}>;
  subscription: RealtimeChannel | null;
  loading: boolean;
  
  // Global synchronization
  refreshTrigger: number;
  triggerRefresh: () => void;
  
  // Driver tracking state
  isTracking: boolean;
  driverStatus: 'active' | 'inactive' | 'offline';
  
  // Acciones
  setDriverInfoDict: (dict: Record<string, {name: string; placa: string; orgName?: string; status?: string}>) => void;
  fetchInitialLocations: (routeId?: string, orgId?: string, coords?: { latitude: number; longitude: number }) => Promise<void>;
  subscribeToLocations: (routeId?: string, orgId?: string) => void;
  unsubscribeFromLocations: () => void;
  
  selectedImpersonatedOrg: string | null;
  setSelectedImpersonatedOrg: (orgId: string | null) => void;
  
  // Driver actions
  setDriverTracking: (isTracking: boolean) => void;
  setDriverStatus: (status: 'active' | 'inactive' | 'offline') => void;
  startDriverTracking: (driverId: string, routeId: string) => Promise<void>;
  updateDriverLocation: (driverId: string, routeId: string, latitude: number, longitude: number) => Promise<void>;
  stopDriverTrackingAndCleanup: (driverId: string) => Promise<void>;
}

export const useStore = create<TransitState>((set, get) => ({
  liveLocations: [],
  driverInfoDict: {},
  subscription: null,
  loading: false,
  refreshTrigger: 0,
  triggerRefresh: () => set((state) => ({ refreshTrigger: state.refreshTrigger + 1 })),
  isTracking: false,
  driverStatus: 'offline',
  selectedImpersonatedOrg: null,
  setSelectedImpersonatedOrg: (orgId) => set({ selectedImpersonatedOrg: orgId }),

  setDriverInfoDict: (dict) => set({ driverInfoDict: dict }),

  fetchInitialLocations: async (routeId, orgId, coords) => {
    set({ loading: true });
    try {
      let data;
      if (coords) {
        // Usar RPC de geolocalización PostGIS para choferes cercanos en radio de 5km
        const { data: rpcData, error } = await supabase.rpc('get_nearby_drivers', {
          passenger_lat: coords.latitude,
          passenger_lng: coords.longitude,
          radius_meters: 5000.0
        });
        if (error) throw error;
        data = rpcData;
      } else {
        // Fallback a select tradicional
        let selectQuery = supabase.from('live_locations').select('*');
        if (routeId) selectQuery = selectQuery.eq('route_id', routeId);
        if (orgId) selectQuery = selectQuery.eq('organization_id', orgId);
        const { data: selectData, error } = await selectQuery;
        if (error) throw error;
        data = selectData;
      }
      
      if (data) {
        let filtered = data;
        if (coords) {
          // Filtrar en memoria por ruta o sindicato si se usó la consulta por cercanía
          if (routeId) {
            filtered = filtered.filter((item: any) => item.route_id === routeId);
          }
          if (orgId) {
            filtered = filtered.filter((item: any) => item.organization_id === orgId);
          }
        }
        
        // Mapear campos para coherencia con la interfaz LiveLocation
        const mapped = filtered.map((item: any) => ({
          driver_id: item.driver_id || item.driver_id,
          route_id: item.route_id,
          latitude: item.latitude,
          longitude: item.longitude,
          last_updated: item.last_updated,
          is_off_route: item.is_off_route || false,
          distance_from_path: item.distance_from_path || 0.0
        }));
        
        set({ liveLocations: mapped });
      }
    } catch (e) {
      console.error('Zustand: Error al cargar ubicaciones:', e);
    } finally {
      set({ loading: false });
    }
  },

  subscribeToLocations: (routeId, orgId) => {
    // Limpiar suscripción previa
    const currentSub = get().subscription;
    if (currentSub) {
      supabase.removeChannel(currentSub);
    }

    const channelName = routeId ? `live-transit-${routeId}` : `live-transit-${orgId || 'global'}`;
    const filter = routeId 
      ? `route_id=eq.${routeId}` 
      : (orgId ? `organization_id=eq.${orgId}` : undefined);

    console.log(`Zustand: Suscribiendo al canal ${channelName} con filtro ${filter}`);

    const newSub = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_locations',
          filter: filter,
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          const { liveLocations } = get();

          if (eventType === 'DELETE') {
            set({
              liveLocations: liveLocations.filter((loc) => loc.driver_id !== oldRecord.driver_id)
            });
          } else {
            const exists = liveLocations.some((loc) => loc.driver_id === newRecord.driver_id);
            if (exists) {
              set({
                liveLocations: liveLocations.map((loc) =>
                  loc.driver_id === newRecord.driver_id ? { ...loc, ...newRecord } : loc
                )
              });
            } else {
              set({
                liveLocations: [...liveLocations, newRecord as LiveLocation]
              });
            }
          }
        }
      )
      .subscribe();

    set({ subscription: newSub });
  },

  unsubscribeFromLocations: () => {
    const currentSub = get().subscription;
    if (currentSub) {
      supabase.removeChannel(currentSub);
      set({ subscription: null });
    }
  },

  setDriverTracking: (isTracking) => set({ isTracking }),
  setDriverStatus: (status) => set({ driverStatus: status }),

  startDriverTracking: async (driverId, routeId) => {
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ status: 'active' })
        .eq('id', driverId);
      if (error) throw error;
      set({ isTracking: true, driverStatus: 'active' });
    } catch (e) {
      console.error('Zustand: Error starting driver tracking:', e);
    }
  },

  updateDriverLocation: async (driverId, routeId, latitude, longitude) => {
    try {
      const { error } = await supabase
        .from('live_locations')
        .upsert(
          {
            driver_id: driverId,
            route_id: routeId,
            latitude: latitude,
            longitude: longitude,
            last_updated: new Date().toISOString(),
          },
          { onConflict: 'driver_id' }
        );
      if (error) throw error;
    } catch (e) {
      console.error('Zustand: Error updating driver location:', e);
    }
  },

  stopDriverTrackingAndCleanup: async (driverId) => {
    try {
      await supabase.from('live_locations').delete().eq('driver_id', driverId);
      await supabase.from('drivers').update({ status: 'offline' }).eq('id', driverId);
      set({ isTracking: false, driverStatus: 'offline' });
    } catch (e) {
      console.error('Zustand: Error stopping driver tracking:', e);
    }
  }
}));
