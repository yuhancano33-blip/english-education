import { createClient } from '@supabase/supabase-js'

// Clave pública (anon): la protección la da RLS (SPEC-006 §2).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
