'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/db'
import { formatCurrency, parseCurrency } from '@/lib/utils'
import { processResumenData } from '@/lib/resumenLogic'
import { exportResumenExcel } from '@/lib/excelExport'
import { exportResumenPDF, exportDetailPDF } from '@/lib/pdfExport'
import { useNotifications } from '@/context/NotificationContext'
import { SERVICIOS_CATALOGO, CONFIG } from '@/lib/config'
import Modal from '@/components/ui/Modal'
import { Search, Eye, Building2 } from 'lucide-react'

export default function ResumenPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const { success, error: notifyError } = useNotifications()
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedCaja, setSelectedCaja] = useState('Todas las cajas')

  // Local state for A Depositar block
  const [depositosDesde, setDepositosDesde] = useState('')
  const [depositosHasta, setDepositosHasta] = useState('')
  const [customMontoSistema, setCustomMontoSistema] = useState(null)

  // Data
  const [metrics, setMetrics] = useState({ totalTarjeta: 0, totalPedidosYa: 0, totalCredito: 0 })
  const [tableData, setTableData] = useState([])
  const [egresosList, setEgresosList] = useState([])
  const [inversionesList, setInversionesList] = useState([])
  const [loading, setLoading] = useState(false)
  const [summaryData, setSummaryData] = useState(null)
  const [saldoAnterior, setSaldoAnterior] = useState(0)
  const [egresosFilters, setEgresosFilters] = useState({
    cajero: '',
    categoria: '',
    receptor: '',
    descripcion: '',
    montoMin: ''
  })

  // Deposit State
  const [requestedDeposits, setRequestedDeposits] = useState({})
  const [isSavingDeposits, setIsSavingDeposits] = useState(false)

  // Efectivo Real al Cierre States
  const [efectivoReal, setEfectivoReal] = useState(0)
  const [efectivoRealDetalle, setEfectivoRealDetalle] = useState({
    efectivoGs: {},
    monedasExtranjeras: {
      usd: { cantidad: 0, cotizacion: 7000 },
      brl: { cantidad: 0, cotizacion: 1250 },
      ars: { cantidad: 0, cotizacion: 0 }
    }
  })
  const [globalCotizaciones, setGlobalCotizaciones] = useState({ usd: 7000, brl: 1250, ars: 0 })
  const [isEfectivoModalOpen, setIsEfectivoModalOpen] = useState(false)

  // Metric Drill-down state
  const [rawMovements, setRawMovements] = useState([])
  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    title: '',
    data: [],
    type: ''
  })

  // Auth Protection
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    } else if (!authLoading && profile && profile.rol === 'cajero') {
      router.push('/')
    }
  }, [user, profile, authLoading, router])

  // Fetch Data
  useEffect(() => {
    if (user) {
      fetchData()
    }
  }, [user, startDate, endDate, selectedCaja])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 1. Fetch all raw data for the range
      const [resMovsTemp, resEgresos, resArqueos, resMovs, resRecaudacion] = await Promise.all([
        db.getDataRange('movimientos_temporales', startDate, endDate, selectedCaja),
        db.getDataRange('egresos_caja', startDate, endDate, selectedCaja),
        db.getDataRange('arqueos', startDate, endDate, selectedCaja),
        db.getDataRange('movimientos', startDate, endDate, selectedCaja),
        db.obtenerRecaudacion(startDate) // Note: Recaudacion table is usually by single date or need range support?
        // Legacy 'obtenerRecaudacion' fetches by date. If range > 1 day, this might need loop or range support.
        // For now let's assume it fetches enough. 
        // Wait, 'obtenerRecaudacion' in db.js only filters by 'eq date'.
        // If user selects a range, we should probably fetch for all days?
        // Legacy Resumen usually works per day or range. 
        // Let's keep it simple: If range is multiple days, Recaudacion table might be weird if it aggregates same cashier multiple times.
        // Legacy 'actualizarTablaRecaudacion' fetches `db.obtenerRecaudacion(fechaDesde, ...)`
        // It seems to rely on start date.
      ])

      // Combine movements
      const combinedMovs = [
        ...(resMovsTemp.data || []),
        ...(resMovs.data || [])
      ]

      const egresosData = resEgresos.data || []
      const arqueosData = resArqueos.data || []
      const recaudacionData = resRecaudacion || [] // array

      // 2. Process Data
      const processed = processResumenData(combinedMovs, arqueosData, egresosData, recaudacionData, selectedCaja)
      
      if (!depositosDesde) setDepositosDesde(startDate)
      if (!depositosHasta) setDepositosHasta(endDate)

      setMetrics(processed.metrics)
      setTableData(processed.tableData)
      setEgresosList(egresosData)
      setSummaryData(processed.summaryData)
      setRawMovements(combinedMovs)

      const inversiones = (resMovs.data || []).filter(m => m.tipo === 'deposito-inversiones' || m.tipo === 'inversion-retiro');
      setInversionesList(inversiones);

      // 3. Fetch Saldo Anterior
      const prevDate = new Date(startDate)
      prevDate.setDate(prevDate.getDate() - 1)
      const prevDateStr = prevDate.toISOString().slice(0, 10)
      
      const cajaSearch = selectedCaja === 'Todas las cajas' ? 'Todas las Cajas' : selectedCaja
      const resSaldo = await db.getTotalGeneral(prevDateStr, cajaSearch)
      setSaldoAnterior(resSaldo?.data?.total || 0)

      // 4. Fetch Depositos (using the generic start date to maintain compatibility)
      const resDepositos = await db.getDepositosServicios(startDate, cajaSearch)
      setRequestedDeposits(resDepositos?.data?.[0]?.servicios || {})

      // 5. Fetch Global Cotizaciones first
      let activeCotizaciones = { usd: 7000, brl: 1250, ars: 0 }
      const resCot = await db.getCotizaciones()
      if (resCot?.success && resCot.data) {
        activeCotizaciones = {
          usd: parseInt(resCot.data.usd) || 7000,
          brl: parseInt(resCot.data.brl) || 1250,
          ars: parseInt(resCot.data.ars) || 0
        }
        setGlobalCotizaciones(activeCotizaciones)
      }

      // 6. Fetch Total General of Current Day (to reload physical cash if already saved)
      const resCurrentTotal = await db.getTotalGeneral(startDate, cajaSearch)
      if (resCurrentTotal?.success && resCurrentTotal.data) {
        setEfectivoReal(resCurrentTotal.data.efectivo_real || 0)
        setEfectivoRealDetalle(resCurrentTotal.data.efectivo_real_detalle || {
          efectivoGs: {},
          monedasExtranjeras: {
            usd: { cantidad: 0, cotizacion: activeCotizaciones.usd },
            brl: { cantidad: 0, cotizacion: activeCotizaciones.brl },
            ars: { cantidad: 0, cotizacion: activeCotizaciones.ars }
          }
        })
      } else {
        setEfectivoReal(0)
        setEfectivoRealDetalle({
          efectivoGs: {},
          monedasExtranjeras: {
            usd: { cantidad: 0, cotizacion: activeCotizaciones.usd },
            brl: { cantidad: 0, cotizacion: activeCotizaciones.brl },
            ars: { cantidad: 0, cotizacion: activeCotizaciones.ars }
          }
        })
      }

    } catch (error) {
      console.error("Error fetching resumen data:", error)
    } finally {
      setLoading(false)
    }
  }

  // Effect to recalculate local 'Monto Sistema' when specific filter changes
  useEffect(() => {
    if (!depositosDesde || !depositosHasta) return;
    
    let isMounted = true;
    const fetchCustomMontoSistema = async () => {
       const cajaSearch = selectedCaja === 'Todas las cajas' ? 'Todas las Cajas' : selectedCaja;
       
       const [resMovsTemp, resMovs] = await Promise.all([
           db.getDataRange('movimientos_temporales', depositosDesde, depositosHasta, cajaSearch),
           db.getDataRange('movimientos', depositosDesde, depositosHasta, cajaSearch)
       ])

       const combined = [...(resMovsTemp.data || []), ...(resMovs.data || [])];
       const tempSums = {};

       combined.forEach(m => {
          if (!m.tipo || m.tipo === 'ingreso' || m.tipo === 'deposito-inversiones') {
             if (m.servicios) {
                Object.entries(m.servicios).forEach(([k, s]) => {
                   const monto = s.monto || 0;
                   if (monto !== 0) {
                      const cat = Object.values(SERVICIOS_CATALOGO).find(c => c.key === k);
                      const label = cat ? cat.label : k;
                      tempSums[label] = (tempSums[label] || 0) + monto;
                   }
                })
             }
             if (m.otrosServicios || m.otros_servicios) {
                const arr = m.otrosServicios || m.otros_servicios;
                arr.forEach(s => {
                   const monto = s.monto || 0;
                   if (monto !== 0) {
                      const label = s.nombre || 'Otros Servicios';
                      tempSums[label] = (tempSums[label] || 0) + monto;
                   }
                })
             }
          }
       })
       
       if(isMounted) {
          setCustomMontoSistema(tempSums);
       }
    }

    fetchCustomMontoSistema();
    return () => { isMounted = false };
  }, [depositosDesde, depositosHasta, selectedCaja])

  // Effect to refetch saved deposits when `depositosHasta` changes
  useEffect(() => {
     if (!depositosHasta) return;
     const loadSaved = async () => {
         const cajaSearch = selectedCaja === 'Todas las cajas' ? 'Todas las Cajas' : selectedCaja;
         const resDepositos = await db.getDepositosServicios(depositosHasta, cajaSearch)
         setRequestedDeposits(resDepositos?.data?.[0]?.servicios || {})
     }
     loadSaved();
  }, [depositosHasta, selectedCaja])

  const recalculateEfectivoReal = (detalle) => {
    let totalGs = 0;
    if (detalle.efectivoGs) {
      Object.entries(detalle.efectivoGs).forEach(([den, cant]) => {
        totalGs += (parseInt(den) * (parseInt(cant) || 0));
      });
    }
    if (detalle.monedasExtranjeras) {
      Object.entries(detalle.monedasExtranjeras).forEach(([mon, obj]) => {
        totalGs += ((parseFloat(obj.cantidad) || 0) * (parseFloat(obj.cotizacion) || 0));
      });
    }
    return totalGs;
  };

  const exportGeneralToExcel = () => {
     exportResumenExcel(summaryData, metrics, tableData, startDate, endDate, selectedCaja)
  }

  const handleCerrarDia = async () => {
    const totalIngresos = Object.values(summaryData.servicios).reduce((a,b)=>a+b,0) + 
                         summaryData.ingresosOtros.inversiones + 
                         summaryData.ingresosOtros.inversionRetiro + 
                         (summaryData.ingresosOtros.sobrantes || 0) +
                         metrics.totalIngresoTiendaSistema + 
                         saldoAnterior;
    const totalEgresos = Object.values(summaryData.egresos).reduce((a,b)=>a+b,0);
    const totalGral = totalIngresos - totalEgresos;

    const cajaSave = selectedCaja === 'Todas las cajas' ? 'Todas las Cajas' : selectedCaja
    const res = await db.saveTotalGeneral(startDate, cajaSave, totalGral, efectivoReal, efectivoRealDetalle)
    
    if (res.success) {
      success('Balance Guardado', 'El balance del día se registró correctamente.')
    } else {
      notifyError('Error de Guardado', 'No se pudo guardar el balance.')
    }
  }

  const handleSaveRecaudacion = async (cajero, caja, valor) => {
    // Only save if single date is selected (typical use case) or use startDate
    // Legacy saves using startDate
    const numericVal = parseCurrency(valor)
    
    const res = await db.guardarRecaudacion(startDate, cajero, caja, numericVal)
    
    if (res.success) {
      // Update local state to reflect change immediately
      setTableData(prev => prev.map(row => {
        if (row.nombreCajero === cajero && row.nombreCaja === caja) {
           const diff = row.ingresoTiendaCalculado - numericVal
           return {
             ...row,
             recaudadoReal: numericVal,
             sobrante: diff < 0 ? Math.abs(diff) : 0,
             faltante: diff > 0 ? diff : 0
           }
        }
        return row
      }))
      success('Cambios Guardados', 'La operación se realizó con éxito.')
    } else {
      notifyError('Error', 'No se pudieron guardar los cambios.')
    }
  }

  const handleSaveDepositos = async () => {
    setIsSavingDeposits(true)
    const cajaSave = selectedCaja === 'Todas las cajas' ? 'Todas las Cajas' : selectedCaja
    const res = await db.saveDepositosServicios(depositosHasta || startDate, cajaSave, requestedDeposits)
    
    if (res.success) {
       success('Depósitos Guardados', 'Los montos de servicios se registraron correctamente.')
    } else {
       notifyError('Error al Guardar', res.error)
    }
    setIsSavingDeposits(false)
  }
  
  const handleDepositChange = (serviceKey, value) => {
    const numericVal = value === '' ? '' : parseInt(value.replace(/\D/g, ''), 10)
    setRequestedDeposits(prev => ({
        ...prev,
        [serviceKey]: numericVal
    }))
  }

  // Derived filtered egresos (split into Proveedores, Retiros, and Gastos)
  const filteredProveedoresList = egresosList
    .filter(e => e.categoria === 'Pago a Proveedor')
    .filter(e => {
      const f = egresosFilters
      const matchCajero = !f.cajero || (e.cajero || '').toLowerCase().includes(f.cajero.toLowerCase())
      const matchReceptor = !f.receptor || (e.receptor || '').toLowerCase().includes(f.receptor.toLowerCase())
      const matchDescripcion = !f.descripcion || (e.descripcion || '').toLowerCase().includes(f.descripcion.toLowerCase())
      const matchMonto = !f.montoMin || (e.monto || 0) >= parseFloat(f.montoMin)
      return matchCajero && matchReceptor && matchDescripcion && matchMonto
    })

  const filteredRetirosList = egresosList
    .filter(e => e.categoria === 'Retiro de Fondos')
    .filter(e => {
      const f = egresosFilters
      const matchCajero = !f.cajero || (e.cajero || '').toLowerCase().includes(f.cajero.toLowerCase())
      const matchReceptor = !f.receptor || (e.receptor || '').toLowerCase().includes(f.receptor.toLowerCase())
      const matchDescripcion = !f.descripcion || (e.descripcion || '').toLowerCase().includes(f.descripcion.toLowerCase())
      const matchMonto = !f.montoMin || (e.monto || 0) >= parseFloat(f.montoMin)
      return matchCajero && matchReceptor && matchDescripcion && matchMonto
    })

  const filteredGastosList = egresosList
    .filter(e => e.categoria !== 'Pago a Proveedor' && e.categoria !== 'Retiro de Fondos')
    .filter(e => {
      const f = egresosFilters
      const matchCajero = !f.cajero || (e.cajero || '').toLowerCase().includes(f.cajero.toLowerCase())
      const matchCategoria = !f.categoria || (e.categoria || '').toLowerCase().includes(f.categoria.toLowerCase())
      const matchReceptor = !f.receptor || (e.receptor || '').toLowerCase().includes(f.receptor.toLowerCase())
      const matchDescripcion = !f.descripcion || (e.descripcion || '').toLowerCase().includes(f.descripcion.toLowerCase())
      const matchMonto = !f.montoMin || (e.monto || 0) >= parseFloat(f.montoMin)
      return matchCajero && matchCategoria && matchReceptor && matchDescripcion && matchMonto
    })

  const filteredEgresosList = [...filteredProveedoresList, ...filteredRetirosList, ...filteredGastosList]


  const handleFilterChange = (name, value) => {
    setEgresosFilters(prev => ({ ...prev, [name]: value }))
  }

  const handleShowDetail = (type) => {
    let filtered = []
    let title = ""
    
    switch(type) {
      case 'tarjeta':
        filtered = rawMovements.filter(m => (m.pagosTarjeta || m.pagos_tarjeta || 0) > 0)
        title = "Desglose de Pagos con Tarjeta"
        break
      case 'pedidosYa':
        filtered = rawMovements.filter(m => (m.pedidosYa || m.pedidos_ya || 0) > 0)
        title = "Desglose de Pedidos Ya"
        break
      case 'credito':
        filtered = rawMovements.filter(m => (m.ventasCredito || m.ventas_credito || 0) > 0)
        title = "Desglose de Ventas a Crédito"
        break
      default: return
    }

    setDetailModal({
      isOpen: true,
      title,
      data: filtered,
      type
    })
  }

  const getAmountLabel = (m, type) => {
    switch(type) {
      case 'tarjeta': return m.pagosTarjeta || m.pagos_tarjeta || 0
      case 'pedidosYa': return m.pedidosYa || m.pedidos_ya || 0
      case 'credito': return m.ventasCredito || m.ventas_credito || 0
      default: return 0
    }
  }

  if (authLoading || !user) return <div>Cargando...</div>

  return (
    <div className="w-full">
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Resumen de Tesorería</h1>

        {/* --- FILTERS --- */}
        <div className="bg-white p-4 rounded-lg shadow mb-8 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Caja</label>
            <select 
              value={selectedCaja} 
              onChange={(e) => setSelectedCaja(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="Todas las cajas">Todas las cajas</option>
              <option value="Caja 1">Caja 1</option>
              <option value="Caja 2">Caja 2</option>
              <option value="Caja 3">Caja 3</option>
              <option value="Tesoreria">Tesoreria</option>
            </select>
          </div>
          <button 
            onClick={fetchData}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
          
          <div className="flex-grow"></div>
          
          <button 
            onClick={() => exportResumenExcel(tableData, metrics, { start: startDate, end: endDate }, filteredEgresosList)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2 transform active:scale-95 transition-all shadow-sm"
          >
            📊 Excel
          </button>

          <button 
            onClick={() => exportResumenPDF(tableData, metrics, { start: startDate, end: endDate }, summaryData, saldoAnterior, requestedDeposits, filteredEgresosList, efectivoReal, rawMovements.filter(m => (m.ventasCredito || m.ventas_credito || 0) > 0))}
            className="px-4 py-2 bg-red-700 text-white rounded-md hover:bg-red-800 flex items-center gap-2 transform active:scale-95 transition-all shadow-sm"
          >
            📄 PDF
          </button>
        </div>

        {/* --- METRICS CARDS --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-600">
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm text-gray-500 font-bold uppercase">Total Ventas Tienda</p>
                 <p className="text-2xl font-bold text-gray-800">{formatCurrency(metrics.totalVentasTienda || 0)}</p>
                 <p className="text-[10px] text-gray-400 mt-1 italic">(Efectivo IGNIS + Tarjetas + PedidosYa + Crédito + Sobrante)</p>
               </div>
               <span className="text-3xl">🏬</span>
             </div>
          </div>

          <button 
            onClick={() => handleShowDetail('tarjeta')}
            className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500 text-left hover:shadow-lg hover:scale-[1.02] transition-all group relative"
          >
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm text-gray-500 font-bold uppercase group-hover:text-purple-600 transition-colors">Total Tarjeta</p>
                 <p className="text-2xl font-bold text-gray-800">{formatCurrency(metrics.totalTarjeta)}</p>
               </div>
               <span className="text-3xl opacity-80 group-hover:opacity-100 transition-opacity">💳</span>
             </div>
             <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
               <Eye size={16} className="text-purple-400" />
             </div>
          </button>

          <button 
            onClick={() => handleShowDetail('pedidosYa')}
            className="bg-white p-6 rounded-lg shadow border-l-4 border-red-500 text-left hover:shadow-lg hover:scale-[1.02] transition-all group relative"
          >
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm text-gray-500 font-bold uppercase group-hover:text-red-600 transition-colors">Pedidos Ya</p>
                 <p className="text-2xl font-bold text-gray-800">{formatCurrency(metrics.totalPedidosYa)}</p>
               </div>
               <span className="text-3xl opacity-80 group-hover:opacity-100 transition-opacity">🛵</span>
             </div>
             <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
               <Eye size={16} className="text-red-400" />
             </div>
          </button>

          <button 
            onClick={() => handleShowDetail('credito')}
            className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500 text-left hover:shadow-lg hover:scale-[1.02] transition-all group relative"
          >
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm text-gray-500 font-bold uppercase group-hover:text-yellow-600 transition-colors">Ventas Crédito</p>
                 <p className="text-2xl font-bold text-gray-800">{formatCurrency(metrics.totalCredito)}</p>
               </div>
               <span className="text-3xl opacity-80 group-hover:opacity-100 transition-opacity">📝</span>
             </div>
             <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
               <Eye size={16} className="text-yellow-400" />
             </div>
          </button>
        </div>

        {/* --- RECAUDACION TABLE --- */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
          <div className="bg-gray-800 text-white px-6 py-3 font-bold text-lg">
            RECAUDACIÓN
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 text-gray-600 uppercase font-bold">
                <tr>
                  <th className="px-6 py-3">Cajero</th>
                  <th className="px-6 py-3 text-right">Total Ingresos Tienda</th>
                  <th className="px-6 py-3 text-center">Efectivo IGNIS</th>
                  <th className="px-6 py-3 text-right">Sobrante</th>
                  <th className="px-6 py-3 text-right">Faltante</th>
                  <th className="px-6 py-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tableData.length > 0 ? (
                  <>
                    {tableData.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900">{row.nombreCajero}</div>
                          <div className="text-xs text-gray-500">{row.nombreCaja}</div>
                        </td>
                        <td className="px-6 py-4 text-right font-medium">
                          {formatCurrency(row.ingresoTiendaCalculado)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <input 
                              type="text" 
                              className="w-32 px-2 py-1 border border-gray-300 rounded text-right bg-white focus:outline-none focus:border-blue-500"
                              value={row.recaudadoReal === '' ? '' : new Intl.NumberFormat('es-PY').format(row.recaudadoReal || 0)}
                              onChange={(e) => {
                                const strVal = e.target.value.replace(/\D/g, '');
                                setTableData(prev => prev.map(r => {
                                  if (r.nombreCajero === row.nombreCajero && r.nombreCaja === row.nombreCaja) {
                                    return { ...r, recaudadoReal: strVal === '' ? '' : parseInt(strVal, 10) }
                                  }
                                  return r;
                                }))
                              }}
                              onBlur={() => handleSaveRecaudacion(row.nombreCajero, row.nombreCaja, row.recaudadoReal)}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-green-600 font-medium">
                          {formatCurrency(row.sobrante)}
                        </td>
                        <td className="px-6 py-4 text-right text-red-600 font-medium">
                          {formatCurrency(row.faltante)}
                        </td>
                        <td className="px-6 py-4 text-right font-bold">
                          {formatCurrency(row.ingresoTiendaCalculado)}
                        </td>
                      </tr>
                    ))}
                    {/* TOTALES FOOTER */}
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                      <td className="px-6 py-4 uppercase">Total Recaudado:</td>
                      <td className="px-6 py-4 text-right">
                        {formatCurrency(tableData.reduce((acc, r) => acc + (r.ingresoTiendaCalculado || 0), 0))}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {formatCurrency(tableData.reduce((acc, r) => acc + (parseFloat(r.recaudadoReal) || 0), 0))}
                      </td>
                      <td className="px-6 py-4 text-right text-green-600">
                        {formatCurrency(tableData.reduce((acc, r) => acc + (r.sobrante || 0), 0))}
                      </td>
                      <td className="px-6 py-4 text-right text-red-600">
                        {formatCurrency(tableData.reduce((acc, r) => acc + (r.faltante || 0), 0))}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {formatCurrency(tableData.reduce((acc, r) => acc + (r.ingresoTiendaCalculado || 0), 0))}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr><td colSpan="6" className="text-center py-8 text-gray-500">No hay datos para este rango</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- PROVEEDORES TABLE --- */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
          <div className="bg-[#c62828] text-white px-6 py-3 font-bold text-lg">
            PAGOS A PROVEEDORES
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 text-gray-600 uppercase font-bold sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3">Fecha</th>
                  <th className="px-6 py-3">Cajero</th>
                  <th className="px-6 py-3">Proveedor</th>
                  <th className="px-6 py-3">Descripción</th>
                  <th className="px-6 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* FILTERS ROW */}
                <tr className="bg-gray-50 border-b sticky top-[48px] z-10 shadow-sm">
                  <td className="px-6 py-2"></td>
                  <td className="px-6 py-2">
                    <input 
                      type="text" 
                      placeholder="Filtrar..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.cajero}
                      onChange={(e) => handleFilterChange('cajero', e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input 
                      type="text" 
                      placeholder="Filtrar..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.receptor}
                      onChange={(e) => handleFilterChange('receptor', e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input 
                      type="text" 
                      placeholder="Filtrar..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.descripcion}
                      onChange={(e) => handleFilterChange('descripcion', e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input 
                      type="number" 
                      placeholder="Min..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.montoMin}
                      onChange={(e) => handleFilterChange('montoMin', e.target.value)}
                    />
                  </td>
                </tr>

                {filteredProveedoresList.length > 0 ? (
                  <>
                    {filteredProveedoresList.map((e, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-4">{new Date(e.fecha).toLocaleDateString()}</td>
                        <td className="px-6 py-4">{e.cajero || 'N/A'}</td>
                        <td className="px-6 py-4 font-medium text-gray-700">{e.receptor || '---'}</td>
                        <td className="px-6 py-4">{e.descripcion}</td>
                        <td className="px-6 py-4 text-right text-red-600 font-medium">
                          {formatCurrency(e.monto)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                      <td colSpan="4" className="px-6 py-4 uppercase">Total Proveedores:</td>
                      <td className="px-6 py-4 text-right text-red-600">
                        {formatCurrency(filteredProveedoresList.reduce((acc, e) => acc + (e.monto || 0), 0))}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr><td colSpan="5" className="text-center py-8 text-gray-500">No hay pagos a proveedores que coincidan</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- GASTOS ADMINISTRATIVOS TABLE --- */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
          <div className="bg-gray-800 text-white px-6 py-3 font-bold text-lg">
            GASTOS ADMINISTRATIVOS
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 text-gray-600 uppercase font-bold sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3">Fecha</th>
                  <th className="px-6 py-3">Cajero</th>
                  <th className="px-6 py-3">Categoría</th>
                  <th className="px-6 py-3">Proveedor/Receptor</th>
                  <th className="px-6 py-3">Descripción</th>
                  <th className="px-6 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* FILTERS ROW */}
                <tr className="bg-gray-50 border-b sticky top-[48px] z-10 shadow-sm">
                  <td className="px-6 py-2"></td>
                  <td className="px-6 py-2">
                    <input 
                      type="text" 
                      placeholder="Filtrar..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.cajero}
                      onChange={(e) => handleFilterChange('cajero', e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input 
                      type="text" 
                      placeholder="Filtrar..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.categoria}
                      onChange={(e) => handleFilterChange('categoria', e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input 
                      type="text" 
                      placeholder="Filtrar..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.receptor}
                      onChange={(e) => handleFilterChange('receptor', e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input 
                      type="text" 
                      placeholder="Filtrar..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.descripcion}
                      onChange={(e) => handleFilterChange('descripcion', e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input 
                      type="number" 
                      placeholder="Min..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.montoMin}
                      onChange={(e) => handleFilterChange('montoMin', e.target.value)}
                    />
                  </td>
                </tr>

                {filteredGastosList.length > 0 ? (
                  <>
                    {filteredGastosList.map((e, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-4">{new Date(e.fecha).toLocaleDateString()}</td>
                        <td className="px-6 py-4">{e.cajero || 'N/A'}</td>
                        <td className="px-6 py-4">{e.categoria}</td>
                        <td className="px-6 py-4 font-medium text-gray-700">{e.receptor || '---'}</td>
                        <td className="px-6 py-4">{e.descripcion}</td>
                        <td className="px-6 py-4 text-right text-red-600 font-medium">
                          {formatCurrency(e.monto)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                      <td colSpan="5" className="px-6 py-4 uppercase">Total Gastos:</td>
                      <td className="px-6 py-4 text-right text-red-600">
                        {formatCurrency(filteredGastosList.reduce((acc, e) => acc + (e.monto || 0), 0))}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr><td colSpan="6" className="text-center py-8 text-gray-500">No hay gastos administrativos que coincidan</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- RETIRO DE FONDOS TABLE --- */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
          <div className="bg-teal-700 text-white px-6 py-3 font-bold text-lg">
            RETIRO DE FONDOS
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 text-gray-600 uppercase font-bold sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3">Fecha</th>
                  <th className="px-6 py-3">Cajero</th>
                  <th className="px-6 py-3">Receptor</th>
                  <th className="px-6 py-3">Descripción</th>
                  <th className="px-6 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* FILTERS ROW */}
                <tr className="bg-gray-50 border-b sticky top-[48px] z-10 shadow-sm">
                  <td className="px-6 py-2"></td>
                  <td className="px-6 py-2">
                    <input 
                      type="text" 
                      placeholder="Filtrar..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.cajero}
                      onChange={(e) => handleFilterChange('cajero', e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input 
                      type="text" 
                      placeholder="Filtrar..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.receptor}
                      onChange={(e) => handleFilterChange('receptor', e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input 
                      type="text" 
                      placeholder="Filtrar..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.descripcion}
                      onChange={(e) => handleFilterChange('descripcion', e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-2">
                    <input 
                      type="number" 
                      placeholder="Min..."
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none"
                      value={egresosFilters.montoMin}
                      onChange={(e) => handleFilterChange('montoMin', e.target.value)}
                    />
                  </td>
                </tr>

                {filteredRetirosList.length > 0 ? (
                  <>
                    {filteredRetirosList.map((e, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-4">{new Date(e.fecha).toLocaleDateString()}</td>
                        <td className="px-6 py-4">{e.cajero || 'N/A'}</td>
                        <td className="px-6 py-4 font-medium text-gray-700">{e.receptor || '---'}</td>
                        <td className="px-6 py-4">{e.descripcion}</td>
                        <td className="px-6 py-4 text-right text-red-600 font-medium">
                          {formatCurrency(e.monto)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                      <td colSpan="4" className="px-6 py-4 uppercase">Total Retiros:</td>
                      <td className="px-6 py-4 text-right text-red-600">
                        {formatCurrency(filteredRetirosList.reduce((acc, e) => acc + (e.monto || 0), 0))}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr><td colSpan="5" className="text-center py-8 text-gray-500">No hay retiros de fondos que coincidan</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>


        {/* --- INVERSIONES TABLE --- */}
        <div className="bg-white rounded-lg shadow overflow-hidden mt-8">
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-6 py-3 font-bold text-lg">
            INVERSIONES
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 text-gray-600 uppercase font-bold sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3">Fecha</th>
                  <th className="px-6 py-3">Cajero</th>
                  <th className="px-6 py-3">Descripción</th>
                  <th className="px-6 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {inversionesList.length > 0 ? (
                  <>
                    {inversionesList.map((inv, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-gray-600 font-medium">{new Date(inv.fecha).toLocaleDateString()}</td>
                        <td className="px-6 py-4">{inv.cajero || 'N/A'}</td>
                        <td className="px-6 py-4 text-gray-500 italic">{inv.descripcion || 'Depósito de Inversión'}</td>
                        <td className="px-6 py-4 text-right text-gray-900 font-black">
                          {formatCurrency(Math.abs(inv.monto))}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-emerald-50 font-bold border-t-2 border-emerald-100">
                      <td colSpan="3" className="px-6 py-4 uppercase text-emerald-800 text-right tracking-widest text-xs">Total Inversiones:</td>
                      <td className="px-6 py-4 text-right text-emerald-700 text-lg">
                        {formatCurrency(inversionesList.reduce((acc, inv) => acc + Math.abs(inv.monto || 0), 0))}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr><td colSpan="4" className="text-center py-8 text-gray-500 font-medium tracking-wide">No se registraron inversiones en este rango</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* --- SUMMARY COMPARISON CARDS (INGRESOS vs EGRESOS) --- */}
        {summaryData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12 mb-10">
            
            {/* INGRESOS CARD */}
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 flex flex-col transform transition-all hover:-translate-y-1 hover:shadow-2xl">
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-8 py-5 flex items-center justify-between shadow-md z-10">
                <h3 className="text-white font-black text-xl uppercase tracking-widest flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-4 shadow-[0_0_10px_rgba(34,197,94,0.8)]"></div>
                  Ingresos
                </h3>
              </div>
              <div className="p-8 flex-1 flex flex-col space-y-6">
                {/* Items */}
                <div className="space-y-3 flex-1">
                  {Object.entries(summaryData.servicios).map(([key, val]) => val !== 0 && (
                    <div key={key} className="flex justify-between items-center px-5 py-3.5 bg-gray-50 rounded-2xl hover:bg-gray-100 hover:scale-[1.01] transition-all cursor-default">
                      <span className="uppercase font-bold text-gray-500 text-xs tracking-wider">{key}</span>
                      <span className="font-black text-gray-900">{formatCurrency(val)}</span>
                    </div>
                  ))}
                  {summaryData.ingresosOtros.inversiones > 0 && (
                    <div className="flex justify-between items-center px-5 py-3.5 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all cursor-default">
                      <span className="uppercase font-bold text-gray-500 text-xs tracking-wider">Inversiones</span>
                      <span className="font-black text-gray-900">{formatCurrency(summaryData.ingresosOtros.inversiones)}</span>
                    </div>
                  )}
                  {summaryData.ingresosOtros.inversionRetiro > 0 && (
                    <div className="flex justify-between items-center px-5 py-3.5 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all cursor-default">
                      <span className="uppercase font-bold text-gray-500 text-xs tracking-wider">Inversiones-Retiro de fondos</span>
                      <span className="font-black text-gray-900">{formatCurrency(summaryData.ingresosOtros.inversionRetiro)}</span>
                    </div>
                  )}
                  {summaryData.ingresosOtros.sobrantes > 0 && (
                    <div className="flex justify-between items-center px-5 py-3.5 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all cursor-default">
                      <span className="uppercase font-bold text-gray-500 text-xs tracking-wider">Sobrantes de Efectivo</span>
                      <span className="font-black text-gray-900">{formatCurrency(summaryData.ingresosOtros.sobrantes)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center px-5 py-4 bg-green-50/50 rounded-2xl border border-green-100 shadow-sm mt-4">
                    <span className="uppercase font-bold text-green-700 text-xs tracking-wider">Efectivo (Ventas)</span>
                    <span className="font-black text-green-700 text-lg">{formatCurrency(metrics.totalIngresoTiendaSistema)}</span>
                  </div>
                </div>
                
                {/* Totals Section */}
                <div className="pt-6 border-t-2 border-dashed border-gray-200 space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <span className="uppercase text-[10px] font-black text-gray-400 tracking-widest">Saldo Caja Día Ant.</span>
                    <span className="font-bold text-gray-400">{formatCurrency(saldoAnterior)}</span>
                  </div>
                  <div className="flex justify-between items-center px-6 py-5 bg-gray-900 rounded-2xl shadow-lg ring-1 ring-gray-800">
                    <span className="uppercase tracking-widest text-sm font-black text-gray-300">Total Ingresos</span>
                    <span className="text-2xl font-black text-green-400 drop-shadow-md">
                      {formatCurrency(
                        Object.values(summaryData.servicios).reduce((a,b)=>a+b,0) + 
                        summaryData.ingresosOtros.inversiones + 
                        summaryData.ingresosOtros.inversionRetiro + 
                        (summaryData.ingresosOtros.sobrantes || 0) +
                        metrics.totalIngresoTiendaSistema + 
                        saldoAnterior
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* EGRESOS CARD */}
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 flex flex-col transform transition-all hover:-translate-y-1 hover:shadow-2xl">
              <div className="bg-gradient-to-r from-red-700 to-red-600 px-8 py-5 flex items-center justify-between shadow-md z-10">
                <h3 className="text-white font-black text-xl uppercase tracking-widest flex items-center">
                  <div className="w-3 h-3 bg-white/80 rounded-full mr-4 shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
                  Egresos / Gastos
                </h3>
              </div>
              <div className="p-8 flex-1 flex flex-col space-y-6">
                {/* Items */}
                <div className="space-y-3 flex-1">
                  {Object.entries(summaryData.egresos).map(([cat, val]) => (
                    <div key={cat} className="flex justify-between items-center px-5 py-3.5 bg-red-50/40 rounded-2xl border border-red-50 hover:bg-red-50 hover:scale-[1.01] transition-all cursor-default">
                      <span className="uppercase font-bold text-gray-500 text-xs tracking-wider">{cat}</span>
                      <span className="font-black text-gray-900">{formatCurrency(val)}</span>
                    </div>
                  ))}
                </div>
                
                {/* Totals Section */}
                <div className="pt-6 border-t-2 border-dashed border-gray-200 mt-auto">
                  <div className="flex justify-between items-center px-6 py-5 bg-red-50 rounded-2xl border border-red-100 shadow-inner">
                    <span className="uppercase tracking-widest text-sm font-black text-red-800">Total Egresos</span>
                    <span className="text-2xl font-black text-red-600 drop-shadow-sm">
                      {formatCurrency(Object.values(summaryData.egresos).reduce((a,b)=>a+b,0))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* FINAL RESULTS FOOTER */}
        {summaryData && (
          <div className="mb-20 flex flex-col items-center">
            <div className="bg-gray-900 rounded-2xl shadow-xl overflow-hidden border border-gray-800 relative w-full max-w-3xl">
              
              {/* Decorative elements */}
              <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-red-500 to-red-800"></div>
              
              <div className="px-6 py-5 md:px-8 flex flex-col md:flex-row justify-between items-center gap-5 relative z-10 w-full">
                <div className="flex flex-wrap gap-5 items-center justify-center md:justify-start flex-grow">
                  {(() => {
                    const sistemaNeto = (Object.values(summaryData.servicios).reduce((a,b)=>a+b,0) + 
                                          summaryData.ingresosOtros.inversiones + 
                                          summaryData.ingresosOtros.inversionRetiro + 
                                          (summaryData.ingresosOtros.sobrantes || 0) +
                                          metrics.totalIngresoTiendaSistema + 
                                          saldoAnterior) - 
                                         (Object.values(summaryData.egresos).reduce((a,b)=>a+b,0));
                    const diferenciaCierre = efectivoReal - sistemaNeto;
                    
                    return (
                      <>
                        <div className="flex flex-col space-y-0.5 text-center md:text-left">
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.2em]">Resultado Neto (Sistema)</span>
                          <div className="text-xl md:text-2xl font-black text-white flex items-center justify-center md:justify-start gap-2">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">
                              {formatCurrency(sistemaNeto)}
                            </span>
                          </div>
                        </div>

                        <div 
                          onClick={() => setIsEfectivoModalOpen(true)}
                          className="flex flex-col space-y-0.5 text-center md:text-left cursor-pointer hover:bg-gray-800/60 transition-all bg-gray-800/40 p-2.5 px-3.5 rounded-xl border border-gray-700/50 shadow-inner group"
                        >
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.2em] flex items-center gap-1.5 justify-center md:justify-start group-hover:text-blue-400 transition-colors">
                            💵 Efectivo Real al Cierre
                          </span>
                          <div className="text-xl md:text-2xl font-black text-white flex items-center justify-center md:justify-start gap-2">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300">
                              {formatCurrency(efectivoReal)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col space-y-0.5 text-center md:text-left bg-gray-800/20 p-2.5 px-3.5 rounded-xl border border-gray-800/50">
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.2em]">Diferencia</span>
                          <div className="text-xl md:text-2xl font-black flex items-center justify-center md:justify-start gap-2">
                            <span className={diferenciaCierre === 0 ? 'text-gray-300' : diferenciaCierre > 0 ? 'text-green-400' : 'text-red-500'}>
                              {diferenciaCierre > 0 ? '+' : ''}{formatCurrency(diferenciaCierre)}
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 mt-4 md:mt-0">
                  <button 
                    onClick={handleCerrarDia}
                    className="px-5 py-3 bg-white text-gray-900 text-xs font-black rounded-xl hover:bg-gray-100 transition-all transform active:scale-95 shadow-[0_10px_20px_rgba(255,255,255,0.1)] flex items-center gap-2"
                  >
                    <Building2 size={16} />
                    GUARDAR CIERRE
                  </button>
                </div>
              </div>
            </div>

            {/* Total a Entregar per Cashier */}
            <div className="w-full max-w-3xl mt-8 animate-fade-in">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-px flex-1 bg-gray-200"></div>
                <h4 className="text-gray-400 font-black uppercase text-[10px] tracking-[0.3em]">Efectivo a Entregar (Billetes Gs.)</h4>
                <div className="h-px flex-1 bg-gray-200"></div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {tableData.map((row, idx) => (
                  <div key={idx} className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-gray-100 flex flex-col items-center group hover:border-blue-200 hover:shadow-md transition-all">
                    <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center mb-3 group-hover:bg-blue-50 transition-colors">
                      <span className="text-xs font-bold text-gray-400 group-hover:text-blue-500">{row.nombreCajero.charAt(0)}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">{row.nombreCajero}</span>
                    <span className="text-xl font-black text-gray-900">{formatCurrency(row.totalAEntregar)}</span>
                    <div className="flex items-center gap-1.5 mt-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                       <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">{row.nombreCaja}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ventas a Crédito Detalladas */}
            {(() => {
              const creditMovements = rawMovements.filter(m => (m.ventasCredito || m.ventas_credito || 0) > 0);
              if (creditMovements.length === 0) return null;
              
              return (
                <div className="w-full max-w-3xl mt-8 animate-fade-in">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="h-px flex-1 bg-gray-200"></div>
                    <h4 className="text-gray-400 font-black uppercase text-[10px] tracking-[0.3em]">Detalle Ventas a Crédito</h4>
                    <div className="h-px flex-1 bg-gray-200"></div>
                  </div>
                  
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-50 text-gray-600 uppercase font-bold">
                        <tr>
                          <th className="px-4 py-3">Fecha</th>
                          <th className="px-4 py-3">Cajero / Caja</th>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Descripción</th>
                          <th className="px-4 py-3 text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {creditMovements.map((m, i) => (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-gray-500">
                              {new Date(m.fecha).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-bold text-gray-700">{m.cajero || m.usuario || 'N/A'}</div>
                              <div className="text-[10px] text-gray-400">{m.caja || 'N/A'}</div>
                            </td>
                            <td className="px-4 py-3 font-semibold text-gray-700">
                              {m.creditoDetalles?.cliente || m.credito_detalles?.cliente || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {m.creditoDetalles?.descripcion || m.credito_detalles?.descripcion || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-900 font-bold">
                              {formatCurrency(m.ventasCredito || m.ventas_credito || 0)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-yellow-50/50 font-black border-t-2 border-yellow-100">
                          <td colSpan="4" className="px-4 py-3 uppercase text-yellow-800 text-right tracking-wider text-xs">Total Créditos:</td>
                          <td className="px-4 py-3 text-right text-yellow-750 text-sm">
                            {formatCurrency(creditMovements.reduce((acc, m) => acc + (m.ventasCredito || m.ventas_credito || 0), 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* INLINE DEPOSIT SECTION */}
        {summaryData && (
          <div className="mb-20 flex flex-col items-center">
            <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden border border-gray-200 relative w-full max-w-3xl">
              <div className="bg-gradient-to-r from-blue-700 to-blue-600 px-8 py-5 flex items-center justify-between shadow-md z-10 flex-wrap gap-4">
                <h3 className="text-white font-black text-xl uppercase tracking-widest flex items-center">
                  <Building2 className="mr-3" size={24} />
                  A Depositar - Servicios
                </h3>
                <div className="flex gap-3 items-center bg-blue-800/50 p-2 rounded-lg border border-blue-500">
                   <div className="flex flex-col">
                       <label className="text-[10px] uppercase text-blue-200 font-bold mb-1">Desde</label>
                       <input 
                         type="date" 
                         value={depositosDesde}
                         onChange={(e) => setDepositosDesde(e.target.value)}
                         className="px-2 py-1 text-sm bg-white text-gray-800 rounded outline-none w-32"
                       />
                   </div>
                   <div className="flex flex-col">
                       <label className="text-[10px] uppercase text-blue-200 font-bold mb-1">Hasta</label>
                       <input 
                         type="date" 
                         value={depositosHasta}
                         onChange={(e) => setDepositosHasta(e.target.value)}
                         className="px-2 py-1 text-sm bg-white text-gray-800 rounded outline-none w-32"
                       />
                   </div>
                </div>
              </div>
              
              <div className="p-6">
                 <div className="border text-sm rounded-lg overflow-hidden">
                   <table className="w-full text-left">
                     <thead className="bg-blue-50 text-blue-900 uppercase font-bold text-[10px]">
                       <tr>
                         <th className="px-4 py-3">Servicio</th>
                         <th className="px-4 py-3 text-right">Monto Sistema</th>
                         <th className="px-4 py-3 text-center">A Depositar</th>
                         <th className="px-4 py-3 text-right">Diferencia</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-200">
                       {SERVICIOS_CATALOGO.map((srv, i) => {
                          const label = srv.label;
                          const monto_sistema = customMontoSistema ? (customMontoSistema[label] || 0) : (summaryData?.servicios?.[label] || 0);
                          const solicitado = requestedDeposits[srv.key] || 0;
                          const diferencia = monto_sistema - solicitado;
                          if (monto_sistema === 0 && !solicitado) return null;

                          return (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-semibold text-gray-800 uppercase text-xs tracking-wider">
                                {label}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-600 font-bold">
                                {formatCurrency(monto_sistema)}
                              </td>
                              <td className="px-4 py-3">
                                <input 
                                  type="text" 
                                  value={solicitado === 0 ? '' : formatCurrency(solicitado).replace('Gs. ', '')}
                                  onChange={(e) => handleDepositChange(srv.key, e.target.value)}
                                  placeholder="0"
                                  className="w-full text-right bg-white border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 font-bold text-gray-800"
                                />
                              </td>
                              <td className={`px-4 py-3 text-right font-bold ${diferencia < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                {formatCurrency(diferencia)}
                              </td>
                            </tr>
                          );
                       })}
                     </tbody>
                     <tfoot className="bg-gray-50 font-black text-gray-800">
                        {(() => {
                           let sumSistema = 0;
                           let sumSolicitado = 0;
                           let sumDiferencia = 0;
                           SERVICIOS_CATALOGO.forEach(srv => {
                              const label = srv.label;
                              const monto_sistema = customMontoSistema ? (customMontoSistema[label] || 0) : (summaryData?.servicios?.[label] || 0);
                              const solicitado = requestedDeposits[srv.key] || 0;
                              if (monto_sistema > 0 || solicitado > 0) {
                                  sumSistema += monto_sistema;
                                  sumSolicitado += solicitado;
                                  sumDiferencia += (monto_sistema - solicitado);
                              }
                           });
                           return (
                              <tr>
                                 <td className="px-4 py-3">TOTALES</td>
                                 <td className="px-4 py-3 text-right">{formatCurrency(sumSistema)}</td>
                                 <td className="px-4 py-3 text-right text-blue-700">{formatCurrency(sumSolicitado)}</td>
                                 <td className={`px-4 py-3 text-right ${sumDiferencia < 0 ? 'text-red-500' : 'text-green-600'}`}>{formatCurrency(sumDiferencia)}</td>
                              </tr>
                           )
                        })()}
                     </tfoot>
                   </table>
                 </div>
                 
                 <div className="mt-4 flex justify-end">
                    <button 
                       onClick={handleSaveDepositos}
                       disabled={isSavingDeposits}
                       className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow disabled:opacity-50"
                    >
                       {isSavingDeposits ? 'Guardando...' : 'Guardar Montos de Depósito'}
                    </button>
                 </div>
              </div>
            </div>
          </div>
        )}


      </main>

      {/* --- DRILL-DOWN MODAL --- */}
      <Modal 
        isOpen={detailModal.isOpen} 
        onClose={() => setDetailModal(prev => ({ ...prev, isOpen: false }))}
        title={detailModal.title}
      >
        <div className="bg-gray-50 border rounded-lg overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead className="bg-gray-100 text-gray-600 uppercase">
              <tr className="border-b">
                <th className="px-4 py-2 text-left">Fecha</th>
                <th className="px-4 py-2 text-left">Cajero</th>
                {detailModal.type === 'credito' ? (
                  <>
                    <th className="px-4 py-2 text-left">Cliente</th>
                    <th className="px-4 py-2 text-left">Descripción</th>
                  </>
                ) : (
                  <th className="px-4 py-2 text-left">Caja</th>
                )}
                <th className="px-4 py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {detailModal.data.length > 0 ? (
                <>
                  {detailModal.data.map((m, i) => (
                    <tr key={i} className="hover:bg-blue-50/50 bg-white group">
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(m.fecha).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 font-bold text-gray-700">{m.cajero || m.usuario || 'N/A'}</td>
                      {detailModal.type === 'credito' ? (
                        <>
                          <td className="px-4 py-2 text-gray-700 font-semibold">{m.creditoDetalles?.cliente || 'N/A'}</td>
                          <td className="px-4 py-2 text-gray-500">{m.creditoDetalles?.descripcion || 'N/A'}</td>
                        </>
                      ) : (
                        <td className="px-4 py-2 text-gray-400">{m.caja}</td>
                      )}
                      <td className="px-4 py-2 text-right text-gray-900 font-black">
                        {formatCurrency(getAmountLabel(m, detailModal.type))}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 font-black text-gray-900 border-t-2">
                    <td colSpan={detailModal.type === 'credito' ? 4 : 3} className="px-4 py-3 text-right uppercase tracking-tighter">Total en Detalle:</td>
                    <td className="px-4 py-3 text-right text-lg">
                      {formatCurrency(detailModal.data.reduce((acc, m) => acc + (getAmountLabel(m, detailModal.type) || 0), 0))}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={detailModal.type === 'credito' ? 5 : 4} className="text-center py-10 text-gray-400 italic">No hay movimientos registrados para esta métrica.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-5 pt-4 border-t flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
            Vista de Auditoría de Tesorería • Hojas de Cálculo
          </p>
          {detailModal.data.length > 0 && (
            <button
              onClick={() => exportDetailPDF(detailModal.title, detailModal.data, detailModal.type, { start: startDate, end: endDate })}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-lg shadow flex items-center gap-1.5 transition-all transform active:scale-95"
            >
              📥 Descargar PDF
            </button>
          )}
        </div>
      </Modal>

      {/* --- MODAL DE EFECTIVO REAL --- */}
      <Modal
        isOpen={isEfectivoModalOpen}
        onClose={() => setIsEfectivoModalOpen(false)}
        title="Ingreso de Efectivo Real al Cierre"
      >
        <div className="space-y-6">
          <div className="bg-gray-100 p-4 rounded-xl flex items-center justify-between border">
            <span className="text-sm font-bold text-gray-700 uppercase">Total Efectivo Real:</span>
            <span className="text-xl font-black text-gray-900">{formatCurrency(efectivoReal)}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* GUARANÍES DESGLOSE */}
            <div>
              <h4 className="text-sm font-black text-gray-800 uppercase border-b pb-2 mb-4">Efectivo Guaraníes (Gs.)</h4>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {CONFIG.denominaciones.map((den) => {
                  const val = den.valor;
                  const currentCant = efectivoRealDetalle.efectivoGs?.[val] || '';
                  return (
                    <div key={val} className="flex items-center justify-between gap-4">
                      <span className="text-xs font-bold text-gray-500 w-24 uppercase">Gs. {den.nombre}:</span>
                      <input
                        type="text"
                        placeholder="0"
                        className="w-24 px-2 py-1 text-sm border rounded text-right font-mono"
                        value={currentCant}
                        onChange={(e) => {
                          const cant = e.target.value.replace(/\D/g, '');
                          const newDetalle = {
                            ...efectivoRealDetalle,
                            efectivoGs: {
                              ...efectivoRealDetalle.efectivoGs,
                              [val]: cant === '' ? '' : parseInt(cant, 10)
                            }
                          };
                          setEfectivoRealDetalle(newDetalle);
                          setEfectivoReal(recalculateEfectivoReal(newDetalle));
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* MONEDAS EXTRANJERAS DESGLOSE */}
            <div>
              <h4 className="text-sm font-black text-gray-800 uppercase border-b pb-2 mb-4">Moneda Extranjera</h4>
              <div className="space-y-4">
                {['usd', 'brl', 'ars'].map((mon) => {
                  const label = mon === 'usd' ? 'Dólares ($)' : mon === 'brl' ? 'Reales (R$)' : 'Pesos (ARS)';
                  const currentVal = efectivoRealDetalle.monedasExtranjeras?.[mon] || { cantidad: 0, cotizacion: globalCotizaciones[mon] || 0 };
                  return (
                    <div key={mon} className="p-3 bg-gray-50 rounded-lg border space-y-2">
                      <span className="text-xs font-black text-gray-700 uppercase block">{label}</span>
                      
                      <div className="flex items-center gap-3">
                        <div className="flex-grow">
                          <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Cant.</label>
                          <input
                            type="text"
                            placeholder="0.00"
                            className="w-full px-2 py-1 text-xs border rounded text-right font-mono"
                            value={currentVal.cantidad || ''}
                            onChange={(e) => {
                              const cantStr = e.target.value.replace(/[^0-9.]/g, '');
                              const cant = cantStr === '' ? '' : parseFloat(cantStr);
                              const newDetalle = {
                                ...efectivoRealDetalle,
                                monedasExtranjeras: {
                                  ...efectivoRealDetalle.monedasExtranjeras,
                                  [mon]: {
                                    ...currentVal,
                                    cantidad: cant
                                  }
                                }
                              };
                              setEfectivoRealDetalle(newDetalle);
                              setEfectivoReal(recalculateEfectivoReal(newDetalle));
                            }}
                          />
                        </div>
                        
                        <div className="w-24">
                          <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Cotiz.</label>
                          <input
                            type="text"
                            placeholder="0"
                            className="w-full px-2 py-1 text-xs border rounded text-right font-mono bg-gray-100"
                            value={currentVal.cotizacion || 0}
                            onChange={(e) => {
                              const cotStr = e.target.value.replace(/\D/g, '');
                              const cot = cotStr === '' ? 0 : parseInt(cotStr, 10);
                              const newDetalle = {
                                ...efectivoRealDetalle,
                                monedasExtranjeras: {
                                  ...efectivoRealDetalle.monedasExtranjeras,
                                  [mon]: {
                                    ...currentVal,
                                    cotizacion: cot
                                  }
                                }
                              };
                              setEfectivoRealDetalle(newDetalle);
                              setEfectivoReal(recalculateEfectivoReal(newDetalle));
                            }}
                          />
                        </div>
                      </div>

                      <div className="text-right text-[10px] text-gray-500 font-bold uppercase">
                        Equiv: {formatCurrency((currentVal.cantidad || 0) * (currentVal.cotizacion || 0))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end">
            <button
              onClick={() => setIsEfectivoModalOpen(false)}
              className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
            >
              Aceptar
            </button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
