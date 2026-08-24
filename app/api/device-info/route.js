import { NextResponse, userAgent } from 'next/server'

export async function GET(request) {
  const { os, browser, device } = userAgent(request)
  const rawUserAgent = request.headers.get('user-agent') || 'Desconocido'
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || request.ip || 'IP Desconocida'

  return NextResponse.json({
    ip,
    browser: browser.name ? `${browser.name} ${browser.version || ''}`.trim() : 'Desconocido',
    os: os.name ? `${os.name} ${os.version || ''}`.trim() : 'Desconocido',
    deviceType: device.type || 'Escritorio',
    rawUserAgent
  })
}
