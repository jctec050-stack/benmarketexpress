'use client'

import { formatCurrency } from '@/lib/utils'
import { Trash2, Pencil } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export default function OperacionesList({ 
  operaciones, 
  onDelete,
  onEdit,
  dateFilter,
  setDateFilter,
  cajaFilter,
  setCajaFilter,
  cajeroFilter,
  setCajeroFilter
}) {
  const { profile, user } = useAuth()
  const isCajero = profile?.rol === 'cajero'
  // Extract unique boxes
  const availableCajas = Array.from(new Set(operaciones.map(m => m.caja))).filter(Boolean)
  // Extract unique cashiers
  const availableCajeros = Array.from(new Set(operaciones.map(m => m.cajero))).filter(Boolean)

  // Filter logic
  const filteredOperaciones = operaciones.filter(op => {
    const opDate = op.fecha ? op.fecha.split('T')[0] : ''
    const matchDate = dateFilter ? opDate === dateFilter : true
    const matchCaja = cajaFilter && cajaFilter !== 'Todas las cajas' ? op.caja === cajaFilter : true
    const matchCajero = cajeroFilter && cajeroFilter !== 'Todos los cajeros' ? op.cajero === cajeroFilter : true
    
    // Safety check for cashiers: only their assigned box and their own operations
    if (isCajero) {
      if (cajaFilter && op.caja !== cajaFilter) return false
      const opCajero = op.cajero || op.usuario
      const isMyMov = opCajero === profile?.username || 
                      opCajero === user?.email || 
                      op.usuario_id === user?.id
      if (!isMyMov) return false
    }

    return matchDate && matchCaja && matchCajero
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <h3 className="text-lg font-bold text-gray-800">Historial de Operaciones</h3>
        
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <input 
            type="date" 
            value={dateFilter || ''} 
            onChange={(e) => setDateFilter && setDateFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 focus:ring-blue-500 focus:border-blue-500"
          />
          {!isCajero ? (
            <>
              <select 
                value={cajaFilter || 'Todas las cajas'} 
                onChange={(e) => setCajaFilter && setCajaFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 bg-white"
              >
                <option value="Todas las cajas">Todas las cajas</option>
                {availableCajas.sort().map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select 
                value={cajeroFilter || 'Todos los cajeros'} 
                onChange={(e) => setCajeroFilter && setCajeroFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 bg-white"
              >
                <option value="Todos los cajeros">Todos los cajeros</option>
                {availableCajeros.sort().map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </>
          ) : (
            <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md text-sm font-bold text-blue-700 flex items-center gap-1">
              <span>🏪</span> {cajaFilter}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {filteredOperaciones.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-white rounded-lg shadow border border-dashed border-gray-300">
            <p>No se encontraron operaciones con los filtros seleccionados.</p>
          </div>
        ) : (
          filteredOperaciones.map((op, index) => {
            const isIngreso = op.tipo === 'deposito-inversiones' || op.monto > 0 // Heuristic for highlighting
            const signo = isIngreso ? '+' : '-'
            const colorClass = isIngreso ? 'text-green-600 border-green-500' : 'text-gray-800 border-gray-500'
            const bgClass = isIngreso ? 'bg-green-50' : 'bg-white'

            return (
              <div key={op.id || index} className={`p-4 rounded-lg shadow border-l-4 ${colorClass} ${bgClass} hover:shadow-md transition-shadow`}>
                <div className="flex justify-between items-start">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-bold text-lg uppercase tracking-wide">{op.tipo}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center">
                        <span className="mr-1">🕒</span>
                        {new Date(op.fecha || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full flex items-center">
                        <span className="mr-1">🏪</span>
                        {op.caja || 'Sin caja'}
                      </span>
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full flex items-center">
                        <span className="mr-1">👤</span>
                        {op.cajero || 'Desconocido'}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 space-y-1">
                      <p><strong>Descripción:</strong> {op.descripcion}</p>
                      {op.receptor && (
                        <p><strong>Receptor:</strong> {op.receptor}</p>
                      )}
                      {op.referencia && (
                        <p className="italic text-gray-400">Ref: {op.referencia}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end space-y-2">
                    <span className={`text-xl font-bold ${isIngreso ? 'text-green-700' : 'text-gray-700'}`}>
                      {signo}{formatCurrency(Math.abs(op.monto), op.moneda)}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onEdit && onEdit(op)}
                        className="text-gray-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-full transition-colors"
                        title="Editar operación"
                      >
                        <Pencil size={20} />
                      </button>
                      <button
                        onClick={() => onDelete(op.id)}
                        className="text-gray-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-full transition-colors"
                        title="Eliminar operación"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                    </div>
                  </div>
                </div>
            )
          })
        )}
      </div>
    </div>
  )
}
