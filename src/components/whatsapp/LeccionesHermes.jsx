// ============================================================
// LeccionesHermes — lo que aprende Hermes, y lo que decide el dueño
// ------------------------------------------------------------
// (24/11/2026) Hermes propone cada respuesta en modo sombra (sin enviar) y un
// juez la compara con lo que contestó la tienda. Cuando la tienda lo hizo
// mejor, el juez anota una LECCIÓN ("si preguntan por envío, Caribe Tours").
// Las lecciones parecidas se juntan y cuentan las veces (hermes_lecciones).
//
// Aquí el dueño o un administrador las APRUEBA (entran a las instrucciones de
// Hermes en la próxima respuesta), las corrige o las descarta, y puede
// escribir sus propias reglas. Nada entra sin pasar por aquí.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, RefreshCw, GraduationCap, Check, X, Pencil, Plus, Undo2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const hace = (f) => {
  try { return f ? formatDistanceToNow(new Date(f), { addSuffix: true, locale: es }) : ''; } catch { return ''; }
};

function Caso({ e }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] leading-snug space-y-1">
      <div><span className="font-bold text-slate-500">Cliente:</span> {e.pregunta || '—'}</div>
      <div><span className="font-bold text-violet-600">Hermes habría dicho:</span> {e.hermes || '—'}</div>
      <div><span className="font-bold text-emerald-700">La tienda dijo:</span> {e.tienda || '—'}</div>
    </div>
  );
}

