-- Un destino ya publicado puede RECIBIR su enlace si no lo tenía (02/11/2026).
--
-- TikTok da el id del ENVÍO al publicar (external_post_id = publish_id) y el
-- del VIDEO llega después (status/fetch → PUBLISH_COMPLETE). El publicador
-- anota entonces external_url = https://www.tiktok.com/@usuario/video/ID para
-- unir el video con su promoción y medirlo. Este disparador lo rechazaba
-- ("ya tiene publicación confirmada... Eso no se reescribe") porque prohibía
-- CUALQUIER cambio de external_url: el enlace nunca se guardaba y TikTok
-- seguía sin números.
--
-- Ahora: llenar un enlace VACÍO se permite (no reescribe nada). Cambiar un
-- enlace o un id que ya existen sigue prohibido, y devolver a la cola un
-- destino publicado también. Hecho sobre la versión de producción del 02/11.

CREATE OR REPLACE FUNCTION public.no_republicar_destino_confirmado()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Sin confirmación del proveedor no hay nada que proteger.
  if old.external_post_id is null and old.external_url is null then
    return new;
  end if;

  -- (02/11/2026) El id no cambia nunca; el enlace solo se puede LLENAR si
  -- estaba vacío (TikTok lo da después de publicar), nunca reescribir.
  if new.external_post_id is distinct from old.external_post_id
     or (old.external_url is not null and new.external_url is distinct from old.external_url) then
    raise exception
      'El destino % (% %) ya tiene publicación confirmada: %. Eso no se reescribe.',
      old.id, old.platform, old.placement,
      coalesce(old.external_post_id, old.external_url);
  end if;

  if new.status is distinct from old.status
     and new.status in ('draft','awaiting_upload','awaiting_approval','scheduled','queued','processing') then
    raise exception
      'El destino % (% %) ya se publicó: %. Devolverlo a "%" lo publicaría dos veces.',
      old.id, old.platform, old.placement,
      coalesce(old.external_post_id, old.external_url), new.status;
  end if;

  return new;
end;
$function$;

SELECT public.registrar_migracion('destino_publicado_puede_recibir_su_enlace.sql');
