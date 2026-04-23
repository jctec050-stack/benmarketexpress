import * as XLSX from 'xlsx';
import { formatCurrency } from './utils';

export function exportResumenExcel(tableData, metrics, dateRange, egresosList = []) {
  const wb = XLSX.utils.book_new();
  
  // 1. Prepare Summary Sheet
  const summaryRows = [
    ['Resumen de Tesorería'],
    [`Desde: ${dateRange.start}`, `Hasta: ${dateRange.end}`],
    [''],
    ['Métricas Generales'],
    ['Total Tarjeta', metrics.totalTarjeta],
    ['Pedidos Ya', metrics.totalPedidosYa],
    ['Ventas Crédito', metrics.totalCredito],
    [''],
    ['Detalle por Cajero']
  ];

  // Header for Table
  summaryRows.push(['Cajero', 'Caja', 'Total Ingresos Tienda', 'Efectivo IGNIS', 'Sobrante', 'Faltante']);

  tableData.forEach(row => {
    summaryRows.push([
      row.nombreCajero,
      row.nombreCaja,
      row.ingresoTiendaCalculado,
      row.recaudadoReal,
      row.sobrante,
      row.faltante
    ]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen");

  // 2. Prepare Egresos Sheet
  if (egresosList.length > 0) {
    const egresosRows = [
      ['Detalle de Pagos / Egresos'],
      [`Periodo: ${dateRange.start} al ${dateRange.end}`],
      [''],
      ['Fecha', 'Cajero', 'Categoría', 'Proveedor/Receptor', 'Descripción', 'Monto']
    ];

    egresosList.forEach(e => {
      egresosRows.push([
        new Date(e.fecha).toLocaleDateString(),
        e.cajero || 'N/A',
        e.categoria,
        e.receptor || '---',
        e.descripcion,
        e.monto
      ]);
    });

    const wsEgresos = XLSX.utils.aoa_to_sheet(egresosRows);
    XLSX.utils.book_append_sheet(wb, wsEgresos, "Egresos");
  }

  // Save
  XLSX.writeFile(wb, `Resumen_Tesoreria_${dateRange.start}.xlsx`);
}
