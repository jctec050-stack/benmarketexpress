import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://grfyzwfinmowqqxfegsx.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyZnl6d2Zpbm1vd3FxeGZlZ3N4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4MTY3ODMsImV4cCI6MjA3ODM5Mjc4M30.PSr-D8iyMv0ccLUhlFy5Vi6QO12VVWQVDFubmsrotT8'

// Memory-backed storage adapter for Supermium compatibility
// Prevents infinite loops if browser's localStorage is slow or asynchronous
const memoryCache = {}

const customStorage = {
  getItem: (key) => {
    try {
      if (typeof window !== 'undefined') {
        const value = window.localStorage.getItem(key)
        memoryCache[key] = value
        return value
      }
      return memoryCache[key] || null
    } catch (e) {
      return memoryCache[key] || null
    }
  },
  setItem: (key, value) => {
    try {
      memoryCache[key] = value
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
