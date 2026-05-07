'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import EgresoForm from '@/components/egresos/EgresoForm'
import EgresosList from '@/components/egresos/EgresosList'
import { exportEgresoReceiptPDF } from '@/lib/pdfExport'
import { useNotifications } from '@/context/NotificationContext'

export default function EgresosPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const { success, confirm } = useNotifications()
  const isCajero = profile?.rol === 'cajero'
  const { 
    egresos, 
    addEgreso, 
    deleteEgreso, 
    loadingData, 
    selectedDate,
    setSelectedDate,
    selectedCaja,
    setSelectedCaja,
    selectedCajero,
    setSelectedCajero
  } = useData()
  const router = useRouter()
  const [editingEgreso, setEditingEgreso] = useState(null)

  // Auth Protection
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  const handleAddEgreso = async (egreso) => {
    // Combine date from form + current time
    const now = new Date()
    const timeString = now.toTimeString().split(' ')[0] // HH:MM:SS
    const baseDate = egreso.fecha ? String(egreso.fecha).split('T')[0] : selectedDate
    const datetimeString = `${baseDate}T${timeString}`

    const newEgreso = {
      ...egreso,
      fecha: datetimeString,
      caja: (profile?.rol === 'tesoreria' && !egreso.id) ? 'Tesoreria' : selectedCaja,
      cajero: profile?.username || user?.email || 'unknown',
      arqueado: false
    }
    
    const result = await addEgreso(newEgreso)
    
    if (result.success) {
      setEditingEgreso(null)
    }

    // Auto-print only for Retiro de Fondos
    if (result.success && egreso.categoria === 'Retiro de Fondos') {
      const finalItem = result.data || { ...newEgreso, id: 'temp-' + Date.now() }
      exportEgresoReceiptPDF(finalItem)
    }
  }

  const handleDeleteEgreso = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar egreso?',
      message: 'Esta acción no se puede deshacer y el monto volverá al saldo de caja.',
      confirmText: 'Eliminar',
      type: 'danger'
    })

    if (ok) {
      await deleteEgreso(id)
      setEditingEgreso(prev => (prev?.id === id ? null : prev))
      success('Egreso Eliminado', 'El registro ha sido borrado.')
    }
  }

  const handleEditEgreso = (eg) => {
    setEditingEgreso(eg)
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (authLoading || !user) {
    return <div className="flex h-screen items-center justify-center bg-[#FAFAFA] text-gray-500 font-bold">Iniciando sesión...</div>
  }

  // --- BLOQUEO: Sin fecha de jornada ---
  if (!selectedDate) {
    return (
      <div className="w-full">
        <main className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="max-w-5xl mx-auto mb-6 flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Egresos de Caja</h1>
              <p className="text-sm text-gray-400 font-medium">Gestión de salidas de dinero</p>
            </div>
          </div>

          <div className="w-full max-w-md mx-auto mt-8">
            <div className="bg-white rounded-2xl shadow-lg border-t-4 border-red-500 p-8 flex flex-col items-center gap-6 text-center">
              <div className="bg-red-100 rounded-full p-5">
                <span className="text-5xl">📅</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Seleccione la Fecha de Jornada</h2>
                <p className="text-gray-500 text-sm">
                  Debe ingresar la fecha de trabajo antes de poder registrar egresos.
                </p>
              </div>
              <div className="w-full">
                <label className="block text-xs font-bold text-red-600 uppercase tracking-wider mb-2">
                  Fecha de Jornada
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-red-300 rounded-xl text-gray-800 font-bold text-lg focus:outline-none focus:border-red-500 text-center"
                />
              </div>
              <p className="text-[11px] text-gray-400">
                Esta fecha se asignará automáticamente a todos los egresos registrados durante la jornada.
              </p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="w-full">
      <main className="container mx-auto px-4 py-8">
        
        {/* Module Header */}
        <div className="max-w-5xl mx-auto mb-6 flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <div>
            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              Egresos de Caja
            </h1>
            <p className="text-sm text-gray-400 font-medium">
              Gestión de salidas de dinero
            </p>
          </div>

          <div className="flex items-center gap-4">
             {/* Date Selector (Workday) */}
             <div className="bg-gray-50 p-2 px-3 rounded-lg border border-gray-200 flex flex-col min-w-[140px]">
                <label className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">Fecha de Trabajo</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-gray-700 bg-transparent border-none cursor-pointer font-bold text-xs focus:ring-0 focus:outline-none p-0"
                />
             </div>

             {!isCajero && (
                <select 
                  value={selectedCaja} 
                  onChange={(e) => setSelectedCaja(e.target.value)}
                  className="bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg text-sm font-bold text-gray-700 focus:outline-none focus:border-red-500 h-full"
                >
                  <option value="Caja 1">Caja 1</option>
                  <option value="Caja 2">Caja 2</option>
                  <option value="Caja 3">Caja 3</option>
                  <option value="Tesoreria">Tesoreria</option>
                  <option value="Todas las cajas">Todas las cajas</option>
                </select>
              )}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-10 animate-fade-in">
          <EgresoForm 
            onSubmit={handleAddEgreso} 
            initialData={editingEgreso} 
            onCancelEdit={() => setEditingEgreso(null)} 
          />
          
          <EgresosList 
            egresos={egresos} 
            onDelete={handleDeleteEgreso} 
            onEdit={handleEditEgreso}
            dateFilter={selectedDate}
            setDateFilter={setSelectedDate}
            cajaFilter={selectedCaja}
            setCajaFilter={setSelectedCaja}
            cajeroFilter={selectedCajero}
            setCajeroFilter={setSelectedCajero}
          />
        </div>

      </main>
    </div>
  )
}
