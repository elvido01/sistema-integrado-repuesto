-- =====================================================================
-- Un agente por empresa — Hermes es el de Repuestos Morla, no el del sistema
-- ---------------------------------------------------------------------
-- (2026-08-08) "mi Hermes solo es para Repuestos Morla, pero en el futuro
-- cada empresa puede agregar su agente para que trabaje en su empresa como
-- un empleado más."
--
-- Por eso el agente NO se cablea en el código. Cada empresa define el suyo:
-- su nombre, su personalidad, sus reglas. Caminero Motors tendrá el suyo,
-- MotoPréstamos el suyo, y ninguno sabrá de la existencia del otro.
--
-- >>> POR QUÉ UNA TABLA Y NO UNA CONSTANTE <<<
-- Hoy hay un solo agente y sería más rápido escribir su prompt dentro de la
-- Edge Function. Pero entonces agregar el agente de Caminero exigiría tocar
-- código y desplegar, y el dueño de Caminero no puede hacer eso. Así lo
-- cambia desde la pantalla, como cambia el logo o los precios.
--
-- >>> LO QUE NO CAMBIA POR EMPRESA <<<
-- Las reglas duras — no inventar precios, no tocar otro tenant, consultar
-- antes de afirmar — van en el código, no aquí. Un dueño puede darle
-- personalidad a su agente; no puede darle permiso para mentir.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.agentes_ia (
  tenant_id     uuid PRIMARY KEY REFERENCES public.config_empresa(tenant_id) ON DELETE CASCADE,
  nombre        text NOT NULL,                   -- "Hermes"
  puesto        text,                            -- "asistente de la tienda"
  persona       text NOT NULL,                   -- cómo habla y qué le importa
  saludo        text,                            -- lo que dice al encenderse
  voz_id        text,                            -- para ElevenLabs, cuando toque
  activo        boolean NOT NULL DEFAULT true,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agentes_ia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agentes_ia_propios ON public.agentes_ia;
CREATE POLICY agentes_ia_propios ON public.agentes_ia
  FOR ALL USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- ------------------------------------------------------------
-- EL AGENTE DE QUIEN PREGUNTA
-- ------------------------------------------------------------
-- Devuelve NULL si la empresa no tiene agente: entonces no se muestra el
-- botón. Mejor sin asistente que con uno genérico que no conoce el negocio.
CREATE OR REPLACE FUNCTION public.get_agente_ia()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  SELECT json_build_object(
           'nombre', a.nombre, 'puesto', a.puesto,
           'persona', a.persona, 'saludo', a.saludo, 'voz_id', a.voz_id,
           'empresa', e.nombre)
    INTO v_out
  FROM public.agentes_ia a
  JOIN public.config_empresa e ON e.tenant_id = a.tenant_id
  WHERE a.tenant_id = v_tenant AND a.activo = true;

  RETURN v_out;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_agente_ia() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_agente_ia() TO authenticated;

-- ------------------------------------------------------------
-- HERMES, DE REPUESTOS MORLA
-- ------------------------------------------------------------
-- Su personalidad sale de docs/HERMES_INSTRUCCIONES_TELEGRAM.md, para que el
-- de adentro del sistema y el de Telegram sean el mismo, no dos primos que
-- se contradicen.
INSERT INTO public.agentes_ia (tenant_id, nombre, puesto, persona, saludo)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Hermes',
  'asistente de Repuestos Morla',
  $persona$Eres Hermes, el asistente de Repuestos Morla — tienda de repuestos de
motocicletas en Higüey, República Dominicana. No eres "una IA": eres parte
del equipo, como un empleado que conoce la tienda.

CÓMO HABLAS
- Español dominicano, directo y corto. Sin rodeos ni frases de manual.
- Nada de "como asistente virtual", "estoy aquí para ayudarte" ni disculpas
  largas. Si algo no se puede, lo dices en una línea y ofreces la salida.
- Tratas de usted al dueño, pero sin ceremonia. Cercano, no servil.
- Respuestas de dos o tres líneas. Si hace falta más, lo dices por partes.

QUÉ TE IMPORTA
- Que no se pierda una venta por no contestar a tiempo.
- Que nadie se lleve una pieza a un precio que no cubre el costo.
- Que el cuadre del día cierre y, si no cierra, encontrar por qué.
- Las piezas que llegaron y todavía no se le avisó al cliente.

CÓMO TRABAJAS
- Cuando te preguntan por una pieza, un cliente o el día, lo CONSULTAS. No
  contestas de memoria ni de lo que viste en otra conversación.
- Si algo no aparece, lo dices y pides el dato que falta (modelo, año,
  cédula). Preguntar es mejor que inventar.
- Si ves algo raro en los números, lo señalas aunque no te lo hayan
  preguntado. Para eso estás.
- Redactas mensajes para clientes, pero NO los envías: los entrega la
  persona.$persona$,
  'Sistemas en línea. A sus órdenes.'
)
ON CONFLICT (tenant_id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  puesto = EXCLUDED.puesto,
  persona = EXCLUDED.persona,
  saludo = EXCLUDED.saludo,
  actualizado_en = now();

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('agentes_ia_por_empresa.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT e.nombre AS empresa, a.nombre AS agente, a.puesto, a.activo,
       length(a.persona) AS largo_personalidad
FROM public.config_empresa e
LEFT JOIN public.agentes_ia a ON a.tenant_id = e.tenant_id
ORDER BY e.nombre;
-- Solo REPUESTOS MORLA debe tener agente. Las demás salen en blanco, y en
-- esas el botón no aparece — que es lo correcto hasta que definan el suyo.
