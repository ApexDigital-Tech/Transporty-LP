-- =====================================================================
-- SQL PATCH: CONFIGURACIÓN DE ROLES SUPERADMIN Y ADMIN DE SINDICATO
-- =====================================================================
-- Ejecuta este script en el editor SQL de Supabase para vincular los 
-- números de teléfono de prueba con sus respectivos roles y sindicatos.

-- 1. Función para crear/actualizar perfiles de administración dinámicamente
CREATE OR REPLACE FUNCTION public.handle_new_admin_profile()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
BEGIN
  -- SuperAdmin: termina en 72845621
  IF NEW.phone LIKE '%72845621' THEN
    INSERT INTO public.admin_profiles (id, role, organization_id)
    VALUES (NEW.id, 'superadmin', NULL)
    ON CONFLICT (id) DO UPDATE 
    SET role = 'superadmin', organization_id = NULL;
  
  -- Admin Sindicato 14 de Septiembre: termina en 72845620
  ELSIF NEW.phone LIKE '%72845620' THEN
    SELECT id INTO org_id FROM public.organizations WHERE name = 'SINDICATO 14 DE SEPTIEMBRE' LIMIT 1;
    INSERT INTO public.admin_profiles (id, role, organization_id)
    VALUES (NEW.id, 'admin', org_id)
    ON CONFLICT (id) DO UPDATE 
    SET role = 'admin', organization_id = org_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Recrear el trigger en auth.users para futuros registros/logins
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_admin_profile();

-- 3. Crear/actualizar perfiles para los usuarios que ya se registraron durante las pruebas
DO $$
DECLARE
  user_id_superadmin UUID;
  user_id_admin UUID;
  org_id_14 UUID;
BEGIN
  -- Buscar UUIDs en auth.users usando LIKE para mayor tolerancia a formatos
  SELECT id INTO user_id_superadmin FROM auth.users WHERE phone LIKE '%72845621' LIMIT 1;
  SELECT id INTO user_id_admin FROM auth.users WHERE phone LIKE '%72845620' LIMIT 1;
  
  -- Buscar ID del Sindicato 14 de Septiembre
  SELECT id INTO org_id_14 FROM public.organizations WHERE name = 'SINDICATO 14 DE SEPTIEMBRE' LIMIT 1;
  
  -- Sincronizar SuperAdmin
  IF user_id_superadmin IS NOT NULL THEN
    INSERT INTO public.admin_profiles (id, role, organization_id)
    VALUES (user_id_superadmin, 'superadmin', NULL)
    ON CONFLICT (id) DO UPDATE SET role = 'superadmin', organization_id = NULL;
  END IF;
  
  -- Sincronizar Admin Sindicato 14 de Septiembre
  IF user_id_admin IS NOT NULL THEN
    INSERT INTO public.admin_profiles (id, role, organization_id)
    VALUES (user_id_admin, 'admin', org_id_14)
    ON CONFLICT (id) DO UPDATE SET role = 'admin', organization_id = org_id_14;
  END IF;
END $$;
