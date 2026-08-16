import type { Config, Context } from "@netlify/functions";
import { firebaseAdminConfigured, getFirebaseAdminMessaging } from "./_shared/firebase-admin";
import { getNeonSql } from "./_shared/neon";

type Recipient = { token: string; token_id: number; student_name: string; student_room: string };

function fortalezaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export default async (_req: Request, _context: Context) => {
  const date = fortalezaDate();
  const monthDay = date.slice(5);
  const sql = getNeonSql();
  await sql`
    create table if not exists birthday_push_deliveries (
      delivery_date date not null,
      token_id bigint not null references equipe_push_tokens(id) on delete cascade,
      sent_at timestamptz not null default now(),
      primary key (delivery_date, token_id)
    )
  `;
  const rows = await sql`
    select distinct t.id as token_id, t.token, s.name as student_name, s.room as student_room
    from students s
    join team_members m on m.role = 'admin' or (m.role = 'teacher' and lower(trim(m.room)) = lower(trim(s.room)))
    join equipe_push_tokens t on t.membro_id = m.id and t.ativo = true
    left join birthday_push_deliveries d on d.token_id = t.id and d.delivery_date = ${date}::date
    where substring(s.birthday from 6 for 5) = ${monthDay}
      and d.token_id is null
    order by t.id, s.name
  ` as Recipient[];
  if (!rows.length || !firebaseAdminConfigured()) return Response.json({ date, recipients: rows.length, sent: 0 });

  const grouped = new Map<string, { tokenId: number; students: { name: string; room: string }[] }>();
  rows.forEach((row) => {
    const current = grouped.get(row.token) ?? { tokenId: Number(row.token_id), students: [] };
    current.students.push({ name: row.student_name, room: row.student_room });
    grouped.set(row.token, current);
  });

  const messaging = getFirebaseAdminMessaging();
  let sent = 0;
  for (const [token, recipient] of grouped) {
    const first = recipient.students[0];
    const title = recipient.students.length === 1 ? `Aniversariante do dia: ${first.name}` : `${recipient.students.length} aniversariantes hoje`;
    const message = recipient.students.length === 1
      ? `Hoje é aniversário de ${first.name}, da sala ${first.room}. Envie suas felicitações!`
      : `Hoje: ${recipient.students.map((student) => student.name).join(", ")}. Envie suas felicitações!`;
    try {
      await messaging.send({
        token,
        notification: { title, body: message },
        data: { title, message, type: "aniversario", link: "/" },
        webpush: {
          headers: { Urgency: "high" },
          notification: { title, body: message, icon: "/ebr-logo.jpg", badge: "/ebr-logo.jpg", tag: `ebr-aniversario-${date}`, data: { link: "/" } },
          fcmOptions: { link: "https://ebrresgatai.netlify.app/" }
        }
      });
      await sql`
        insert into birthday_push_deliveries (delivery_date, token_id, sent_at)
        values (${date}::date, ${recipient.tokenId}, now())
        on conflict (delivery_date, token_id) do nothing
      `;
      sent += 1;
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
        await sql`update equipe_push_tokens set ativo = false, atualizado_em = now() where id = ${recipient.tokenId}`;
      }
      console.error("[birthday-push] Falha ao enviar", { tokenId: recipient.tokenId, code });
    }
  }
  return Response.json({ date, pendingRecipients: grouped.size, sent });
};

// Netlify usa UTC: 12h-21h UTC corresponde a 09h-18h em Fortaleza.
// As tentativas repetidas cobrem tokens renovados/ativados depois da primeira hora;
// birthday_push_deliveries garante apenas uma notificação por dispositivo ao dia.
export const config: Config = { schedule: "*/15 12-21 * * *" };
