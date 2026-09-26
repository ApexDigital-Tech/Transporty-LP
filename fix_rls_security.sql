-- ==========================================
-- SCRIPT DE SEGURIDAD SAAS Y GARBAGE COLLECTOR (PG_CRON)
-- ==========================================
-- Ejecuta este script en el editor SQL de Supabase.

-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Asegurar que RLS esté activo en todas las tablas
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;

-- 3. Limpiar políticas antiguas
DROP POLICY IF EXISTS "Public Select Orgs" ON public.organizations;
DROP POLICY IF EXISTS "Public Select Routes" ON public.routes;
DROP POLICY IF EXISTS "Public Access Drivers" ON public.drivers;
DROP POLICY IF EXISTS "Public Access Live" ON public.live_locations;
DROP POLICY IF EXISTS "Allow select for everyone" ON public.drivers;
DROP POLICY IF EXISTS "Allow insert for self" ON public.drivers;
DROP POLICY IF EXISTS "Allow update for self" ON public.drivers;
DROP POLICY IF EXISTS "Allow delete for self" ON public.drivers;
DROP POLICY IF EXISTS "Allow select for everyone" ON public.live_locations;
DROP POLICY IF EXISTS "Allow write for self" ON public.live_locations;

-- 4. Políticas para Organizations y Routes (Lectura pública)
CREATE POLICY "Public Select Orgs" ON public.organizations FOR SELECT USING (true);
CREATE POLICY "Public Select Routes" ON public.routes FOR SELECT USING (true);

-- 5. Políticas de Drivers (UUID del chofer coincide con auth.uid())
CREATE POLICY "Allow select for everyone" ON public.drivers FOR SELECT USING (true);
CREATE POLICY "Allow insert for self" ON public.drivers FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow update for self" ON public.drivers FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow delete for self" ON public.drivers FOR DELETE USING (auth.uid() = id);

-- 6. Políticas de Live Locations (driver_id coincide con auth.uid())
CREATE POLICY "Allow select for everyone" ON public.live_locations FOR SELECT USING (true);
CREATE POLICY "Allow write for self" ON public.live_locations FOR ALL USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

-- 7. Garbage Collector en el Servidor (pg_cron)
-- Crear función para purgar registros de ubicación inactivos (TTL 2 minutos)
CREATE OR REPLACE FUNCTION public.purge_inactive_locations()
RETURNS void AS $$
BEGIN
  DELETE FROM public.live_locations
  WHERE last_updated < NOW() - INTERVAL '2 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Desprogramar tarea antigua si existe (seguro contra errores)
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'purge-inactive-locations-cron';

-- Programar para que corra cada minuto
SELECT cron.schedule(
  'purge-inactive-locations-cron',
  '* * * * *', -- Cada minuto
  'SELECT public.purge_inactive_locations()'
);

-- 8. Trigger para autocompletar organization_id en live_locations basándose en la organización del chofer
CREATE OR REPLACE FUNCTION public.set_live_location_organization()
RETURNS trigger AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id
  FROM public.drivers
  WHERE id = NEW.driver_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_live_location_org_trigger ON public.live_locations;
CREATE TRIGGER set_live_location_org_trigger
BEFORE INSERT OR UPDATE ON public.live_locations
FOR EACH ROW
EXECUTE FUNCTION public.set_live_location_organization();

