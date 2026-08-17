// Qué puede hacer Jarvis solo y qué no. (Fase 10)
//
// La clasificación vive en motoflow-ai-chat, que corre en Deno y no se
// importa desde aquí. Se copia la función a propósito y se prueba la
// REGLA — si alguien afloja el patrón allá, esto sigue verde y no sirve,
// así que la prueba incluye la lista de nombres reales del sistema.

import { describe, it, expect } from 'vitest';

// Copia literal de la de supabase/functions/motoflow-ai-chat/index.ts
const VERBO_DESTRUCTIVO = /^(anular|eliminar|borrar|cancelar|revertir|castigar|cerrar|ajustar|cambiar|pagar|desembolsar|transferir)$/;
const VERBO_ESCRIBE = /^(crear|guardar|grabar|facturar|registrar|actualizar|modificar|preparar|cobrar)$/;

function nivelDeRiesgo(nombre) {
  const partes = (nombre || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const primero = partes[0] || '';
  if (VERBO_DESTRUCTIVO.test(primero)) return 3;
  if (VERBO_ESCRIBE.test(primero) && partes.some((t) => VERBO_DESTRUCTIVO.test(t))) return 3;
  if (VERBO_ESCRIBE.test(primero)) return 2;
  return 1;
}

describe('nivel 1 — leer, corre solo', () => {
  it('las herramientas que hay hoy en el MCP son todas de lectura', () => {
    // Si mañana una de estas pasa a escribir, esta prueba se pone roja y
    // obliga a mirarlo. Es el punto.
    for (const t of [
      'buscar_piezas', 'ver_pieza', 'estado_cliente', 'resumen_dia',
      'buscar_ayuda', 'cartera_cobrar', 'cuentas_pagar', 'ventas_periodo',
      'piezas_criticas', 'buscar_cotizacion', 'buscar_documento',
      'resolver_entidad', 'verificar_entidad', 'abrir_modulo',
    ]) expect(nivelDeRiesgo(t), t).toBe(1);
  });

  it('un informe no se bloquea por llevar dentro un verbo de acción', () => {
    // Esta prueba nació de un fallo real: la primera versión buscaba la
    // palabra en cualquier posición y `cuentas_pagar` salía nivel 3 — con
    // esa regla, Jarvis no habría podido ni LEER las cuentas por pagar.
    // La diferencia está en el orden: `pagar_suplidor` hace algo,
    // `cuentas_pagar` cuenta algo.
    expect(nivelDeRiesgo('cuentas_pagar')).toBe(1);
    expect(nivelDeRiesgo('cartera_cobrar')).toBe(1);
    expect(nivelDeRiesgo('pagar_suplidor')).toBe(3);
  });
});

describe('nivel 2 — escribir lo normal', () => {
  it('crear y facturar corren si la orden es inequívoca', () => {
    // El dueño fue explícito: "no quiero una confirmación innecesaria
    // después de cada orden".
    for (const t of [
      'crear_cotizacion', 'crear_pedido', 'facturar_cotizacion',
      'registrar_pago', 'preparar_venta', 'cobrar_venta', 'actualizar_cliente',
    ]) expect(nivelDeRiesgo(t), t).toBe(2);
  });
});

describe('nivel 3 — no lo ejecuta el modelo, se propone', () => {
  it('lo que destruye o mueve dinero queda fuera del chat', () => {
    for (const t of [
      'anular_factura', 'eliminar_cotizacion', 'borrar_cliente',
      'cancelar_pedido', 'revertir_pago', 'castigar_prestamo',
      'cerrar_caja', 'cambiar_precio', 'ajustar_precio',
      'pagar_suplidor', 'desembolsar_prestamo', 'transferir_entre_cuentas',
    ]) expect(nivelDeRiesgo(t), t).toBe(3);
  });

  it('el nivel 3 gana aunque el nombre también suene a nivel 2', () => {
    // "anular_factura_registrada" tiene 'registrar' dentro. Ante la duda,
    // el nivel más alto: equivocarse hacia arriba solo cuesta un clic;
    // hacia abajo cuesta una factura anulada sin permiso.
    expect(nivelDeRiesgo('anular_factura_registrada')).toBe(3);
    expect(nivelDeRiesgo('crear_nota_para_anular')).toBe(3);
  });
});

describe('ante lo desconocido', () => {
  it('un nombre que no dice nada se trata como lectura', () => {
    // Es lo correcto: una herramienta nueva de consulta no debería quedar
    // trabada esperando una clasificación. Las que escriben llevan verbo.
    expect(nivelDeRiesgo('consultar_algo_nuevo')).toBe(1);
    expect(nivelDeRiesgo('')).toBe(1);
    expect(nivelDeRiesgo(null)).toBe(1);
  });
});
