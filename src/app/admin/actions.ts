"use server";

import { redirect } from "next/navigation";
import { findAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null; email: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Escribe tu correo y tu contraseña.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 400) {
      return { error: "El correo o la contraseña no son correctos.", email };
    }
    return { error: "No se pudo iniciar sesión. Intenta de nuevo.", email };
  }

  // Una cuenta válida que no administra el estudio no entra.
  if (!(await findAdmin(supabase))) {
    await supabase.auth.signOut();
    return { error: "El correo o la contraseña no son correctos.", email };
  }

  redirect("/admin");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
