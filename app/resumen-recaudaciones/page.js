'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/db'
import { formatCurrency } from '@/lib/utils'
import { processResumenData } from '@/lib/resumenLogic'
import { exportResumenRecaudacionesPDF } from '@/lib/pdfExport'

export default function ResumenRecaudacionesPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const today = new Date().toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [cajeroFilter, setCajeroFilter] = useState('')
  const [cajaFilter, setCajaFilter] = useState('Todas las cajas')
  const [loading, setLoading] = useState(false)

  // Rows: [{ fecha, cajero, caja, ingresoTiendaCalculado, efectivoIgnis, sobrante, faltante }]
  const [rows, setRows] = useState([])

  // Auth Protection
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    } else if (!authLoading && profile && profile.rol === 'cajero') {
      router.push('/')
    }
  }, [user, profile, authLoading, router])

  const fetchData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      // Get all unique dates in range
      const dateList = []
      const cur = new Date(startDate)
      const end = new Date(endDate)
      while (cur <= end) {
        dateList.push(cur.toISOString().slice(0, 10))
        cur.setDate(cur.getDate() + 1)
      }

      // Fetch raw data for the entire range in parallel
      const [resMovsTemp, resEgresos, resArqueos, resMovs, recaudacionData] = await Promise.all([
        db.getDataRange('movimientos_temporales', startDate, endDate, 'Todas las cajas'),
        db.getDataRange('egresos_caja', startDate, endDate, 'Todas las cajas'),
        db.getDataRange('arqueos', startDate, endDate, 'Todas las cajas'),
        db.getDataRange('movimientos', startDate, endDate, 'Todas las cajas'),
        db.obtenerRecaudacionPorRango(startDate, endDate)
      ])

      const combinedMovs = [
        ...(resMovsTemp.data || []),
        ...(resMovs.data || [])
      ]
      const egresosData = resEgresos.data || []
      const arqueosData = resArqueos.data || []

      // Build per-date rows
      const allRows = []

      for (const fecha of dateList) {
        // Filter data for this specific date
        const movsForDate = combinedMovs.filter(m => {
          const mFecha = (m.fecha || m.fecha_mov || '').slice(0, 10)
          return mFecha === fecha
        })
        const egresosForDate = egresosData.filter(e => {
          const eFecha = (e.fecha || '').slice(0, 10)
          return eFecha === fecha
        })
        const arqueosForDate = arqueosData.filter(a => {
          const aFecha = (a.fecha || a.fecha_cierre || '').slice(0, 10)
          return aFecha === fecha
        })
        const recaudForDate = recaudacionData.filter(r => {
          const rFecha = (r.fecha || '').slice(0, 10)
          return rFecha === fecha
        })

        if (movsForDate.length === 0 && arqueosForDate.length === 0) continue

        // Use processResumenData to calculate tableData for this date
        const processed = processResumenData(
          movsForDate,
          arqueosForDate,
          egresosForDate,
          recaudForDate,
          'Todas las cajas'
        )

        processed.tableData.forEach(row => {
          allRows.push({
            fecha,
            cajero: row.nombreCajero,
            caja: row.nombreCaja,
            ingresoTiendaCalculado: row.ingresoTiendaCalculado || 0,
            efectivoIgnis: row.recaudadoReal || 0,
            sobrante: row.sobrante || 0,
            faltante: row.faltante || 0,
          })
        })
      }

      setRows(allRows)
    } catch (err) {
      console.error('Error fetching resumen recaudaciones:', err)
    } finally {
      setLoading(false)
    }
  }, [user, startDate, endDate])

  useEffect(() => {
    if (user) fetchData()
  }, [fetchData])

  if (authLoading || !user) return <div className="p-8 text-gray-500">Cargando...</div>

  // Apply filters
  const filteredRows = rows.filter(r => {
    const matchCaja = cajaFilter === 'Todas las cajas' || r.caja === cajaFilter
    const matchCajero = cajeroFilter === '' || r.cajero === cajeroFilter
    return matchCaja && matchCajero
  })

  // Totals
  const totalIngresoTienda = filteredRows.reduce((s, r) => s + r.ingresoTiendaCalculado, 0)
  const totalEfectivoIgnis = filteredRows.reduce((s, r) => s + r.efectivoIgnis, 0)
  const totalSobrante = filteredRows.reduce((s, r) => s + r.sobrante, 0)
  const totalFaltante = filteredRows.reduce((s, r) => s + r.faltante, 0)

  // Group by date for section headers
  const fechas = [...new Set(filteredRows.map(r => r.fecha))].sort((a, b) => b.localeCompare(a))

  const formatFecha = (f) =>
    new Date(f + 'T12:00:00').toLocaleDateString('es-PY', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

  const cajerosUnicos = [...new Set(rows.map(r => r.cajero))].sort((a, b) => a.localeCompare(b))

  return (
    <div className="w-full">
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Resumen Recaudaciones</h1>
          <p className="text-sm text-gray-500 mt-1">
            Detalle de recaudacion por cajero y caja en el rango seleccionado
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-8 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input
              id="recaudaciones-desde"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input
              id="recaudaciones-hasta"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Caja</label>
            <select
              value={cajaFilter}
              onChange={(e) => setCajaFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Todas las cajas">Todas las cajas</option>
              <option value="Caja 1">Caja 1</option>
              <option value="Caja 2">Caja 2</option>
              <option value="Caja 3">Caja 3</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cajero</label>
            <select
              value={cajeroFilter}
              onChange={(e) => setCajeroFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los cajeros</option>
              {cajerosUnicos.map(cajero => (
                <option key={cajero} value={cajero}>{cajero}</option>
              ))}
            </select>
          </div>
          <button
            id="recaudaciones-buscar"
            onClick={fetchData}
            disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>

          <div className="flex-grow"></div>

          <button
            id="recaudaciones-export-pdf"
            onClick={() => exportResumenRecaudacionesPDF({
              rows: filteredRows,
              startDate,
              endDate,
              cajaFilter,
              cajeroFilter,
              totals: { totalIngresoTienda, totalEfectivoIgnis, totalSobrante, totalFaltante }
            })}
            disabled={loading || filteredRows.length === 0}
            className="px-4 py-2 bg-red-700 text-white rounded-md hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transform active:scale-95 transition-all shadow-sm font-medium"
            title="Descargar reporte en PDF con los datos actuales"
          >
            📄 PDF
          </button>
        </div>

        {/* Summary Cards */}
        {filteredRows.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-blue-600">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Total Ingreso Tienda</p>
              <p className="text-xl font-bold text-gray-800">{formatCurrency(totalIngresoTienda)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-indigo-500">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Efectivo IGNIS</p>
              <p className="text-xl font-bold text-gray-800">{formatCurrency(totalEfectivoIgnis)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-green-500">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Total Sobrante</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(totalSobrante)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-red-500">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Total Faltante</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totalFaltante)}</p>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-gray-800 text-white px-6 py-3 font-bold text-lg flex items-center gap-2">
            <span>&#128176;</span> RECAUDACIONES
          </div>

          {loading ? (
            <div className="py-16 text-center text-gray-500">
              <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p>Cargando datos...</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <p className="text-lg">No hay registros de recaudacion para los filtros seleccionados.</p>
              <p className="text-sm mt-1 text-gray-400">Asegurate que existan movimientos o arqueos cerrados en esas fechas.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {fechas.map(fecha => {
                const rowsForDate = filteredRows.filter(r => r.fecha === fecha)
                const subTotalIngreso = rowsForDate.reduce((s, r) => s + r.ingresoTiendaCalculado, 0)
                const subTotalIgnis = rowsForDate.reduce((s, r) => s + r.efectivoIgnis, 0)
                const subTotalSobrante = rowsForDate.reduce((s, r) => s + r.sobrante, 0)
                const subTotalFaltante = rowsForDate.reduce((s, r) => s + r.faltante, 0)

                return (
                  <div key={fecha}>
                    {/* Date separator */}
                    <div className="bg-gray-100 px-6 py-2 border-b border-gray-300">
                      <span className="text-sm font-semibold text-gray-700 capitalize">
                        &#128197; {formatFecha(fecha)}
                      </span>
                    </div>
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-600 uppercase font-bold text-xs">
                        <tr>
                          <th className="px-6 py-2">Cajero</th>
                          <th className="px-6 py-2">Caja</th>
                          <th className="px-6 py-2 text-right">Total Ingreso Tienda</th>
                          <th className="px-6 py-2 text-right">Efectivo IGNIS</th>
                          <th className="px-6 py-2 text-right">Sobrante</th>
                          <th className="px-6 py-2 text-right">Faltante</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rowsForDate.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-3 font-medium text-gray-900">{row.cajero}</td>
                            <td className="px-6 py-3 text-gray-600">{row.caja}</td>
                            <td className="px-6 py-3 text-right font-medium text-gray-800">
                              {formatCurrency(row.ingresoTiendaCalculado)}
                            </td>
                            <td className="px-6 py-3 text-right text-indigo-700 font-medium">
                              {row.efectivoIgnis > 0 ? formatCurrency(row.efectivoIgnis) : <span className="text-gray-400 italic text-xs">Sin registrar</span>}
                            </td>
                            <td className="px-6 py-3 text-right font-medium">
                              {row.sobrante > 0
                                ? <span className="text-green-600">{formatCurrency(row.sobrante)}</span>
                                : <span className="text-gray-300">--</span>
                              }
                            </td>
                            <td className="px-6 py-3 text-right font-medium">
                              {row.faltante > 0
                                ? <span className="text-red-600">{formatCurrency(row.faltante)}</span>
                                : <span className="text-gray-300">--</span>
                              }
                            </td>
                          </tr>
                        ))}
                        {/* Per-date subtotal */}
                        <tr className="bg-gray-50 font-semibold border-t border-gray-200 text-xs">
                          <td colSpan={2} className="px-6 py-2 uppercase text-gray-600">Subtotal dia</td>
                          <td className="px-6 py-2 text-right text-gray-800">{formatCurrency(subTotalIngreso)}</td>
                          <td className="px-6 py-2 text-right text-indigo-700">{formatCurrency(subTotalIgnis)}</td>
                          <td className="px-6 py-2 text-right text-green-600">{formatCurrency(subTotalSobrante)}</td>
                          <td className="px-6 py-2 text-right text-red-600">{formatCurrency(subTotalFaltante)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )
              })}

              {/* Grand Total */}
              <table className="w-full text-sm">
                <tfoot>
                  <tr className="bg-gray-800 text-white font-bold">
                    <td colSpan={2} className="px-6 py-4 uppercase">TOTAL GENERAL</td>
                    <td className="px-6 py-4 text-right">{formatCurrency(totalIngresoTienda)}</td>
                    <td className="px-6 py-4 text-right">{formatCurrency(totalEfectivoIgnis)}</td>
                    <td className="px-6 py-4 text-right text-green-300">{formatCurrency(totalSobrante)}</td>
                    <td className="px-6 py-4 text-right text-red-300">{formatCurrency(totalFaltante)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}