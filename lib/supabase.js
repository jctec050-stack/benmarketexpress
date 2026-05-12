import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://grfyzwfinmowqqxfegsx.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyZnl6d2Zpbm1vd3FxeGZlZ3N4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4MTY3ODMsImV4cCI6MjA3ODM5Mjc4M30.PSr-D8iyMv0ccLUhlFy5Vi6QO12VVWQVDFubmsrotT8'

// Memory-backed storage adapter for Supermium compatibility
// Prevents infinite loops if browser's localStorage is slow or asynchronous
const memoryCache = {}

const customStorage = {
  getItem: (key) => {
    try {
      // Si ya lo tenemos en memoria, lo usamos directo (esto evita el lag de lectura en Supermium)
      if (memoryCache[key] !== undefined) {
        return memoryCache[key]
      }
      // Si no está en memoria, intentamos leer del navegador
      if (typeof window !== 'undefined') {
        const value = window.localStorage.getItem(key)
        memoryCache[key] = value
        return value
      }
      return null
    } catch (e) {
      return memoryCache[key] || null
    }
  },
  setItem: (key, value) => {
    try {
      // FIX SUPERMIUM TIMEZONE SKEW BUG
      // If the PC has the wrong timezone but correct manual time, Date.now() will be hours ahead of UTC.
      // We intercept the session storage and force expires_at to be artificially high (1 year in future locally)
      if (key.includes('supabase.auth.token') && typeof value === 'string') {
        try {
          const parsed = JSON.parse(value)
          if (parsed && parsed.currentSession) {
            const fakeFuture = Math.round(Date.now() / 1000) + (86400 * 365) // 1 year ahead of whatever local clock is
            parsed.expires_at = fakeFuture
            parsed.currentSession.expires_at = fakeFuture
            value = JSON.stringify(parsed)
          }
        } catch(e) {}
      }

      // Guardado instantáneo en memoria para evitar desfases
      memoryCache[key] = value
      // Guardado asíncrono en disco
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, value)
      }
    } catch (e) {}
  },
  removeItem: (key) => {
    try {
      delete memoryCache[key]
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key)
      }
    } catch (e) {}
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})
