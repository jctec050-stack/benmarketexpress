import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './utils';
import { SERVICIOS_CATALOGO, getServicioLabel } from './config';

/**
 * Exports the treasury summary to a premium PDF report
 */
export const exportResumenPDF = (data, metrics, dates, summaryData, saldoAnterior, requestedDeposits = {}) => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // --- 1. HEADER ---
  // Background for Header
  doc.setFillColor(17, 24, 39); // Gray-900
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN DE TESORERÍA', margin, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Periodo: ${dates.start} al ${dates.end}`, margin, 25);
  doc.text(`Generado: ${new Date().toLocaleString()}`, margin, 30);

  // App Brand
  doc.setFontSize(14);
  doc.setTextColor(185, 28, 28); // Red-700
  doc.text('BENMARKET', pageWidth - margin - 35, 18);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('SISTEMA DE GESTIÓN', pageWidth - margin - 35, 23);

  let currentY = 50;

  // --- 2. METRICS CARDS (Simulated) ---
  const metricCols = [
    { label: 'VENTAS TIENDA', value: formatCurrency(metrics.totalVentasTienda || 0), color: [37, 99, 235] },
    { label: 'TARJETAS', value: formatCurrency(metrics.totalTarjeta || 0), color: [168, 85, 247] },
    { label: 'PEDIDOS YA', value: formatCurrency(metrics.totalPedidosYa || 0), color: [239, 68, 68] },
    { label: 'CRÉDITO', value: formatCurrency(metrics.totalCredito || 0), color: [234, 179, 8] }
  ];

  const colWidth = (pageWidth - (margin * 2)) / 4;
  metricCols.forEach((m, i) => {
    const x = margin + (i * colWidth);

    // Card border/accent
    doc.setDrawColor(m.color[0], m.color[1], m.color[2]);
    doc.setLineWidth(1);
    doc.line(x + 2, currentY, x + colWidth - 2, currentY);

    doc.setTextColor(100, 100, 100);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(m.label, x + 5, currentY + 5);

    doc.setTextColor(17, 24, 39);
    doc.setFontSize(11);
    doc.text(m.value, x + 5, currentY + 12);
  });

  currentY += 25;

  // --- 3. RECAUDACION TABLE ---
  doc.setDrawColor(200);
  doc.setTextColor(50);
  doc.setFontSize(12);
  doc.text('RECAUDACIÓN POR CAJERO', margin, currentY);
  currentY += 5;

  const recaudacionBody = data.map(r => [
    `${r.nombreCajero}\n(${r.nombreCaja})`,
    formatCurrency(r.ingresoTiendaCalculado),
    formatCurrency(r.recaudadoReal || 0),
    formatCurrency(r.sobrante),
    formatCurrency(r.faltante),
    formatCurrency(r.ingresoTiendaCalculado)
  ]);

  const totalRecaudado = data.reduce((acc, r) => acc + (r.ingresoTiendaCalculado || 0), 0);
  const totalRecaudadoReal = data.reduce((acc, r) => acc + (parseFloat(r.recaudadoReal) || 0), 0);

  autoTable(doc, {
    startY: currentY,
    head: [['Cajero', 'Ingreso Tienda', 'Efectivo Real', 'Sobrante', 'Faltante', 'Subtotal']],
    body: recaudacionBody,
    foot: [['TOTALES', formatCurrency(totalRecaudado), formatCurrency(totalRecaudadoReal), '', '', formatCurrency(totalRecaudado)]],
    theme: 'striped',
    headStyles: { fillColor: [31, 41, 55], fontSize: 8 },
    footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' },
    margin: { left: margin, right: margin },
    styles: { fontSize: 8 }
  });

  currentY = doc.lastAutoTable.finalY + 15;

  currentY = doc.lastAutoTable.finalY + 15;

  // --- 4. BALANCE GENERAL (T-ACCOUNT LAYOUT) ---
  if (currentY > 180) { doc.addPage(); currentY = 20; }

  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('BALANCE GENERAL', margin, currentY);
  currentY += 5;

  const balanceColWidth = (pageWidth - (margin * 2) - 10) / 2; // Split page in two with 10mm gap

  // Calculate totals
  const totalServicios = Object.values(summaryData?.servicios || {}).reduce((a, b) => a + b, 0);
  const totalInversiones = summaryData?.ingresosOtros?.inversiones || 0;
  const totalInversionRetiro = summaryData?.ingresosOtros?.inversionRetiro || 0;
  // USE SYSTEM VALUE (TOTAL INGRESO TIENDA SISTEMA) TO MATCH UI DASHBOARD
  const sumIngresos = metrics.totalIngresoTiendaSistema + totalServicios + totalInversiones + totalInversionRetiro + (saldoAnterior || 0);
  const sumEgresos = Object.values(summaryData?.egresos || {}).reduce((a, b) => a + b, 0);

  // 4a. INGRESOS TABLE (LEFT)
  const serviceRows = Object.entries(summaryData?.servicios || {})
    .filter(([_, val]) => val > 0)
    .map(([key, val]) => [key.toUpperCase(), formatCurrency(val)]);

  autoTable(doc, {
    startY: currentY,
    head: [[{ content: 'INGRESOS (DEBE)', colSpan: 2, styles: { fillColor: [5, 150, 105], halign: 'center' } }]],
    body: [
      ['Ingreso Tienda (Sistema)', formatCurrency(metrics.totalIngresoTiendaSistema)],
      ...serviceRows,
      ['Inversiones', formatCurrency(totalInversiones)],
      ['Inversiones-Retiro de fondos', formatCurrency(totalInversionRetiro)],
      ['Saldo Anterior', formatCurrency(saldoAnterior || 0)],
      [{ content: 'TOTAL INGRESOS', styles: { fontStyle: 'bold' } }, { content: formatCurrency(sumIngresos), styles: { fontStyle: 'bold' } }]
    ],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: { 1: { halign: 'right', cellWidth: 25 } },
    margin: { left: margin, right: margin + balanceColWidth + 10 },
    tableWidth: balanceColWidth
  });

  const leftTableY = doc.lastAutoTable.finalY;

  // 4b. EGRESOS TABLE (RIGHT)
  const egresosRows = summaryData ? Object.entries(summaryData.egresos).map(([cat, val]) => [
    cat.length > 32 ? cat.substring(0, 30) + '..' : cat.toUpperCase(),
    formatCurrency(val)
  ]) : [];

  autoTable(doc, {
    startY: currentY, // Same Y as the left table
    head: [[{ content: 'EGRESOS (HABER)', colSpan: 2, styles: { fillColor: [185, 28, 28], halign: 'center' } }]],
    body: [
      ...egresosRows,
      [{ content: 'TOTAL EGRESOS', styles: { fontStyle: 'bold' } }, { content: formatCurrency(sumEgresos), styles: { fontStyle: 'bold' } }]
    ],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: { 1: { halign: 'right', cellWidth: 25 } },
    margin: { left: margin + balanceColWidth + 10, right: margin },
    tableWidth: balanceColWidth
  });

  const rightTableY = doc.lastAutoTable.finalY;
  currentY = Math.max(leftTableY, rightTableY) + 15;

  // --- 5. RESULTADO NETO ---
  if (currentY > 260) { doc.addPage(); currentY = 20; }

  doc.setFillColor(17, 24, 39);
  doc.rect(margin, currentY, pageWidth - (margin * 2), 20, 'F');

  doc.setTextColor(200, 200, 200);
  doc.setFontSize(8);
  doc.text('RESULTADO NETO DEL PERIODO (EFECTIVO EN CAJA)', margin + 10, currentY + 8);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(sumIngresos - sumEgresos), margin + 10, currentY + 16);

  currentY += 30;

  // --- 6. DEPOSITOS SERVICIOS ---
  if (currentY > 240) { doc.addPage(); currentY = 20; }

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('A DEPOSITAR - SERVICIOS (Bocas de Cobranza)', margin, currentY);
  currentY += 5;

  const depositRows = [];
  let totalSistema = 0;
  let totalDepositar = 0;
  let totalDiferencia = 0;

  SERVICIOS_CATALOGO.forEach(srv => {
    const monto_sistema = summaryData.servicios[srv.label] || 0;
    const solicitado = requestedDeposits[srv.key] || 0;
    const diferencia = monto_sistema - solicitado;

    if (monto_sistema > 0 || solicitado > 0) {
      totalSistema += monto_sistema;
      totalDepositar += solicitado;
      totalDiferencia += diferencia;

      depositRows.push([
        srv.label,
        formatCurrency(monto_sistema),
        formatCurrency(solicitado),
        (diferencia > 0 ? '+' : '') + formatCurrency(diferencia)
      ]);
    }
  });

  if (depositRows.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [['Servicio', 'Sistema', 'A Depositar', 'Diferencia']],
      body: depositRows,
      foot: [['TOTALES', formatCurrency(totalSistema), formatCurrency(totalDepositar), (totalDiferencia > 0 ? '+' : '') + formatCurrency(totalDiferencia)]],
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], halign: 'center' },
      footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' }
      },
      styles: { fontSize: 8 },
      margin: { left: margin, right: margin }
    });
  } else {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('No hay movimientos o depósitos registrados para servicios en este periodo.', margin, currentY + 5);
  }

  // Save the PDF
  doc.save(`Resumen_Tesoreria_${dates.start}.pdf`);
};

