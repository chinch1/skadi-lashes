import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

// Para acciones del servidor y rutas, con la sesión de quien hace la petición.
// Respeta la seguridad por filas y puede renovar la sesión (escribe cookies).
export async function createClient() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}

// Para páginas y diseños, donde no se pueden escribir cookies.
// Si la sesión venció, renovarla aquí gastaría el código de renovación sin poder
// guardar el nuevo, y Giselle quedaría fuera. Por eso se bloquea la renovación y
// se avisa con `refreshBlocked`, para que la haga la ruta /admin/sesion.
export async function createReadOnlyClient() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();
  let blocked = false;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {},
    },
    global: {
      fetch: (input, init) => {
        const target = input instanceof Request ? input.url : String(input);
        if (target.includes("grant_type=refresh_token")) {
          blocked = true;
          return Promise.resolve(
            Response.json(
              { code: "refresh_blocked", message: "Renovación bloqueada" },
              { status: 400 },
            ),
          );
        }
        return fetch(input, init);
      },
    },
  });

  return { supabase, refreshBlocked: () => blocked };
}
