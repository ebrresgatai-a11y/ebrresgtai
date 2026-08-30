import type { Config, Context } from "@netlify/functions";
import { AuthError, requireManagementSession } from "./_shared/auth";
import { firebaseAdminConfigured, getFirebaseAdminMessaging } from "./_shared/firebase-admin";
import { getNeonSql, jsonResponse } from "./_shared/neon";

type TokenRow = { token: string };

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return jsonResponse({ message: "Método não permitido." }, { status: 405 });
  try {
    const session = requireManagementSession(req);
    const sql = getNeonSql();
    const rows = await sql`select token from equipe_push_tokens where membro_id = ${session.sub} and ativo = true` as TokenRow[];
    const tokens = rows.map((row) => String(row.token || "")).filter(Boolean);
    if (!tokens.length) return jsonResponse({ sent: 0, failed: 0, message: "Nenhum dispositivo ativo. Ative o sino novamente." }, { status: 409 });
    if (!firebaseAdminConfigured()) return jsonResponse({ sent: 0, failed: tokens.length, message: "Firebase não configurado no servidor." }, { status: 503 });

    const title = "Teste de notificação EBR";
    const message = `Notificações funcionando para ${session.name}.`;
    const notificationId = `ebr-teste-${Date.now()}`;
    const result = await getFirebaseAdminMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body: message },
      data: { title, message, type: "teste", link: "/", notificationId },
      webpush: {
        headers: { Urgency: "high" },
        notification: { title, body: message, icon: "/ebr-logo.jpg", badge: "/ebr-logo.jpg", tag: notificationId, data: { link: "/" } },
        fcmOptions: { link: "https://ebrresgatai.netlify.app/" }
      }
    });
    const invalidTokens: string[] = [];
    result.responses.forEach((response, index) => {
      const code = response.error?.code ?? "";
      if (!response.success && (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token"))) invalidTokens.push(tokens[index]);
    });
    for (const token of invalidTokens) await sql`update equipe_push_tokens set ativo = false, atualizado_em = now() where token = ${token}`;
    console.info("[team-push-test] Teste concluído.", { memberId: session.sub, tokens: tokens.length, sent: result.successCount, failed: result.failureCount, invalidated: invalidTokens.length });
    return jsonResponse({
      sent: result.successCount,
      failed: result.failureCount,
      message: result.successCount ? `Teste enviado para ${result.successCount} dispositivo(s).` : "O Firebase recusou os dispositivos. Ative o sino novamente."
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return jsonResponse({ sent: 0, failed: 0, message: error instanceof Error ? error.message : "Falha ao testar notificações." }, { status });
  }
};

export const config: Config = { path: "/api/push/team-test", method: ["POST"] };
