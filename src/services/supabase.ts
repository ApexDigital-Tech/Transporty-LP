import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { PostgrestError } from '@supabase/supabase-js';

// Define Supabase database types
export interface Route {
  id: string;
  line_code: string;
  name: string;
  start_point: string;
  end_point: string;
  vehicle_type?: string;
  organization_id?: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  placa: string;
  organization_id: string;
  sindicato?: string;
  propietario?: string;
  numero_afiliacion?: string;
  is_profile_complete?: boolean;
  status: 'active' | 'inactive' | 'offline';
  foto_url?: string;
  foto_vehiculo_url?: string;
  documentacion_urls?: {
    license?: string;
    soat?: string;
  };
}

export interface LiveLocation {
  driver_id: string;
  route_id: string;
  latitude: number;
  longitude: number;
  last_updated: string;
  is_off_route?: boolean;
  distance_from_path?: number;
}

export interface RouteDeviation {
  id: string;
  driver_id: string;
  route_id: string;
  organization_id?: string;
  start_time: string;
  end_time: string | null;
  max_distance: number;
  duration_seconds: number | null;
}

export interface QRPayment {
  id: string;
  driver_id: string;
  organization_id?: string;
  passenger_phone: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}


const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wwnxwdliysojiqtefuoy.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3bnh3ZGxpeXNvamlxdGVmdW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Njc5NTYsImV4cCI6MjA5NTA0Mzk1Nn0.qX81MiWsByNhaer_UEEmGoFAEfmYqyJk9gj6slq_c98';

// Wrapper seguro para compatibilidad con SSR (Server-Side Rendering) en entornos Node.js
const safeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return null;
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return;
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return;
    }
    return AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: safeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const updateLiveLocation = async (
  driverId: string,
  routeId: string,
  lat: number,
  lng: number
): Promise<{ error: PostgrestError | null }> => {
  const { error } = await supabase
    .from('live_locations')
    .upsert(
      {
        driver_id: driverId,
        route_id: routeId,
        latitude: lat,
        longitude: lng,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'driver_id' }
    );
  return { error };
};

export const fetchRoutes = async (): Promise<{ data: Route[] | null; error: PostgrestError | null }> => {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .order('line_code', { ascending: true });
  return { data, error };
};

export const uploadDriverAttachment = async (
  userId: string,
  folderName: 'photo' | 'vehicle' | 'soat' | 'license',
  fileUri: string
): Promise<{ publicUrl: string | null; error: Error | null }> => {
  try {
    if (fileUri.startsWith('http://') || fileUri.startsWith('https://')) {
      return { publicUrl: fileUri, error: null };
    }
    const response = await fetch(fileUri);
    const blob = await response.blob();
    
    const fileExt = fileUri.split('.').pop() || 'jpg';
    const fileName = `${userId}/${folderName}_${Date.now()}.${fileExt}`;
    
    const { error } = await supabase.storage
      .from('driver_profiles')
      .upload(fileName, blob, {
        cacheControl: '3600',
        upsert: true
      });
      
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage
      .from('driver_profiles')
      .getPublicUrl(fileName);
      
    return { publicUrl, error: null };
  } catch (error: any) {
    console.error('Error uploading driver attachment:', error);
    return { publicUrl: null, error };
  }
};

export const uploadOrgBranding = async (
  orgId: string,
  folderName: 'logo' | 'banner',
  fileUri: string
): Promise<{ publicUrl: string | null; error: Error | null }> => {
  try {
    const response = await fetch(fileUri);
    const blob = await response.blob();
    
    const fileExt = fileUri.split('.').pop() || 'jpg';
    const fileName = `${orgId}/${folderName}_${Date.now()}.${fileExt}`;
    
    const { error } = await supabase.storage
      .from('organizations_branding')
      .upload(fileName, blob, {
        cacheControl: '3600',
        upsert: true
      });
      
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage
      .from('organizations_branding')
      .getPublicUrl(fileName);
      
    return { publicUrl, error: null };
  } catch (error: any) {
    console.error('Error uploading organization branding:', error);
    return { publicUrl: null, error };
  }
};

export const createQRPayment = async (
  driverId: string,
  passengerPhone: string,
  amount: number
): Promise<{ data: QRPayment | null; error: Error | null }> => {
  try {
    const { data, error } = await supabase
      .from('qr_payments')
      .insert({
        driver_id: driverId,
        passenger_phone: passengerPhone,
        amount: amount,
        status: 'pending'
      })
      .select()
      .single();
      
    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    console.error('Error creating QR payment:', error);
    return { data: null, error };
  }
};

export const updateQRPaymentStatus = async (
  paymentId: string,
  status: 'completed' | 'failed'
): Promise<{ error: Error | null }> => {
  try {
    const { error } = await supabase
      .from('qr_payments')
      .update({ status })
      .eq('id', paymentId);
      
    if (error) throw error;
    return { error: null };
  } catch (error: any) {
    console.error('Error updating QR payment status:', error);
    return { error };
  }
};

