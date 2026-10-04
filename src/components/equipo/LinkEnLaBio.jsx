import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Copy, ExternalLink, Link2 } from 'lucide-react';

// TU LINK EN LA BIO — la página pública de promociones (public/promos.html).
//
// (04/10/2026) Un enlace por red: la red decide la letra del código de
// descuento (T/I/F/Y) y se anota en cada visita y en cada toque a WhatsApp
// (sql/promos_link_en_bio.sql). Aquí se copian y se ve quién trae gente.

const BASE = 'https://repuestos-morla.pages.dev/promos';
const REDES = [
  { red: 'instagram', nombre: 'Instagram', donde: 'Editar perfil → Enlaces' },
  { red: 'tiktok', nombre: 'TikTok', donde: 'Editar perfil → Sitio web' },
  { red: 'facebook', nombre: 'Facebook', donde: 'Información de la página → Sitio web' },
  { red: 'youtube', nombre: 'YouTube', donde: 'Personalizar canal → Vínculos' },
];

export function LinkEnLaBio() {
  const { toast } = useToast();
  const [clics, setClics] = useState({});

  useEffect(() => {
    supabase.rpc('equipo_promos_clics', { p_dias: 7 }).then(({ data, error }) => {
      if (!error && data) setClics(data);
    });
  }, []);

  const copiar = async (url, nombre) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: `Enlace de ${nombre} copiado`, description: url });
    } catch {
      toast({ title: `Enlace de ${nombre}`, description: url });
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Link2 className="h-4 w-4 text-emerald-600" />
          Tu link en la bio
        </span>
        <p className="flex-1 text-[11px] text-slate-500">
          Una página con tus promociones de la semana (lo publicado y con existencia): foto, precio, código y un botón de
          WhatsApp con el mensaje ya escrito. Pon en cada red SU enlace: así se sabe de dónde viene cada cliente.
        </p>
        <a href={`${BASE}?red=instagram`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline">
          Ver la página <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {REDES.map((r) => {
          const url = `${BASE}?red=${r.red}`;
          const c = clics[r.red] || {};
          return (
            <div key={r.red} className="flex items-center gap-2 rounded border border-slate-100 p-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-slate-800">{r.nombre}</p>
                <p className="truncate font-mono text-[10px] text-slate-500">{url}</p>
                <p className="text-[10px] text-slate-400">{r.donde}</p>
              </div>
              <span className="text-right text-[10px] text-slate-500" title="Últimos 7 días">
                {Number(c.visitas || 0)} visitas<br />
                <b className="text-emerald-700">{Number(c.whatsapp || 0)} a WhatsApp</b>
              </span>
              <button type="button" onClick={() => copiar(url, r.nombre)} title="Copiar enlace"
                className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
