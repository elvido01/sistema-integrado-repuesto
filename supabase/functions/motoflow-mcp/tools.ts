// ============================================================
// motoflow-mcp — el catalogo de herramientas
// ------------------------------------------------------------
// Vive aparte del servidor por una razon concreta: index.ts arranca un
// Deno.serve() al importarse, asi que no se puede cargar desde una prueba
// sin levantar un servidor. Esta lista si, y es la que conviene probar —
// el fallo mas facil de cometer aqui es que el nombre de un parametro no
// coincida con el de la funcion SQL, y eso hoy solo se descubre cuando
// alguien le pregunta a Jarvis y no le contesta.
//
// La 'description' no es adorno: es lo unico que el modelo lee para decidir
// si llama esta herramienta o no. Dice cuando usarla, no solo que hace.
// ============================================================

export const TOOLS = [
  {
    name: 'buscar_piezas',
    description:
      'Busca repuestos en el inventario por descripcion, marca o modelo y devuelve precio y EXISTENCIA REAL. ' +
      'Usala siempre que alguien pregunte si hay una pieza, cuanto cuesta o si sirve para una motocicleta. ' +
      'Nunca respondas de memoria sobre precios o existencias: consultala.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Lo que pide el cliente, tal cual. Ej: "cigueñal g2 vini", "goma trasera TVS 125"' },
        limite: { type: 'integer', description: 'Cuantas piezas devolver (1-25, por defecto 8)' },
      },
      required: ['texto'],
    },
    rpc: 'mcp_buscar_piezas',
    args: (a) => ({ p_texto: String(a.texto || ''), p_limite: a.limite ?? 8 }),
  },
  {
    name: 'ver_pieza',
    description:
      'Devuelve el detalle de UNA pieza por su codigo exacto: precio, existencia, ubicacion en almacen, ITBIS y garantia. ' +
      'Usala cuando ya sabes el codigo; si solo tienes la descripcion, usa buscar_piezas.',
    inputSchema: {
      type: 'object',
      properties: { codigo: { type: 'string', description: 'Codigo del producto' } },
      required: ['codigo'],
    },
    rpc: 'mcp_ver_pieza',
    args: (a) => ({ p_codigo: String(a.codigo || '') }),
  },
  {
    name: 'estado_cliente',
    description:
      'Situacion de un cliente: facturas pendientes, cuanto debe y prestamos activos. Busca por nombre, cedula o codigo. ' +
      'Si hay varios parecidos devuelve la lista para que preguntes cual, en vez de adivinar.',
    inputSchema: {
      type: 'object',
      properties: { busqueda: { type: 'string', description: 'Nombre, cedula/RNC o codigo del cliente' } },
      required: ['busqueda'],
    },
    rpc: 'mcp_estado_cliente',
    args: (a) => ({ p_busqueda: String(a.busqueda || '') }),
  },
  {
    name: 'resumen_dia',
    description:
      'Como va el dia: cantidad de facturas, total vendido, recibos cobrados (y cuanto en efectivo), gastos y prestamos ' +
      'desembolsados en efectivo. Lo ANULADO no cuenta. Sin fecha, usa hoy.',
    inputSchema: {
      type: 'object',
      properties: { fecha: { type: 'string', description: 'Fecha AAAA-MM-DD. Vacio = hoy' } },
    },
    rpc: 'mcp_resumen_dia',
    args: (a) => ({ p_fecha: a.fecha || null }),
  },
  {
    name: 'buscar_ayuda',
    description:
      'Explica COMO SE USA MotoFlow: en que modulo se hace cada cosa y los pasos. ' +
      'Usala siempre que pregunten "como hago...", "donde se registra...", "por que no me deja...", ' +
      'o cuando alguien no encuentre una pantalla. Devuelve tambien la clave del modulo, ' +
      'asi que despues de responder ofrece abrirlo con abrir_modulo. ' +
      'Si no devuelve nada, di que no lo sabes: NO inventes pasos.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'La duda tal cual la dijeron. Ej: "como registro un abono", "no me deja rebajar el precio"' },
        limite: { type: 'integer', description: 'Cuantas entradas devolver (1-10, por defecto 4)' },
      },
      required: ['texto'],
    },
    rpc: 'mcp_buscar_ayuda',
    args: (a) => ({ p_texto: String(a.texto || ''), p_limite: a.limite ?? 4 }),
  },
  // ── Lo que se pregunta de pie, sin computadora delante ──────
  // Estas cinco son las que hacen que el asistente sirva por VOZ: quien va
  // manejando no puede abrir Cartera de Clientes, pero si puede preguntar
  // quien le debe.
  {
    name: 'cartera_cobrar',
    description:
      'Quien le debe a la empresa y desde cuando. Devuelve el total por cobrar, cuanto esta vencido y los ' +
      'clientes que mas deben, con sus dias de mora y telefono. ' +
      'Usala para "quien me debe", "cuanto hay en la calle", "quienes estan atrasados". ' +
      'Para la deuda de UN cliente concreto usa estado_cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        dias_mora: { type: 'integer', description: 'Solo los atrasados por al menos tantos dias. 0 o vacio = todos' },
        limite: { type: 'integer', description: 'Cuantos clientes listar (1-25, por defecto 10)' },
      },
    },
    rpc: 'mcp_cartera_cobrar',
    args: (a) => ({ p_dias_mora: a.dias_mora ?? 0, p_limite: a.limite ?? 10 }),
  },
  {
    name: 'cuentas_pagar',
    description:
      'Lo que la EMPRESA le debe a sus suplidores, agrupado por suplidor, con lo vencido y los dias de atraso. ' +
      'Usala para "a quien le debo", "cuanto debo en compras", "que hay que pagar esta semana". ' +
      'Ojo: es lo contrario de cartera_cobrar. Esto es deuda propia, no de los clientes.',
    inputSchema: {
      type: 'object',
      properties: { limite: { type: 'integer', description: 'Cuantos suplidores listar (1-25, por defecto 10)' } },
    },
    rpc: 'mcp_cuentas_pagar',
    args: (a) => ({ p_limite: a.limite ?? 10 }),
  },
  {
    name: 'ventas_periodo',
    description:
      'Cuanto se vendio entre dos fechas, con la comparacion contra el periodo anterior de igual largo y las ' +
      '5 piezas que mas facturaron. Sin fechas, el mes en curso. ' +
      'Usala para "como vamos este mes", "cuanto vendimos la semana pasada", "que es lo que mas se vende". ' +
      'Para el dia de hoy es mejor resumen_dia, que ademas trae cobros, gastos y efectivo.',
    inputSchema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'Fecha AAAA-MM-DD. Vacio = primer dia del mes en curso' },
        hasta: { type: 'string', description: 'Fecha AAAA-MM-DD. Vacio = hoy' },
      },
    },
    rpc: 'mcp_ventas_periodo',
    args: (a) => ({ p_desde: a.desde || null, p_hasta: a.hasta || null }),
  },
  {
    name: 'piezas_criticas',
    description:
      'Piezas que SE VENDEN y estan agotadas o por debajo del minimo: lo que hay que reponer. ' +
      'Devuelve unidades vendidas, existencia actual y fecha de la ultima venta. ' +
      'Usala para "que se me acabo", "que hay que comprar", "que me esta faltando". ' +
      'No lista el catalogo entero: solo lo que tuvo movimiento, que es lo que duele tener en cero.',
    inputSchema: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Cuantos dias de ventas mirar (7-365, por defecto 60)' },
        limite: { type: 'integer', description: 'Cuantas piezas listar (1-25, por defecto 10)' },
      },
    },
    rpc: 'mcp_piezas_criticas',
    args: (a) => ({ p_dias: a.dias ?? 60, p_limite: a.limite ?? 10 }),
  },
  {
    name: 'buscar_cotizacion',
    description:
      'Encuentra una cotizacion PENDIENTE por el nombre del cliente o por su numero, y devuelve numero, ' +
      'fecha, cliente y total. Sin busqueda, las ultimas. ' +
      'Usala SIEMPRE que te hablen de "la cotizacion de fulano" o te pidan pasar una cotizacion a factura: ' +
      'el numero tiene que salir de aqui. NUNCA lo escribas de memoria ni lo deduzcas — hay cientos y ' +
      'acertar el de otro cliente factura la mercancia equivocada. ' +
      'Las ya facturadas o anuladas no aparecen a proposito.',
    inputSchema: {
      type: 'object',
      properties: {
        busqueda: { type: 'string', description: 'Nombre del cliente o numero. Ej: "Miki", "CT-000089"' },
        limite: { type: 'integer', description: 'Cuantas devolver (1-20, por defecto 8)' },
      },
    },
    rpc: 'mcp_buscar_cotizacion',
    args: (a) => ({ p_busqueda: a.busqueda || null, p_limite: a.limite ?? 8 }),
  },
  {
    name: 'buscar_documento',
    description:
      'Busca UN numero en facturas, cotizaciones, compras y recibos, y dice que es cada coincidencia con su ' +
      'estado, cliente o suplidor, total y lo que quede pendiente. ' +
      'Usala cuando digan un numero suelto: "buscame la 1023", "que paso con la factura 980", "el recibo 45".',
    inputSchema: {
      type: 'object',
      properties: { numero: { type: 'string', description: 'El numero tal cual lo dijeron' } },
      required: ['numero'],
    },
    rpc: 'mcp_buscar_documento',
    args: (a) => ({ p_numero: String(a.numero || '') }),
  },
  // ── EL RESOLVEDOR DE ENTIDADES ────────────────────────────────────
  // (2026-08-17) Existe por un error concreto: no había forma de buscar una
  // cotización por nombre de cliente, así que al pedirle "la de Sander" el
  // modelo se sacó un número — y resultó existir. Cotizó al cliente
  // equivocado. El fallo no fue del modelo: fue dejarle escribir un id.
  //
  // Estas dos herramientas hacen que los identificadores SALGAN de la base.
  {
    name: 'resolver_entidad',
    description:
      'Convierte un NOMBRE en el identificador de verdad. Usala SIEMPRE antes de operar sobre un cliente, ' +
      'cotizacion, producto o factura del que solo sabes el nombre o una parte del numero. ' +
      'Responde una de tres cosas: no existe (dilo, no inventes), es esta (sigue solo), ' +
      'o hay varias (enseñalas y pregunta cual — NO elijas tu). ' +
      'NUNCA escribas un id de tu cabeza: si no salio de aqui o de otra herramienta, no existe.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['cliente', 'cotizacion', 'producto', 'factura'] },
        texto: { type: 'string', description: 'El nombre o numero tal cual lo dijeron. Ej: "Sander", "CT-000097"' },
        limite: { type: 'integer', description: 'Cuantas opciones devolver si hay varias (1-20, por defecto 6)' },
      },
      required: ['tipo', 'texto'],
    },
    rpc: 'mcp_resolver_entidad',
    args: (a) => ({ p_tipo: String(a.tipo || ''), p_texto: String(a.texto || ''), p_limite: a.limite ?? 6 }),
  },
  {
    name: 'verificar_entidad',
    description:
      'Comprueba que un identificador existe y es de ESTA empresa antes de usarlo. ' +
      'Si vuelve existe=false, ese id no vale: no lo uses, busca por nombre con resolver_entidad.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['cliente', 'cotizacion', 'producto', 'factura'] },
        id: { type: 'string', description: 'El id o el numero de documento' },
      },
      required: ['tipo', 'id'],
    },
    rpc: 'mcp_verificar_entidad',
    args: (a) => ({ p_tipo: String(a.tipo || ''), p_id: String(a.id || '') }),
  },
];
