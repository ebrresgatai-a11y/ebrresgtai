import type { Config, Context } from "@netlify/functions";
import { getNeonSql, jsonResponse } from "./_shared/neon";

type TokenBody = { membroId?: number; token?: string; plataforma?: string };

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST" && req.method !== "DELETE") return jsonResponse({ message: "Método não permitido." }, { status: 405 });
  try {
    const body = (await req.json()) as TokenBody;
    const membroId = Number(body.membroId ?? 0);
    const token = String(body.token ?? "").trim();
    if (!membroId || token.length < 20 || token.length > 4096) return jsonResponse({ message: "Membro ou token inválido." }, { status: 400 });
    const sql = getNeonSql();
    const members = await sql`select id from team_members where id = ${membroId} limit 1`;
    if (!members.length) return jsonResponse({ message: "Membro da equipe não encontrado." }, { status: 404 });
    if (req.method === "DELETE") {
      await sql`update equipe_push_tokens set ativo = false, atualizado_em = now() where membro_id = ${membroId} and token = ${token}`;
      return jsonResponse({ ok: true });
    }
    const plataforma = String(body.plataforma ?? "web").trim().slice(0, 40) || "web";
    const rows = await sql`
      insert into equipe_push_tokens (membro_id, token, plataforma, ativo, atualizado_em)
      values (${membroId}, ${token}, ${plataforma}, true, now())
      on conflict (token) do update set membro_id = excluded.membro_id, plataforma = excluded.plataforma, ativo = true, atualizado_em = now()
      returning id, membro_id, plataforma, ativo, criado_em, atualizado_em
    `;
    return jsonResponse({ ok: true, data: rows[0] });
  } catch (error) {
    return jsonResponse({ ok: false, message: error instanceof Error ? error.message : "Erro ao salvar token da equipe." }, { status: 500 });
  }
};

export const config: Config = { path: "/api/push/team-tokens", method: ["POST", "DELETE"] };
