-- =====================================================================
-- Jarvis: el asistente del SISTEMA, no de una empresa
-- ---------------------------------------------------------------------
-- (2026-08-09) Con Hermes apagado, el asistente de respaldo contestaba
-- diciendo "Soy Hermes, parte del equipo de Repuestos Morla". No lo era:
-- cargaba la persona de agentes_ia, que es la ranura del agente DE LA
-- EMPRESA. Un suplente usando el nombre del titular.
--
-- La separación ya estaba dicha y el respaldo la rompía:
--   Hermes  -> es de Repuestos Morla. Vive en la PC de la tienda, tiene la
--              memoria de Telegram, y su dueño edita su personalidad.
--   Jarvis  -> es de MotoFlow. Está en todas las empresas por igual, no
--              tiene memoria de nadie, y conoce el SISTEMA.
--
-- >>> POR QUÉ UNA TABLA APARTE Y NO UNA FILA EN agentes_ia <<<
-- Porque agentes_ia.tenant_id apunta a config_empresa: cada fila ES de una
-- empresa. Meter ahí a Jarvis exigiría inventarle una empresa falsa, y
-- entonces aparecería en la pantalla donde el dueño edita SU agente. La
-- mezcla de hoy nació justo de eso.
--
-- >>> POR QUÉ TABLA Y NO CONSTANTE EN EL CÓDIGO <<<
-- Porque hay que entrenarlo. Afinar cómo habla no puede exigir un
-- despliegue: se cambia aquí y en la siguiente pregunta ya contesta
-- distinto. Las reglas duras siguen en el código de la Edge Function.
--
-- Idempotente / re-ejecutable. NO pisa la persona si ya se editó.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.agente_sistema (
  -- Una sola fila, para siempre. El CHECK es lo que lo garantiza: sin él,
  -- un INSERT de más crearía un segundo Jarvis y nadie sabría cuál contesta.
  id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nombre         text NOT NULL DEFAULT 'Jarvis',
  puesto         text,
  persona        text NOT NULL,
  saludo         text,
  voz_id         text,
  activo         boolean NOT NULL DEFAULT true,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agente_sistema ENABLE ROW LEVEL SECURITY;

-- Lo lee todo el mundo: es el mismo para todas las empresas y no contiene
-- un solo dato de negocio. Escribirlo es otra cosa — cambia lo que Jarvis
-- le dice a TODOS los clientes de MotoFlow, así que solo el super-admin.
DROP POLICY IF EXISTS agente_sistema_lectura ON public.agente_sistema;
CREATE POLICY agente_sistema_lectura ON public.agente_sistema
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS agente_sistema_escritura ON public.agente_sistema;
CREATE POLICY agente_sistema_escritura ON public.agente_sistema
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND p.is_superadmin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.is_superadmin = true));

GRANT SELECT ON public.agente_sistema TO authenticated;
GRANT INSERT, UPDATE ON public.agente_sistema TO authenticated;

-- ------------------------------------------------------------
-- QUIÉN ES
-- ------------------------------------------------------------
-- ON CONFLICT DO NOTHING a propósito: re-ejecutar este archivo después de
-- meses de afinarlo no puede borrar el trabajo de entrenamiento.
INSERT INTO public.agente_sistema (id, nombre, puesto, persona, saludo)
VALUES (
  1,
  'Jarvis',
  'asistente del sistema MotoFlow',
$persona$Eres Jarvis, el asistente de MotoFlow — el sistema, no la empresa que lo usa.

QUIÉN ERES
Conoces MotoFlow por dentro: qué hace cada módulo, dónde está cada cosa y
cómo se hacen las tareas. No eres el agente de esta empresa ni tienes su
memoria; eres el que sabe usar el programa.

Si te preguntan quién eres, dilo así de claro. Y si la empresa tiene su
propio agente y está caído, no finjas ser él: eres el asistente del sistema.

PARA QUÉ TE BUSCAN
Casi siempre porque no saben hacer algo. Alguien con un cliente delante que
no encuentra dónde se registra un abono, o cómo se anula una factura. Esa es
tu razón de existir.

CÓMO CONTESTAS
Primero el paso, después la explicación — si es que hace falta. Quien
pregunta está trabajando, no estudiando.

Cuando la respuesta está en una pantalla del sistema, ofrécete a abrirla en
la misma frase: "Eso se hace en Recibo de Ingreso, ¿te lo abro?". No lo abras
sin preguntar: puede estar en medio de una factura sin grabar.

Dos o tres líneas. Sin saludos largos ni "con gusto le ayudo".

LO QUE NO HACES
No inventas pasos. Si no sabes cómo se hace algo en MotoFlow, dilo y ofrece
abrir el módulo donde debería estar. Un paso inventado hace perder más tiempo
que un "no sé": la persona lo intenta, no le sale, y encima duda de si lo
hizo mal.

No hablas de datos de otra empresa. Nunca.$persona$,
  'Jarvis en línea. ¿Qué necesitas hacer?'
)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- CÓMO SE PIDE
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_agente_sistema()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT to_json(a) FROM (
    SELECT nombre, puesto, persona, saludo, voz_id
    FROM public.agente_sistema
    WHERE id = 1 AND activo = true
  ) a;
$$;

REVOKE EXECUTE ON FUNCTION public.get_agente_sistema() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_agente_sistema() TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('jarvis_agente_sistema.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT public.get_agente_sistema();

-- Para entrenarlo (super-admin), se edita la persona y ya:
-- UPDATE public.agente_sistema
-- SET persona = '...', actualizado_en = now()
-- WHERE id = 1;
