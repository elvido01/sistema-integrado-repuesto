-- =====================================================================
-- Equipo IA — tres agentes, un orquestador, y Elvido aprobando
-- ---------------------------------------------------------------------
-- Hermes coordina. Jarvis mira MotoFlow y nada más. Comercial-Creativo
-- convierte datos verificados en contenido. Elvido aprueba lo importante.
-- Nadie más. Elvido NO es un agente.
--
-- >>> ESTADO ANTES DE ESTO <<<
--   agentes_ia      PK = tenant_id      → un agente por empresa. Hermes.
--   agente_sistema  CHECK (id = 1)      → un solo Jarvis, global.
--   hermes_chat     contrato v4         → canal persona ↔ Hermes.
--   (nada)                              → delegación entre agentes.
--
-- >>> LA BRECHA <<<
-- No cabe un tercero: la clave primaria de agentes_ia es el tenant. Y
-- aunque cupiera, no hay por dónde pasarle trabajo — hermes_chat es
-- persona↔agente, con un `rol` de dos valores.
--
-- >>> QUÉ SE ELIGIÓ, Y QUÉ NO <<<
-- NO se toca agentes_ia, NO se toca agente_sistema, NO se toca
-- hermes_chat. Jarvis no se recrea: se registra apuntando al que ya hay.
-- El chat principal sigue funcionando sin enterarse de nada de esto.
--
-- Cuatro tablas nuevas, todas con prefijo `equipo_`:
--   equipo_agentes       el catálogo de los tres, con sus límites
--   equipo_trabajos      lo que Elvido pidió
--   equipo_mensajes      la delegación entre agentes (§4)
--   equipo_aprobaciones  las decisiones de Elvido, auditables
--
-- >>> QUIÉN LO VE <<<
-- Solo elvidocaminero@gmail.com y admin@repuestosmorla.com. Está puesto en
-- la base, no solo en la pantalla: una comprobación que vive únicamente en
-- el frontend no es un permiso, es una sugerencia.
--
-- Reversible: sql/equipo_ia_revertir.sql
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. QUIÉN PUEDE ENTRAR
-- ------------------------------------------------------------
-- Por correo y no por rol: es un módulo del dueño, no de un puesto. Si
-- mañana hay que abrirlo a alguien más, se cambia esta lista y ya — sin
-- tocar políticas ni funciones.
CREATE OR REPLACE FUNCTION public.equipo_ia_permitido()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- El COALESCE de fuera no es adorno (ver sql/equipo_ia_permiso_null.sql):
  -- sin correo esto daba NULL, y las ocho funciones que preguntan lo hacen
  -- con `IF NOT permitido() THEN`. `NOT NULL` es NULL, y con NULL PL/pgSQL
  -- no entra en el IF: la comprobación se saltaba entera. Sin correo NO es
  -- "no se sabe", es que no.
  SELECT COALESCE(
    lower(COALESCE(
      NULLIF(auth.jwt() ->> 'email', ''),
      (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
    )) IN ('elvidocaminero@gmail.com', 'admin@repuestosmorla.com'),
    false);
$$;

REVOKE ALL ON FUNCTION public.equipo_ia_permitido() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_ia_permitido() TO authenticated;

-- ------------------------------------------------------------
-- 2. LOS TRES AGENTES  (§3)
-- ------------------------------------------------------------
-- Tabla propia y no una fila más en agentes_ia porque allí la clave
-- primaria es el tenant: no caben dos. Aquí la clave es (tenant, agente),
-- y el CHECK de `clave` es lo que impide que aparezca un cuarto.
CREATE TABLE IF NOT EXISTS public.equipo_agentes (
  tenant_id     uuid    NOT NULL REFERENCES public.config_empresa(tenant_id) ON DELETE CASCADE,
  clave         text    NOT NULL CHECK (clave IN ('hermes', 'jarvis', 'comercial_creativo')),
  nombre        text    NOT NULL,
  rol_visible   text    NOT NULL,
  descripcion   text,
  -- Qué sabe hacer y qué tiene prohibido. En la base y no en el código:
  -- las reglas comerciales de Morla (§8) cambian sin desplegar.
  capacidades   jsonb   NOT NULL DEFAULT '[]'::jsonb,
  limites       jsonb   NOT NULL DEFAULT '[]'::jsonb,
  politicas     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  -- A quién puede delegarle. Vacío = a nadie. Esto es lo que hace que
  -- Jarvis y Comercial-Creativo no puedan hablarse (§4.8).
  puede_delegar_a text[] NOT NULL DEFAULT '{}',
  puede_aprobar boolean NOT NULL DEFAULT false,
  activo        boolean NOT NULL DEFAULT true,
  orden         smallint NOT NULL DEFAULT 0,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, clave)
);

