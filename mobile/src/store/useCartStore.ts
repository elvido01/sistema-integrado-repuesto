import { create } from 'zustand';
import { Producto } from '../services/productService';

export interface CartItem extends Producto {
  cantidad: number;
  precioSeleccionado: number;
  descuento: number;
  // Línea de servicio escrita a mano (descripción y monto propios). Varias
  // líneas cuelgan del mismo producto (SERVICIO GENERAL), así que no se
  // juntan por id: cada una tiene su lineaId.
  lineaId?: string;
  naturaleza?: 'bien' | 'servicio' | 'inmueble' | null;
}

// La llave de una línea del carrito: su lineaId si es de servicio, si no el producto.
export const claveLinea = (i: Pick<CartItem, 'id' | 'lineaId'>) => i.lineaId || i.id;
const esLinea = (i: CartItem, clave: string) => (i.lineaId ? i.lineaId === clave : i.id === clave);
let seqLinea = 0;
export const nuevaLineaId = () => `serv_${Date.now()}_${seqLinea++}`;

interface CartState {
  items: CartItem[];
  clienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  cotizacionOrigenId: string | null;
  cotizacionOrigenNumero: string | number | null;
  pedidoOrigenId: string | null;
  pedidoOrigenNumero: string | number | null;
  // `extra` lo pasan cotizaciones y pedidos al volver a cargar su detalle: una
  // línea de servicio o inmueble entra suelta (con su lineaId y su descuento),
  // no se junta con otra del mismo producto.
  addItem: (
    producto: Producto,
    cantidad?: number,
    tipoPrecio?: 1 | 2 | 3 | 4,
    extra?: { naturaleza?: string | null; descuento?: number },
  ) => void;
  addLineaServicio: (linea: CartItem) => void;
  removeItem: (productoId: string) => void;
  updateQuantity: (productoId: string, cantidad: number) => void;
  updateDiscount: (productoId: string, descuento: number) => void;
  setCliente: (id: string | null, nombre: string, telefono: string) => void;
  setCotizacionOrigen: (id: string | null, numero?: string | number | null) => void;
  setPedidoOrigen: (id: string | null, numero?: string | number | null) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTotalDiscount: () => number;
  getTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  clienteId: null,
  clienteNombre: 'Cliente Generico',
  clienteTelefono: '',
  cotizacionOrigenId: null,
  cotizacionOrigenNumero: null,
  pedidoOrigenId: null,
  pedidoOrigenNumero: null,

  addItem: (producto, cantidad = 1, tipoPrecio = 1, extra) => {
    const items = get().items;
    const nat = extra?.naturaleza;
    if (nat === 'servicio' || nat === 'inmueble') {
      set({
        items: [...items, {
          ...producto,
          lineaId: nuevaLineaId(),
          naturaleza: nat,
          // El inmueble no lleva ITBIS (igual que la web), diga lo que diga la ficha.
          itbis_pct: nat === 'inmueble' ? 0 : producto.itbis_pct,
          cantidad,
          precioSeleccionado: producto.precio_venta_1,
          descuento: Number(extra?.descuento || 0),
        }],
      });
      return;
    }
    const existingItem = items.find(i => i.id === producto.id && !i.lineaId);

    let precio = producto.precio_venta_1;
    if (tipoPrecio === 2) precio = producto.precio_venta_2;
    if (tipoPrecio === 3 && producto.precio_venta_3) precio = producto.precio_venta_3;
    if (tipoPrecio === 4 && producto.precio_venta_4) precio = producto.precio_venta_4;

    if (existingItem) {
      set({
        items: items.map(i =>
          i.id === producto.id && !i.lineaId
            ? { ...i, cantidad: i.cantidad + cantidad }
            : i
        )
      });
    } else {
      set({ items: [...items, { ...producto, cantidad, precioSeleccionado: precio, descuento: 0 }] });
    }
  },

  addLineaServicio: (linea) => set({ items: [...get().items, linea] }),

  removeItem: (clave) => set({ items: get().items.filter(i => !esLinea(i, clave)) }),

  // Una línea de servicio es un monto: su cantidad no se cambia con +/-.
  updateQuantity: (productoId, cantidad) => set({
    items: get().items.map(i => esLinea(i, productoId) && !i.lineaId ? { ...i, cantidad } : i)
  }),

  updateDiscount: (productoId, descuento) => set({
    items: get().items.map(i => esLinea(i, productoId) ? { ...i, descuento } : i)
  }),

  setCliente: (id, nombre, telefono) => set({ clienteId: id, clienteNombre: nombre, clienteTelefono: telefono }),

  setCotizacionOrigen: (id, numero = null) => set({ cotizacionOrigenId: id, cotizacionOrigenNumero: numero }),

  setPedidoOrigen: (id, numero = null) => set({ pedidoOrigenId: id, pedidoOrigenNumero: numero }),

  clearCart: () => set({
    items: [],
    clienteId: null,
    clienteNombre: 'Cliente Generico',
    clienteTelefono: '',
    cotizacionOrigenId: null,
    cotizacionOrigenNumero: null,
    pedidoOrigenId: null,
    pedidoOrigenNumero: null,
  }),

  getSubtotal: () => get().items.reduce((total, item) => total + (item.precioSeleccionado * item.cantidad), 0),

  getTotalDiscount: () => get().items.reduce((total, item) => total + (item.descuento || 0), 0),

  getTotal: () => get().getSubtotal() - get().getTotalDiscount(),
}));
