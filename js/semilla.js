// Datos iniciales (tu mensaje del 31 oct 2026). Solo se usan la primera vez que abres Jarvis.
//
// ⚠ Son datos personales (montos y nombres). El repositorio es privado; si algún día lo
//   publicas, vacía este archivo antes (deja `semilla()` devolviendo datosVacios()).

function semilla() {
  const h = hoy();
  return {
    version: 1,
    ultimoRespaldo: '',
    ingresos: { q15: 793900, q30: 800000 }, // la del 30 de octubre ya llegó
    config: { gananciaEstimada: 100000 },   // ~$100.000 de ganancia por perfume

    pagos: [
      // Deudas pendientes: salen de la quincena del 30 de octubre, salvo Addi
      { nombre: 'Tarjeta Nu', tipo: 'deuda', monto: 0, saldo: 600000, fecha: '2026-11-04',
        nota: 'Pagar al menos el mínimo. La fecha es provisional: confirma fecha y mínimo en la app de Nu' },
      { nombre: 'Cuota iPhone (octubre)', tipo: 'deuda', monto: 232626, fecha: '2026-10-22',
        nota: 'Vencida: pagar ya' },
      { nombre: 'Movistar', tipo: 'deuda', monto: 92186, fecha: h,
        nota: 'Saldos del traspaso a WOM. Pagar ya' },
      { nombre: 'Abuela', tipo: 'deuda', monto: 100000, fecha: '2026-10-30',
        nota: 'Este mes, el 30' },
      { nombre: 'Addi', tipo: 'deuda', monto: 321613, fecha: '2026-11-08', conCobros: true,
        nota: 'Fecha límite 8 nov, pagarlo el 7. Sale de lo que pague Jerónimo' },
      { nombre: 'Tía Rocío', tipo: 'deuda', monto: 0, fecha: '', pagado: true,
        nota: 'Pagada completa (deuda cerrada)' },

      // Fijos de la quincena del 15
      { nombre: 'Cuota iPhone', tipo: 'fijo', monto: 232626, fecha: '2026-11-22', mensual: true,
        nota: 'Se repite cada mes el 22' },
      { nombre: 'Mamá', tipo: 'fijo', monto: 100000, fecha: '2026-11-15', mensual: true },
      { nombre: 'Internet', tipo: 'fijo', monto: 300000, fecha: '2026-11-15', mensual: true },
    ],

    diarios: [
      { nombre: 'Transporte (motos)', monto: 32000, soloHabiles: true },
    ],

    // Me deben / ya cobrado (costo vacío = se usa la ganancia estimada)
    pedidos: [
      { cliente: 'Tío Álvaro', perfume: '', precio: 300000, costo: null, estado: 'entregado', fechaCobro: '2026-10-30' },
      { cliente: 'Jerónimo', perfume: '', precio: 300000, costo: null, estado: 'pagado', fechaCobro: '' },
      { cliente: 'Compañero de clase', perfume: '', precio: 130000, costo: null, estado: 'entregado', fechaCobro: '2026-11-15' },
      { cliente: 'Cote', perfume: '', precio: 150000, costo: null, estado: 'pagado', fechaCobro: '' },
    ],

    tareas: [
      { texto: 'Confirmar fecha y pago mínimo de la tarjeta Nu en su app', fecha: h, urgente: true, importante: true },
    ],

    metas: [
      { nombre: 'Vender $10.000.000 en perfumes', fecha: '2026-12-31', objetivo: 10000000, auto: 'ventas',
        nota: 'Ganancia aproximada: $100.000 por perfume' },
      { nombre: 'Cerrar 10 pedidos de perfumes', fecha: '2026-11-10', objetivo: 10, auto: 'pedidos',
        nota: 'Cuenta todos los pedidos registrados' },
      { nombre: 'Patineta Ninebot', fecha: '2026-11-15', objetivo: 2300000, actual: 0 },
      { nombre: 'Pase A2', fecha: '2026-12-31', objetivo: 1455800, actual: 0,
        nota: 'En diciembre (valor aproximado)' },
      { nombre: 'Moto Hero', fecha: '2027-01-31', objetivo: 0,
        nota: 'En enero 2027. Falta definir el precio' },
      { nombre: 'Pasar Matemática', fecha: '', objetivo: 0,
        nota: 'Necesito 4.3 en el Momento 3' },
    ],
  };
}
