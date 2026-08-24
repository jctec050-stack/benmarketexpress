import { NextResponse, userAgent } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { os, browser, device } = userAgent(request)
    const rawUserAgent = request.headers.get('user-agent') || 'Desconocido'
    
    // Attempt to get IP from headers (common in Vercel/proxies)
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               request.ip || 
               'IP Desconocida'

    // Formatear nombres
    const osName = os.name ? `${os.name} ${os.version || ''}`.trim() : 'Desconocido'
    const browserName = browser.name ? `${browser.name} ${browser.version || ''}`.trim() : 'Desconocido'
    const deviceType = device.type || 'Escritorio'

    // Insertar en base de datos
    const { data, error } = await supabase
      .from('conexiones_dispositivos')
      .insert([
        {
          usuario_id: session.user.id,
          ip_address: ip,
          browser: browserName,
          os: osName,
          device_type: deviceType,
          user_agent: rawUserAgent
        }
      ])

    if (error) {
      console.error('Error insertando dispositivo:', error)
      return NextResponse.json({ error: 'Error al registrar conexión' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })

  } catch (error) {
    console.error('Error en log-device:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
