-- ============================================================
-- EL CREATIVO VIVE DONDE ESTÁ EL MONTADOR
-- ============================================================
-- Al cambiar el motor del Comercial-Creativo a OpenAI, `equipo_motor` aplicó
-- su regla:
--
--   v_ejecuta := CASE WHEN p_proveedor = 'claude_suscripcion'
--                     THEN 'maquina_propia' ELSE 'nube' END;
--
-- Y el creativo se mudó a la nube. El concepto salió bien —de hecho es el
-- que está ahora mismo en la mesa del dueño— porque escribir copy solo
-- necesita un modelo.
--
-- Pero la pieza no la escribe un modelo: la DIBUJA `scripts/arteCreativo.mjs`
-- con sharp, y sharp no existe en una Edge Function de Deno. La nube no tiene
-- ni una línea de composición de imagen. Si el arte le toca a ella, devuelve
-- un brief sin archivo, la revisión de Hermes lo rechaza con razón, y se
-- entra en un baile de devoluciones que no puede terminar bien.
--
-- Peor todavía: `hermes.equipo_tomar` NO filtra por `ejecuta_en`, así que el
-- worker del VPS sigue pescando en la misma cola. Los dos compiten por el
-- mismo mensaje y el arte se lo lleva quien llegue primero. Una moneda al
-- aire cada vez.
--
-- La regla estaba mal planteada. No es "motor de API → nube": es **donde
-- esté la herramienta**. Un agente que tiene que dibujar corre en la máquina
-- que sabe dibujar, use el motor que use.
--
-- Se hace con un trigger y no reescribiendo `equipo_motor` (102 líneas):
-- así la corrección vale para cualquiera que escriba en la tabla, hoy y
-- mañana, y no hay que transcribir código ajeno para cambiarle una línea.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipo_agente_donde_corre()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- El Comercial-Creativo monta piezas. El montador (sharp) solo existe en
  -- la máquina propia. El día que la nube sepa dibujar, esto se quita.
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

SELECT public.registrar_migracion('el_creativo_vive_donde_esta_el_montador.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- No basta con mirar la fila: se intenta MOVERLO a la nube, que es justo lo
-- que hace equipo_motor al elegir un motor de API, y se comprueba que no se
-- deja. Un trigger que no se prueba empujandolo es un trigger sin probar.
UPDATE public.equipo_agentes SET ejecuta_en = 'nube' WHERE clave = 'comercial_creativo';

SELECT json_build_object(
 'aguanto_el_empujon', (SELECT a.ejecuta_en FROM public.equipo_agentes a
   WHERE a.clave = 'comercial_creativo'),
 'la_nube_ya_no_lo_coge', NOT (SELECT public.equipo_nube_agentes() ? 'comercial_creativo')
) AS r;
