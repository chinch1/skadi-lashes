import { createClient } from "@supabase/supabase-js";
import { STUDIO_SLUG } from "@/lib/studio";
import { supabaseEnv } from "@/lib/supabase/env";

// Comprueba la conexión a Supabase con la llave pública.
export async function GET() {
  try {
    const { url, anonKey } = supabaseEnv();
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase
      .from("studios")
      .select("name")
      .eq("slug", STUDIO_SLUG)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("No se encontró el estudio.");
    return Response.json({ ok: true, studio: data.name });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido";
    return Response.json({ ok: false, error: message }, { status: 503 });
  }
}
