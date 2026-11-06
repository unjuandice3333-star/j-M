-- CORRECCIÓN PROPUESTA (M24C) para supabase/seeds/00_qa_users.sql — aplicada SOLO al stack local de validación.
-- GoTrue lee estas columnas como string no nulo; si quedan NULL, el login devuelve HTTP 500.
UPDATE auth.users
   SET confirmation_token         = COALESCE(confirmation_token, ''),
       recovery_token             = COALESCE(recovery_token, ''),
       email_change_token_new     = COALESCE(email_change_token_new, ''),
       email_change               = COALESCE(email_change, ''),
       email_change_token_current = COALESCE(email_change_token_current, ''),
       reauthentication_token     = COALESCE(reauthentication_token, ''),
       phone_change               = COALESCE(phone_change, ''),
       phone_change_token         = COALESCE(phone_change_token, '')
 WHERE email LIKE '%@qa.jm.test';
