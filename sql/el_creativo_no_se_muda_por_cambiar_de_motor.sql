-- ============================================================
-- EL CREATIVO NO SE MUDA POR CAMBIARLE EL MOTOR
-- ============================================================
-- El 31/08 se puso un candado (`el_creativo_vive_donde_esta_el_montador.sql`)
-- para que el Comercial-Creativo corriera SIEMPRE en la máquina que tiene el
-- montador, use el motor que use. Hoy, 28/09, ese candado está en producción
-- INVERTIDO: el trigger sigue ahí, pero su cuerpo ya no es el del repo.
-- Alguien lo reescribió a mano y la versión viva dice justo lo contrario:
--
--   if new.clave = 'comercial_creativo' then
--     if new.proveedor = 'claude_suscripcion' then
--       new.ejecuta_en := 'maquina_propia';
--     elsif new.proveedor in ('openai','claude') then
--       new.ejecuta_en := 'nube';          -- <<< esto es el bug
--     end if;
--   end if;
--
-- Al cambiar el motor a OpenAI el 25/09, ese `elsif` mudó el creativo a la
-- nube. Y la nube no sabe dibujar: la pieza la DIBUJA scripts/arteCreativo.mjs
-- con sharp, y sharp no existe en una Edge Function de Deno.
--
-- Lo que se vio hoy en el encargo del amortiguador (733ba131):
--
--   17:54  lo toma el worker del VPS  → 83 s, dos escenas GPT Image 2, pieza
--   18:10  lo toma la nube            →  4 s, cero imágenes, un brief pelado
--          con la advertencia "Falta foto real del producto"
--
-- Hermes revisó y lo rechazó con razón ("No hay pieza montada: llegó un
-- brief, no un archivo"), pero dejó una aprobación de CONCEPTO esperando. El
-- panel solo sabe enseñar aprobaciones con arte, así que se quedó girando
-- para siempre: ni pieza que enseñar, ni trabajo terminado que cerrar.
--
-- Y no es que la nube se lo robara una vez: `hermes.equipo_tomar` NO filtra
-- por `ejecuta_en`, así que mientras el creativo esté marcado 'nube' los dos
-- pescan en la misma cola. Es una moneda al aire en cada vuelta — por eso
-- fallaba a ratos y no siempre.
--
-- La regla buena es la del 31/08, y esto la vuelve a poner: no es "motor de
-- API → nube", es **donde esté la herramienta**. El motor no se toca: el
-- worker del VPS corre con gpt-4o igual de bien, y de hecho es el que montó
-- la pieza buena de las 17:54.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipo_agente_donde_corre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $fn$
BEGIN
  -- El Comercial-Creativo monta piezas. El montador (sharp) solo existe en la
  -- máquina propia. Da igual el proveedor: mientras dibujar sea cosa de la
  -- máquina, el creativo vive ahí. El día que la nube sepa dibujar, esto se
  -- quita — pero se quita a propósito, no de refilón al cambiar un motor.
  IF NEW.clave = 'comercial_creativo'
     AND COALESCE(NEW.ejecuta_en, '') <> 'maquina_propia' THEN
    NEW.ejecuta_en := 'maquina_propia';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_equipo_agente_donde_corre ON public.equipo_agentes;
CREATE TRIGGER trg_equipo_agente_donde_corre
  BEFORE INSERT OR UPDATE ON public.equipo_agentes
  FOR EACH ROW EXECUTE FUNCTION public.equipo_agente_donde_corre();

-- Y se corrige lo que ya está puesto.
UPDATE public.equipo_agentes
   SET ejecuta_en = 'maquina_propia'
 WHERE clave = 'comercial_creativo' AND ejecuta_en IS DISTINCT FROM 'maquina_propia';

SELECT public.registrar_migracion('el_creativo_no_se_muda_por_cambiar_de_motor.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- No basta con mirar la fila. Se EMPUJA: se intenta mudarlo a la nube con el
-- mismo movimiento que hace `equipo_motor` al elegir un motor de API, y se
-- comprueba que el candado no se deja. Un trigger que no se prueba
-- empujándolo es un trigger sin probar.
DO $prueba$
DECLARE
  v_donde   text;
  v_lo_coge boolean;
BEGIN
  -- El empujón: exactamente lo que rompió esto el 25/09.
  UPDATE public.equipo_agentes
     SET ejecuta_en = 'nube', proveedor = proveedor
   WHERE clave = 'comercial_creativo';

  SELECT ejecuta_en INTO v_donde
    FROM public.equipo_agentes WHERE clave = 'comercial_creativo';

  IF v_donde IS DISTINCT FROM 'maquina_propia' THEN
    RAISE EXCEPTION 'EL CANDADO NO AGUANTA: tras empujarlo, el creativo quedó en "%". Debía quedarse en maquina_propia.', v_donde;
  END IF;

  -- Y lo que de verdad importa: que la nube ya no lo tenga en su lista.
  v_lo_coge := jsonb_exists(public.equipo_nube_agentes(), 'comercial_creativo');

  IF v_lo_coge THEN
    RAISE EXCEPTION 'LA NUBE SIGUE COGIENDO AL CREATIVO: equipo_nube_agentes() todavía lo devuelve. Mientras esté ahí, le roba el arte al montador.';
  END IF;

  RAISE NOTICE 'El creativo se queda en la máquina del montador, y la nube ya no lo coge.';
END $prueba$;
