import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { ClipboardList, ChevronRight } from 'lucide-react';

export default function AprobacionesPendientesAlert() {
  const { tenantId } = useAuth();
  const { openPanel } = usePanels();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    let cancel = false;
    const fetch = async () => {
      try {
        const { count: c } = await supabase
          .from('compras_aprobaciones')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('estado', 'pendiente');
        if (!cancel) setCount(c || 0);
      } catch (_) {
        if (!cancel) setCount(0);
      }
    };
    fetch();
    return () => { cancel = true; };
  }, [tenantId]);

  if (count === 0) return null;

  return (
    <motion.button
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      onClick={() => openPanel('aprobaciones-compras')}
      className="w-full flex items-center gap-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-4 py-3 rounded-lg shadow-md transition-all"
    >
      <div className="p-2 bg-white/20 rounded-md">
        <ClipboardList className="w-5 h-5" />
      </div>
      <div className="flex-1 text-left">
        <p className="text-xs uppercase font-bold tracking-wide opacity-90">Aprobaciones de compras</p>
        <p className="text-sm font-black">
          {count} orden{count !== 1 ? 'es' : ''} pendiente{count !== 1 ? 's' : ''} de tu autorización
        </p>
      </div>
      <ChevronRight className="w-5 h-5" />
    </motion.button>
  );
}
