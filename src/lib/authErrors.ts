import { AuthError } from '@supabase/supabase-js'

/** Traduce los errores de Supabase Auth a mensajes claros en español. */
export function authErrorMessage(err: unknown): string {
  if (!(err instanceof AuthError)) {
    return 'No se pudo completar la operación. Inténtalo de nuevo.'
  }

  switch (err.code) {
    case 'invalid_credentials':
      return 'Email o contraseña incorrectos.'
    case 'email_not_confirmed':
      return 'Tu email aún no está confirmado. Revisa tu bandeja de entrada (y la de spam).'
    case 'user_already_exists':
    case 'email_exists':
      return 'Ya existe una cuenta con este email. Inicia sesión.'
    case 'weak_password':
      return 'La contraseña es demasiado débil. Usa al menos 8 caracteres.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
    case 'signup_disabled':
      return 'El registro de nuevas cuentas está desactivado.'
    case 'email_address_invalid':
      return 'El email no es válido.'
  }

  if (err.status === 0 || err.name === 'AuthRetryableFetchError') {
    return 'No se pudo conectar con el servidor de autenticación. Revisa tu conexión.'
  }
  if (err.status === 400) {
    return 'No se pudo iniciar sesión con esos datos. Revisa el email y la contraseña.'
  }
  if (err.status === 429) {
    return 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
  }
  return 'Ocurrió un error de autenticación. Inténtalo de nuevo.'
}
