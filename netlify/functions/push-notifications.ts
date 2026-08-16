import type { Config, Context } from "@netlify/functions";
import { getNeonSql, jsonResponse } from "./_shared/neon";

function mapNotification(row: any) {
  return {
    id: Number(row.id),
    studentId: Number(row.aluno_id),
    roomId: row.turma_id ? Number(row.turma_id) : undefined,
    title: row.titulo ?? "",
    message: row.mensagem ?? "",
    type: row.tipo ?? "",
    link: row.link_destino ?? "/aluno",
    read: Boolean(row.lida),
    createdAt: row.criado_em ?? "",
    readAt: row.lida_em ?? ""
  };
}

export default async (req: Request, _context: Context) => {
  try {
    const sql = getNeonSql();
    if (req.method === "GET") {
      const url = new URL(req.url);
      const alunoId = Number(url.searchParams.get("alunoId") ?? 0);
      if (!alunoId) return jsonResponse({ message: "Aluno não informado." }, { status: 400 });
      const rows = await sql`select * from notificacoes where aluno_id = ${alunoId} order by criado_em desc limit 60`;
      return jsonResponse({ items: rows.map(mapNotification), unread: rows.filter((row) => !row.lida).length });
    }
    if (req.method === "PATCH") {
      const body = await req.json() as { alunoId?: number; notificationId?: number; markAll?: boolean };
      const alunoId = Number(body.alunoId ?? 0);
      if (!alunoId) return jsonResponse({ message: "Aluno não informado." }, { status: 400 });
      if (body.markAll) {
        await sql`update notificacoes set lida = true, lida_em = coalesce(lida_em, now()) where aluno_id = ${alunoId} and lida = false`;
      } else {
        const notificationId = Number(body.notificationId ?? 0);
        if (!notificationId) return jsonResponse({ message: "Notificação não informada." }, { status: 400 });
        await sql`update notificacoes set lida = true, lida_em = coalesce(lida_em, now()) where id = ${notificationId} and aluno_id = ${alunoId}`;
      }
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ message: "Método não permitido." }, { status: 405 });
  } catch (error) {
    return jsonResponse({ ok: false, message: error instanceof Error ? error.message : "Erro ao acessar notificações." }, { status: 500 });
  }
};

export const config: Config = { path: "/api/push/notifications", method: ["GET", "PATCH"] };
