import type { Config, Context } from "@netlify/functions";
import { getNeonSql, jsonResponse } from "./_shared/neon";

type TokenBody = { alunoId?: number; token?: string; plataforma?: string };

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST" && req.method !== "DELETE") return jsonResponse({ message: "Método não permitido." }, { status: 405 });
  try {
    const body = (await req.json()) as TokenBody;
    const alunoId = Number(body.alunoId ?? 0);
    const token = String(body.token ?? "").trim();
    if (!alunoId || token.length < 20 || token.length > 4096) return jsonResponse({ message: "Aluno ou token inválido." }, { status: 400 });
    const sql = getNeonSql();
    const students = await sql`select id from students where id = ${alunoId} limit 1`;
    if (!students.length) return jsonResponse({ message: "Aluno não encontrado." }, { status: 404 });
    if (req.method === "DELETE") {
      await sql`update aluno_push_tokens set ativo = false, atualizado_em = now() where aluno_id = ${alunoId} and token = ${token}`;
      return jsonResponse({ ok: true });
    }
    const plataforma = String(body.plataforma ?? "web").trim().slice(0, 40) || "web";
    const rows = await sql`
      insert into aluno_push_tokens (aluno_id, token, plataforma, ativo, atualizado_em)
      values (${alunoId}, ${token}, ${plataforma}, true, now())
      on conflict (token) do update set aluno_id = excluded.aluno_id, plataforma = excluded.plataforma, ativo = true, atualizado_em = now()
      returning id, aluno_id, plataforma, ativo, criado_em, atualizado_em
    `;
    return jsonResponse({ ok: true, data: rows[0] });
  } catch (error) {
    return jsonResponse({ ok: false, message: error instanceof Error ? error.message : "Erro ao salvar token FCM." }, { status: 500 });
  }
};

export const config: Config = { path: "/api/push/tokens", method: ["POST", "DELETE"] };
