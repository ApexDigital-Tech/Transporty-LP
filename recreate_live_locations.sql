-- ========================================================
-- SCRIPT PARA SOLUCIONAR live_locations SCHEMA CACHE ERROR
-- ========================================================
-- Ejecuta todo este script en el editor SQL de Supabase. Esto recreará 
-- la tabla con las columnas exactas que la app Expo requiere.

-- 1. Eliminar la tabla live_locations para corregir discrepancias
DROP TABLE IF EXISTS public.live_locations CASCADE;

-- 2. Crear la tabla live_locations con el esquema correcto (latitude/longitude/last_updated)
CREATE TABLE public.live_locations (
    driver_id UUID PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
    route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- 3. Habilitar Seguridad RLS
ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;

-- 4. Crear Políticas RLS
CREATE POLICY "Allow select for everyone" ON public.live_locations FOR SELECT USING (true);
CREATE POLICY "Allow write for self" ON public.live_locations FOR ALL USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

-- 5. Agregar la tabla a la publicación en tiempo real de Supabase
-- Nota: Si da error de que ya existe en la publicación, se puede ignorar.
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_locations;

-- 6. Trigger para autocompletar organization_id
CREATE OR REPLACE FUNCTION public.set_live_location_organization()
RETURNS trigger AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id
  FROM public.drivers
  WHERE id = NEW.driver_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER set_live_location_org_trigger
BEFORE INSERT OR UPDATE ON public.live_locations
FOR EACH ROW
EXECUTE FUNCTION public.set_live_location_organization();
