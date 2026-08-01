import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Landmark } from 'lucide-react';

// Selector de cuenta bancaria reutilizable (ventas, recibos, cierre, pago
// suplidor). Viene con la cuenta PREDETERMINADA de la empresa ya
// seleccionada, pero se puede cambiar. `value`/`onChange` los controla el
// padre. Si `moneda` se pasa, solo muestra cuentas de esa moneda.
// `inline` pone el rótulo a la izquierda y el selector a la derecha, en una
// sola línea: donde el espacio vertical escasea (cierre de caja) apilarlos
// gastaba un renglón entero.
export default function CuentaBancariaSelect({ value, onChange, onSelect, moneda, label = 'Cuenta bancaria', autoDefault = true, contexto = null, inline = false }) {
  const { tenantId, empresa } = useAuth();
  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Notifica al padre el id y (opcional) la cuenta completa (banco, numero…).
  const emitir = (id, lista = cuentas) => {
    onChange?.(id);
    onSelect?.(lista.find((c) => c.id === id) || null);
  };

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!tenantId) return;
      // get_cuentas_seleccionables trae las propias + las de la financiera
      // vinculada (cuenta compartida). Si no existe aún el RPC, cae al query
      // directo de las propias.
      let data = null;
      const rpc = await supabase.rpc('get_cuentas_seleccionables', { p_moneda: moneda || null });
      if (!rpc.error) {
        data = rpc.data;
      } else {
        const q = await supabase
          .from('cuentas_bancarias')
          .select('id, banco, alias, moneda, numero_cuenta')
          .eq('tenant_id', tenantId).eq('activo', true)
          .order('orden').order('banco');
        data = q.data;
      }
      // Cuentas predeterminadas por módulo (ventas/recibo/cierre_caja/…)
      const { data: defs } = await supabase
        .from('cuentas_bancarias_default')
        .select('modulo, cuenta_id')
        .eq('tenant_id', tenantId);
      if (!vivo) return;
      const mapDef = Object.fromEntries((defs || []).map((d) => [d.modulo, d.cuenta_id]));
      const lista = (data || []).filter((c) => !moneda || c.moneda === moneda);
      setCuentas(lista);
      setCargando(false);
      // Preseleccionar: default del MÓDULO → default general → primera.
      if (autoDefault && !value && lista.length) {
        const defId = (contexto && mapDef[contexto]) || empresa?.cuenta_bancaria_default_id || null;
        const def = lista.find((c) => c.id === defId) || lista[0];
        emitir(def.id, lista);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, moneda, contexto]);

  if (!cargando && cuentas.length === 0) {
    return (
      <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        No hay cuentas bancarias{moneda ? ` en ${moneda}` : ''}. Créalas en el módulo <b>Cuentas Bancarias</b>.
      </div>
    );
  }

  return (
    <div className={inline ? 'flex items-center gap-2 min-w-0' : ''}>
      {label && (
        <Label className={`flex items-center gap-1 text-xs ${inline ? 'shrink-0' : ''}`}>
          <Landmark className="w-3.5 h-3.5 shrink-0" />{label}
        </Label>
      )}
      <Select value={value || ''} onValueChange={(id) => emitir(id)}>
        <SelectTrigger className={inline ? 'h-8 text-xs min-w-0 flex-1' : ''}><SelectValue placeholder="Seleccionar cuenta…" /></SelectTrigger>
        <SelectContent>
          {cuentas.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.banco}{c.alias ? ` — ${c.alias}` : ''} ({c.moneda}{c.numero_cuenta ? ` ···${String(c.numero_cuenta).slice(-4)}` : ''})
              {c.id === empresa?.cuenta_bancaria_default_id ? ' ⭐' : ''}
              {c.externa ? ` · compartida (${c.empresa})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
