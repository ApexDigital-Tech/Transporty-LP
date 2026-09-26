-- ==========================================
-- SCRIPT DE MIGRACIÓN: MULTI-TENANT, POSTGIS, STORAGE Y TRAMEAJE
-- ==========================================
-- Ejecuta todo este script en el Editor SQL de Supabase.

-- ---------------------------------------------------------------------
-- 1. HABILITAR EXTENSIONES
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------
-- 2. MODIFICACIÓN DEL ESQUEMA: HITO 1 (STORAGE) Y HITO 2 (POSTGIS / TRAMEAJE)
-- ---------------------------------------------------------------------

-- Alterar tabla drivers para añadir nuevos campos de urls de adjuntos
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS foto_vehiculo_url TEXT,
ADD COLUMN IF NOT EXISTS documentacion_urls JSONB DEFAULT '{}'::jsonb;

-- Alterar tabla routes para añadir la columna espacial route_path (LineString)
ALTER TABLE public.routes 
ADD COLUMN IF NOT EXISTS route_path GEOGRAPHY(LineString, 4326);

-- Alterar tabla live_locations para añadir columnas espaciales y de alerta de trameaje
ALTER TABLE public.live_locations 
ADD COLUMN IF NOT EXISTS geom GEOGRAPHY(Point, 4326),
ADD COLUMN IF NOT EXISTS is_off_route BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS distance_from_path DOUBLE PRECISION DEFAULT 0.0;

-- Crear índices espaciales GIST
CREATE INDEX IF NOT EXISTS idx_routes_route_path ON public.routes USING gist(route_path);
CREATE INDEX IF NOT EXISTS idx_live_locations_geom ON public.live_locations USING gist(geom);

-- ---------------------------------------------------------------------
-- 3. TABLA DE PERFILES DE ADMINISTRADOR (HITO 3)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS en admin_profiles
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- Políticas para admin_profiles
DROP POLICY IF EXISTS "Admins can read own profile" ON public.admin_profiles;
CREATE POLICY "Admins can read own profile" ON public.admin_profiles FOR SELECT USING (auth.uid() = id);

-- ---------------------------------------------------------------------
-- 4. FUNCIONES HELPER PARA RLS Y TENANCY
-- ---------------------------------------------------------------------

-- Obtener organización del administrador actual
CREATE OR REPLACE FUNCTION public.get_my_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.admin_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Verificar si es superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT role = 'superadmin' FROM public.admin_profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------------
-- 5. TRIGGER DE TELEMETRÍA Y CONTROL DE TRAMEAJE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_live_location_organization()
RETURNS trigger AS $$
DECLARE
  var_route_path GEOGRAPHY;
BEGIN
  -- 1. Sincronizar organization_id desde la ficha del conductor
  SELECT organization_id INTO NEW.organization_id
  FROM public.drivers
  WHERE id = NEW.driver_id;
  
  -- 2. Generar representación geográfica del punto
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  
  -- 3. Calcular trameaje si tiene ruta asignada
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

-- Recrear el trigger en live_locations
DROP TRIGGER IF EXISTS set_live_location_org_trigger ON public.live_locations;
CREATE TRIGGER set_live_location_org_trigger
BEFORE INSERT OR UPDATE ON public.live_locations
FOR EACH ROW
EXECUTE FUNCTION public.set_live_location_organization();

