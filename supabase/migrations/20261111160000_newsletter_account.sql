-- =============================================================================
-- Boletín desde «Mi cuenta» (ejecución 70). Solo aditivo.
-- Antes la casilla «Quiero recibir novedades y promociones por correo» de «Mis datos» solo cambiaba
-- profiles.marketing_opt_in: el cliente NO entraba en newsletter_subscribers (lo que ve el admin) y
-- desmarcarla no lo daba de baja del boletín al que se suscribió en la portada.
--  * my_newsletter_subscription(): estado del boletín para el correo de LA CUENTA (auth.users).
--  * set_my_newsletter_subscription(bool): alta/baja de ese correo y sincroniza marketing_opt_in.
--  * Se identifica SOLO por el correo de la cuenta (no por user_id: subscribe_newsletter deja user_id
--    en cualquier correo que un usuario con sesión escriba en la portada). Exige correo confirmado,
--    para que nadie dé de baja un correo ajeno registrando una cuenta sin verificarlo.
-- =============================================================================
CREATE FUNCTION private.my_account_email() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para gestionar el boletín' USING ERRCODE = 'P0001', HINT = 'JM_AUTH_REQUIRED';
  END IF;
  SELECT lower(btrim(u.email)), u.email_confirmed_at INTO v_email, v_confirmed FROM auth.users u WHERE u.id = v_uid;
  IF coalesce(v_email, '') = '' THEN
    RAISE EXCEPTION 'Tu cuenta no tiene correo' USING ERRCODE = 'P0001', HINT = 'JM_NO_EMAIL';
  END IF;
  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'Confirma tu correo para gestionar el boletín' USING ERRCODE = 'P0001', HINT = 'JM_EMAIL_UNCONFIRMED';
  END IF;
  RETURN v_email;
END $$;
REVOKE ALL ON FUNCTION private.my_account_email() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.my_newsletter_subscription() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email text := private.my_account_email();
  v_row public.newsletter_subscribers%ROWTYPE;
  v_opt boolean;
BEGIN
  SELECT * INTO v_row FROM public.newsletter_subscribers WHERE email_normalized = v_email;
  IF FOUND THEN
    RETURN jsonb_build_object('email', v_email, 'subscribed', v_row.unsubscribed_at IS NULL, 'on_list', true,
                              'subscribed_at', v_row.subscribed_at, 'unsubscribed_at', v_row.unsubscribed_at);
  END IF;
  -- Sin fila en la lista: se respeta el consentimiento previo guardado en el perfil.
  SELECT p.marketing_opt_in INTO v_opt FROM public.profiles p WHERE p.id = auth.uid();
  RETURN jsonb_build_object('email', v_email, 'subscribed', coalesce(v_opt, false), 'on_list', false,
                            'subscribed_at', NULL, 'unsubscribed_at', NULL);
END $$;

CREATE FUNCTION public.set_my_newsletter_subscription(p_subscribed boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email text := private.my_account_email();
  v_uid uuid := auth.uid();
BEGIN
  IF p_subscribed IS NULL THEN
    RAISE EXCEPTION 'Indica si quieres recibir el boletín' USING ERRCODE = 'P0001', HINT = 'JM_INVALID_INPUT';
  END IF;
  IF p_subscribed THEN
    INSERT INTO public.newsletter_subscribers AS s (email, source, user_id)
    VALUES (v_email, 'account', v_uid)
    ON CONFLICT (email_normalized) DO UPDATE
      SET unsubscribed_at = NULL,
          subscribed_at   = CASE WHEN s.unsubscribed_at IS NULL THEN s.subscribed_at ELSE now() END,
          user_id         = coalesce(s.user_id, v_uid);
  ELSE
    UPDATE public.newsletter_subscribers SET unsubscribed_at = now()
     WHERE email_normalized = v_email AND unsubscribed_at IS NULL;
  END IF;
  UPDATE public.profiles SET marketing_opt_in = p_subscribed WHERE id = v_uid AND marketing_opt_in IS DISTINCT FROM p_subscribed;
  RETURN public.my_newsletter_subscription();
END $$;

REVOKE ALL ON FUNCTION public.my_newsletter_subscription() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_my_newsletter_subscription(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_newsletter_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_newsletter_subscription(boolean) TO authenticated;
