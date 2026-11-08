// =====================================================================
// Empresa hermana (08/11/2026)
// ---------------------------------------------------------------------
// El admin/dueño crea, desde Perfil Empresa, otra empresa que comparte su
// INVENTARIO (productos, precios, existencia) y sus CLIENTES. La base hace
// todo (sql/empresa_hermana.sql → crear_empresa_hermana): una sola por
// empresa; la nueva sale sin RNC ni datos, en prueba, y solo con quien la
// creó. Cada una factura, cobra, cierra caja y declara lo suyo.
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Copy, ArrowRightLeft } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function EmpresaHermana() {
  const { profile, isSuperAdmin, tenantId } = useAuth();
  const { toast } = useToast();
  const puede = isSuperAdmin || ['admin', 'owner'].includes(profile?.role);
  const [estado, setEstado] = useState(null);      // { inventario, clientes, nombre } | null
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [conInventario, setConInventario] = useState(true);
  const [conClientes, setConClientes] = useState(true);
  const [conUsuarios, setConUsuarios] = useState(false);
  const [creando, setCreando] = useState(false);
  const [creada, setCreada] = useState(null);       // respuesta de crear_empresa_hermana
  const [abriendo, setAbriendo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase.rpc('get_empresa_hermana');
    setEstado(data || null);
    setCargando(false);
  }, []);
  useEffect(() => { if (puede && tenantId) cargar(); }, [puede, tenantId, cargar]);

  if (!puede) return null;

  const crear = async () => {
    const n = nombre.trim();
    if (!n) return toast({ title: 'Falta el nombre', description: 'Escribe cómo se llamará la empresa nueva.', variant: 'destructive' });
    if (!conInventario && !conClientes) return toast({ title: 'Marca qué va a compartir', description: 'Inventario, clientes o los dos.', variant: 'destructive' });
    const que = conInventario && conClientes ? 'los MISMOS productos, existencia y clientes'
      : conInventario ? 'los MISMOS productos y existencia (los clientes NO)' : 'los MISMOS clientes (el inventario NO)';
    if (!window.confirm(
      `Se creará "${n}" con ${que} de esta empresa.\n\n`
      + (conInventario ? 'Lo que se venda o entre en una baja o sube en la otra.\n' : '')
      + (conClientes ? 'Los clientes nuevos o editados aparecen en las dos.\n' : '')
      + (conUsuarios ? 'Los usuarios de esta empresa también podrán entrar a la nueva (con sus mismos permisos).\n'
        : 'Solo tú podrás entrar a la nueva; a los demás los agregas después.\n')
      + 'Cada empresa factura, cobra, cierra caja y declara lo suyo.\n\n'
      + 'Solo se puede crear una empresa hermana. ¿Continuar?',
    )) return;
    setCreando(true);
    const { data, error } = await supabase.rpc('crear_empresa_hermana', { p_nombre: n, p_inventario: conInventario, p_clientes: conClientes, p_usuarios: conUsuarios });
    setCreando(false);
    if (error) return toast({ title: 'No se pudo crear', description: error.message, variant: 'destructive' });
    setCreada(data);
    setNombre('');
    toast({
      title: `Empresa "${data.nombre}" creada`,
      description: `${[conInventario && `${data.productos} productos`, conClientes && `${data.clientes} clientes`].filter(Boolean).join(' y ')} compartidos.`,
    });
    window.dispatchEvent(new CustomEvent('mf:empresas-cambiaron'));   // el selector del menú la muestra
    cargar();
  };

  const abrir = async () => {
    setAbriendo(true);
    const { error } = await supabase.rpc('cambiar_empresa_activa', { p_tenant: creada.id });
    if (error) { setAbriendo(false); toast({ title: 'No se pudo abrir', description: error.message, variant: 'destructive' }); return; }
    window.location.reload();   // lo pide la persona con el botón (todo el estado es de la otra empresa)
  };

  const comparte = estado && (estado.inventario || estado.clientes);

  return (
    <div className="border-t border-gray-200 pt-5">
      <h3 className="text-sm font-black text-gray-700 uppercase mb-1 flex items-center gap-2">
        <ArrowRightLeft className="w-4 h-4" /> Empresa hermana (inventario y clientes compartidos)
      </h3>
      {cargando ? (
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      ) : comparte ? (
        <div className="text-sm text-gray-700 space-y-2">
          <p>
            Esta empresa comparte {estado.inventario ? 'inventario' : ''}{estado.inventario && estado.clientes ? ' y ' : ''}{estado.clientes ? 'clientes' : ''} con{' '}
            <b>{estado.nombre || 'otra empresa'}</b>. Lo que se vende o entra en una se refleja en la otra; cada una factura y cierra caja por separado.
          </p>
          {creada && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 space-y-2">
              <p>
                Lista: <b>{creada.nombre}</b>, en prueba hasta el {new Date(creada.prueba_hasta).toLocaleDateString('es-DO')}. Ábrela y llena su RNC,
                dirección, teléfono y logo aquí mismo (Perfil Empresa).{' '}
                {creada.usuarios > 1
                  ? `Pueden entrar ${creada.usuarios} usuarios (los de esta empresa, con sus mismos permisos).`
                  : 'Solo tú puedes entrar: a los demás los agregas en Usuarios y Permisos de esa empresa.'}
              </p>
              <Button size="sm" onClick={abrir} disabled={abriendo} className="h-8">
                {abriendo ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ArrowRightLeft className="w-4 h-4 mr-1" />} Abrir {creada.nombre}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-[11px] text-gray-500 italic mb-3">
            Crea otra empresa que venda del MISMO inventario, con los MISMOS clientes, o las dos cosas (por ejemplo, una segunda razón social).
            Sale sin RNC ni datos: los pones tú después. Cada una factura, cobra, cierra caja y declara lo suyo. Solo se puede una.
          </p>
          <div className="flex flex-wrap items-center gap-4 mb-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={conInventario} onChange={(e) => setConInventario(e.target.checked)} />
              Compartir almacén / inventario (productos, precios y existencia)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={conClientes} onChange={(e) => setConClientes(e.target.checked)} />
              Compartir clientes
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={conUsuarios} onChange={(e) => setConUsuarios(e.target.checked)} />
              Dar acceso a los usuarios de esta empresa
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-9 max-w-sm" placeholder="Nombre de la empresa nueva" value={nombre}
              onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && crear()} />
            <Button onClick={crear} disabled={creando || !nombre.trim() || (!conInventario && !conClientes)} variant="outline"
              className="h-9 px-4 border-blue-600 text-blue-700 hover:bg-blue-50 font-bold text-xs uppercase flex items-center gap-2">
              {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
              {creando ? 'Creando…' : 'Crear empresa hermana'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
