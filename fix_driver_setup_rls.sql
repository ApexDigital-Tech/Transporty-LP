-- =====================================================================
-- SQL PATCH: FIX DRIVERS ONBOARDING & STORAGE PERMISSIONS
-- =====================================================================
-- Ejecuta este script en el Editor SQL de Supabase para autorizar
-- el registro de choferes y la subida de sus fotos y documentos.

-- 1. Asegurar permisos totales de escritura y lectura en la tabla drivers
DROP POLICY IF EXISTS "Allow insert for self" ON public.drivers;
DROP POLICY IF EXISTS "Allow update for self" ON public.drivers;
DROP POLICY IF EXISTS "Allow delete for self" ON public.drivers;
DROP POLICY IF EXISTS "Allow all for drivers" ON public.drivers;

CREATE POLICY "Allow all for drivers" ON public.drivers
FOR ALL USING (true) WITH CHECK (true);

-- 2. Asegurar permisos en live_locations para telemetría
DROP POLICY IF EXISTS "Allow write for self" ON public.live_locations;
DROP POLICY IF EXISTS "Allow all for live_locations" ON public.live_locations;

CREATE POLICY "Allow all for live_locations" ON public.live_locations
FOR ALL USING (true) WITH CHECK (true);

-- 3. Crear / Configurar bucket 'driver_profiles' en Supabase Storage
INSERT INTO storage.buckets (id, name, public) 
VALUES ('driver_profiles', 'driver_profiles', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 4. Habilitar subida y lectura pública en 'driver_profiles'
DROP POLICY IF EXISTS "Allow public uploads on driver_profiles" ON storage.objects;
DROP POLICY IF EXISTS "Allow public select on driver_profiles" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update on driver_profiles" ON storage.objects;

CREATE POLICY "Allow public uploads on driver_profiles" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'driver_profiles');

CREATE POLICY "Allow public select on driver_profiles" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'driver_profiles');

CREATE POLICY "Allow public update on driver_profiles" 
ON storage.objects FOR ALL 
USING (bucket_id = 'driver_profiles')
WITH CHECK (bucket_id = 'driver_profiles');
