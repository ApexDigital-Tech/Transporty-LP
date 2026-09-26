-- ========================================================
-- SCRIPT DE REPARACIÓN DE POLÍTICAS EN TABLA DRIVERS
-- ========================================================
-- Ejecuta este script en el editor SQL de Supabase para limpiar 
-- cualquier política antigua o duplicada que esté causando recursión.

-- 1. Desactivar RLS temporalmente para evitar bloqueos
ALTER TABLE public.drivers DISABLE ROW LEVEL SECURITY;

-- 2. Eliminar absolutamente todas las políticas conocidas y antiguas en drivers
DROP POLICY IF EXISTS "Public Access Drivers" ON public.drivers;
DROP POLICY IF EXISTS "Allow select for everyone" ON public.drivers;
DROP POLICY IF EXISTS "Allow insert for self" ON public.drivers;
DROP POLICY IF EXISTS "Allow update for self" ON public.drivers;
DROP POLICY IF EXISTS "Allow delete for self" ON public.drivers;
DROP POLICY IF EXISTS "Allow public read of drivers" ON public.drivers;
DROP POLICY IF EXISTS "Allow public insert of drivers" ON public.drivers;
DROP POLICY IF EXISTS "Allow public update of drivers" ON public.drivers;
DROP POLICY IF EXISTS "Allow public delete of drivers" ON public.drivers;

-- 3. Volver a habilitar RLS con las políticas limpias de la Fase 1
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- 4. Re-crear las políticas sin subconsultas recursivas
CREATE POLICY "Allow select for everyone" ON public.drivers FOR SELECT USING (true);
CREATE POLICY "Allow insert for self" ON public.drivers FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow update for self" ON public.drivers FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow delete for self" ON public.drivers FOR DELETE USING (auth.uid() = id);
