-- =====================================================================
-- SQL PATCH: AGREGAR COLUMNAS FALTANTES PARA CHOFERES Y STORAGE (HITO 1 & 2)
-- =====================================================================
-- INSTRUCCIONES: Copia y ejecuta todo este script en el Editor SQL de Supabase.
-- Esto solucionará el error 400 Bad Request / PGRST204 de columnas faltantes.

-- 1. Habilitar extensión PostGIS si no está habilitada
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Añadir columnas faltantes de fotos y documentación a public.drivers
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS foto_vehiculo_url TEXT,
ADD COLUMN IF NOT EXISTS documentacion_urls JSONB DEFAULT '{}'::jsonb;

-- 3. Añadir columna espacial de trazado de ruta a public.routes
ALTER TABLE public.routes 
ADD COLUMN IF NOT EXISTS route_path GEOGRAPHY(LineString, 4326);

-- 4. Añadir columnas de telemetría y trameaje a public.live_locations
ALTER TABLE public.live_locations 
ADD COLUMN IF NOT EXISTS geom GEOGRAPHY(Point, 4326),
ADD COLUMN IF NOT EXISTS is_off_route BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS distance_from_path DOUBLE PRECISION DEFAULT 0.0;

-- 5. Crear índices espaciales GIST
CREATE INDEX IF NOT EXISTS idx_routes_route_path ON public.routes USING gist(route_path);
CREATE INDEX IF NOT EXISTS idx_live_locations_geom ON public.live_locations USING gist(geom);

-- 6. Crear función y trigger para setear la organización y trameaje automáticamente
CREATE OR REPLACE FUNCTION public.set_live_location_organization()
RETURNS trigger AS $$
DECLARE
  var_route_path GEOGRAPHY;
BEGIN
  -- Sincronizar organization_id desde la ficha del conductor
  SELECT organization_id INTO NEW.organization_id
  FROM public.drivers
  WHERE id = NEW.driver_id;
  
  -- Generar representación geográfica del punto
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  
  -- Calcular trameaje si tiene ruta asignada
  IF NEW.route_id IS NOT NULL THEN
    SELECT route_path INTO var_route_path
    FROM public.routes
    WHERE id = NEW.route_id;
    
    IF var_route_path IS NOT NULL AND NEW.geom IS NOT NULL THEN
      NEW.distance_from_path := ST_Distance(NEW.geom, var_route_path);
      NEW.is_off_route := (NEW.distance_from_path > 100); -- Alerta si se desvía más de 100 metros
    ELSE
      NEW.distance_from_path := 0.0;
      NEW.is_off_route := false;
    END IF;
  ELSE
    NEW.distance_from_path := 0.0;
    NEW.is_off_route := false;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_live_location_org_trigger ON public.live_locations;
CREATE TRIGGER set_live_location_org_trigger
BEFORE INSERT OR UPDATE ON public.live_locations
FOR EACH ROW
EXECUTE FUNCTION public.set_live_location_organization();

-- 7. Crear el bucket 'driver_profiles' si no existe
INSERT INTO storage.buckets (id, name, public) 
VALUES ('driver_profiles', 'driver_profiles', true)
ON CONFLICT (id) DO NOTHING;

-- 8. Limpiar políticas antiguas sobre driver_profiles
DROP POLICY IF EXISTS "Allow public select on driver_profiles" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated insert on driver_profiles" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update/delete on driver_profiles" ON storage.objects;

-- 9. Crear políticas sobre storage.objects para driver_profiles
CREATE POLICY "Allow public select on driver_profiles" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'driver_profiles');

CREATE POLICY "Allow authenticated insert on driver_profiles" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (
  bucket_id = 'driver_profiles' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Allow authenticated update/delete on driver_profiles" 
ON storage.objects FOR ALL 
TO authenticated 
USING (
  bucket_id = 'driver_profiles' 
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'driver_profiles' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 10. Recargar caché de PostgREST para aplicar cambios inmediatamente
NOTIFY pgrst, 'reload schema';
