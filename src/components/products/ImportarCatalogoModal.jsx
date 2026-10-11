// ============================================================
// ImportarCatalogoModal — cargar el catálogo desde Excel/CSV
// ============================================================
// (11/10/2026) Para dar de alta clientes nuevos: una tienda con miles de
// piezas no tenía cómo cargarlas ("Importar existencias" solo ajusta las que
// ya existen). Flujo:
//   1. Archivo .xlsx/.xls/.csv → se lee aquí, en el navegador.
//   2. Columnas: se reconocen solas por el título (código, descripción,
//      costo, precio...); se pueden corregir a mano.
//   3. "Revisar": la base simula sin escribir (cuántos nuevos, cuántos ya
//      existen, qué filas tienen problemas).
//   4. "Importar": por tandas de 500, con progreso.
// La lógica y las reglas viven en la base: sql/importar_catalogo.sql.
// ============================================================
import React, { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';

// Campo → títulos que se reconocen (sin acentos, minúsculas).
const CAMPOS_CATALOGO = [
  { k: 'codigo', label: 'Código *', alias: ['codigo', 'cod', 'code', 'sku', 'codigo articulo', 'cod articulo', 'item'] },
  { k: 'descripcion', label: 'Descripción *', alias: ['descripcion', 'nombre', 'producto', 'articulo', 'description', 'detalle'] },
  { k: 'referencia', label: 'Referencia', alias: ['referencia', 'ref', 'numero de parte', 'no parte', 'parte', 'oem'] },
  { k: 'costo', label: 'Costo', alias: ['costo', 'cost', 'costo unitario', 'precio costo', 'precio de costo'] },
  { k: 'precio', label: 'Precio', alias: ['precio', 'precio venta', 'precio de venta', 'pvp', 'price', 'precio1', 'precio 1'] },
  { k: 'itbis', label: 'ITBIS (18 / 0)', alias: ['itbis', 'itbis %', 'itbis pct', 'impuesto', 'tax'] },
  { k: 'existencia', label: 'Existencia', alias: ['existencia', 'stock', 'cantidad', 'qty', 'inventario', 'existencias'] },
  { k: 'ubicacion', label: 'Ubicación', alias: ['ubicacion', 'location', 'tramo', 'estante'] },
  { k: 'min_stock', label: 'Mínimo', alias: ['minimo', 'min', 'stock minimo', 'min stock', 'punto de reorden'] },
  { k: 'suplidor', label: 'Suplidor', alias: ['suplidor', 'proveedor', 'supplier'] },
  { k: 'marca', label: 'Marca', alias: ['marca', 'brand'] },
  { k: 'tipo', label: 'Tipo', alias: ['tipo', 'categoria', 'familia', 'grupo', 'linea'] },
];
// (11/10/2026) También importa clientes: misma pantalla, otros campos y otra
// función en la base (sql/importar_clientes.sql).
const CAMPOS_CLIENTES = [
  { k: 'codigo', label: 'Código', alias: ['codigo', 'cod', 'code', 'codigo cliente', 'id cliente', 'numero'] },
  { k: 'nombre', label: 'Nombre *', alias: ['nombre', 'cliente', 'razon social', 'nombre cliente', 'name'] },
  { k: 'rnc', label: 'RNC / Cédula', alias: ['rnc', 'cedula', 'rnc/cedula', 'rnc cedula', 'documento', 'identificacion'] },
  { k: 'direccion', label: 'Dirección', alias: ['direccion', 'address', 'domicilio'] },
  { k: 'telefono', label: 'Teléfono', alias: ['telefono', 'tel', 'celular', 'phone', 'movil', 'whatsapp'] },
  { k: 'email', label: 'Correo', alias: ['email', 'correo', 'e-mail', 'mail'] },
  { k: 'limite_credito', label: 'Límite de crédito', alias: ['limite', 'limite credito', 'limite de credito', 'credito limite'] },
  { k: 'dias_credito', label: 'Días de crédito', alias: ['dias', 'dias credito', 'dias de credito', 'plazo'] },
  { k: 'credito', label: 'Crédito (sí/no)', alias: ['credito', 'a credito', 'autorizar credito', 'tiene credito'] },
  { k: 'tipo_ncf', label: 'Comprobante (01/02)', alias: ['tipo ncf', 'ncf', 'comprobante', 'tipo comprobante'] },
  { k: 'precio_nivel', label: 'Nivel de precio (1-3)', alias: ['nivel precio', 'precio nivel', 'nivel', 'lista de precio'] },
];

const CONFIG = {
  catalogo: {
    titulo: 'Importar catálogo (Excel o CSV)', campos: CAMPOS_CATALOGO, rpc: 'importar_catalogo', unidad: 'productos',
    obligatorios: ['codigo', 'descripcion'], llave: 'codigo', llaveNombre: 'código',
    intro: 'Crea los productos que no existen. Una fila por producto, con títulos en la primera fila. Código y descripción son obligatorios; lo demás es opcional (costo, precio, ITBIS, existencia, ubicación, mínimo, suplidor, marca, tipo).',
    actualizar: 'Los que YA existen: actualizar descripción, costo, precio, ITBIS, ubicación y demás datos que vengan llenos (su existencia no se toca; para eso está "Importar existencias").',
    plantilla: ['plantilla_catalogo_motoflow.csv',
      'codigo,descripcion,referencia,costo,precio,itbis,existencia,ubicacion,min_stock,suplidor,marca,tipo\n'
      + 'FA-001,FILTRO DE ACEITE CG150,15410-KF0,120,250,18,24,A-03,5,PEDRO RACING,HONDA,FILTROS\n'],
  },
  clientes: {
    titulo: 'Importar clientes (Excel o CSV)', campos: CAMPOS_CLIENTES, rpc: 'importar_clientes', unidad: 'clientes',
    obligatorios: ['nombre'], llave: 'nombre', llaveNombre: 'nombre',
    intro: 'Crea los clientes que no existen. El nombre es obligatorio. Si trae código o RNC/cédula, con eso se reconoce al que ya existe. Los balances NO se cargan aquí: lo que debe un cliente son facturas a crédito y van aparte.',
    actualizar: 'Los que YA existen (mismo código o RNC): actualizar nombre, teléfono, dirección, crédito y demás datos que vengan llenos.',
    plantilla: ['plantilla_clientes_motoflow.csv',
      'codigo,nombre,rnc,direccion,telefono,email,limite_credito,dias_credito,credito,tipo_ncf,precio_nivel\n'
      + 'C-001,TALLER EL MECANICO SRL,131880681,AV. DUARTE 12 HIGUEY,809-555-1234,taller@correo.com,20000,30,si,01,2\n'],
  },
};

const NUMERICOS = new Set(['costo', 'precio', 'itbis', 'existencia', 'min_stock', 'limite_credito', 'dias_credito', 'precio_nivel']);
const TANDA = 500;

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

// "RD$ 1,250.50" → 1250.5 · celda vacía → null
export function aNumero(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const limpio = String(v).replace(/[^\d.,-]/g, '');
  if (!limpio) return null;
  // 1.250,50 (coma decimal) → 1250.50 ; 1,250.50 → 1250.50
  const conComaDecimal = /,\d{1,2}$/.test(limpio) && limpio.includes('.');
  const n = Number(conComaDecimal ? limpio.replace(/\./g, '').replace(',', '.') : limpio.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const descargarPlantilla = ([nombre, csv]) => {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  URL.revokeObjectURL(url);
};

export default function ImportarCatalogoModal({ open, onClose, onTerminado, tipo = 'catalogo' }) {
  const cfg = CONFIG[tipo] || CONFIG.catalogo;
  const CAMPOS = cfg.campos;
  const inputRef = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [titulos, setTitulos] = useState([]);
  const [datos, setDatos] = useState([]);          // filas crudas (arrays)
  const [mapa, setMapa] = useState({});            // campo → índice de columna
  const [actualizar, setActualizar] = useState(false);
  const [fase, setFase] = useState('archivo');     // archivo | columnas | revisado | importando | listo
  const [resumen, setResumen] = useState(null);
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState(null);

  const reiniciar = () => {
    setArchivo(null); setTitulos([]); setDatos([]); setMapa({}); setActualizar(false);
    setFase('archivo'); setResumen(null); setProgreso(0); setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };
  const cerrar = () => { if (fase !== 'importando') { reiniciar(); onClose?.(); } };

  const leerArchivo = async (f) => {
    setError(null);
    try {
      const XLSX = await import('xlsx');
      const libro = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' })
        .filter((r) => r.some((c) => String(c).trim() !== ''));
      if (filas.length < 2) throw new Error('El archivo no tiene filas debajo de los títulos.');
      const tit = filas[0].map((t) => String(t));
      const auto = {};
      CAMPOS.forEach(({ k, alias }) => {
        const i = tit.findIndex((t) => alias.includes(normal(t)));
        if (i >= 0) auto[k] = i;
      });
      setArchivo(f); setTitulos(tit); setDatos(filas.slice(1)); setMapa(auto); setFase('columnas');
    } catch (e) {
      setError(e.message || 'No se pudo leer el archivo.');
    }
  };

  const filasMapeadas = useMemo(() => datos.map((r) => {
    const o = {};
    CAMPOS.forEach(({ k }) => {
      const i = mapa[k];
      if (i === undefined || i === null || i === '') return;
      const v = r[i];
      o[k] = NUMERICOS.has(k) ? aNumero(v) : (String(v ?? '').trim() || null);
    });
    return o;
  }), [datos, mapa, CAMPOS]);

  const sinCodigo = filasMapeadas.filter((f) => !f[cfg.llave]).length;
  const listo = cfg.obligatorios.every((k) => mapa[k] !== undefined);

  const enviar = async (simular) => {
    setError(null);
    const validas = filasMapeadas.filter((f) => f[cfg.llave]);
    const total = { recibidas: 0, nuevos: 0, nuevos_con_existencia: 0, actualizados: 0, existentes_sin_tocar: 0, errores: [], suplidores_no_encontrados: [] };
    if (!simular) { setFase('importando'); setProgreso(0); }
    try {
      for (let i = 0; i < validas.length; i += TANDA) {
        const { data, error: e } = await supabase.rpc(cfg.rpc, {
          p_filas: validas.slice(i, i + TANDA), p_actualizar: actualizar, p_simular: simular,
        });
        if (e) throw e;
        for (const k of ['recibidas', 'nuevos', 'nuevos_con_existencia', 'actualizados', 'existentes_sin_tocar']) total[k] += data?.[k] || 0;
        total.errores.push(...(data?.errores || []));
        total.suplidores_no_encontrados = [...new Set([...total.suplidores_no_encontrados, ...(data?.suplidores_no_encontrados || [])])];
        if (!simular) setProgreso(Math.min(100, Math.round(((i + TANDA) / validas.length) * 100)));
      }
      setResumen({ ...total, simulado: simular });
      setFase(simular ? 'revisado' : 'listo');
      if (!simular) onTerminado?.();
    } catch (e) {
      setError(e.message || String(e));
      setFase(simular ? 'columnas' : 'revisado');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cerrar(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-emerald-600" /> {cfg.titulo}</DialogTitle>
        </DialogHeader>

        {fase === 'archivo' && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">{cfg.intro}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => inputRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Elegir archivo</Button>
              <Button variant="outline" onClick={() => descargarPlantilla(cfg.plantilla)}><Download className="mr-2 h-4 w-4" /> Bajar plantilla</Button>
            </div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])} />
          </div>
        )}

        {fase !== 'archivo' && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600"><b>{archivo?.name}</b> · {datos.length.toLocaleString('es-DO')} filas
              {sinCodigo > 0 && <span className="text-amber-700"> · {sinCodigo} sin {cfg.llaveNombre} (se saltan)</span>}</p>

            {/* Columnas */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {CAMPOS.map(({ k, label }) => (
                <label key={k} className="text-xs">
                  <span className="mb-0.5 block font-semibold text-slate-600">{label}</span>
                  <select className="w-full rounded border border-slate-300 bg-white p-1 text-xs" disabled={fase === 'importando'}
                    value={mapa[k] ?? ''} onChange={(e) => {
                      const v = e.target.value === '' ? undefined : Number(e.target.value);
                      setMapa((m) => ({ ...m, [k]: v })); setResumen(null); if (fase !== 'columnas') setFase('columnas');
                    }}>
                    <option value="">— no viene —</option>
                    {titulos.map((t, i) => <option key={i} value={i}>{t || `Columna ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>

            {/* Vista previa */}
            <div className="max-h-56 overflow-auto rounded border border-slate-200">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                  <tr>{CAMPOS.filter(({ k }) => mapa[k] !== undefined).map(({ k, label }) => <th key={k} className="px-2 py-1">{label.replace(' *', '')}</th>)}</tr>
                </thead>
                <tbody>
                  {filasMapeadas.slice(0, 15).map((f, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {CAMPOS.filter(({ k }) => mapa[k] !== undefined).map(({ k }) => (
                        <td key={k} className={`px-2 py-1 ${f[k] == null && cfg.obligatorios.includes(k) ? 'bg-red-50' : ''}`}>{f[k] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={actualizar} disabled={fase === 'importando'}
                onChange={(e) => { setActualizar(e.target.checked); setResumen(null); if (fase === 'revisado') setFase('columnas'); }} />
              {cfg.actualizar}
            </label>

            {resumen && (
              <div className={`rounded border p-3 text-xs ${resumen.simulado ? 'border-blue-200 bg-blue-50' : 'border-emerald-200 bg-emerald-50'}`}>
                <p className="mb-1 font-semibold">{resumen.simulado ? 'Revisión (todavía no se guardó nada):' : '✅ Importación terminada:'}</p>
                <p>{cfg.unidad === 'clientes' ? 'Clientes' : 'Productos'} nuevos: <b>{resumen.nuevos.toLocaleString('es-DO')}</b>
                  {resumen.nuevos_con_existencia > 0 && <> ({resumen.nuevos_con_existencia.toLocaleString('es-DO')} con existencia inicial)</>}</p>
                <p>Ya existían: <b>{(resumen.actualizados + resumen.existentes_sin_tocar).toLocaleString('es-DO')}</b>
                  {' '}→ {actualizar ? `${resumen.actualizados.toLocaleString('es-DO')} se actualizan` : 'no se tocan'}</p>
                {resumen.suplidores_no_encontrados.length > 0 && (
                  <p className="text-amber-800">Suplidores que no existen (créalos y vuelve a importar si quieres enlazarlos): {resumen.suplidores_no_encontrados.slice(0, 10).join(', ')}{resumen.suplidores_no_encontrados.length > 10 ? '…' : ''}</p>
                )}
                {resumen.errores.length > 0 && (
                  <div className="mt-1 text-red-700">
                    <p className="font-semibold">{resumen.errores.length} filas con problemas (se saltan):</p>
                    <ul className="max-h-28 list-disc overflow-auto pl-5">
                      {resumen.errores.slice(0, 50).map((e, i) => <li key={i}><b>{e.codigo || e.fila}</b>: {e.motivo}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {fase === 'importando' && (
              <div className="h-2 w-full overflow-hidden rounded bg-slate-200"><div className="h-2 bg-emerald-500 transition-all" style={{ width: `${progreso}%` }} /></div>
            )}
            {error && <p className="text-xs text-red-700">{error}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              {fase !== 'listo' && <Button variant="ghost" disabled={fase === 'importando'} onClick={reiniciar}>Otro archivo</Button>}
              {fase === 'columnas' && (
                <Button variant="outline" disabled={!listo} onClick={() => enviar(true)}
                  title={listo ? '' : 'Indica qué columna corresponde a cada campo con asterisco (*)'}>Revisar (sin guardar)</Button>
              )}
              {fase === 'revisado' && (resumen?.nuevos > 0 || resumen?.actualizados > 0) && (
                <Button onClick={() => enviar(false)} className="bg-emerald-600 hover:bg-emerald-700">
                  Importar {(resumen.nuevos + resumen.actualizados).toLocaleString('es-DO')} {cfg.unidad}
                </Button>
              )}
              {fase === 'importando' && <Button disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando… {progreso}%</Button>}
              {fase === 'listo' && <Button onClick={cerrar}>Cerrar</Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
