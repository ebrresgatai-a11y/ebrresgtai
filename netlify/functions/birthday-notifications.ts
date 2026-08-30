import type { Config, Context } from "@netlify/functions";
import { firebaseAdminConfigured, getFirebaseAdminMessaging } from "./_shared/firebase-admin";
import { getNeonSql } from "./_shared/neon";

type Recipient = { token: string; token_id: number; delivery_date: string; student_name: string; student_room: string };

function fortalezaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function isInvalidToken(code: string) {
  return code.includes("registration-token-not-registered") || code.includes("invalid-registration-token");
}

export default async (_req: Request, _context: Context) => {
  const today = fortalezaDate();
  const yesterday = fortalezaDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const sql = getNeonSql();
  await sql`
    create table if not exists birthday_push_deliveries (
      delivery_date date not null,
      token_id bigint not null references equipe_push_tokens(id) on delete cascade,
      sent_at timestamptz not null default now(),
      primary key (delivery_date, token_id)
    )
  `;
  await sql`
    create table if not exists birthday_push_attempts (
      id bigserial primary key,
      delivery_date date not null,
      token_id bigint not null references equipe_push_tokens(id) on delete cascade,
      status text not null check (status in ('sent', 'failed')),
      error_code text not null default '',
      message_id text not null default '',
      attempted_at timestamptz not null default now()
    )
  `;

  const rows = await sql`
    with target_dates as (
      select unnest(array[${today}::date, ${yesterday}::date]) as delivery_date
    )
    select distinct t.id as token_id, t.token, target.delivery_date::text, s.name as student_name, s.room as student_room
    from target_dates target
    join students s on substring(s.birthday from 6 for 5) = to_char(target.delivery_date, 'MM-DD')
    join team_members m on m.role = 'admin' or (m.role = 'teacher' and lower(trim(m.room)) = lower(trim(s.room)))
    join equipe_push_tokens t on t.membro_id = m.id and t.ativo = true
    left join birthday_push_deliveries d on d.token_id = t.id and d.delivery_date = target.delivery_date
    where d.token_id is null
    order by delivery_date, token_id, student_name
  ` as Recipient[];

  const grouped = new Map<string, { token: string; tokenId: number; deliveryDate: string; students: { name: string; room: string }[] }>();
  rows.forEach((row) => {
    const deliveryDate = String(row.delivery_date).slice(0, 10);
    const key = `${deliveryDate}:${row.token}`;
    const current = grouped.get(key) ?? { token: row.token, tokenId: Number(row.token_id), deliveryDate, students: [] };
    current.students.push({ name: row.student_name, room: row.student_room });
    grouped.set(key, current);
  });

  if (!grouped.size) return Response.json({ dates: [today, yesterday], pendingRecipients: 0, sent: 0, failed: 0 });
  if (!firebaseAdminConfigured()) {
    for (const recipient of grouped.values()) {
      await sql`
        insert into birthday_push_attempts (delivery_date, token_id, status, error_code)
        values (${recipient.deliveryDate}::date, ${recipient.tokenId}, 'failed', 'firebase-not-configured')
      `;
    }
    console.error("[birthday-push] Firebase Admin não configurado.", { recipients: grouped.size });
    return Response.json({ dates: [today, yesterday], pendingRecipients: grouped.size, sent: 0, failed: grouped.size }, { status: 503 });
  }

  const messaging = getFirebaseAdminMessaging();
  let sent = 0;
  let failed = 0;
  for (const recipient of grouped.values()) {
    const first = recipient.students[0];
    const isToday = recipient.deliveryDate === today;
    const title = recipient.students.length === 1
      ? `${isToday ? "Aniversariante do dia" : "Aniversariante de ontem"}: ${first.name}`
      : `${recipient.students.length} aniversariantes ${isToday ? "hoje" : "ontem"}`;
    const message = recipient.students.length === 1
      ? `${isToday ? "Hoje é" : "Ontem foi"} aniversário de ${first.name}, da sala ${first.room}. Envie suas felicitações!`
      : `${isToday ? "Hoje" : "Ontem"}: ${recipient.students.map((student) => student.name).join(", ")}. Envie suas felicitações!`;
    try {
      const messageId = await messaging.send({
        token: recipient.token,
        notification: { title, body: message },
        data: { title, message, type: "aniversario", link: "/", deliveryDate: recipient.deliveryDate },
        webpush: {
          headers: { Urgency: "high" },
          notification: { title, body: message, icon: "/ebr-logo.jpg", badge: "/ebr-logo.jpg", tag: `ebr-aniversario-${recipient.deliveryDate}`, data: { link: "/" } },
          fcmOptions: { link: "https://ebrresgatai.netlify.app/" }
        }
      });
      await sql`
        insert into birthday_push_deliveries (delivery_date, token_id, sent_at)
        values (${recipient.deliveryDate}::date, ${recipient.tokenId}, now())
        on conflict (delivery_date, token_id) do nothing
      `;
      await sql`
        insert into birthday_push_attempts (delivery_date, token_id, status, message_id)
        values (${recipient.deliveryDate}::date, ${recipient.tokenId}, 'sent', ${messageId})
      `;
      sent += 1;
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "unknown";
      if (isInvalidToken(code)) await sql`update equipe_push_tokens set ativo = false, atualizado_em = now() where id = ${recipient.tokenId}`;
      await sql`
        insert into birthday_push_attempts (delivery_date, token_id, status, error_code)
        values (${recipient.deliveryDate}::date, ${recipient.tokenId}, 'failed', ${code})
      `;
      failed += 1;
      console.error("[birthday-push] Falha ao enviar", { tokenId: recipient.tokenId, deliveryDate: recipient.deliveryDate, code });
    }
  }
  console.info("[birthday-push] Execução concluída.", { dates: [today, yesterday], recipients: grouped.size, sent, failed });
  return Response.json({ dates: [today, yesterday], pendingRecipients: grouped.size, sent, failed });
};

// Netlify usa UTC: 12h-21h UTC corresponde a 09h-18h em Fortaleza.
// A função recupera também o dia anterior quando nenhuma entrega foi confirmada.
export const config: Config = { schedule: "*/15 12-21 * * *" };
