// =====================================================================
// Guías interactivas — definiciones (Fase 3 del onboarding, 19/11/2026)
// ---------------------------------------------------------------------
// Una guía = una lista de pasos sobre la PANTALLA REAL del módulo. La guía
// solo señala y explica: nunca crea registros ni graba nada por la persona
// (decisión del dueño). Para agregar una guía nueva basta con un objeto más
// en GUIAS; el motor (src/contexts/GuiaContext.jsx) no cambia.
//
// Cada guía:
//   id          único, minúsculas y guiones (es la llave del progreso)
//   modulo      el panel donde vive (PanelContext)
//   version     'mayor.menor'. Solo subir la MAYOR vuelve a ofrecerla a
//               quien ya la hizo; un retoque de pantalla sube la menor.
//   plataformas ['web'] por ahora (la app tendrá las suyas)
//   tiposExcluidos  tipos de negocio donde no aplica
//   pasos       { selector, titulo, texto, avanzarAlClic?, opcional? }
//
// Selectores: SIEMPRE un id estable o un data-guia puesto a propósito en el
// elemento (nunca clases de estilo ni posiciones). Si una pantalla cambia,
// se mueve el data-guia y la guía sigue igual. Varios selectores separados
// por coma = el primero que se vea (la venta tiene vista de PC y de móvil).
// =====================================================================

export const GUIAS = [
  {
    id: 'vendedor',
    modulo: 'vendedores',
    nombre: 'Crear tu primer vendedor',
    descripcion: 'Registra a quien vende y cómo se le paga la comisión.',
    version: '1.0',
    plataformas: ['web'],
    pasos: [
      { selector: '[data-guia="vendedor-crear"]', titulo: 'Crea tu vendedor', avanzarAlClic: true,
        texto: 'Pulsa aquí para registrar a quien vende. Si vendes tú solo, regístrate tú mismo.' },
      { selector: '[data-guia="vendedor-nombre"]', titulo: 'Su nombre',
        texto: 'Escribe el nombre como quieres que salga en la factura.' },
      { selector: '[data-guia="vendedor-comision"]', titulo: 'Su comisión',
        texto: 'Elige cómo se le paga: un % de lo que vende o un monto fijo por unidad. Si no lleva comisión, deja el 0.' },
      { selector: '[data-guia="vendedor-guardar"]', titulo: 'Guárdalo',
        texto: 'Ojo: un vendedor NO es un usuario. No tiene clave ni entra al sistema; sirve para saber quién vendió y calcular su comisión. Para que alguien entre a MotoFlow se crea un usuario en Usuarios y Permisos.' },
    ],
  },
  {
    id: 'producto',
    modulo: 'mercancias',
    nombre: 'Crear tu primer artículo',
    descripcion: 'Código, nombre, categoría, costo y precio de venta.',
    version: '1.1',
    plataformas: ['web'],
    pasos: [
      { selector: '[data-guia="producto-nuevo"]', titulo: 'Nuevo artículo', avanzarAlClic: true,
        texto: 'Pulsa aquí para crear un artículo o un servicio.' },
      { selector: '[data-guia="producto-codigo"]', titulo: 'El código',
        texto: 'El código con que lo vas a buscar al vender. Puede ser el del suplidor o uno tuyo.' },
      { selector: '#descripcion', titulo: 'El nombre',
        texto: 'Cómo se llama, tal como quieres verlo en la factura.' },
      { selector: '[data-guia="producto-tipo"]', titulo: 'La categoría', opcional: true,
        texto: 'Agrúpalo por tipo (aceites, gomas, frenos…). Te ayuda a buscar y a ver los reportes.' },
      { selector: '[id^="costo-"]', titulo: 'El costo',
        texto: 'Lo que te cuesta a ti. Con él MotoFlow calcula tu ganancia y no te deja vender por debajo del costo.' },
      { selector: '[id^="precio1-"]', titulo: 'El precio de venta',
        texto: 'Lo que le cobras al cliente. Puedes tener hasta tres precios.' },
      { selector: '#btn-grabar-producto', titulo: 'Grábalo (F10)',
        texto: 'La existencia no se escribe aquí: entra cuando registras una compra o una Entrada de Mercancía. Así cada unidad queda con su costo.' },
    ],
  },
  {
    id: 'venta',
    modulo: 'ventas',
    nombre: 'Hacer tu primera venta',
    descripcion: 'Artículos, cliente, vendedor, forma de pago y total.',
    version: '1.0',
    plataformas: ['web'],
    pasos: [
      { selector: '#input-codigo', titulo: 'El artículo',
        texto: 'Escribe el código y pulsa Enter, o F3 para buscarlo por nombre.' },
      { selector: '#input-cantidad, #movil-cantidad', titulo: 'Cantidad y precio',
        texto: 'Ajusta la cantidad. El precio sale solo; se puede cambiar si tu usuario tiene permiso.' },
      { selector: '#cliente-id, button[title="Buscar cliente"]', titulo: 'El cliente', opcional: true,
        texto: 'Si no eliges ninguno, la venta es a consumidor final. Para venderle a nombre de alguien, escribe su código o búscalo aquí.' },
      { selector: '[data-guia="venta-vendedor"]', titulo: 'Quién vende',
        texto: 'Elige el vendedor: así se le cuenta la venta y su comisión.' },
      { selector: '[data-guia="venta-pago"]', titulo: 'La forma de pago',
        texto: 'De contado, o a crédito para los clientes que tienen crédito autorizado.' },
      { selector: '#input-monto-pago', titulo: 'Lo que te pagan',
        texto: 'Escribe lo que recibes y MotoFlow te dice la devuelta.' },
      { selector: '[data-guia="venta-total"]', titulo: 'Revisa el total',
        texto: 'Antes de grabar, confirma el total con el cliente.' },
      { selector: '[data-guia="venta-grabar"]', titulo: 'Grábala (F10)',
        texto: 'Al grabar, la venta sale de tu inventario y puedes imprimir o compartir la factura.' },
    ],
  },
  {
    id: 'compra',
    modulo: 'compras',
    nombre: 'Registrar tu primera compra',
    descripcion: 'Suplidor, artículos, cantidades, costos y forma de pago.',
    version: '1.0',
    plataformas: ['web'],
    tiposExcluidos: ['servicios', 'inmobiliaria'],
    pasos: [
      { selector: '[data-guia="compra-suplidor"]', titulo: 'El suplidor',
        texto: 'Elige a quién le compraste (F3). Si todavía no existe, lo creas desde la búsqueda.' },
      { selector: '#codigo-producto', titulo: 'Los artículos',
        texto: 'Escribe el código del artículo (F3 para buscarlo). También puedes subir la foto de la factura y MotoFlow la lee.' },
      { selector: '#cantidad-producto', titulo: 'La cantidad',
        texto: 'Cuántas unidades llegaron.' },
      { selector: '#costo-unitario', titulo: 'El costo',
        texto: 'El costo por unidad de esta factura. Se actualiza en el artículo.' },
      { selector: '[data-guia="compra-pago"]', titulo: 'Cómo pagaste',
        texto: 'De contado, o a crédito: entonces queda en lo que le debes al suplidor.' },
      { selector: '[data-guia="compra-total"]', titulo: 'Revisa el total',
        texto: 'Compáralo con la factura del suplidor antes de grabar.' },
      { selector: '[data-guia="compra-grabar"]', titulo: 'Grábala (F10)',
        texto: 'Al grabar, la mercancía entra a tu inventario con su costo.' },
    ],
  },
];

export const guiaPorId = (id) => GUIAS.find((g) => g.id === id) || null;
