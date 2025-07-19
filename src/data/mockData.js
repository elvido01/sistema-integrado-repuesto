export const products = [
  { id: 1, codigo: 'SKU001', referencia: 'REF-01', descripcion: 'Filtro de Aceite para Moto 150cc', tipo: 'Filtro', marca: 'Yamaha', min_stock: 5, max_stock: 50, activo: true, garantia_meses: 6, itbis_pct: 18 },
  { id: 2, codigo: 'SKU002', referencia: 'REF-02', descripcion: 'Pastillas de Freno Delanteras', tipo: 'Freno', marca: 'Honda', min_stock: 10, max_stock: 100, activo: true, garantia_meses: 3, itbis_pct: 18 },
  { id: 3, codigo: 'SKU003', referencia: 'REF-03', descripcion: 'Llanta Trasera 130/70-17', tipo: 'Llanta', marca: 'Michelin', min_stock: 3, max_stock: 20, activo: true, garantia_meses: 12, itbis_pct: 18 },
  { id: 4, codigo: 'SKU004', referencia: 'REF-04', descripcion: 'Kit de Arrastre Completo', tipo: 'Transmisión', marca: 'Suzuki', min_stock: 8, max_stock: 40, activo: false, garantia_meses: 6, itbis_pct: 0 },
  { id: 5, codigo: 'SKU005', referencia: 'REF-05', descripcion: 'Bujía de Iridio CR9EIX', tipo: 'Eléctrico', marca: 'NGK', min_stock: 20, max_stock: 200, activo: true, garantia_meses: 0, itbis_pct: 18 },
];

export const inventory_movements = [
  // Producto 1
  { id: 1, producto_id: 1, tipo: 'ENTRADA', cantidad: 20 },
  { id: 2, producto_id: 1, tipo: 'SALIDA', cantidad: -5 },
  { id: 3, producto_id: 1, tipo: 'SALIDA', cantidad: -2 },
  
  // Producto 2
  { id: 4, producto_id: 2, tipo: 'ENTRADA', cantidad: 50 },
  { id: 5, producto_id: 2, tipo: 'SALIDA', cantidad: -10 },

  // Producto 3 (Stock bajo)
  { id: 6, producto_id: 3, tipo: 'ENTRADA', cantidad: 5 },
  { id: 7, producto_id: 3, tipo: 'SALIDA', cantidad: -3 },

  // Producto 4
  { id: 8, producto_id: 4, tipo: 'ENTRADA', cantidad: 15 },

  // Producto 5
  { id: 9, producto_id: 5, tipo: 'ENTRADA', cantidad: 100 },
  { id: 10, producto_id: 5, tipo: 'SALIDA', cantidad: -30 },
];

export const calculateStock = (productId) => {
  return inventory_movements
    .filter(mov => mov.producto_id === productId)
    .reduce((acc, mov) => acc + mov.cantidad, 0);
};