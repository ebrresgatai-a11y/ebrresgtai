import type { Config, Context } from "@netlify/functions";

import { AuthError, loginTeamMember } from "./_shared/auth";
import { jsonResponse } from "./_shared/neon";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return jsonResponse({ message: "Método não permitido." }, { status: 405 });
  try {
    const body = await req.json() as { login?: string; password?: string };
    return jsonResponse(await loginTeamMember(String(body.login ?? ""), String(body.password ?? "")));
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof AuthError ? error.message : "Não foi possível entrar agora.";
    return jsonResponse({ message }, { status });
  }
};

export const config: Config = { path: "/api/auth/login", method: ["POST"] };