-- ------------------------------------------------------------
-- 3. LOS TRABAJOS  (§6, §7C)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.equipo_trabajos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.config_empresa(tenant_id) ON DELETE CASCADE,
  -- El hilo lógico compartido. NO se deduce el canal de respuesta de aquí
  -- (§5): para eso están las tres columnas origin_*.
  conversation_key text NOT NULL,
  context_epoch    integer NOT NULL DEFAULT 1,
  origin_platform  text,
  origin_chat_id   text,
  origin_message_id text,
  -- Quién lo pidió, y qué pidió en sus palabras.
  solicitado_por   uuid REFERENCES auth.users(id),
  titulo           text NOT NULL,
  peticion         text NOT NULL,
  tipo             text NOT NULL DEFAULT 'consulta'
                   CHECK (tipo IN ('consulta', 'promocion', 'seguimiento', 'compleja')),
  estado           text NOT NULL DEFAULT 'pending'
                   CHECK (estado IN ('pending','claimed','processing','waiting_dependency',
                                     'waiting_approval','completed','failed','cancelled','expired')),
  resultado        jsonb,
  error            text,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  iniciado_en      timestamptz,
  terminado_en     timestamptz
);

CREATE INDEX IF NOT EXISTS equipo_trabajos_cola
  ON public.equipo_trabajos (tenant_id, estado, creado_en);

-- ------------------------------------------------------------
-- 4. LOS MENSAJES ENTRE AGENTES  (§4)
-- ------------------------------------------------------------
-- Aquí vive la delegación. Cada fila es "alguien le pidió algo a alguien"
-- o "alguien contestó". Nunca aparece en el chat principal: eso es lo que
-- separa la coordinación del hilo que lee una persona (§4.9).
CREATE TABLE IF NOT EXISTS public.equipo_mensajes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.config_empresa(tenant_id) ON DELETE CASCADE,
  trabajo_id       uuid NOT NULL REFERENCES public.equipo_trabajos(id) ON DELETE CASCADE,
  conversation_key text NOT NULL,
  context_epoch    integer NOT NULL DEFAULT 1,
  -- Correlación: todo lo que sale de una misma petición comparte
  -- correlation_id; parent_message_id dice de cuál nació exactamente.
  correlation_id   uuid NOT NULL,
  parent_message_id uuid REFERENCES public.equipo_mensajes(id) ON DELETE SET NULL,
  -- Cuán hondo va la cadena. El CHECK es el que impide el ciclo infinito
  -- (§4.5, §4.6): a la cuarta, la base dice que no.
  profundidad      smallint NOT NULL DEFAULT 0 CHECK (profundidad BETWEEN 0 AND 3),

  from_agent       text NOT NULL CHECK (from_agent IN ('elvido','hermes','jarvis','comercial_creativo')),
  to_agent         text NOT NULL CHECK (to_agent   IN ('elvido','hermes','jarvis','comercial_creativo')),
  message_type     text NOT NULL CHECK (message_type IN (
                     'user_request','delegation','data_request','data_result',
                     'creative_request','draft_result','approval_request','approval_decision',
                     'execution_request','execution_result','progress','error')),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN (
                     'pending','claimed','processing','waiting_dependency',
                     'waiting_approval','completed','failed','cancelled','expired')),
  priority         smallint NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 9),

  summary          text NOT NULL,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,

  requires_approval boolean NOT NULL DEFAULT false,
  approval_status   text CHECK (approval_status IN ('pending','approved','rejected','changes_requested')),

  -- El mismo evento dos veces produce UNA fila. No es una comprobación en
  -- código: es el índice único de más abajo.
  idempotency_key  text NOT NULL,

  claim_token      uuid,
  lease_until      timestamptz,
  attempts         smallint NOT NULL DEFAULT 0,
  error            text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  claimed_at       timestamptz,
  completed_at     timestamptz,
  expires_at       timestamptz
);