-- ---------------------------------------------------------------------
-- 6. RPC: OBTENER CHOFERES CERCANOS (HITO 2)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_nearby_drivers(
  passenger_lat double precision, 
  passenger_lng double precision, 
  radius_meters double precision
)
RETURNS TABLE (
  driver_id UUID,
  driver_name TEXT,
  phone TEXT,
  placa TEXT,
  organization_id UUID,
  organization_name TEXT,
  route_id UUID,
  route_line_code TEXT,
  latitude double precision,
  longitude double precision,
  last_updated timestamp with time zone,
  is_off_route boolean,
  distance_from_path double precision,
  foto_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id AS driver_id,
    d.name AS driver_name,
    d.phone,
    d.placa,
    d.organization_id,
    o.name AS organization_name,
    l.route_id,
    r.line_code AS route_line_code,
    l.latitude,
    l.longitude,
    l.last_updated,
    l.is_off_route,
    l.distance_from_path,
    d.foto_url
  FROM public.live_locations l
  JOIN public.drivers d ON l.driver_id = d.id
  LEFT JOIN public.organizations o ON d.organization_id = o.id
  LEFT JOIN public.routes r ON l.route_id = r.id
  WHERE ST_DWithin(
    l.geom, 
    ST_SetSRID(ST_MakePoint(passenger_lng, passenger_lat), 4326)::geography, 
    radius_meters
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------
-- 7. POLÍTICAS RLS MULTI-TENANT ACTUALIZADAS (HITO 3)
-- ---------------------------------------------------------------------

-- A. Limpiar políticas anteriores para evitar conflictos
DROP POLICY IF EXISTS "Public Select Orgs" ON public.organizations;
DROP POLICY IF EXISTS "Public Select Routes" ON public.routes;
DROP POLICY IF EXISTS "Allow select for everyone" ON public.drivers;
DROP POLICY IF EXISTS "Allow insert for self" ON public.drivers;
DROP POLICY IF EXISTS "Allow update for self" ON public.drivers;
DROP POLICY IF EXISTS "Allow delete for self" ON public.drivers;
DROP POLICY IF EXISTS "Allow select for everyone" ON public.live_locations;
DROP POLICY IF EXISTS "Allow write for self" ON public.live_locations;

-- B. Políticas de Organizations
CREATE POLICY "Public Select Orgs" ON public.organizations FOR SELECT USING (true);
CREATE POLICY "Admins Manage Orgs" ON public.organizations FOR ALL USING (public.is_superadmin());

-- C. Políticas de Routes
CREATE POLICY "Public Select Routes" ON public.routes FOR SELECT USING (true);
CREATE POLICY "Admins Manage Routes" ON public.routes FOR ALL 
USING (public.is_superadmin() OR organization_id = public.get_my_organization_id())
WITH CHECK (public.is_superadmin() OR organization_id = public.get_my_organization_id());

-- D. Políticas de Drivers
CREATE POLICY "Public Select Drivers" ON public.drivers FOR SELECT USING (true);
CREATE POLICY "Self Manage Driver" ON public.drivers FOR ALL 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins Manage Drivers" ON public.drivers FOR ALL 
USING (public.is_superadmin() OR organization_id = public.get_my_organization_id())
WITH CHECK (public.is_superadmin() OR organization_id = public.get_my_organization_id());

-- E. Políticas de Live Locations
CREATE POLICY "Public Select Live" ON public.live_locations FOR SELECT USING (true);
CREATE POLICY "Self Manage Live" ON public.live_locations FOR ALL 
USING (auth.uid() = driver_id)
WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Admins Manage Live" ON public.live_locations FOR ALL 
USING (public.is_superadmin() OR organization_id = public.get_my_organization_id())
WITH CHECK (public.is_superadmin() OR organization_id = public.get_my_organization_id());

-- ---------------------------------------------------------------------
-- 8. POLÍTICAS RLS EN SUPABASE STORAGE (HITO 1)
-- ---------------------------------------------------------------------

-- Asegurar que el bucket existe
INSERT INTO storage.buckets (id, name, public) 
VALUES ('driver_profiles', 'driver_profiles', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas sobre storage.objects
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow Uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public select on driver_profiles" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated insert on driver_profiles" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update/delete on driver_profiles" ON storage.objects;

-- 1. Permitir lectura pública de las fotos y documentos
CREATE POLICY "Allow public select on driver_profiles" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'driver_profiles');

-- 2. Permitir a usuarios autenticados subir archivos a su propia subcarpeta (su UUID)
CREATE POLICY "Allow authenticated insert on driver_profiles" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (
  bucket_id = 'driver_profiles' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Permitir a los usuarios modificar/eliminar únicamente sus propios archivos
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
