import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

// Para componentes del navegador (sesión de /admin).
export function createClient() {
  const { url, anonKey } = supabaseEnv();
  return createBrowserClient(url, anonKey);
}
