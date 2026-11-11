-- =============================================================================
-- Boletín «Únete al club J&M» (ejecución 67)
-- Antes el formulario de la portada decía «¡Gracias por suscribirte!» sin guardar nada.
-- Tabla de suscriptores + RPC pública subscribe_newsletter. Solo aditivo.
--  * Nadie lee ni escribe la tabla directamente salvo el admin (lectura y baja/alta).
--  * La RPC es idempotente y no revela si el correo ya estaba suscrito (misma respuesta).
--  * Límite global: más de 30 altas nuevas en 1 minuto → JM_RATE_LIMITED (freno anti-abuso sin
--    depender de la IP, que PostgREST no garantiza).
-- =============================================================================
CREATE TABLE public.newsletter_subscribers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL,
  email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  source           text NOT NULL DEFAULT 'home',
  user_id          uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  subscribed_at    timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT newsletter_email_format CHECK (
    char_length(btrim(email)) BETWEEN 3 AND 254
    AND btrim(email) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT newsletter_source_format CHECK (source ~ '^[a-z0-9_]{1,32}$')
);
CREATE UNIQUE INDEX uq_newsletter_email ON public.newsletter_subscribers (email_normalized);
CREATE INDEX idx_newsletter_created_at ON public.newsletter_subscribers (created_at);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.newsletter_subscribers FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (unsubscribed_at) ON public.newsletter_subscribers TO authenticated;
CREATE POLICY newsletter_admin_read ON public.newsletter_subscribers FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY newsletter_admin_update ON public.newsletter_subscribers FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE FUNCTION public.subscribe_newsletter(p_email text, p_source text DEFAULT 'home') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email  text := btrim(coalesce(p_email, ''));
  v_source text := coalesce(nullif(btrim(p_source), ''), 'home');
  v_uid    uuid := auth.uid();
BEGIN
  IF char_length(v_email) NOT BETWEEN 3 AND 254 OR v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Correo electrónico inválido' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_EMAIL';
  END IF;
  IF v_source !~ '^[a-z0-9_]{1,32}$' THEN
    v_source := 'home';
  END IF;

  -- Reactivación de una baja (o ya activo): no cuenta para el límite y no revela el estado previo.
  UPDATE public.newsletter_subscribers
     SET unsubscribed_at = NULL,
         subscribed_at   = CASE WHEN unsubscribed_at IS NULL THEN subscribed_at ELSE now() END,
         user_id         = coalesce(user_id, v_uid)
   WHERE email_normalized = lower(v_email);
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF (SELECT count(*) FROM public.newsletter_subscribers WHERE created_at > now() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'Demasiadas suscripciones en poco tiempo; intenta en un minuto'
      USING ERRCODE = 'P0001', HINT = 'JM_RATE_LIMITED';
  END IF;

  INSERT INTO public.newsletter_subscribers (email, source, user_id)
  VALUES (v_email, v_source, v_uid)
  ON CONFLICT (email_normalized) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.subscribe_newsletter(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscribe_newsletter(text, text) TO anon, authenticated;
