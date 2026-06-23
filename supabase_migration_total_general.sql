-- Script de Migración para agregar Efectivo Real al Cierre en public.total_general

-- 1. Agregar columna efectivo_real (tipo NUMERIC)
ALTER TABLE public.total_general 
ADD COLUMN IF NOT EXISTS efectivo_real NUMERIC NOT NULL DEFAULT 0;

-- 2. Agregar columna efectivo_real_detalle (tipo JSONB)
ALTER TABLE public.total_general 
ADD COLUMN IF NOT EXISTS efectivo_real_detalle JSONB NOT NULL DEFAULT '{}'::jsonb;
