// =====================================================================
// Botón "Instalar en Android" (19/11/2026) — login e Inicio
// ---------------------------------------------------------------------
// La app está en PRUEBA CERRADA en Google Play: para publicarla Google exige
// 12 testers durante 14 días. Camino A (todo automático):
//   1. La persona deja su Gmail (RPC registrar_tester_android).
//   2. La función android-tester lo mete al grupo de Google que es tester de
//      la pista cerrada (Cloud Identity) y le manda el enlace por correo.
//   3. Ella acepta la prueba e instala. Si falta configuración, queda
//      pendiente y le llega el correo cuando se habilite.
// Ver sql/android_testers*.sql y scripts/play-testers.mjs.
// =====================================================================
import React, { useState } from 'react';
import { Loader2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ENLACE_GRUPO, ENLACE_PRUEBA, ENLACE_TIENDA } from '../../../supabase/functions/_shared/androidTesters.mjs';
const META_TESTERS = 12;
const CLAVE_LOCAL = 'motoflow_tester_android';

const leerLocal = () => { try { return localStorage.getItem(CLAVE_LOCAL) || ''; } catch { return ''; } };
const guardarLocal = (v) => { try { localStorage.setItem(CLAVE_LOCAL, v); } catch { /* sin almacenamiento */ } };

const IconoAndroid = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
    <path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22A11.4 11.4 0 0 0 12 8.1c-1.75 0-3.4.38-4.92 1.04L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
  </svg>
);

const Paso = ({ n, titulo, texto, href, boton }) => (
  <div className="flex gap-3 rounded-lg border border-gray-200 p-3">
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{n}</div>
    <div className="min-w-0 flex-1">
      <div className="text-sm font-bold text-gray-800">{titulo}</div>
      <div className="text-xs text-gray-500">{texto}</div>
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-black">
        {boton} <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  </div>
);

export default function InstalarAndroid({ origen = 'login', className = '' }) {
  const [abierto, setAbierto] = useState(false);
  const [email, setEmail] = useState(leerLocal);
  const [registrado, setRegistrado] = useState(() => !!leerLocal());
  const [estado, setEstado] = useState(null);   // {en_grupo, correo_enviado, pendiente} de android-tester
  const [total, setTotal] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const registrar = async (e) => {
    e?.preventDefault();
    if (enviando) return;
    setEnviando(true); setError('');
    const { data, error: err } = await supabase.rpc('registrar_tester_android', { p_email: email.trim(), p_origen: origen });
    setEnviando(false);
    if (err || !data?.ok) { setError(data?.error || 'No se pudo guardar. Intenta otra vez.'); return; }
    guardarLocal(email.trim().toLowerCase());
    setTotal(data.total);
    setRegistrado(true);
    await procesar(email.trim().toLowerCase());
  };

  // Grupo de testers + correo con el enlace (en el servidor). Si la función
  // no responde, el correo ya quedó anotado: se trata como pendiente.
  const procesar = async (correo) => {
    setEnviando(true);
    const { data } = await supabase.functions.invoke('android-tester', { body: { email: correo } }).catch(() => ({ data: null }));
    setEnviando(false);
    setEstado(data?.ok ? data : { pendiente: true });
  };

  const abrir = () => {
    setAbierto(true);
    const guardado = leerLocal();
    if (guardado && !estado) procesar(guardado);
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className={`inline-flex items-center gap-2 rounded-lg bg-black px-3 py-1.5 text-left text-white shadow-sm hover:bg-gray-800 ${className}`}
        title="Instalar MotoFlow en Android"
      >
        <IconoAndroid className="h-5 w-5 text-[#3DDC84]" />
        <span className="leading-none">
          <span className="block text-[9px] font-medium opacity-80">Instalar en</span>
          <span className="block text-sm font-bold">Android</span>
        </span>
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><IconoAndroid className="h-5 w-5 text-[#3DDC84]" /> MotoFlow para Android</DialogTitle>
            <DialogDescription>
              La app está en prueba en Google Play. Únete como tester: es gratis y la instalas desde la Play Store como cualquier app.
            </DialogDescription>
          </DialogHeader>

          {!registrado ? (
            <form onSubmit={registrar} className="space-y-3">
              <label className="block text-xs font-bold text-gray-700">
                Tu correo de Google (el que usas en la Play Store)
                <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="tunombre@gmail.com" className="mt-1" />
              </label>
              {error && <div className="text-xs text-red-600">{error}</div>}
              <Button type="submit" disabled={enviando || !email.trim()} className="w-full bg-emerald-600 font-bold hover:bg-emerald-700">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continuar'}
              </Button>
            </form>
          ) : (
            <div className="space-y-2">
              {enviando || !estado ? (
                <div className="flex items-center gap-2 py-4 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Preparando tu acceso…</div>
              ) : (
                <>
                  <div className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {estado.correo_enviado
                        ? <>¡Anotado! Te enviamos los pasos a <b>{email}</b> (mira también en spam).</>
                        : <>¡Anotado con <b>{email}</b>!</>}
                      {total ? ` Ya van ${total} de ${META_TESTERS} testers.` : ''} Hazlo desde aquí con esa misma cuenta de Google:
                    </span>
                  </div>
                  <Paso n={1} titulo="Únete al grupo de testers" texto='Pulsa "Unirse al grupo". Es lo que te da acceso a la prueba.'
                    href={ENLACE_GRUPO} boton="Unirme al grupo" />
                  <Paso n={2} titulo="Acepta la prueba" texto='Pulsa "Convertirse en tester". Si dice que no tienes acceso, espera unos minutos.'
                    href={ENLACE_PRUEBA} boton="Aceptar la prueba" />
                  <Paso n={3} titulo="Instala MotoFlow" texto="Déjala instalada al menos 14 días y ábrela de vez en cuando: así nos ayudas a publicarla."
                    href={ENLACE_TIENDA} boton="Ir a la Play Store" />
                </>
              )}
              <button type="button" className="text-[11px] text-gray-400 underline" onClick={() => { setRegistrado(false); setTotal(null); setEstado(null); }}>
                Usar otro correo
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
