import { create } from 'zustand';
import { Producto } from '../services/productService';

export interface CartItem extends Producto {
  cantidad: number;
  precioSeleccionado: number;
  descuento: number;
}

interface CartState {
  items: CartItem[];
  clienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  addItem: (producto: Producto, cantidad?: number, tipoPrecio?: 1 | 2 | 3 | 4) => void;
  removeItem: (productoId: string) => void;
  updateQuantity: (productoId: string, cantidad: number) => void;
  updateDiscount: (productoId: string, descuento: number) => void;
  setCliente: (id: string | null, nombre: string, telefono: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTotalDiscount: () => number;
  getTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  clienteId: null,
  clienteNombre: 'Cliente Genérico',
  clienteTelefono: '',
  
  addItem: (producto, cantidad = 1, tipoPrecio = 1) => {
    const items = get().items;
    const existingItem = items.find(i => i.id === producto.id);
    
    let precio = producto.precio_venta_1;
    if (tipoPrecio === 2) precio = producto.precio_venta_2;
    if (tipoPrecio === 3 && producto.precio_venta_3) precio = producto.precio_venta_3;
    if (tipoPrecio === 4 && producto.precio_venta_4) precio = producto.precio_venta_4;

    if (existingItem) {
      set({
        items: items.map(i => 
          i.id === producto.id 
            ? { ...i, cantidad: i.cantidad + cantidad }
            : i
        )
      });
    } else {
      set({ items: [...items, { ...producto, cantidad, precioSeleccionado: precio, descuento: 0 }] });
    }
  },
  
  removeItem: (productoId) => set({ items: get().items.filter(i => i.id !== productoId) }),
  
  updateQuantity: (productoId, cantidad) => set({
    items: get().items.map(i => i.id === productoId ? { ...i, cantidad } : i)
  }),
  
  updateDiscount: (productoId, descuento) => set({
    items: get().items.map(i => i.id === productoId ? { ...i, descuento } : i)
  }),
  
  setCliente: (id, nombre, telefono) => set({ clienteId: id, clienteNombre: nombre, clienteTelefono: telefono }),
  
  clearCart: () => set({ items: [], clienteId: null, clienteNombre: 'Cliente Genérico', clienteTelefono: '' }),
  
  getSubtotal: () => get().items.reduce((total, item) => total + (item.precioSeleccionado * item.cantidad), 0),
  
  getTotalDiscount: () => get().items.reduce((total, item) => total + (item.descuento || 0), 0),
  
  getTotal: () => get().getSubtotal() - get().getTotalDiscount(),
}));
