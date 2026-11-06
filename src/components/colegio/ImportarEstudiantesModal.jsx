// Importar estudiantes desde la plantilla de Excel (centros educativos).
// La lista del colegio es confidencial: el archivo lo sube la dueña desde
// SU cuenta y se lee en su navegador; no pasa por nadie más. Antes de
// guardar se muestra qué se va a crear y qué filas tienen errores.
// Los hermanos se agrupan por la columna "Familia (apellidos)".
import React, { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { COLUMNAS_PLANTILLA, leerPlantillaEstudiantes } from '@/lib/colegio';

export default function ImportarEstudiantesModal({ open, onClose, cursos, tarifas, anioActual, tenantId, cupo, onDone, onError }) {
  const [lectura, setLectura] = useState(null);     // { familias, errores, total, archivo }
  const [guardando, setGuardando] = useState(false);
  const [avance, setAvance] = useState('');
  const archivoRef = useRef(null);

  const cerrar = () => { if (!guardando) { setLectura(null); setAvance(''); onClose(); } };

  const bajarPlantilla = async () => {
    const XLSX = await import('xlsx');
    const libro = XLSX.utils.book_new();
    const ejemplo = {
      'Familia (apellidos)': 'Pérez Santana', Nombres: 'María Fernanda', Apellidos: 'Pérez Santana',
      'Fecha de nacimiento (dd/mm/aaaa)': '15/03/2018', 'Lugar de nacimiento': 'Higüey',
      Curso: cursos.find((c) => c.nivel === 'primaria')?.nombre || cursos[0]?.nombre || '', Tanda: 'Matutina',
      'Condición (nuevo/continuante)': 'continuante', Mensualidad: 5900, 'Beca %': 0, 'Sala de Tareas (si/no)': 'no',
      Madre: 'Ana Santana', 'Teléfono madre': '809-000-0000', Padre: 'José Pérez', 'Teléfono padre': '809-000-0001',
      Tutor: '', 'Teléfono tutor': '', Dirección: 'Calle 1 #2', Sector: 'Centro', Notas: 'FILA DE EJEMPLO: bórrala',
    };
    const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS_PLANTILLA, COLUMNAS_PLANTILLA.map((k) => ejemplo[k] ?? '')]);
    hoja['!cols'] = COLUMNAS_PLANTILLA.map((k) => ({ wch: Math.max(12, k.length + 2) }));
    XLSX.utils.book_append_sheet(libro, hoja, 'Estudiantes');
    const ayuda = XLSX.utils.aoa_to_sheet([
      ['Cursos válidos (escríbelos igual)', 'Tandas'],
      ...cursos.filter((c) => c.activo).map((c) => [c.nombre, c.tandas.join(', ')]),
      [],
      ['Tarifas del colegio (mensualidad)'],
      ...tarifas.filter((t) => t.activa).map((t) => [t.monto]),
      [],
      ['Hermanos: pon los mismos apellidos en "Familia (apellidos)" para enlazarlos.'],
      ['Acuerdos (ej. 5,500): escribe el monto en "Mensualidad".'],
      ['La foto se toma después, desde la ficha de cada estudiante.'],
    ]);
    ayuda['!cols'] = [{ wch: 38 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(libro, ayuda, 'Ayuda');
    XLSX.writeFile(libro, 'Plantilla_estudiantes.xlsx');
  };

  const leer = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const XLSX = await import('xlsx');
      const libro = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const hoja = libro.Sheets.Estudiantes || libro.Sheets[libro.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' });
      const enc = (filas[0] || []).map((x) => String(x).trim());
      const faltan = COLUMNAS_PLANTILLA.filter((k, i) => enc[i] !== k);
      if (faltan.length) throw new Error(`El archivo no tiene las columnas de la plantilla (primera distinta: "${faltan[0]}"). Baja la plantilla y copia los datos ahí.`);
      // La fila de ejemplo no se importa.
      const sinEjemplo = filas.filter((r, i) => i === 0 || !String(r[COLUMNAS_PLANTILLA.indexOf('Notas')] || '').includes('FILA DE EJEMPLO'));
      const r = leerPlantillaEstudiantes(sinEjemplo, cursos);
      const total = [...r.familias.values()].reduce((n, fa) => n + fa.estudiantes.length, 0);
      setLectura({ ...r, total, archivo: f.name });
    } catch (err) {
      onError('No se pudo leer el archivo', err?.message);
    }
  };

  const quedan = cupo?.quedan;
  const pasaTope = lectura && quedan != null && lectura.total > quedan;

  const importar = async () => {
    if (!lectura?.total || pasaTope) return;
    setGuardando(true);
    let creados = 0;
    const fallos = [];
    try {
      const tarifaPorMonto = new Map(tarifas.map((t) => [Number(t.monto), t.id]));
      // Importar en varias tandas no duplica familias: se reusa la que ya tiene esos apellidos.
      const { data: existentes, error: eX } = await supabase.from('edu_familias').select('id, nombre').eq('tenant_id', tenantId);
      if (eX) throw eX;
      const clave = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
      const famPorNombre = new Map((existentes || []).map((x) => [clave(x.nombre), x.id]));
      let i = 0;
      for (const fa of lectura.familias.values()) {
        i += 1;
        setAvance(`Familia ${i} de ${lectura.familias.size}…`);
        let famRow = famPorNombre.has(clave(fa.datos.nombre)) ? { id: famPorNombre.get(clave(fa.datos.nombre)) } : null;
        if (!famRow) {
          const { data, error: eF } = await supabase.from('edu_familias')
            .insert({ ...fa.datos, tenant_id: tenantId }).select('id').single();
          if (eF) { fa.estudiantes.forEach((x) => fallos.push({ fila: x.fila, motivo: eF.message })); continue; }
          famRow = data;
          famPorNombre.set(clave(fa.datos.nombre), data.id);
        }
        for (const x of fa.estudiantes) {
          const tarifaId = tarifaPorMonto.get(Number(x.tarifa_mensual)) || null;
          const { fila, ...datos } = x;
          const { error: eE } = await supabase.from('edu_estudiantes').insert({
            ...datos, tenant_id: tenantId, familia_id: famRow.id, estado: 'activo',
            tarifa_id: tarifaId, tarifa_acuerdo: !tarifaId, tarifa_nota: tarifaId ? null : 'Acuerdo (importado)',
            anio_ingreso: x.condicion === 'nuevo' ? (anioActual?.anio_inicio ?? null) : null,
          });
          if (eE) fallos.push({ fila, motivo: eE.message }); else creados += 1;
        }
      }
      onDone(creados, fallos);
      setLectura(null);
    } catch (err) {
      onError('La importación se detuvo', `${err?.message || err}. Se guardaron ${creados}.`);
    } finally {
      setGuardando(false);
      setAvance('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Importar estudiantes desde Excel</DialogTitle></DialogHeader>
        <ol className="text-sm text-gray-700 list-decimal pl-5 space-y-1">
          <li>Baja la plantilla: trae los cursos y tarifas de tu colegio en la hoja "Ayuda".</li>
          <li>Llénala en tu computadora (una fila por estudiante; los hermanos con la misma "Familia").</li>
          <li>Súbela aquí. Antes de guardar verás qué se va a crear y qué filas tienen errores.</li>
        </ol>
        <p className="text-xs text-gray-500">
          El archivo se lee en tu navegador y los datos van solo a tu colegio. No lo mandes por WhatsApp ni por correo.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={bajarPlantilla}><Download className="w-4 h-4 mr-1" /> Bajar plantilla</Button>
          <Button variant="outline" onClick={() => archivoRef.current?.click()} disabled={guardando}><Upload className="w-4 h-4 mr-1" /> Subir archivo</Button>
          <input ref={archivoRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={leer} />
        </div>

        {lectura && (
          <div className="rounded-md border border-gray-200 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2 font-semibold"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> {lectura.archivo}</div>
            <div>Se van a crear <b>{lectura.total}</b> estudiantes en <b>{lectura.familias.size}</b> familias.</div>
            {quedan != null && (
              <div className={pasaTope ? 'text-red-700 font-semibold' : 'text-gray-600'}>
                Cupo del plan: quedan {quedan} de {cupo.limite}. {pasaTope ? 'No caben todos: sube de plan o importa menos filas.' : ''}
              </div>
            )}
            {lectura.errores.length > 0 && (
              <div className="rounded bg-amber-50 border border-amber-200 p-2 max-h-40 overflow-y-auto">
                <div className="flex items-center gap-1 font-semibold text-amber-800"><AlertTriangle className="w-4 h-4" /> {lectura.errores.length} filas no se importarán:</div>
                {lectura.errores.map((e) => <div key={e.fila} className="text-xs">Fila {e.fila}: {e.motivo}</div>)}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <span className="text-xs text-gray-500 self-center mr-auto">{avance}</span>
          <Button variant="ghost" onClick={cerrar} disabled={guardando}>Cerrar</Button>
          <Button onClick={importar} disabled={guardando || !lectura?.total || pasaTope}>
            {guardando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Importar {lectura?.total || ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