-- LO QUE HACE IMPOSIBLE EL DUPLICADO (§4.1, §11.12, §11.25)
CREATE UNIQUE INDEX IF NOT EXISTS equipo_mensajes_idem
  ON public.equipo_mensajes (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS equipo_mensajes_cola
  ON public.equipo_mensajes (tenant_id, to_agent, status, created_at);
CREATE INDEX IF NOT EXISTS equipo_mensajes_trabajo
  ON public.equipo_mensajes (trabajo_id, created_at);
CREATE INDEX IF NOT EXISTS equipo_mensajes_correlacion
  ON public.equipo_mensajes (correlation_id);

-- ------------------------------------------------------------
-- 5. LAS APROBACIONES  (§7D, §9)
-- ------------------------------------------------------------
-- Persistentes y con nombre y hora. Un estado de color en el frontend no
-- es una aprobación: es un color.
CREATE TABLE IF NOT EXISTS public.equipo_aprobaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.config_empresa(tenant_id) ON DELETE CASCADE,
  trabajo_id     uuid NOT NULL REFERENCES public.equipo_trabajos(id) ON DELETE CASCADE,
  mensaje_id     uuid REFERENCES public.equipo_mensajes(id) ON DELETE SET NULL,
  preparado_por  text NOT NULL CHECK (preparado_por IN ('hermes','jarvis','comercial_creativo')),
  accion         text NOT NULL,
  motivo         text,
  datos_usados   jsonb NOT NULL DEFAULT '{}'::jsonb,
  impacto        text,
  riesgo         text NOT NULL DEFAULT 'medio' CHECK (riesgo IN ('bajo','medio','alto')),
  contenido      jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado         text NOT NULL DEFAULT 'pending'
                 CHECK (estado IN ('pending','approved','rejected','changes_requested','expired')),
  -- Quién decidió y cuándo. Sin esto no hay auditoría, hay un rumor.
  decidido_por   uuid REFERENCES auth.users(id),
  decidido_email text,
  decidido_en    timestamptz,
  comentario     text,
  -- Al pedir cambios nace una revisión nueva enlazada a esta (§11.18).
  revision_de    uuid REFERENCES public.equipo_aprobaciones(id) ON DELETE SET NULL,
  revision_num   smallint NOT NULL DEFAULT 1,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  expira_en      timestamptz
);

CREATE INDEX IF NOT EXISTS equipo_aprobaciones_pendientes
  ON public.equipo_aprobaciones (tenant_id, estado, creado_en);

-- ------------------------------------------------------------
-- 6. AISLAMIENTO  (§9)
-- ------------------------------------------------------------
-- Dos condiciones a la vez: tu empresa Y tu correo. Cualquiera de las dos
-- por separado dejaría un hueco.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipo_agentes','equipo_trabajos','equipo_mensajes','equipo_aprobaciones']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_duenio', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (tenant_id = public.get_user_tenant() AND public.equipo_ia_permitido())',
      t || '_duenio', t);
    -- Supabase concede ALL por defecto a las tablas nuevas de public
    -- (ALTER DEFAULT PRIVILEGES del proyecto). Sin este REVOKE, anon y
    -- authenticated nacen con INSERT, UPDATE y DELETE sobre las cuatro
    -- tablas: 24 permisos que nadie pidió.
    --
    -- Hoy la RLS los frena —solo hay política de SELECT, y sin política
    -- de escritura un INSERT se deniega—, así que no había agujero. Pero
    -- depender de eso es depender de que nadie añada nunca una política
    -- permisiva de más. Se quitan los permisos y ya no hay que confiar.
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;
-- Escribir NO se concede a nadie: todo pasa por las funciones SECURITY
-- DEFINER, que son las que comprueban quién delega a quién y qué necesita
-- aprobación.

-- ------------------------------------------------------------
-- 7. LOS TRES, Y SUS LÍMITES  (§3, §8)
-- ------------------------------------------------------------
-- Solo para Repuestos Morla. Las otras empresas no tienen equipo.
INSERT INTO public.equipo_agentes
  (tenant_id, clave, nombre, rol_visible, descripcion, capacidades, limites, puede_delegar_a, orden)
