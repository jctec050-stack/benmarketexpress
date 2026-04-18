import { processResumenData } from './lib/resumenLogic.js';

const mockMovimientos = [
  { tipo: 'operacion', monto: -100000, categoria: 'Deposito/Retiro bancario' },
  { tipo: 'gasto', monto: -50000, categoria: 'Gastos Varios' },
  { tipo: 'egreso', monto: -200000, categoria: 'Pago a Proveedor' }
];

const mockArqueos = [];
const mockEgresos = [];
const mockRecaudaciones = [];

const result = processResumenData(mockMovimientos, mockArqueos, mockEgresos, mockRecaudaciones, 'Todas las cajas');

console.log('Egresos Breakdown keys:', Object.keys(result.summaryData.egresos));
if (Object.keys(result.summaryData.egresos).includes('Deposito Bancario-No inversion')) {
  console.log('Verification SUCCESS: New label found.');
} else {
  console.log('Verification FAILED: New label not found.');
}
