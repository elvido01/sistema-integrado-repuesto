import { supabase } from '@/lib/customSupabaseClient';

const SESION_VENCIDA =
    'Tu sesión se venció. Cierra sesión y vuelve a entrar para hacer este cambio.';

/**
 * Llama a un Edge Function CON la sesión del usuario, o falla diciendo por qué.
 *
 * Por qué existe: cuando la sesión del navegador ya no sirve, supabase-js NO
 * avisa — manda la anon key en el lugar del token del usuario
 * (`lib/fetch.js`: `const accessToken = (await getAccessToken()) ?? supabaseKey`).
 * La anon key es un JWT válido, así que pasa el filtro de la puerta de entrada
 * y muere adentro de la función, que responde un "Unauthorized" seco. En
 * pantalla eso parece falta de permisos — "este admin no puede cambiar claves" —
 * cuando lo único que pasó es que la sesión se venció y hay que volver a entrar.
 *
 * Aquí se pide la sesión primero (getSession renueva sola si el token expiró y
 * el refresh todavía sirve). Si no hay, se corta antes de llamar y se dice lo
 * que hay que hacer.
 */
export async function invocarConSesion(nombreFuncion, body) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error(SESION_VENCIDA);

    const { data, error } = await supabase.functions.invoke(nombreFuncion, {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!error) return data;

    // error.context es la Response HTTP: el cuerpo trae el mensaje real del
    // servidor (ej. "usuario ya ocupado"), no el genérico de supabase-js.
    let mensaje = error.message;
    try {
        const cuerpo = await error.context?.json?.();
        mensaje = cuerpo?.error || cuerpo?.message || mensaje;
    } catch { /* cuerpo no-JSON: se queda el mensaje genérico */ }

    if (/unauthorized|invalid jwt|jwt expired|token de sesión/i.test(mensaje || '')) {
        throw new Error(SESION_VENCIDA);
    }
    throw new Error(mensaje);
}
