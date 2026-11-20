// =====================================================================
// Guías de la app (20/11/2026)
// ---------------------------------------------------------------------
// Cada paso señala un "objetivo": un botón o campo marcado en su pantalla con
// useObjetivoGuia('<objetivo>') (src/guias/GuiaMovil.tsx). Si el objetivo no
// está en pantalla todavía, la tarjeta muestra `siNoEsta` (qué hacer para
// llegar). Los id empiezan con "app-": la web tiene sus propias guías y el
// progreso de cada una es por separado (guias_progreso, plataforma 'movil').
// La versión mayor.menor: subir la MAYOR vuelve a ofrecerla a quien ya la vio.
// =====================================================================
export type PasoGuia = {
  objetivo?: string;
  titulo: string;
  texto: string;
  siNoEsta?: string;
  ruta?: string;            // a dónde llevar al empezar en este paso
  tarjeta?: 'abajo';        // la tarjeta abajo (no tapar lo que hay que tocar)
};
export type GuiaApp = {
  id: string;
  version: string;
  nombre: string;
  descripcion: string;
  modulo?: string;          // permiso que hace falta (canAccessModule)
  pasos: PasoGuia[];
};

export const GUIAS_APP: GuiaApp[] = [
  {
    id: 'app-venta',
    version: '1.0',
    nombre: 'Tu primera venta desde el teléfono',
    descripcion: 'Cliente, artículos, cuánto te pagó y finalizar la venta.',
    modulo: 'ventas',
    pasos: [
      { objetivo: 'pos-cliente', ruta: '/(tabs)/pos', titulo: 'El cliente',
        texto: 'Toca aquí para escoger un cliente ya creado. Si no escoges ninguno, la venta sale a "Cliente general".',
        siNoEsta: 'Abre la pestaña Venta.' },
      { objetivo: 'pos-agregar', titulo: 'Agrega artículos',
        texto: 'Toca "Buscar Productos" (o "+ Agregar más artículos"): se abre el catálogo para escoger lo que vas a vender.',
        siNoEsta: 'Vuelve a la pestaña Venta.' },
      { objetivo: 'cat-buscar', tarjeta: 'abajo', titulo: 'Busca el artículo',
        texto: 'Escribe el nombre o el código. Después toca DOS VECES el artículo, pon la cantidad y agrégalo. Cuando termines, toca "Volver a factura".',
        siNoEsta: 'Toca "Buscar Productos" en la pestaña Venta: se abre el catálogo.' },
      { objetivo: 'pos-recibido', titulo: '¿Cuánto te pagó?',
        texto: 'En "Monto Pagado" escribe lo que te entregó el cliente. MotoFlow calcula el cambio.',
        siNoEsta: 'Este campo aparece cuando la factura ya tiene un artículo. Agrega uno y vuelve a la factura.' },
      { objetivo: 'pos-cobrar', titulo: 'Finaliza la venta',
        texto: 'Toca "Finalizar Venta": se graba y puedes imprimir o compartir la factura por WhatsApp. El botón de la basura vacía la factura.',
        siNoEsta: 'El botón "Finalizar Venta" aparece cuando la factura ya tiene un artículo.' },
    ],
  },
  {
    id: 'app-catalogo',
    version: '1.0',
    nombre: 'Consultar precio y existencia',
    descripcion: 'Busca un artículo y mira cuánto hay y a cuánto se vende.',
    modulo: 'catalogo',
    pasos: [
      { objetivo: 'cat-buscar', ruta: '/(tabs)/catalogo', tarjeta: 'abajo', titulo: 'Busca',
        texto: 'Escribe parte del nombre, el código o la referencia. También puedes escanear el código de barras con el botón de al lado.',
        siNoEsta: 'Abre el Catálogo.' },
      { titulo: 'Toca el artículo',
        texto: 'Al tocarlo ves su existencia en cada almacén, sus precios y su ubicación. Listo: así consultas sin llamar a nadie.' },
    ],
  },
];

export const versionMayor = (v?: string | null) => String(v || '0').split('.')[0];
