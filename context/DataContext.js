'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/db'
import { useAuth } from './AuthContext'

const DataContext = createContext({})

export const DataProvider = ({ children }) => {
  const { user, profile } = useAuth()
  const [ingresos, setIngresos] = useState([])
  const [egresos, setEgresos] = useState([])
  const [arqueos, setArqueos] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [cotizaciones, setCotizaciones] = useState({ usd: 7000, brl: 1250, ars: 0 })
  const [loadingData, setLoadingData] = useState(false)

  const getLocalISODate = () => {
    const now = new Date()
    const tzOffsetMs = now.getTimezoneOffset() * 60000
    return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10)
  }

  // Selected Date, Box (Caja) and Cashier (Cajero) for filtering
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedCaja, setSelectedCaja] = useState('Caja 1') // Default
  const [selectedCajero, setSelectedCajero] = useState('Todos los cajeros')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedCaja = sessionStorage.getItem('cajaSeleccionada')
      if (storedCaja) {
        setSelectedCaja(storedCaja)
      }
      // La fecha NO se restaura intencionalmente: siempre debe ser
      // seleccionada manualmente al inicio de cada jornada (Opción A)
    }
  }, [user])

  // Persist Date and Caja changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('cajaSeleccionada', selectedCaja)
    }
  }, [selectedCaja])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Solo persistimos si hay fecha activa; al limpiar, se borra del storage
      if (selectedDate) {
        sessionStorage.setItem('fechaJornada', selectedDate)
      } else {
        sessionStorage.removeItem('fechaJornada')
      }
    }
  }, [selectedDate])

  // Limpia la fecha de jornada (llamada al guardar el arqueo)
  const clearSelectedDate = () => {
    setSelectedDate('')
  }

  // Fetch data when user, date, caja or cajero changes
  const refreshData = useCallback(async () => {
    setLoadingData(true)
    try {
      // Sincronizar datos locales acumulados si hay conexión
      if (typeof window !== 'undefined' && navigator.onLine) {
        try {
          await db.syncOfflineData()
        } catch (syncErr) {
          console.warn('Error al sincronizar datos offline en refreshData:', syncErr)
        }
      }

      const isCajero = profile?.rol === 'cajero'
      const cajaParam = selectedCaja

      // Parallel fetching
      const [resIngresos, resEgresos, resArqueos, resMovimientos, resCot] = await Promise.all([
        db.getMovimientosTemporales(selectedDate, cajaParam),
        db.getEgresos(selectedDate, cajaParam),
        db.getArqueos(selectedDate, cajaParam),
        db.getMovimientos(selectedDate, cajaParam),
        db.getCotizaciones()
      ])

      if (resIngresos.success) setIngresos(resIngresos.data)
      if (resEgresos.success) setEgresos(resEgresos.data)
      if (resArqueos.success) setArqueos(resArqueos.data)
      if (resMovimientos.success) setMovimientos(resMovimientos.data)
      if (resCot.success) setCotizaciones(resCot.data)

    } catch (error) {
      console.error("Error refreshing data:", error)
    } finally {
      setLoadingData(false)
    }
  }, [selectedDate, selectedCaja, profile])

  // Fetch data when user, date, caja or cajero changes
  useEffect(() => {
    if (user) {
      refreshData()
    }
  }, [user, selectedDate, selectedCaja, selectedCajero, profile, refreshData])

  // Sync listener
  useEffect(() => {
    const handleOnline = () => {
      console.log('Online: Syncing data...')
      db.syncOfflineData().then(({ synced }) => {
        if (synced > 0) refreshData()
      })
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [refreshData])

  // CRUD Wrappers that update local state immediately (Optimistic UI could be added here)
  const addIngreso = async (item) => {
    const editorName = profile?.nombre || profile?.username || user?.email || 'Desconocido'
    const res = await db.saveMovimientoTemporal(item, editorName)
    if (res.success) await refreshData() // Or append to state directly
    return res
  }

  const deleteIngreso = async (id) => {
    const res = await db.deleteMovimientoTemporal(id)
    if (res.success) await refreshData()
    return res
  }

  const addEgreso = async (item) => {
    const editorName = profile?.nombre || profile?.username || user?.email || 'Desconocido'
    const res = await db.saveEgreso(item, editorName)
    if (res.success) await refreshData()
    return res
  }

  const deleteEgreso = async (id) => {
    const res = await db.deleteEgreso(id)
    if (res.success) await refreshData()
    return res
  }

  const addArqueo = async (item) => {
    const res = await db.saveArqueo(item, user?.id)
    if (res.success) await refreshData()
    return res
  }

  const updateArqueo = async (id, item) => {
    const res = await db.updateArqueo(id, item)
    if (res.success) await refreshData()
    return res
  }

  const deleteArqueo = async (id, fecha, caja) => {
    const res = await db.deleteArqueo(id, fecha, caja)
    if (res.success) await refreshData()
    return res
  }

  const addMovimiento = async (item) => {
    const editorName = profile?.nombre || profile?.username || user?.email || 'Desconocido'
    const res = await db.saveMovimiento(item, editorName)
    if (res.success) await refreshData()
    return res
  }

  const deleteMovimiento = async (id) => {
    const res = await db.deleteMovimiento(id)
    if (res.success) await refreshData()
    return res
  }


  const updateGlobalCotizaciones = async (newCot) => {
    const res = await db.saveCotizaciones(newCot)
    if (res.success) {
      setCotizaciones(res.data)
    }
    return res
  }

  return (
    <DataContext.Provider value={{
      ingresos,
      egresos,
      arqueos,
      movimientos,
      cotizaciones,
      loadingData,
      selectedDate,
      clearSelectedDate,
      setSelectedDate,
      selectedCaja,
      setSelectedCaja,
      selectedCajero,
      setSelectedCajero,
      refreshData,
      addIngreso,
      deleteIngreso,
      addEgreso,
      deleteEgreso,
      addArqueo,
      updateArqueo,
      deleteArqueo,
      addMovimiento,
      deleteMovimiento,
      updateGlobalCotizaciones
    }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
