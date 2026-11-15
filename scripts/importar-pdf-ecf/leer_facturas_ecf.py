import glob, json, re, sys, os
import pypdf

def num(s):
    return float(s.replace(',', ''))

def leer(path):
    r = pypdf.PdfReader(path)
    t = '\n'.join((p.extract_text() or '') for p in r.pages)
    f = {'archivo': os.path.basename(path)}
    m = re.search(r'e-NCF:\s*(E\d{12})', t); f['encf'] = m.group(1) if m else None
    m = re.search(r'Fecha emisi.n:\s*(\d{2})-(\d{2})-(\d{4})', t); f['fecha'] = f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else None
    m = re.search(r'Fecha l.mite pago:\s*(\d{2})-(\d{2})-(\d{4})', t); f['vence'] = f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else None
    m = re.search(r'N.mero factura interno:\s*(\S+)', t); f['interno'] = m.group(1) if m else None
    f['credito'] = bool(re.search(r'Tipo pago:.*Cr.dito', t)) or 'Crédito' in t.split('Tipo pago:')[-1][:80] if 'Tipo pago:' in t else None
    m = re.search(r'Monto gravado Total:\s*RD\$\s*([\d,]+\.\d+)', t); f['gravado'] = num(m.group(1)) if m else 0
    m = re.search(r'Total ITBIS:\s*RD\$\s*([\d,]+\.\d+)', t); f['itbis'] = num(m.group(1)) if m else 0
    m = re.search(r'Monto exento:\s*RD\$\s*([\d,]+\.\d+)', t); f['exento'] = num(m.group(1)) if m else 0
    m = re.search(r'Monto [Tt]otal:\s*RD\$\s*([\d,]+\.\d+)', t); f['total'] = num(m.group(1)) if m else None
    lineas = []
    rows = t.split('\n')
    for i, ln in enumerate(rows):
        m = re.match(r'^(\d+) (\S+) ([\d,]+\.\d+) ([\d,]+\.\d{4}) (.*?)(ITBIS (\d+)%|Exento|E\b)\s*([12])\s*$', ln.strip())
        if not m:
            continue
        desc = ''
        for j in range(i + 1, min(i + 4, len(rows))):
            if 'Informaci' in rows[j]:
                desc = rows[j].split('Informaci')[0].strip()
                break
        lineas.append({
            'n': int(m.group(1)), 'codigo': m.group(2), 'cantidad': num(m.group(3)), 'precio': num(m.group(4)),
            'itbis_pct': int(m.group(7)) if m.group(7) else 0, 'bos': int(m.group(8)), 'descripcion': desc,
        })
    f['lineas'] = lineas
    base = round(sum(l['cantidad'] * l['precio'] for l in lineas), 2)
    f['suma_lineas'] = base
    f['cuadra'] = abs(base - (f['gravado'] + f['exento'])) < 0.05
    return f

facturas = [leer(p) for p in sorted(glob.glob(r'C:\Users\PC\Downloads\DR-Y002-*.pdf'))]
json.dump(facturas, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
ok = [f for f in facturas if f['cuadra']]
print('facturas', len(facturas), 'cuadran', len(ok))
for f in facturas:
    if not f['cuadra']:
        print(' NO CUADRA', f['archivo'], f['encf'], 'lineas', len(f['lineas']), 'suma', f['suma_lineas'], 'gravado', f['gravado'], 'exento', f['exento'])
encfs = [f['encf'] for f in facturas]
print('e-NCF repetidos:', len(encfs) - len(set(encfs)))
prods = {}
cargos = {}
for f in facturas:
    for l in f['lineas']:
        d = prods if l['bos'] == 1 else cargos
        d.setdefault(l['codigo'], {'descripcion': l['descripcion'], 'veces': 0, 'precios': set()})
        d[l['codigo']]['veces'] += 1
        d[l['codigo']]['precios'].add(l['precio'])
print('productos distintos (bienes):', len(prods), '· cargos distintos (servicios):', len(cargos))
print('fechas:', min(f['fecha'] for f in facturas if f['fecha']), 'a', max(f['fecha'] for f in facturas if f['fecha']))
print('credito:', sum(1 for f in facturas if f['credito']), 'contado:', sum(1 for f in facturas if f['credito'] is False))
print('total gravado', round(sum(f['gravado'] for f in facturas), 2), 'itbis', round(sum(f['itbis'] for f in facturas), 2))
print('CARGOS:')
for k, v in sorted(cargos.items(), key=lambda x: -x[1]['veces']):
    print(f'  {k:8} {v["veces"]:3}x {v["descripcion"][:50]}')
print('PRODUCTOS (primeros 15):')
for k, v in list(sorted(prods.items(), key=lambda x: -x[1]['veces']))[:15]:
    print(f'  {k:8} {v["veces"]:3}x {v["descripcion"][:45]:45} precios {sorted(v["precios"])[:3]}')
