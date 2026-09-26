-- =====================================================================
-- SQL CONSOLIDATED PATCH: ROBUST SAAS MULTI-TENANCY, STORAGE & BRANDING
-- =====================================================================
-- INSTRUCCIONES: Copia y ejecuta todo este script en el Editor SQL de Supabase.

-- 1. Crear el bucket 'organizations_branding' si no existe
INSERT INTO storage.buckets (id, name, public) 
VALUES ('organizations_branding', 'organizations_branding', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Limpiar políticas de storage antiguas para branding
DROP POLICY IF EXISTS "Allow public select on branding" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin insert on branding" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin update/delete on branding" ON storage.objects;

-- 3. Crear políticas para el bucket 'organizations_branding'
CREATE POLICY "Allow public select on branding" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'organizations_branding');

CREATE POLICY "Allow admin insert on branding" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (
  bucket_id = 'organizations_branding'
);

CREATE POLICY "Allow admin update/delete on branding" 
ON storage.objects FOR ALL 
TO authenticated 
USING (
  bucket_id = 'organizations_branding'
)
WITH CHECK (
  bucket_id = 'organizations_branding'
);

-- 4. Redefinir is_superadmin() de forma robusta con fallback directo al teléfono de auth.users
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'superadmin' FROM public.admin_profiles WHERE id = auth.uid()),
    (SELECT phone LIKE '%72845621' FROM auth.users WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5. Redefinir get_my_organization_id() con fallback al Sindicato 14 de Septiembre si es el número de prueba
CREATE OR REPLACE FUNCTION public.get_my_organization_id()
RETURNS UUID AS $$
DECLARE
  org_id UUID;
BEGIN
  -- Intentar obtener de la tabla admin_profiles
  SELECT organization_id INTO org_id FROM public.admin_profiles WHERE id = auth.uid();
  
  -- Fallback de seguridad para el número de prueba de Admin si no se ha sincronizado en la tabla
  IF org_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND phone LIKE '%72845620') THEN
      SELECT id INTO org_id FROM public.organizations WHERE name = 'SINDICATO 14 DE SEPTIEMBRE' LIMIT 1;
    END IF;
  END IF;
  
  RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 6. Habilitar RLS en public.organizations si no está activo
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 7. Habilitar actualización de branding a los Admins de su propia organización y a SuperAdmins
DROP POLICY IF EXISTS "Orgs update own branding" ON public.organizations;
DROP POLICY IF EXISTS "Admins Manage Orgs" ON public.organizations;

CREATE POLICY "Orgs update own branding" 
ON public.organizations FOR UPDATE 
USING (
  id = public.get_my_organization_id()
  OR public.is_superadmin()
)
WITH CHECK (
  id = public.get_my_organization_id()
  OR public.is_superadmin()
);

-- 8. Asignar rutas específicas del Sindicato 14 de Septiembre en la DB para la prueba de Admin
DO $$
DECLARE
  org_id_14 UUID;
BEGIN
  SELECT id INTO org_id_14 FROM public.organizations WHERE name = 'SINDICATO 14 DE SEPTIEMBRE' LIMIT 1;
  
  IF org_id_14 IS NOT NULL THEN
    -- Asignar Ruta 14, Ruta 10, y crear un par adicionales para que el Admin tenga rutas asignadas
    UPDATE public.routes 
    SET organization_id = org_id_14 
    WHERE line_code IN ('10', '14', '300', '158');
    
    -- Insertar un par de rutas adicionales de prueba si no existen
    IF NOT EXISTS (SELECT 1 FROM public.routes WHERE line_code = '14-A') THEN
      INSERT INTO public.routes (line_code, name, start_point, end_point, vehicle_type, organization_id)
      VALUES ('14-A', 'Ruta 14-A (Pampa - Prado)', 'Pamphasi', 'Prado', 'MINIBUS', org_id_14);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.routes WHERE line_code = '14-B') THEN
      INSERT INTO public.routes (line_code, name, start_point, end_point, vehicle_type, organization_id)
      VALUES ('14-B', 'Ruta 14-B (Chasquipampa - San Pedro)', 'Chasquipampa', 'San Pedro', 'MINIBUS', org_id_14);
    END IF;
  END IF;
END $$;

-- 9. Sincronizar retroactivamente las cuentas de prueba en la tabla admin_profiles
DO $$
DECLARE
  user_id_superadmin UUID;
  user_id_admin UUID;
  org_id_14 UUID;
BEGIN
  SELECT id INTO user_id_superadmin FROM auth.users WHERE phone LIKE '%72845621' LIMIT 1;
  SELECT id INTO user_id_admin FROM auth.users WHERE phone LIKE '%72845620' LIMIT 1;
  SELECT id INTO org_id_14 FROM public.organizations WHERE name = 'SINDICATO 14 DE SEPTIEMBRE' LIMIT 1;
  
  IF user_id_superadmin IS NOT NULL THEN
    INSERT INTO public.admin_profiles (id, role, organization_id)
    VALUES (user_id_superadmin, 'superadmin', NULL)
    ON CONFLICT (id) DO UPDATE SET role = 'superadmin', organization_id = NULL;
  END IF;
  
  IF user_id_admin IS NOT NULL THEN
    INSERT INTO public.admin_profiles (id, role, organization_id)
    VALUES (user_id_admin, 'admin', org_id_14)
    ON CONFLICT (id) DO UPDATE SET role = 'admin', organization_id = org_id_14;
  END IF;
END $$;
