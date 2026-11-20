import json, sys, datetime, argparse
# Uso: generar_compras_elite.py facturas.json salida.sql [--prefijo OC25- --desde AAAA-MM-DD --hasta AAAA-MM-DD
#        --migracion nombre.sql --nota "texto" --titulo "comentario"]. Sin opciones hace lo mismo que el 15/11/2026.
ap = argparse.ArgumentParser()
ap.add_argument('facturas'); ap.add_argument('salida')
ap.add_argument('--prefijo', default='OC-')
ap.add_argument('--desde', default=None); ap.add_argument('--hasta', default=None)
ap.add_argument('--migracion', default='elite_royal_prestige_compras.sql')
ap.add_argument('--nota', default='Importada del PDF de la factura electrónica de Royal Prestige (15/11/2026). Sin entrada a inventario.')
ap.add_argument('--titulo', default=None)
# Sin crear productos: las líneas cuyo código no está en el catálogo quedan
# con código y descripción pero sin producto (p. ej. empresa en el límite de su plan).
ap.add_argument('--sin-productos-nuevos', action='store_true')
args = ap.parse_args()
facturas = json.load(open(args.facturas, encoding='utf-8'))
salida = args.salida
facturas = [f for f in facturas if (not args.desde or f['fecha'] >= args.desde) and (not args.hasta or f['fecha'] <= args.hasta)]
T = '3e8823fa-ec63-48c2-8305-2396c1a08e42'
ALM = '8e0bd843-eea1-4a3f-903c-995ecc760559'

# Sin repetidos (mismo e-NCF): el archivo "(1)" es copia.
vistos, fs = set(), []
for f in sorted(facturas, key=lambda x: (x['fecha'], x['interno'])):
    if f['encf'] in vistos:
        continue
    vistos.add(f['encf']); fs.append(f)

def q(v):
    return "'" + str(v).replace("'", "''") + "'"

# Catálogo: costo = el de la ÚLTIMA compra (por fecha).
cat = {}
for f in fs:
    for l in f['lineas']:
        cat[l['codigo']] = {'descripcion': l['descripcion'], 'costo': l['precio'], 'bos': l['bos'], 'itbis': l['itbis_pct'] / 100}

L = []
if args.titulo:
    L.append(args.titulo)
else:
  L.append('''-- =====================================================================
-- ELITE SOLUTIONS COMPANY ESC SRL: catálogo y compras de Royal Prestige
-- (15/11/2026). Leído de los 56 PDF de facturas electrónicas (E31) de
-- Royal Prestige DR S.R.L. (RNC 130743819), enero–octubre 2026; un archivo
-- repetido ("(1)") se omite: 55 facturas. Cada factura cuadra línea por
-- línea con su "Monto gravado Total".
-- Decisiones del dueño (15/11):
--   · catálogo de productos (bienes) con el costo de la última compra y
--     PRECIO 0 (lo pone él); los cargos (envío, Joint Venture, publicidad…)
--     como productos de SERVICIO (sin inventario);
--   · NADA entra al inventario (existencia 0; luego conteo físico);
--   · las 55 compras quedan PAGADAS (no van a Cuentas por Pagar).
-- Solo escribe en la empresa 3e8823fa… (Elite). No toca otras empresas.
-- Idempotente: no repite suplidor, productos ni compras (por e-NCF).
-- =====================================================================
''')
L.append(f'''INSERT INTO public.proveedores (tenant_id, nombre, rnc, activo, vende_a_credito, dias_credito, moneda)
SELECT {q(T)}, 'ROYAL PRESTIGE DR S.R.L.', '130743819', true, true, 30, 'DOP'
WHERE NOT EXISTS (SELECT 1 FROM public.proveedores WHERE tenant_id = {q(T)} AND regexp_replace(COALESCE(rnc,''), '\\D', '', 'g') = '130743819');
''')
SUP = f"(SELECT id FROM public.proveedores WHERE tenant_id = {q(T)} AND regexp_replace(COALESCE(rnc,''), '\\D', '', 'g') = '130743819' ORDER BY id LIMIT 1)"

