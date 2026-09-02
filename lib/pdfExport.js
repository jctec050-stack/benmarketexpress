import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './utils';
import { SERVICIOS_CATALOGO, getServicioLabel } from './config';

/**
 * Exports the treasury summary to a premium PDF report
 */
export const exportResumenPDF = (data, metrics, dates, summaryData, saldoAnterior, requestedDeposits = {}, egresosList = [], efectivoReal = 0, creditMovements = []) => {
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
  const totalSobrantes = summaryData?.ingresosOtros?.sobrantes || 0;
  // USE SYSTEM VALUE (TOTAL INGRESO TIENDA SISTEMA) TO MATCH UI DASHBOARD
  const sumIngresos = metrics.totalIngresoTiendaSistema + totalServicios + totalInversiones + totalInversionRetiro + totalSobrantes + (saldoAnterior || 0);
  const sumEgresos = Object.values(summaryData?.egresos || {}).reduce((a, b) => a + b, 0);

  // 4a. INGRESOS TABLE (LEFT)
  const serviceRows = Object.entries(summaryData?.servicios || {})
    .filter(([_, val]) => val !== 0)
    .map(([key, val]) => [key.toUpperCase(), formatCurrency(val)]);

  autoTable(doc, {
    startY: currentY,
    head: [[{ content: 'INGRESOS (DEBE)', colSpan: 2, styles: { fillColor: [5, 150, 105], halign: 'center' } }]],
    body: [
      ['Ingreso Tienda (Sistema)', formatCurrency(metrics.totalIngresoTiendaSistema)],
      ...serviceRows,
      ...(totalInversiones > 0 ? [['Inversiones', formatCurrency(totalInversiones)]] : []),
      ...(totalInversionRetiro > 0 ? [['Inversiones-Retiro de fondos', formatCurrency(totalInversionRetiro)]] : []),
      ...(totalSobrantes > 0 ? [['Sobrantes de Efectivo', formatCurrency(totalSobrantes)]] : []),
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

  // --- 5. RESULTADO NETO Y CIERRE ---
  if (currentY > 250) { doc.addPage(); currentY = 20; }

  const cardWidth = (pageWidth - (margin * 2) - 8) / 3;
  const cardHeight = 22;

  const sistemaNeto = sumIngresos - sumEgresos;
  const diferenciaVal = efectivoReal - sistemaNeto;

  // Card 1: Resultado Neto Sistema (Dark Gray-900)
  doc.setFillColor(17, 24, 39);
  doc.rect(margin, currentY, cardWidth, cardHeight, 'F');
  
  doc.setTextColor(200, 200, 200);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('RESULTADO NETO SISTEMA', margin + 5, currentY + 7);
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(sistemaNeto), margin + 5, currentY + 16);

  // Card 2: Efectivo Real al Cierre (Dark Slate-800)
  doc.setFillColor(30, 41, 59);
  doc.rect(margin + cardWidth + 4, currentY, cardWidth, cardHeight, 'F');
  
  doc.setTextColor(200, 200, 200);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('EFECTIVO REAL AL CIERRE', margin + cardWidth + 4 + 5, currentY + 7);
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(efectivoReal), margin + cardWidth + 4 + 5, currentY + 16);

  // Card 3: Diferencia
  if (diferenciaVal === 0) {
    doc.setFillColor(55, 65, 81); // Slate-700
  } else if (diferenciaVal > 0) {
    doc.setFillColor(6, 78, 59); // Emerald-900
  } else {
    doc.setFillColor(153, 27, 27); // Red-800
  }
  doc.rect(margin + (cardWidth * 2) + 8, currentY, cardWidth, cardHeight, 'F');
  
  doc.setTextColor(220, 220, 220);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('DIFERENCIA CIERRE', margin + (cardWidth * 2) + 8 + 5, currentY + 7);
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const sign = diferenciaVal > 0 ? '+' : '';
  doc.text(sign + formatCurrency(diferenciaVal), margin + (cardWidth * 2) + 8 + 5, currentY + 16);

  currentY += cardHeight + 10;


  // --- 7. DETALLE DE EGRESOS POR CATEGORÍA (NUEVA SECCIÓN) ---
  if (egresosList && egresosList.length > 0) {
    doc.addPage();
    currentY = 20;

    doc.setTextColor(17, 24, 39);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DESGLOSE DETALLADO DE EGRESOS', margin, currentY);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Reporte de todos los movimientos registrados entre ${dates.start} y ${dates.end}`, margin, currentY + 6);
    currentY += 15;

    // Normalización de categorías para coincidir con el balance
    const getNormalizedCat = (cat) => {
      if (!cat) return 'GASTOS ADMINISTRATIVOS';
      const c = cat.toLowerCase();
      if (c === 'cobros c/ tarjetas' || c === 'cobros c/ transferencia' || c === 'gastos administrativos') {
        return 'GASTOS ADMINISTRATIVOS';
      }
      return cat.toUpperCase();
    };

    // Agrupar por categoría normalizada
    const grouped = egresosList.reduce((acc, e) => {
        const cat = getNormalizedCat(e.categoria);
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(e);
        return acc;
    }, {});

    Object.entries(grouped).forEach(([cat, items]) => {
        // Verificar si necesitamos nueva página antes de empezar una categoría
        if (currentY > 240) { doc.addPage(); currentY = 20; }

        doc.setFontSize(9);
        doc.setTextColor(185, 28, 28);
        doc.setFont('helvetica', 'bold');
        doc.text(cat, margin, currentY);
        currentY += 4;

        const body = items.map(e => [
            new Date(e.fecha).toLocaleDateString(),
            e.cajero || 'N/A',
            e.receptor || '---',
            e.descripcion || '---',
            formatCurrency(e.monto)
        ]);

        const totalCat = items.reduce((acc, e) => acc + (e.monto || 0), 0);

        autoTable(doc, {
            startY: currentY,
            head: [['Fecha', 'Cajero', 'Receptor', 'Descripción', 'Monto']],
            body: body,
            foot: [[{ content: 'TOTAL ' + cat, colSpan: 4, styles: { halign: 'right' } }, formatCurrency(totalCat)]],
            theme: 'grid',
            headStyles: { fillColor: [31, 41, 55], fontSize: 7, halign: 'center' },
            footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 },
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: { 
              0: { cellWidth: 20 },
              1: { cellWidth: 25 },
              2: { cellWidth: 35 },
              4: { halign: 'right', cellWidth: 25, fontStyle: 'bold' } 
            },
            margin: { left: margin, right: margin },
            pageBreak: 'auto'
        });

        currentY = doc.lastAutoTable.finalY + 12;
    });
  }

  // --- 7.5. TOTAL A ENTREGAR POR CAJERO (NUEVA SECCIÓN) ---
  if (data && data.length > 0) {
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('EFECTIVO A ENTREGAR POR CAJERO (Billetes Gs.)', margin, currentY);
    currentY += 6;

    const deliveryRows = data.map(row => [
        row.nombreCajero,
        row.nombreCaja,
        formatCurrency(row.totalAEntregar)
    ]);

    autoTable(doc, {
        startY: currentY,
        head: [['Cajero', 'Caja', 'Monto a Entregar']],
        body: deliveryRows,
        theme: 'grid',
        headStyles: { fillColor: [55, 65, 81], fontSize: 7 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: margin, right: margin }
    });

    currentY = doc.lastAutoTable.finalY + 15;
  }

  // --- 7.6. DETALLE VENTAS A CRÉDITO (NUEVA SECCIÓN) ---
  if (creditMovements && creditMovements.length > 0) {
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DETALLE VENTAS A CRÉDITO', margin, currentY);
    currentY += 6;

    const creditRows = creditMovements.map(m => [
        new Date(m.fecha).toLocaleDateString(),
        `${m.cajero || m.usuario || 'N/A'} (${m.caja || 'N/A'})`,
        m.creditoDetalles?.cliente || m.credito_detalles?.cliente || 'N/A',
        m.creditoDetalles?.descripcion || m.credito_detalles?.descripcion || 'N/A',
        formatCurrency(m.ventasCredito || m.ventas_credito || 0)
    ]);

    const totalCredit = creditMovements.reduce((acc, m) => acc + (m.ventasCredito || m.ventas_credito || 0), 0);

    autoTable(doc, {
        startY: currentY,
        head: [['Fecha', 'Cajero (Caja)', 'Cliente', 'Descripción', 'Monto']],
        body: creditRows,
        foot: [[{ content: 'TOTAL VENTAS A CRÉDITO', colSpan: 4, styles: { halign: 'right' } }, formatCurrency(totalCredit)]],
        theme: 'grid',
        headStyles: { fillColor: [234, 179, 8], textColor: [0, 0, 0], fontSize: 7 },
        footStyles: { fillColor: [254, 249, 195], textColor: [133, 77, 14], fontStyle: 'bold', fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: { 
          0: { cellWidth: 20 },
          1: { cellWidth: 35 },
          2: { cellWidth: 35 },
          4: { halign: 'right', fontStyle: 'bold', cellWidth: 25 } 
        },
        margin: { left: margin, right: margin }
    });

    currentY = doc.lastAutoTable.finalY + 15;
  }

  // --- 8. DEPOSITOS SERVICIOS (MOVIDO AL FINAL) ---
  if (currentY > 230) { doc.addPage(); currentY = 20; } else { currentY += 5; }

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('A DEPOSITAR - SERVICIOS (Bocas de Cobranza)', margin, currentY);
  currentY += 6;

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
      headStyles: { fillColor: [37, 99, 235], halign: 'center', fontSize: 7 },
      footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' }
      },
      styles: { fontSize: 7, cellPadding: 2 },
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
        if (oval.monto !== 0 || oval.tarjeta !== 0) {
          const label = getServicioLabel(okey);
          const lotes = oval.lotes && oval.lotes.length > 0 ? ` (Lote: ${Array.from(new Set(oval.lotes)).join(', ')})` : '';
          servicesRows.push([label + lotes, formatCurrency(oval.monto), formatCurrency(oval.tarjeta)]);
          totalServiciosEfectivo += (oval.monto || 0);
          totalServiciosTarjeta += (oval.tarjeta || 0);
        }
      });
    } else if (val.monto !== 0 || val.tarjeta !== 0) {
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
    `${e.categoria === 'Pago a Proveedor' && e.receptor ? `${e.receptor} - ` : ''}${e.categoria === 'Retiro de Fondos' && e.receptor ? `${e.receptor} - ` : ''}${e.descripcion || e.categoria || 'Sin descripción'}`,
    formatCurrency(Math.abs(e.monto || 0))
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

export const exportDetailPDF = (title, data, type, dates) => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // --- HEADER ---
  doc.setFillColor(17, 24, 39); // Gray-900
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), margin, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Periodo: ${dates.start} al ${dates.end}`, margin, 22);
  doc.text(`Generado: ${new Date().toLocaleString()}`, margin, 27);

  // App Brand
  doc.setFontSize(12);
  doc.setTextColor(185, 28, 28); // Red-700
  doc.text('BENMARKET', pageWidth - margin - 30, 15);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text('REPORTE DE DETALLE', pageWidth - margin - 30, 20);

  let currentY = 45;

  // --- TABLE ---
  let headers = [];
  let body = [];
  let colStyles = {};

  if (type === 'credito') {
    headers = [['Fecha', 'Cajero', 'Cliente', 'Descripción', 'Monto']];
    body = data.map(m => [
      new Date(m.fecha).toLocaleDateString(),
      m.cajero || m.usuario || 'N/A',
      m.creditoDetalles?.cliente || 'N/A',
      m.creditoDetalles?.descripcion || 'N/A',
      formatCurrency(m.ventasCredito || m.ventas_credito || 0)
    ]);
    colStyles = {
      0: { cellWidth: 25 },
      1: { cellWidth: 30 },
      2: { cellWidth: 40 },
      3: { cellWidth: 55 },
      4: { halign: 'right', fontStyle: 'bold' }
    };
  } else {
    // Other types: tarjeta, pedidosYa, etc.
    headers = [['Fecha', 'Cajero', 'Caja', 'Monto']];
    const getAmt = (m) => {
      if (type === 'tarjeta') return m.pagosTarjeta || m.pagos_tarjeta || 0;
      if (type === 'pedidosYa') return m.pedidosYa || m.pedidos_ya || 0;
      return 0;
    };
    body = data.map(m => [
      new Date(m.fecha).toLocaleDateString(),
      m.cajero || m.usuario || 'N/A',
      m.caja || 'N/A',
      formatCurrency(getAmt(m))
    ]);
    colStyles = {
      0: { cellWidth: 35 },
      1: { cellWidth: 45 },
      2: { cellWidth: 45 },
      3: { halign: 'right', fontStyle: 'bold' }
    };
  }

  const total = data.reduce((acc, m) => {
    let amt = 0;
    if (type === 'credito') amt = m.ventasCredito || m.ventas_credito || 0;
    else if (type === 'tarjeta') amt = m.pagosTarjeta || m.pagos_tarjeta || 0;
    else if (type === 'pedidosYa') amt = m.pedidosYa || m.pedidos_ya || 0;
    return acc + amt;
  }, 0);

  autoTable(doc, {
    startY: currentY,
    head: headers,
    body: body,
    foot: [[
      { content: 'TOTAL GENERAL', colSpan: type === 'credito' ? 4 : 3, styles: { halign: 'right' } },
      formatCurrency(total)
    ]],
    theme: 'striped',
    headStyles: { fillColor: [31, 41, 55], fontSize: 8 },
    footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: colStyles,
    margin: { left: margin, right: margin }
  });

  doc.save(`${title.replace(/\s+/g, '_')}_${dates.start}_${dates.end}.pdf`);
};

/**
 * Exports the Resumen Recaudaciones report to PDF
 */
export const exportResumenRecaudacionesPDF = ({
  rows = [],
  startDate,
  endDate,
  cajaFilter = 'Todas las cajas',
  cajeroFilter = '',
  totals = {}
}) => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // --- 1. HEADER ---
  doc.setFillColor(17, 24, 39); // Gray-900
  doc.rect(0, 0, pageWidth, 38, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN DE RECAUDACIONES', margin, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Periodo: ${startDate} al ${endDate}`, margin, 23);
  doc.text(`Filtros: Caja: ${cajaFilter} | Cajero: ${cajeroFilter || 'Todos'}`, margin, 28);
  doc.text(`Generado: ${new Date().toLocaleString('es-PY')}`, margin, 33);

  // App Brand
  doc.setFontSize(14);
  doc.setTextColor(185, 28, 28); // Red-700
  doc.text('BENMARKET', pageWidth - margin - 35, 16);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('CONTROL DE RECAUDACIÓN', pageWidth - margin - 35, 21);

  let currentY = 46;

  // --- 2. SUMMARY METRICS CARDS ---
  const totalIngresoTienda = totals.totalIngresoTienda ?? rows.reduce((s, r) => s + (r.ingresoTiendaCalculado || 0), 0);
  const totalEfectivoIgnis = totals.totalEfectivoIgnis ?? rows.reduce((s, r) => s + (r.efectivoIgnis || 0), 0);
  const totalSobrante = totals.totalSobrante ?? rows.reduce((s, r) => s + (r.sobrante || 0), 0);
  const totalFaltante = totals.totalFaltante ?? rows.reduce((s, r) => s + (r.faltante || 0), 0);

  const metricCols = [
    { label: 'TOTAL INGRESO TIENDA', value: formatCurrency(totalIngresoTienda), color: [37, 99, 235] },
    { label: 'EFECTIVO IGNIS', value: formatCurrency(totalEfectivoIgnis), color: [99, 102, 241] },
    { label: 'TOTAL SOBRANTE', value: formatCurrency(totalSobrante), color: [34, 197, 94] },
    { label: 'TOTAL FALTANTE', value: formatCurrency(totalFaltante), color: [239, 68, 68] }
  ];

  const colWidth = (pageWidth - (margin * 2) - 9) / 4;
  const cardHeight = 16;

  metricCols.forEach((m, i) => {
    const x = margin + (i * (colWidth + 3));

    // Card background & border
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(x, currentY, colWidth, cardHeight, 1.5, 1.5, 'F');

    // Left border accent
    doc.setFillColor(m.color[0], m.color[1], m.color[2]);
    doc.roundedRect(x, currentY, 2, cardHeight, 0.5, 0.5, 'F');

    doc.setTextColor(100, 100, 100);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text(m.label, x + 4, currentY + 5);

    doc.setTextColor(17, 24, 39);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text(m.value, x + 4, currentY + 12);
  });

  currentY += cardHeight + 8;

  // --- 3. TABLE BODY (Grouped by date) ---
  const formatFecha = (f) =>
    new Date(f + 'T12:00:00').toLocaleDateString('es-PY', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

  const fechas = [...new Set(rows.map(r => r.fecha))].sort((a, b) => b.localeCompare(a));

  const tableBody = [];

  fechas.forEach(fecha => {
    const rowsForDate = rows.filter(r => r.fecha === fecha);
    const subTotalIngreso = rowsForDate.reduce((s, r) => s + (r.ingresoTiendaCalculado || 0), 0);
    const subTotalIgnis = rowsForDate.reduce((s, r) => s + (r.efectivoIgnis || 0), 0);
    const subTotalSobrante = rowsForDate.reduce((s, r) => s + (r.sobrante || 0), 0);
    const subTotalFaltante = rowsForDate.reduce((s, r) => s + (r.faltante || 0), 0);

    // Date header row
    tableBody.push([
      {
        content: `FECHA: ${formatFecha(fecha).toUpperCase()}`,
        colSpan: 6,
        styles: { fillColor: [243, 244, 246], textColor: [31, 41, 55], fontStyle: 'bold', fontSize: 8 }
      }
    ]);

    // Rows for this date
    rowsForDate.forEach(row => {
      tableBody.push([
        row.cajero,
        row.caja,
        formatCurrency(row.ingresoTiendaCalculado),
        row.efectivoIgnis > 0 ? formatCurrency(row.efectivoIgnis) : 'Sin registrar',
        row.sobrante > 0 ? formatCurrency(row.sobrante) : '--',
        row.faltante > 0 ? formatCurrency(row.faltante) : '--'
      ]);
    });

    // Subtotal row for this date
    tableBody.push([
      { content: 'SUBTOTAL DÍA', colSpan: 2, styles: { fontStyle: 'bold', textColor: [75, 85, 99], fillColor: [249, 250, 251] } },
      { content: formatCurrency(subTotalIngreso), styles: { fontStyle: 'bold', halign: 'right', fillColor: [249, 250, 251] } },
      { content: formatCurrency(subTotalIgnis), styles: { fontStyle: 'bold', halign: 'right', textColor: [67, 56, 202], fillColor: [249, 250, 251] } },
      { content: subTotalSobrante > 0 ? formatCurrency(subTotalSobrante) : '--', styles: { fontStyle: 'bold', halign: 'right', textColor: [22, 163, 74], fillColor: [249, 250, 251] } },
      { content: subTotalFaltante > 0 ? formatCurrency(subTotalFaltante) : '--', styles: { fontStyle: 'bold', halign: 'right', textColor: [220, 38, 38], fillColor: [249, 250, 251] } }
    ]);
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Cajero', 'Caja', 'Total Ingreso Tienda', 'Efectivo IGNIS', 'Sobrante', 'Faltante']],
    body: tableBody,
    foot: [[
      { content: 'TOTAL GENERAL', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } },
      { content: formatCurrency(totalIngresoTienda), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: formatCurrency(totalEfectivoIgnis), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: formatCurrency(totalSobrante), styles: { halign: 'right', fontStyle: 'bold', textColor: [187, 247, 208] } },
      { content: formatCurrency(totalFaltante), styles: { halign: 'right', fontStyle: 'bold', textColor: [254, 202, 202] } }
    ]],
    theme: 'grid',
    headStyles: { fillColor: [31, 41, 55], fontSize: 7.5, halign: 'center' },
    footStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 25 },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'right', cellWidth: 26 }
    },
    margin: { left: margin, right: margin },
    pageBreak: 'auto'
  });

  // Save the PDF
  doc.save(`Resumen_Recaudaciones_${startDate}_${endDate}.pdf`);
};

