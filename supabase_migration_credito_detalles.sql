-- Script de Migración para agregar la columna creditoDetalles en la tabla movimientos_temporales
-- Ejecutar este script en el editor SQL de Supabase (https://supabase.com/dashboard/project/grfyzwfinmowqqxfegsx/sql/new)

ALTER TABLE public.movimientos_temporales 
ADD COLUMN IF NOT EXISTS "creditoDetalles" JSONB DEFAULT NULL;