for cod, p in ([] if args.sin_productos_nuevos else sorted(cat.items())):
    nat = 'bien' if p['bos'] == 1 else 'servicio'
    L.append(f'''INSERT INTO public.productos (tenant_id, codigo, descripcion, costo, precio, itbis_pct, activo, naturaleza, suplidor_id, min_stock, max_stock)
SELECT {q(T)}, {q(cod)}, {q(p['descripcion'])}, {p['costo']:.2f}, 0, {p['itbis']:.2f}, true, {q(nat)}, {SUP}, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = {q(T)} AND codigo = {q(cod)});''')
    if p['bos'] == 1:
        L.append(f'''INSERT INTO public.presentaciones (tenant_id, producto_id, cantidad, costo, margen_pct, precio1, tipo, precio_final, afecta_inv, afecta_ft)
SELECT {q(T)}, pr.id, 1, {p['costo']:.2f}, 0, 0, 'UND - Unidad', 0, true, true FROM public.productos pr
WHERE pr.tenant_id = {q(T)} AND pr.codigo = {q(cod)} AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = pr.id);''')

n = 0
tot_base = tot_itbis = 0
for f in fs:
    n += 1
    num = f'{args.prefijo}{n:04d}'
    base = round(sum(l['cantidad'] * l['precio'] for l in f['lineas']), 2)
    itbis = f['itbis']
    total = round(base + itbis, 2)
    tot_base += base; tot_itbis += itbis
    dias = (datetime.date.fromisoformat(f['vence']) - datetime.date.fromisoformat(f['fecha'])).days if f.get('vence') else 0
    L.append(f'''
-- {f['interno']} · {f['encf']} · {f['fecha']} · RD$ {total:,.2f}
WITH c AS (
  INSERT INTO public.compras (tenant_id, numero, fecha, ncf, referencia, tipo_bienes_servicios, sub_tipo, suplidor_id, almacen_id,
    total_exento, total_gravado, descuento_total, itbis_total, total_compra, itbis_incluido, actualizar_precios,
    forma_pago, dias_credito, monto_pagado, monto_pendiente, estado, pagos, moneda, notas)
  SELECT {q(T)}, {q(num)}, {q(f['fecha'])}, {q(f['encf'])}, {q(f['interno'])}, '09', 'Compra de Merc', {SUP}, {q(ALM)},
    {f['exento']:.2f}, {f['gravado']:.2f}, 0, {itbis:.2f}, {total:.2f}, false, false,
    'Credito', {dias}, {total:.2f}, 0, 'PAGADA', '[]'::jsonb, 'DOP', {q(args.nota)}
  WHERE NOT EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = {q(T)} AND ncf = {q(f['encf'])})
  RETURNING id
)
INSERT INTO public.compras_detalle (tenant_id, compra_id, producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, descuento_pct, itbis_pct, importe)
SELECT {q(T)}, c.id, (SELECT id FROM public.productos WHERE tenant_id = {q(T)} AND codigo = v.codigo), v.codigo, v.descripcion, v.cantidad, 'UND', v.costo, 0, v.itbis, v.importe
FROM c, (VALUES''')
    vals = []
    for l in f['lineas']:
        # La factura manda: si su ITBIS total es 0 (DR-Y002-2313589), las
        # líneas van sin ITBIS aunque digan 18 %.
        pct = l['itbis_pct'] if f['itbis'] > 0 else 0
        imp = round(l['cantidad'] * l['precio'] * (1 + pct / 100), 2)
        vals.append(f"  ({q(l['codigo'])}, {q(l['descripcion'])}, {l['cantidad']:.2f}, {l['precio']:.4f}, {pct/100:.2f}, {imp:.2f})")
    L.append(',\n'.join(vals) + '\n) AS v(codigo, descripcion, cantidad, costo, itbis, importe);')

L.append(f"\n-- Totales: {n} compras · base RD$ {tot_base:,.2f} · ITBIS RD$ {tot_itbis:,.2f}")
L.append(f"SELECT registrar_migracion({q(args.migracion)});\n")
open(salida, 'w', encoding='utf-8', newline='\n').write('\n'.join(L))
print('compras', n, 'productos', sum(1 for p in cat.values() if p['bos'] == 1), 'servicios', sum(1 for p in cat.values() if p['bos'] == 2), 'base', round(tot_base, 2), 'itbis', round(tot_itbis, 2))
