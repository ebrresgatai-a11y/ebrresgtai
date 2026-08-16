import { getNeonSql } from "./neon";
import { firebaseAdminConfigured, getFirebaseAdminMessaging } from "./firebase-admin";

type NeonSql = ReturnType<typeof getNeonSql>;

type PushInput = {
  room?: string;
  studentId?: number;
  title: string;
  message: string;
  type: string;
  link: string;
};

function cleanText(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function persistNotifications(sql: NeonSql, input: PushInput) {
  const title = cleanText(input.title, 140) || "Nova notificação EBR";
  const message = cleanText(input.message, 500) || "Você recebeu uma novidade.";
  const type = cleanText(input.type, 60) || "conteudo";
  const link = cleanText(input.link, 500) || "/aluno";
  if (input.studentId) {
    return sql`
      insert into notificacoes (aluno_id, turma_id, titulo, mensagem, tipo, link_destino)
      select s.id, r.id, ${title}, ${message}, ${type}, ${link}
      from students s
      left join rooms r on lower(trim(r.name)) = lower(trim(s.room))
      where s.id = ${input.studentId}
      returning id, aluno_id
    `;
  }
  const room = cleanText(input.room, 160) || "Geral";
  if (room.toLowerCase() === "geral") {
    return sql`
      insert into notificacoes (aluno_id, turma_id, titulo, mensagem, tipo, link_destino)
      select s.id, r.id, ${title}, ${message}, ${type}, ${link}
      from students s
      left join rooms r on lower(trim(r.name)) = lower(trim(s.room))
      returning id, aluno_id
    `;
  }
  return sql`
    insert into notificacoes (aluno_id, turma_id, titulo, mensagem, tipo, link_destino)
    select s.id, r.id, ${title}, ${message}, ${type}, ${link}
    from students s
    left join rooms r on lower(trim(r.name)) = lower(trim(s.room))
    where lower(trim(s.room)) = lower(trim(${room}))
    returning id, aluno_id
  `;
}

async function activeTokens(sql: NeonSql, input: PushInput) {
  if (input.studentId) return sql`select token from aluno_push_tokens where aluno_id = ${input.studentId} and ativo = true`;
  const room = cleanText(input.room, 160) || "Geral";
  if (room.toLowerCase() === "geral") return sql`select distinct token from aluno_push_tokens where ativo = true`;
  return sql`
    select distinct t.token
    from aluno_push_tokens t
    join students s on s.id = t.aluno_id
    where t.ativo = true and lower(trim(s.room)) = lower(trim(${room}))
  `;
}

export async function notifyStudents(sql: NeonSql, input: PushInput) {
  try {
    const saved = await persistNotifications(sql, input);
    const tokenRows = await activeTokens(sql, input);
    const tokens = tokenRows.map((row) => String(row.token || "")).filter(Boolean);
    if (!tokens.length) {
      console.info("[push] Notificação interna salva, sem dispositivos ativos.", { saved: saved.length, room: input.room, studentId: input.studentId });
      return { saved: saved.length, sent: 0 };
    }
    if (!firebaseAdminConfigured()) {
      console.error("[push] Firebase Admin não configurado no ambiente da função.", { saved: saved.length, tokens: tokens.length });
      return { saved: saved.length, sent: 0 };
    }
    const messaging = getFirebaseAdminMessaging();
    let sent = 0;
    const invalidTokens: string[] = [];
    const failureCodes: Record<string, number> = {};
    const title = cleanText(input.title, 140) || "Nova notificação EBR";
    const message = cleanText(input.message, 500) || "Você recebeu uma novidade.";
    const type = cleanText(input.type, 60) || "conteudo";
    const link = cleanText(input.link, 500) || "/aluno";
    for (let index = 0; index < tokens.length; index += 500) {
      const chunk = tokens.slice(index, index + 500);
      const result = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title,
          body: message
        },
        data: {
          title,
          message,
          type,
          link
        },
        webpush: {
          headers: { Urgency: "high" },
          notification: {
            title,
            body: message,
            icon: "/ebr-logo.jpg",
            badge: "/ebr-logo.jpg",
            tag: type || "ebr-notification",
            requireInteraction: false,
            data: { link }
          },
          fcmOptions: { link }
        }
      });
      sent += result.successCount;
      result.responses.forEach((response, responseIndex) => {
        const code = response.error?.code ?? "";
        if (!response.success) failureCodes[code || "unknown"] = (failureCodes[code || "unknown"] ?? 0) + 1;
        if (!response.success && (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token"))) invalidTokens.push(chunk[responseIndex]);
      });
    }
    for (const token of invalidTokens) {
      await sql`update aluno_push_tokens set ativo = false, atualizado_em = now() where token = ${token}`;
    }
    console.info("[push] Envio Firebase concluído.", { saved: saved.length, tokens: tokens.length, sent, failed: tokens.length - sent, failureCodes, invalidated: invalidTokens.length });
    return { saved: saved.length, sent };
  } catch (error) {
    console.error("Falha ao registrar/enviar notificação push:", error);
    return { saved: 0, sent: 0 };
  }
}
