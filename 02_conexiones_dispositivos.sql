-- Crear tabla para registrar las conexiones de dispositivos
CREATE TABLE IF NOT EXISTS public.conexiones_dispositivos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    usuario_id UUID REFERENCES public.perfiles_usuarios(id) ON DELETE CASCADE,
    ip_address TEXT,
    browser TEXT,
    os TEXT,
    device_type TEXT,
    user_agent TEXT,
    ultimo_acceso TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_conexiones_usuario_id ON public.conexiones_dispositivos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_conexiones_ultimo_acceso ON public.conexiones_dispositivos(ultimo_acceso DESC);

-- Habilitar Seguridad a Nivel de Fila (RLS)
ALTER TABLE public.conexiones_dispositivos ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- Permitir que los usuarios vean sus propias conexiones
CREATE POLICY "conexiones_select_own" 
    ON public.conexiones_dispositivos 
    FOR SELECT 
    USING (auth.uid() = usuario_id);

-- Permitir que los administradores vean todas las conexiones
CREATE POLICY "conexiones_select_admin" 
    ON public.conexiones_dispositivos 
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.perfiles_usuarios 
            WHERE id = auth.uid() AND rol = 'admin' AND activo = TRUE
        )
    );

-- Permitir que el sistema inserte registros (cualquier usuario autenticado puede registrar su conexión)
CREATE POLICY "conexiones_insert_authenticated" 
    ON public.conexiones_dispositivos 
    FOR INSERT 
    WITH CHECK (auth.uid() = usuario_id);

-- Permitir que el sistema actualice registros (para actualizar 'ultimo_acceso' si ya existe el dispositivo)
CREATE POLICY "conexiones_update_authenticated" 
    ON public.conexiones_dispositivos 
    FOR UPDATE 
    USING (auth.uid() = usuario_id);