VALUES
(
  '00000000-0000-0000-0000-000000000001', 'hermes', 'Hermes', 'Orquestador comercial',
  'Recibe lo que pides, decide si hace falta delegar, coordina a los otros dos y te trae el resultado junto.',
  '["clasificar intencion","delegar cuando aporta","coordinar a Jarvis y Comercial-Creativo","consolidar resultados","pedir aprobacion","mantener el objetivo comercial"]'::jsonb,
  '["no inventa precios, existencias, clientes ni ventas","no ejecuta acciones importantes sin aprobacion de Elvido","no se salta los limites de Jarvis","no crea agentes"]'::jsonb,
  ARRAY['jarvis','comercial_creativo'], 1
),
(
  '00000000-0000-0000-0000-000000000001', 'jarvis', 'Jarvis', 'Especialista MotoFlow',
  'Acceso exclusivo a MotoFlow. Consulta productos, precios, existencias, clientes y ventas, y devuelve datos verificables.',
  '["consultar productos, precios, existencias y ubicaciones","consultar clientes, ventas, inventario y llegadas","devolver resultados estructurados con fuente y fecha","decir claramente cuando no hay datos"]'::jsonb,
  '["acceso exclusivo a MotoFlow","no disena","no publica","no redacta campanas","no opera redes sociales","no recibe herramientas externas","no delega a nadie"]'::jsonb,
  ARRAY[]::text[], 2
),
(
  '00000000-0000-0000-0000-000000000001', 'comercial_creativo', 'Comercial-Creativo',
  'Promoción, diseño, contenido y ventas',
  'Convierte datos ya verificados en propuestas, copies, conceptos de arte y seguimientos. Entrega borradores para revisión.',
  '["elegir productos candidatos","preparar propuestas promocionales","redactar copy para WhatsApp, Facebook e Instagram","preparar conceptos de arte y video","preparar respuestas y seguimientos comerciales"]'::jsonb,
  '["no consulta MotoFlow directamente: los datos le llegan verificados por Jarvis via Hermes","no publica automaticamente","no envia mensajes a clientes sin autorizacion","no aprueba su propio trabajo","no crea agentes","no delega a nadie"]'::jsonb,
  ARRAY[]::text[], 3
)
ON CONFLICT (tenant_id, clave) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      rol_visible = EXCLUDED.rol_visible,
      descripcion = EXCLUDED.descripcion,
      capacidades = EXCLUDED.capacidades,
      limites = EXCLUDED.limites,
      puede_delegar_a = EXCLUDED.puede_delegar_a,
      orden = EXCLUDED.orden,
      actualizado_en = now();

-- Las reglas comerciales de Morla (§8). Van en `politicas` y no repartidas
-- por el código: se cambian sin desplegar y se pueden probar.
UPDATE public.equipo_agentes
SET politicas = jsonb_build_object(
      'solo_productos_activos', true,
      'nunca_inventar_precio_ni_existencia', true,
      'promocion_diaria_max_productos', 2,
      'promocion_un_producto_mayor_a', 1000,
      'promocion_otro_producto_mayor_a', 100,
      'preferir_promocionables_que_necesitan_empuje', true,
      'evitar_productos_de_salida_natural', true,
      'no_promover_como_principal', jsonb_build_array('arandela plana'),
      'no_repetir_propuestos_dias', 14,
      'publicar_codigo_interno', false,
      'exigir_foto_real', true,
      'respetar_zona_segura_9_16', true,
      'acciones_importantes_requieren_aprobacion', true,
      'publicacion_automatica_habilitada', false
    ),
    actualizado_en = now()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND clave = 'comercial_creativo';

-- ------------------------------------------------------------
-- 8. QUIÉN PUEDE DELEGARLE A QUIÉN  (§4.7, §4.8)
-- ------------------------------------------------------------
-- En un trigger y no en la función que delega: así también lo cumple un
-- INSERT hecho a mano, y no depende de que todos usen la puerta correcta.
CREATE OR REPLACE FUNCTION public.equipo_mensajes_validar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_permitidos text[];
BEGIN
  IF NEW.from_agent = NEW.to_agent THEN
    RAISE EXCEPTION 'Un agente no se delega a sí mismo (%).', NEW.from_agent;
  END IF;

  -- Lo que una persona manda y lo que se le contesta no es delegación.
  IF NEW.from_agent = 'elvido' OR NEW.to_agent = 'elvido' THEN
    RETURN NEW;
  END IF;

  SELECT a.puede_delegar_a INTO v_permitidos
  FROM public.equipo_agentes a
  WHERE a.tenant_id = NEW.tenant_id AND a.clave = NEW.from_agent AND a.activo;

  IF v_permitidos IS NULL THEN
    RAISE EXCEPTION 'El agente % no está registrado en esta empresa.', NEW.from_agent;
  END IF;

  -- Contestar a quien te lo pidió siempre vale; empezar tú, solo si te
  -- corresponde. Sin esta distinción Jarvis no podría ni responderle a
  -- Hermes, porque su lista de delegación está vacía a propósito.
  IF NEW.message_type IN ('data_result','draft_result','execution_result','progress','error') THEN
    IF NEW.to_agent <> 'hermes' THEN
      RAISE EXCEPTION 'Un resultado solo se le devuelve a Hermes (intentó % → %).',
        NEW.from_agent, NEW.to_agent;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (NEW.to_agent = ANY(v_permitidos)) THEN
    RAISE EXCEPTION
      'El agente % no puede delegarle a %. Solo Hermes coordina trabajos cruzados.',
      NEW.from_agent, NEW.to_agent;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS equipo_mensajes_validar_trg ON public.equipo_mensajes;
CREATE TRIGGER equipo_mensajes_validar_trg
  BEFORE INSERT ON public.equipo_mensajes
  FOR EACH ROW EXECUTE FUNCTION public.equipo_mensajes_validar();

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
