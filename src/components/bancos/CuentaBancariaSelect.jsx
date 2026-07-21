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
export default function CuentaBancariaSelect({ value, onChange, onSelect, moneda, label = 'Cuenta bancaria', autoDefault = true, contexto = null }) {
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
      const { data } = await supabase
        .from('cuentas_bancarias')
        .select('id, banco, alias, moneda, numero_cuenta')
        .eq('tenant_id', tenantId).eq('activo', true)
        .order('orden').order('banco');
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
    <div>
      {label && <Label className="flex items-center gap-1 text-xs"><Landmark className="w-3.5 h-3.5" />{label}</Label>}
      <Select value={value || ''} onValueChange={(id) => emitir(id)}>
        <SelectTrigger><SelectValue placeholder="Seleccionar cuenta…" /></SelectTrigger>
        <SelectContent>
          {cuentas.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.banco}{c.alias ? ` — ${c.alias}` : ''} ({c.moneda}{c.numero_cuenta ? ` ···${String(c.numero_cuenta).slice(-4)}` : ''})
              {c.id === empresa?.cuenta_bancaria_default_id ? ' ⭐' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
