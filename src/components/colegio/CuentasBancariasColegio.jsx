// =====================================================================
// Cuentas bancarias del colegio (24/11/2026)
// ---------------------------------------------------------------------
// Promesa al colegio: cobrar por transferencia. La Caja del Colegio ya
// acepta "Transferencia" y pregunta a qué cuenta entró; aquí el colegio
// registra esas cuentas. En EDUCA INICIAL hasta 2 activas (lo valida la
// base: sql/colegio_cuentas_bancarias.sql); el módulo completo de
// Cuentas y Saldos queda para Educa Pro/Total.
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Landmark, Loader2, Plus, Save, Ban, CheckCircle2, Pencil } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';

const campo = 'h-9 w-full rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const BANCOS = ['Banco Popular', 'Banreservas', 'Banco BHD', 'Scotiabank', 'Banco Santa Cruz', 'APAP', 'Asociación Cibao',
  'Banco Promerica', 'Banesco', 'Banco Caribe', 'Banco BDI', 'Banco Lafise', 'Banco Vimenca', 'Banco Ademi', 'Asociación La Nacional'];
const VACIA = { banco: '', numero_cuenta: '', tipo: 'corriente', moneda: 'DOP', alias: '' };

// Solo PESOS: la Caja cobra en RD$ y lo registra en la cuenta escogida; una
// cuenta en US$ recibiría RD$ contados como dólares. Solo la dirección cambia.
export default function CuentasBancariasColegio({ error, toast, esDireccion = false }) {
  const { tenantId } = useAuth();
  const [cuentas, setCuentas] = useState([]);
  const [limite, setLimite] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(null);   // { id?, banco, numero_cuenta, tipo, moneda, alias }

  const cargar = useCallback(async () => {
    if (!tenantId) { setCargando(false); return; }
    setCargando(true);
    const [c, l] = await Promise.all([
      supabase.from('cuentas_bancarias').select('id, banco, numero_cuenta, tipo, moneda, alias, activo')
        .eq('tenant_id', tenantId).eq('moneda', 'DOP').order('activo', { ascending: false }).order('orden').order('created_at'),
      supabase.rpc('_limite_cuentas_bancarias', { p_tenant: tenantId }),
    ]);
    setCargando(false);
    if (c.error) { error('No pude cargar las cuentas', c.error); return; }
    setCuentas(c.data || []);
    setLimite(l.error ? null : l.data);
  }, [tenantId, error]);

  useEffect(() => { cargar(); }, [cargar]);

  const activas = cuentas.filter((c) => c.activo !== false).length;
  const llegoAlLimite = limite != null && activas >= limite;

  async function guardar() {
    const banco = form.banco.trim();
    const numero = form.numero_cuenta.trim();
    if (!banco || !numero) { error('Faltan datos', 'Escribe el banco y el número de cuenta.'); return; }
    const datos = {
      banco, numero_cuenta: numero, tipo: form.tipo, moneda: 'DOP',
      alias: form.alias.trim() || null,
    };
    setGuardando(true);
    const q = form.id
      ? supabase.from('cuentas_bancarias').update(datos).eq('id', form.id).select('id')
      : supabase.from('cuentas_bancarias').insert({ ...datos, tenant_id: tenantId }).select('id');
    const { data, error: e } = await q;
    setGuardando(false);
    if (e || !data?.length) { error('No se guardó la cuenta', e || 'No tienes permiso para cambiarla.'); return; }
    toast({ title: form.id ? 'Cuenta actualizada' : 'Cuenta agregada', description: 'Ya aparece en la Caja del Colegio al cobrar por transferencia.' });
    setForm(null);
    cargar();
  }

  async function cambiarActiva(c, activo) {
    setGuardando(true);
    const { data, error: e } = await supabase.from('cuentas_bancarias').update({ activo }).eq('id', c.id).select('id');
    setGuardando(false);
    if (e || !data?.length) { error(activo ? 'No se pudo activar' : 'No se pudo desactivar', e || 'No tienes permiso.'); return; }
    cargar();
  }

  if (cargando) return <div className="py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-black text-gray-800 flex items-center gap-2"><Landmark className="w-5 h-5 text-blue-700" /> Cuentas bancarias</h2>
        <p className="text-xs text-gray-500 mt-1">
          Las cuentas donde los padres pueden transferir. Al cobrar en la Caja del Colegio con <b>Transferencia</b>, <b>Tarjeta</b> o <b>Cheque</b>,
          escoges a cuál de estas entró el dinero.
          {limite != null && <> Tu plan permite hasta <b>{limite}</b> cuentas activas ({activas} de {limite}).</>}
        </p>
      </div>

      {cuentas.length === 0 && !form && (
        <div className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500 text-center">
          Todavía no hay cuentas. Agrega la primera para poder cobrar por transferencia.
        </div>
      )}

      <div className="space-y-2">
        {cuentas.map((c) => (
          <div key={c.id} className={`flex flex-wrap items-center gap-3 rounded-md border p-3 ${c.activo === false ? 'bg-gray-50 border-gray-200 opacity-70' : 'border-gray-200'}`}>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-gray-800">{c.banco}{c.alias ? <span className="font-normal text-gray-500"> · {c.alias}</span> : null}</div>
              <div className="text-xs text-gray-500">
                {c.tipo === 'ahorro' ? 'Ahorro' : 'Corriente'} · Pesos · No. {c.numero_cuenta || '—'}
                {c.activo === false && <span className="ml-2 font-semibold text-gray-500">(desactivada)</span>}
              </div>
            </div>
            {esDireccion && <>
            <Button size="sm" variant="outline" disabled={guardando}
              onClick={() => setForm({ id: c.id, banco: c.banco || '', numero_cuenta: c.numero_cuenta || '', tipo: c.tipo || 'corriente', moneda: c.moneda || 'DOP', alias: c.alias || '' })}>
              <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
            </Button>
            {c.activo === false ? (
              <Button size="sm" variant="ghost" disabled={guardando || llegoAlLimite} onClick={() => cambiarActiva(c, true)}
                title={llegoAlLimite ? 'Desactiva otra cuenta primero' : ''}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Activar
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="text-red-600" disabled={guardando} onClick={() => cambiarActiva(c, false)}>
                <Ban className="w-3.5 h-3.5 mr-1" /> Desactivar
              </Button>
            )}
            </>}
          </div>
        ))}
      </div>

      {form ? (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-gray-600">Banco
              <input list="bancos-rd" className={campo} value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} placeholder="Banco Popular" autoFocus />
              <datalist id="bancos-rd">{BANCOS.map((b) => <option key={b} value={b} />)}</datalist>
            </label>
            <label className="text-xs font-semibold text-gray-600">Número de cuenta
              <input className={campo} value={form.numero_cuenta} onChange={(e) => setForm({ ...form, numero_cuenta: e.target.value })} placeholder="000-000000-0" inputMode="numeric" />
            </label>
            <label className="text-xs font-semibold text-gray-600">Tipo
              <select className={campo} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="corriente">Corriente</option>
                <option value="ahorro">Ahorro</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600 sm:col-span-2">Nombre corto (opcional)
              <input className={campo} value={form.alias} onChange={(e) => setForm({ ...form, alias: e.target.value })} placeholder="Ej.: Cuenta de mensualidades" />
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setForm(null)} disabled={guardando}>Cancelar</Button>
            <Button size="sm" onClick={guardar} disabled={guardando}>
              {guardando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Guardar
            </Button>
          </div>
        </div>
      ) : esDireccion ? (
        <Button size="sm" onClick={() => setForm({ ...VACIA })} disabled={llegoAlLimite}
          title={llegoAlLimite ? `Tu plan permite hasta ${limite} cuentas activas` : ''}>
          <Plus className="w-4 h-4 mr-1" /> Agregar cuenta
        </Button>
      ) : (
        <p className="text-xs text-gray-500">Solo la dirección del colegio puede agregar o cambiar las cuentas.</p>
      )}
      {esDireccion && llegoAlLimite && !form && (
        <p className="text-xs text-amber-700">Llegaste al máximo de tu plan. Para agregar otra, desactiva una de las de arriba.</p>
      )}
    </div>
  );
}
