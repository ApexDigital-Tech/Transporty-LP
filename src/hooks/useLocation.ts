import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';

export interface Coords {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
}

export const useLocation = () => {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permiso de ubicación denegado. Usando simulador GPS.');
          useMockLocation();
          return;
        }

        // Get initial position
        const initialLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCoords({
          latitude: initialLoc.coords.latitude,
          longitude: initialLoc.coords.longitude,
          heading: initialLoc.coords.heading,
          speed: initialLoc.coords.speed,
        });
      } catch (err) {
        console.warn('Usando GPS Simulado:', err);
        useMockLocation();
      }
    })();

    return () => {
      stopTracking();
    };
  }, []);

  // Función para simular movimiento en La Paz si no hay GPS real
  const useMockLocation = () => {
    setCoords({
      latitude: -16.5000,
      longitude: -68.1500,
      speed: 12.5, // m/s
    });
  };

  const mockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTracking = async (onLocationUpdate?: (newCoords: Coords) => void) => {
    if (isTracking) return;

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const requestRes = await Location.requestForegroundPermissionsAsync();
        if (requestRes.status !== 'granted') {
          throw new Error('Permisos denegados');
        }
      }

      setIsTracking(true);
      // High accuracy tracking with small distance threshold (5 meters) to reduce database spam
      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4000, // Update gps every 4 seconds
          distanceInterval: 5, // Or when moved 5 meters
        },
        (location) => {
          const newCoords: Coords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            heading: location.coords.heading,
            speed: location.coords.speed,
          };
          setCoords(newCoords);
          if (onLocationUpdate) {
            onLocationUpdate(newCoords);
          }
        }
      );
    } catch (err) {
      const error = err as Error;
      console.warn('Iniciando Simulador de Movimiento en La Paz debido a error:', error.message);
      setErrorMsg('Usando Simulador GPS...');
      setIsTracking(true);
      
      // Simulador de movimiento
      let currentLat = -16.5000;
      let currentLng = -68.1500;
      
      mockIntervalRef.current = setInterval(() => {
        // Mover ligeramente hacia el sur-este simulando un viaje por el centro
        currentLat -= 0.00015;
        currentLng += 0.00010;
        
        const newCoords: Coords = {
          latitude: currentLat,
          longitude: currentLng,
          speed: 10 + Math.random() * 5, // Velocidad variable
        };
        
        setCoords(newCoords);
        if (onLocationUpdate) {
          onLocationUpdate(newCoords);
        }
      }, 4000);
    }
  };

  const stopTracking = () => {
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.remove();
      } catch (e) {
        console.warn('Advertencia al remover suscripción GPS:', e);
      }
      subscriptionRef.current = null;
    }
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }
    setIsTracking(false);
  };

  return {
    coords,
    errorMsg,
    isTracking,
    startTracking,
    stopTracking,
  };
};
