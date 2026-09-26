-- ==========================================
-- SQL PATCH: CRM MULTITENANT, FACTURACIÓN, BRANDING Y ALERTAS
-- ==========================================

-- 0. Habilitar la tabla de perfiles de admin y funciones auxiliares si no existen
CREATE TABLE IF NOT EXISTS public.admin_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.get_my_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.admin_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT role = 'superadmin' FROM public.admin_profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 1. Añadir columnas a la tabla organizations si no existen
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS banner_url TEXT,
ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#2563eb',
ADD COLUMN IF NOT EXISTS billing_plan TEXT DEFAULT 'monthly' CHECK (billing_plan IN ('weekly', 'monthly', 'unpaid')),
ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'active' CHECK (billing_status IN ('active', 'suspended', 'trial')),
ADD COLUMN IF NOT EXISTS billing_amount DOUBLE PRECISION DEFAULT 150.0,
ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- 2. Crear la tabla de alertas
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE, -- NULL significa alerta global/municipal
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS en alerts
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas antiguas de alerts si existen
DROP POLICY IF EXISTS "Public select alerts" ON public.alerts;
DROP POLICY IF EXISTS "Admins write alerts" ON public.alerts;

-- Crear políticas limpias
CREATE POLICY "Public select alerts" ON public.alerts FOR SELECT USING (true);

CREATE POLICY "Admins write alerts" ON public.alerts FOR ALL 
USING (
  public.is_superadmin() 
  OR organization_id = public.get_my_organization_id()
)
WITH CHECK (
  public.is_superadmin() 
  OR organization_id = public.get_my_organization_id()
);

-- 3. Configurar Supabase Storage para el branding de organizaciones
INSERT INTO storage.buckets (id, name, public) 
VALUES ('organizations_branding', 'organizations_branding', true)
ON CONFLICT (id) DO NOTHING;

-- Limpiar políticas antiguas de storage para branding
DROP POLICY IF EXISTS "Allow public select on branding" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin insert on branding" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin update/delete on branding" ON storage.objects;

-- 1. Permitir lectura pública
CREATE POLICY "Allow public select on branding" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'organizations_branding');

-- 2. Permitir a administradores o superadmins subir imágenes
CREATE POLICY "Allow admin insert on branding" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (
  bucket_id = 'organizations_branding'
  AND (
    public.is_superadmin()
    OR (storage.foldername(name))[1] = public.get_my_organization_id()::text
  )
);

-- 3. Permitir a administradores o superadmins modificar/eliminar imágenes
CREATE POLICY "Allow admin update/delete on branding" 
ON storage.objects FOR ALL 
TO authenticated 
USING (
  bucket_id = 'organizations_branding'
  AND (
    public.is_superadmin()
    OR (storage.foldername(name))[1] = public.get_my_organization_id()::text
  )
)
WITH CHECK (
  bucket_id = 'organizations_branding'
  AND (
    public.is_superadmin()
    OR (storage.foldername(name))[1] = public.get_my_organization_id()::text
  )
);