/**
 * Exports a professional receipt for a single expense (Egreso)
 */
export const exportEgresoReceiptPDF = (egreso) => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: [80, 50] // Adjusted to 8x5 cm
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 5;

  // --- 1. HEADER ---
  doc.setFillColor(185, 28, 28); // Red-700
  doc.rect(0, 0, pageWidth, 8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('RECIBO DE EGRESO', pageWidth / 2, 4.5, { align: 'center' });
  doc.setFontSize(6);
  doc.text('BENMARKET EXPRESS', pageWidth / 2, 7, { align: 'center' });

  let currentY = 12;

  // --- 2. DETAILS ---
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('Nro:', margin, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(String(egreso.numeroRecibo || '---'), margin + 7, currentY);

  doc.setFont('helvetica', 'bold');
  doc.text('Fecha:', pageWidth - margin - 22, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(egreso.fecha).toLocaleDateString(), pageWidth - margin, currentY, { align: 'right' });

  currentY += 4;
  doc.setDrawColor(240);
  doc.setLineWidth(0.1);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Concepto:', margin, currentY);
  doc.setFont('helvetica', 'normal');
  const splitDesc = doc.splitTextToSize(egreso.descripcion || '', pageWidth - (margin * 2) - 15);
  doc.text(splitDesc, margin + 15, currentY);
  currentY += Math.max(4, splitDesc.length * 3);

  doc.setFont('helvetica', 'bold');
  doc.text('Caja/Cajero:', margin, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(`${egreso.caja} / ${egreso.cajero}`, margin + 15, currentY);

  currentY += 4;
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, currentY, pageWidth - (margin * 2), 7, 'F');

  doc.setTextColor(185, 28, 28);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', margin + 3, currentY + 5);
  doc.text(formatCurrency(egreso.monto), pageWidth - margin - 3, currentY + 5, { align: 'right' });

  currentY += 14;
  doc.setDrawColor(150);
  doc.setLineWidth(0.1);
  doc.line(pageWidth / 4, currentY, (3 * pageWidth) / 4, currentY);

  doc.setTextColor(100);
  doc.setFontSize(6);
  doc.text('Firma', pageWidth / 2, currentY + 3, { align: 'center' });

  currentY = 48;
  doc.setFontSize(4);
  doc.text('Documento no válido como factura. Uso interno.', pageWidth / 2, currentY, { align: 'center' });

  // Save the PDF
  doc.save(`Recibo_Egreso_${egreso.numeroRecibo || egreso.id}.pdf`);
};

/**
 * Exports a detailed Arqueo de Caja report
 */
export const exportArqueoPDF = (arqueoData, displayData) => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // --- 1. HEADER ---
  doc.setFillColor(31, 41, 55); // Gray-800
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('ARQUEO DE CAJA', margin, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha: ${arqueoData.fecha}`, margin, 22);
  doc.text(`Caja: ${arqueoData.caja} | Cajero: ${arqueoData.cajero}`, margin, 27);

  doc.setFontSize(14);
  doc.setTextColor(185, 28, 28); // Red-700
  doc.text('BENMARKET', pageWidth - margin - 35, 15);

  let currentY = 45;

  // --- 2. CASH TABLES ---
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALLE DE EFECTIVO', margin, currentY);
  currentY += 5;

  const cashRows = [];
  Object.entries(displayData.efectivo || {}).forEach(([den, val]) => {
    const cant = typeof val === 'object' ? (val.ingreso || val.neto || 0) : val;
    if (cant > 0) {
      cashRows.push([`Gs. ${den}`, cant, formatCurrency(parseInt(den) * cant)]);
    }
  });

  // Agregando monedas extranjeras
  Object.entries(displayData.monedasExtranjeras || {}).forEach(([key, val]) => {
    if (val.cantidad > 0) {
      cashRows.push([key.toUpperCase(), val.cantidad, formatCurrency(val.montoGs)]);
    }
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Denominación', 'Cantidad', 'Subtotal']],
    body: cashRows,
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: margin, right: pageWidth / 2 + 5 },
    styles: { fontSize: 8 }
  });

  const nextY = doc.lastAutoTable.finalY + 10;

  // --- 3. SUMMARY BOX (Beside cash table or below) ---
  const summaryX = pageWidth / 2 + 5;
  let summaryY = currentY;

  const drawSummaryRow = (label, value, color = [0, 0, 0], isBold = false) => {
    doc.setTextColor(100);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(label, summaryX, summaryY);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.setFontSize(9);
    if (isBold) doc.setFont('helvetica', 'bold');
    doc.text(value, pageWidth - margin, summaryY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    summaryY += 7;
  };

  const totalMonedasExtranjerasGs =
    (displayData.monedasExtranjeras?.usd?.montoGs || 0) +
    (displayData.monedasExtranjeras?.brl?.montoGs || 0) +
    (displayData.monedasExtranjeras?.ars?.montoGs || 0);

  drawSummaryRow('EFECTIVO BRUTO:', formatCurrency(displayData.totalEfectivoBruto));
  if (totalMonedasExtranjerasGs > 0) {
    drawSummaryRow('MONEDA EXTRANJERA:', `-${formatCurrency(totalMonedasExtranjerasGs)}`, [185, 28, 28]);
  }
  drawSummaryRow('FONDO FIJO:', `-${formatCurrency(displayData.fondoFijo)}`, [185, 28, 28]);
  summaryY += 3;
  drawSummaryRow('TOTAL A ENTREGAR:', formatCurrency(displayData.totalEfectivoBruto - totalMonedasExtranjerasGs - displayData.fondoFijo), [17, 24, 39], true);


  summaryY += 10;
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('OTROS INGRESOS', summaryX, summaryY);
  summaryY += 5;
  doc.setFont('helvetica', 'normal');
  drawSummaryRow('TARJETAS:', formatCurrency(displayData.pagosTarjeta));
  drawSummaryRow('CRÉDITO:', formatCurrency(displayData.ventasCredito));
  drawSummaryRow('PEDIDOS YA:', formatCurrency(displayData.pedidosYa));
  drawSummaryRow('TRANSFERENCIAS:', formatCurrency(displayData.ventasTransferencia || 0));

  currentY = Math.max(nextY, summaryY) + 10;

  // --- 4. SERVICES ---
  if (currentY > 250) { doc.addPage(); currentY = 20; }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('SERVICIOS', margin, currentY);
  currentY += 5;

  const servicesRows = [];
  let totalServiciosEfectivo = 0;
  let totalServiciosTarjeta = 0;

  Object.entries(displayData.servicios).forEach(([key, val]) => {
    if (key === 'otros') {
      Object.entries(val).forEach(([okey, oval]) => {
        if (oval.monto > 0 || oval.tarjeta > 0) {
          const label = getServicioLabel(okey);
          const lotes = oval.lotes && oval.lotes.length > 0 ? ` (Lote: ${Array.from(new Set(oval.lotes)).join(', ')})` : '';
          servicesRows.push([label + lotes, formatCurrency(oval.monto), formatCurrency(oval.tarjeta)]);
          totalServiciosEfectivo += (oval.monto || 0);
          totalServiciosTarjeta += (oval.tarjeta || 0);
        }
      });
    } else if (val.monto > 0 || val.tarjeta > 0) {
      const label = getServicioLabel(key);
      const lotes = val.lotes && val.lotes.length > 0 ? ` (Lote: ${Array.from(new Set(val.lotes)).join(', ')})` : '';
      servicesRows.push([label + lotes, formatCurrency(val.monto), formatCurrency(val.tarjeta)]);
      totalServiciosEfectivo += (val.monto || 0);
      totalServiciosTarjeta += (val.tarjeta || 0);
    }
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Servicio', 'Efectivo', 'Tarjeta']],
    body: servicesRows,
    foot: [['TOTALES', formatCurrency(totalServiciosEfectivo), formatCurrency(totalServiciosTarjeta)]],
    theme: 'grid',
    headStyles: { fillColor: [17, 24, 39] },
    footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    styles: { fontSize: 7 }
  });

  currentY = doc.lastAutoTable.finalY + 15;

  // --- 4.5. EGRESOS ---
  if (currentY > 230) { doc.addPage(); currentY = 20; }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALLE DE EGRESOS', margin, currentY);
  currentY += 5;

  const egresosRows = (displayData.egresosList || []).map(e => [
    `${e.descripcion || e.categoria || 'Sin descripción'}${e.categoria === 'Pago a Proveedor' && e.receptor ? ` (${e.receptor})` : ''}${e.categoria === 'Retiro de Fondos' && e.receptor ? ` (${e.receptor})` : ''}`,
    formatCurrency(e.monto || 0)
  ]);

  if (egresosRows.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('No hay egresos registrados.', margin, currentY);
    currentY += 10;
  } else {
    autoTable(doc, {
      startY: currentY,
      head: [['Descripción / Categoría', 'Monto']],
      body: egresosRows,
      foot: [['TOTAL EGRESOS', formatCurrency(displayData.totalEgresosMonto)]],
      theme: 'grid',
      headStyles: { fillColor: [185, 28, 28], halign: 'center' },
      footStyles: { fillColor: [243, 244, 246], textColor: [185, 28, 28], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' } },
      styles: { fontSize: 7 }
    });
    currentY = doc.lastAutoTable.finalY + 15;
  }

  // --- 5. FINALS ---
  if (currentY > 230) { doc.addPage(); currentY = 20; }

  const totalADeclarar = displayData.totalEfectivoBruto + displayData.totalEgresosMonto;
  const totalIngresosTiendaCalculado = displayData.totalIngresosTienda !== undefined
    ? displayData.totalIngresosTienda
    : (totalADeclarar - totalServiciosEfectivo - displayData.fondoFijo);

  doc.setFillColor(31, 41, 55); // Gray-800
  doc.rect(margin, currentY, pageWidth - (margin * 2), 35, 'F');

  // Bloque Izquierdo
  doc.setTextColor(156, 163, 175); // Gray-400
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL A DECLARAR EN SISTEMA', margin + 5, currentY + 10);

  doc.setTextColor(253, 224, 71); // Yellow-400
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(totalADeclarar), margin + 5, currentY + 18);

  doc.setTextColor(107, 114, 128); // Gray-500
  doc.setFontSize(7);
  doc.text('(Egresos + Efectivo Bruto)', margin + 5, currentY + 23);

  // Linea central
  doc.setDrawColor(55, 65, 81); // Gray-700
  doc.setLineWidth(0.5);
  doc.line(pageWidth / 2, currentY + 5, pageWidth / 2, currentY + 30);

  // Bloque Derecho
  const rightX = (pageWidth / 2) + 5;
  doc.setTextColor(156, 163, 175);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL INGRESOS TIENDA', rightX, currentY + 10);

  doc.setTextColor(74, 222, 128); // Green-400
  if (totalIngresosTiendaCalculado < 0) {
    doc.setTextColor(248, 113, 113); // Red-400
  }
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(totalIngresosTiendaCalculado), rightX, currentY + 18);

  doc.setTextColor(107, 114, 128); // Gray-500
  doc.setFontSize(7);
  doc.text('(Total Declarar - Serv Efectivo - Fondo)', rightX, currentY + 23);

  // Save
  doc.save(`Arqueo_${arqueoData.caja}_${arqueoData.fecha}.pdf`);

};

/**
 * Exports a receipt for a bank operation or transfer
 */
export const exportOperacionReceiptPDF = (operacion) => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: [80, 50]
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 5;

  // --- 1. HEADER ---
  doc.setFillColor(37, 99, 235); // Blue-600 for Bank Ops
  doc.rect(0, 0, pageWidth, 8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPROBANTE OPERACIÓN', pageWidth / 2, 4.5, { align: 'center' });
  doc.setFontSize(6);
  doc.text('BENMARKET EXPRESS', pageWidth / 2, 7, { align: 'center' });

  let currentY = 12;

  // --- 2. DETAILS ---
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('Nro:', margin, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(String(operacion.id || '---'), margin + 18, currentY);

  currentY += 4;
  doc.setDrawColor(240);
  doc.setLineWidth(0.1);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Tipo:', margin, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(operacion.tipo?.toUpperCase() || 'OPERACIÓN', margin + 18, currentY);

  currentY += 4;
  doc.setFont('helvetica', 'bold');
  doc.text('Concepto:', margin, currentY);
  doc.setFont('helvetica', 'normal');
  const splitDesc = doc.splitTextToSize(operacion.descripcion || '', pageWidth - (margin * 2) - 18);
  doc.text(splitDesc, margin + 18, currentY);
  currentY += Math.max(4, splitDesc.length * 3);

  doc.setFont('helvetica', 'bold');
  doc.text('Caja:', margin, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(operacion.caja || '---', margin + 18, currentY);

  currentY += 4;
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, currentY, pageWidth - (margin * 2), 7, 'F');

  doc.setTextColor(37, 99, 235);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('MONTO:', margin + 3, currentY + 5);
  doc.text(formatCurrency(operacion.monto), pageWidth - margin - 3, currentY + 5, { align: 'right' });

  currentY += 14;
  doc.setDrawColor(150);
  doc.setLineWidth(0.1);
  doc.line(pageWidth / 4, currentY, (3 * pageWidth) / 4, currentY);

  doc.setTextColor(100);
  doc.setFontSize(6);
  doc.text('Firma', pageWidth / 2, currentY + 3, { align: 'center' });

  doc.save(`Op_${operacion.id}.pdf`);
};

/**
 * Exports the Services Summary report
 */
export const exportResumenServiciosPDF = (groupedData, startDate, endDate, selectedCaja) => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // --- 1. HEADER ---
  doc.setFillColor(185, 28, 28); // Red-700
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('REPORTE DE SERVICIOS', margin, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Periodo: ${startDate} al ${endDate}`, margin, 26);
  doc.text(`Caja: ${selectedCaja}`, margin, 31);

  let currentY = 55;

  Object.entries(groupedData).forEach(([serviceName, data]) => {
    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }

    doc.setTextColor(17, 24, 39);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(serviceName.toUpperCase(), margin, currentY);
    currentY += 5;

    const rows = data.items.map(item => [
      item.cajero,
      item.caja,
      item.lote || 'N/A',
      formatCurrency(item.efectivo),
      formatCurrency(item.tarjeta)
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Cajero', 'Caja', 'Lote', 'Efectivo', 'Tarjeta']],
      body: rows,
      foot: [['TOTALES', '', '', formatCurrency(data.totalEfectivo), formatCurrency(data.totalTarjeta)]],
      theme: 'striped',
      headStyles: { fillColor: [31, 41, 55] },
      footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' },
      styles: { fontSize: 8 }
    });

    currentY = doc.lastAutoTable.finalY + 15;
  });

  // Grand Total Summary
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  const grandEfectivo = Object.values(groupedData).reduce((a, b) => a + b.totalEfectivo, 0);
  const grandTarjeta = Object.values(groupedData).reduce((a, b) => a + b.totalTarjeta, 0);

  doc.setFillColor(17, 24, 39);
  doc.rect(margin, currentY, pageWidth - (margin * 2), 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text('RESUMEN GENERAL DE SERVICIOS', margin + 10, currentY + 10);

  doc.setFontSize(16);
  doc.text(`TOTAL: ${formatCurrency(grandEfectivo + grandTarjeta)}`, margin + 10, currentY + 22);

  doc.setFontSize(8);
  doc.text(`EFECTIVO: ${formatCurrency(grandEfectivo)} | TARJETA: ${formatCurrency(grandTarjeta)}`, pageWidth - margin - 10, currentY + 22, { align: 'right' });

  doc.save(`Reporte_Servicios_${startDate}.pdf`);
};