export default function LeccionesHermes({ open, onOpenChange }) {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [filas, setFilas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(null);
  const [editando, setEditando] = useState(null);   // { id, texto }
  const [nueva, setNueva] = useState('');
  const [verCasos, setVerCasos] = useState(null);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    const [l, r] = await Promise.all([
      supabase.from('hermes_lecciones')
        .select('id, texto, estado, origen, veces, ejemplos, creado_en, visto_ultimo')
        .eq('tenant_id', tenantId)
        .order('veces', { ascending: false }).order('visto_ultimo', { ascending: false })
        .limit(200),
      supabase.rpc('hermes_sombra_resumen', { p_dias: 30, p_tenant: tenantId }),
    ]);
    setCargando(false);
    if (l.error) { toast({ variant: 'destructive', title: 'No pude cargar las lecciones', description: l.error.message }); return; }
    setFilas(l.data || []);
    setResumen(r.error ? null : r.data);
  }, [tenantId, toast]);

  useEffect(() => { if (open) cargar(); }, [open, cargar]);

  const grupos = useMemo(() => ({
    pendiente: filas.filter((f) => f.estado === 'pendiente'),
    aprobada: filas.filter((f) => f.estado === 'aprobada'),
    descartada: filas.filter((f) => f.estado === 'descartada'),
  }), [filas]);

  async function decidir(fila, estado, texto = null) {
    setOcupado(fila.id);
    const { error } = await supabase.rpc('hermes_leccion_decidir', { p_id: fila.id, p_estado: estado, p_texto: texto });
    setOcupado(null);
    if (error) { toast({ variant: 'destructive', title: 'No se guardó', description: error.message }); return; }
    setEditando(null);
    toast({ title: estado === 'aprobada' ? 'Aprobada: Hermes la usa desde la próxima respuesta' : estado === 'descartada' ? 'Descartada' : 'Devuelta a pendientes' });
    cargar();
  }

  async function agregar() {
    const texto = nueva.trim();
    if (texto.length < 5) return;
    setOcupado('nueva');
    const { error } = await supabase.rpc('hermes_leccion_agregar', { p_texto: texto });
    setOcupado(null);
    if (error) { toast({ variant: 'destructive', title: 'No se guardó la regla', description: error.message }); return; }
    setNueva('');
    toast({ title: 'Regla agregada: Hermes la usa desde la próxima respuesta' });
    cargar();
  }

  const renderFila = (f) => {
    const enEdicion = editando?.id === f.id;
    const casos = Array.isArray(f.ejemplos) ? f.ejemplos : [];
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        {enEdicion ? (
          <Textarea
            value={editando.texto}
            onChange={(e) => setEditando({ id: f.id, texto: e.target.value })}
            className="text-sm min-h-[60px]"
            maxLength={400}
            autoFocus
          />
        ) : (
          <div className="text-sm font-medium text-slate-900">{f.texto}</div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          {f.origen === 'dueno'
            ? <span className="rounded bg-sky-100 px-1.5 py-0.5 font-bold text-sky-800">La escribiste tú</span>
            : <span className="rounded bg-violet-100 px-1.5 py-0.5 font-bold text-violet-800">El juez la vio {f.veces} {f.veces === 1 ? 'vez' : 'veces'}</span>}
          <span>{hace(f.visto_ultimo)}</span>
          {casos.length > 0 && (
            <button type="button" className="underline hover:text-slate-800" onClick={() => setVerCasos(verCasos === f.id ? null : f.id)}>
              {verCasos === f.id ? 'Ocultar casos' : `Ver ${casos.length === 1 ? 'el caso' : `los ${casos.length} casos`}`}
            </button>
          )}
          <div className="ml-auto flex gap-1">
            {enEdicion ? (
              <>
                <Button size="sm" className="h-7" disabled={ocupado === f.id} onClick={() => decidir(f, 'aprobada', editando.texto)}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Guardar y aprobar
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditando(null)}>Cancelar</Button>
              </>
            ) : f.estado === 'pendiente' ? (
              <>
                <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700" disabled={ocupado === f.id} onClick={() => decidir(f, 'aprobada')}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Aprobar
                </Button>
                <Button size="sm" variant="outline" className="h-7" disabled={ocupado === f.id} onClick={() => setEditando({ id: f.id, texto: f.texto })}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Corregir
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-rose-600" disabled={ocupado === f.id} onClick={() => decidir(f, 'descartada')}>
                  <X className="h-3.5 w-3.5 mr-1" /> Descartar
                </Button>
              </>
            ) : f.estado === 'aprobada' ? (
              <>
                <Button size="sm" variant="outline" className="h-7" disabled={ocupado === f.id} onClick={() => setEditando({ id: f.id, texto: f.texto })}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Corregir
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-rose-600" disabled={ocupado === f.id} onClick={() => decidir(f, 'descartada')}>
                  <X className="h-3.5 w-3.5 mr-1" /> Quitar
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" className="h-7" disabled={ocupado === f.id} onClick={() => decidir(f, 'pendiente')}>
                <Undo2 className="h-3.5 w-3.5 mr-1" /> Devolver
              </Button>
            )}
          </div>
        </div>
        {verCasos === f.id && <div className="space-y-1.5">{casos.map((e, i) => <Caso key={i} e={e} />)}</div>}
      </div>
    );
  };

  const acierto = resumen?.acierto_pct;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-violet-600" /> Lo que aprende Hermes
            <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={cargar} title="Actualizar">
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </DialogTitle>
          <DialogDescription>
            Hermes propone cada respuesta sin enviarla y un juez la compara con la de la tienda. Cuando la tienda lo hizo mejor, sale una lección.
            Solo las que <b>apruebes</b> entran a lo que Hermes sabe.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ['Propuestas (30 días)', resumen?.propuestas ?? '—'],
            ['Comparadas', resumen?.evaluadas ?? '—'],
            ['Acierto', acierto == null ? '—' : `${acierto} %`],
            ['Hermes lo hizo mejor', resumen?.hermes_mejor ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border bg-slate-50 p-2">
              <div className="text-[11px] text-slate-500">{k}</div>
              <div className={`text-lg font-black ${k === 'Acierto' && acierto != null ? (acierto >= 60 ? 'text-emerald-700' : 'text-amber-700') : 'text-slate-900'}`}>{v}</div>
            </div>
          ))}
        </div>
        {acierto != null && (
          <p className="text-[11px] text-slate-500">Meta: 60 % de acierto antes de dejarlo contestar solo.</p>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-black text-slate-800">Por revisar ({grupos.pendiente.length})</h3>
          {grupos.pendiente.length === 0 && (
            <p className="text-xs text-slate-500">Nada nuevo. Las lecciones aparecen aquí cuando el juez compara las propuestas de Hermes con lo que contestó la tienda.</p>
          )}
          {grupos.pendiente.map((f) => <React.Fragment key={f.id}>{renderFila(f)}</React.Fragment>)}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-black text-slate-800">Reglas que Hermes ya usa ({grupos.aprobada.length})</h3>
          {grupos.aprobada.map((f) => <React.Fragment key={f.id}>{renderFila(f)}</React.Fragment>)}
          <div className="flex gap-2 items-start">
            <Textarea
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              placeholder='Escribe una regla tuya. Ej.: "Los envíos al interior van por Caribe Tours y se pagan antes."'
              className="text-sm min-h-[44px]"
              maxLength={400}
            />
            <Button className="shrink-0" disabled={nueva.trim().length < 5 || ocupado === 'nueva'} onClick={agregar}>
              {ocupado === 'nueva' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Agregar
            </Button>
          </div>
        </section>

        {grupos.descartada.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-bold text-slate-500">Descartadas ({grupos.descartada.length})</summary>
            <div className="mt-2 space-y-2">{grupos.descartada.map((f) => <React.Fragment key={f.id}>{renderFila(f)}</React.Fragment>)}</div>
          </details>
        )}
      </DialogContent>
    </Dialog>
  );
}
