'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Loader2, MonitorSmartphone, Wifi } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function DispositivosPage() {
  const [conexiones, setConexiones] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && profile) {
      if (profile.rol !== 'admin') {
        router.push('/')
      } else {
        fetchConexiones()
      }
    }
  }, [profile, authLoading, router])

  const fetchConexiones = async () => {
    try {
      const { data, error } = await supabase
        .from('conexiones_dispositivos')
        .select(`
          id,
          ip_address,
          browser,
          os,
          device_type,
          ultimo_acceso,
          perfiles_usuarios ( username )
        `)
        .order('ultimo_acceso', { ascending: false })
        .limit(100)

      if (error) throw error
      setConexiones(data || [])
    } catch (error) {
      console.error('Error fetching conexiones:', error)
    } finally {
      setLoadingData(false)
    }
  }

  if (authLoading || loadingData) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-red-600" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      <div className="flex items-center gap-3 mb-8">
        <MonitorSmartphone className="w-8 h-8 text-red-600" />
        <h1 className="text-3xl font-bold text-gray-800">Conexiones de Dispositivos</h1>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Usuario
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Dispositivo / SO
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Navegador
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Dirección IP
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Último Acceso
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {conexiones.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                    No hay conexiones registradas aún.
                  </td>
                </tr>
              ) : (
                conexiones.map((con) => (
                  <tr key={con.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold mr-3">
                          {con.perfiles_usuarios?.username?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-gray-900">{con.perfiles_usuarios?.username || 'Desconocido'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {con.device_type} • {con.os}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {con.browser}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Wifi className="w-4 h-4 text-green-500" />
                        {con.ip_address}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(con.ultimo_acceso).toLocaleString('es-ES', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
