import type { Config, Context } from "@netlify/functions";
import { getNeonSql, jsonResponse } from "./_shared/neon";

export default async (_req: Request, _context: Context) => {
  try {
    const sql = getNeonSql();
    const rows = await sql`
      select
        now() as checked_at,
        current_database() as database_name,
        current_schema() as schema_name
    `;

    return jsonResponse({
      ok: true,
      provider: "neon",
      database: rows[0]
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        provider: "neon",
        message: error instanceof Error ? error.message : "Erro desconhecido ao testar o Neon."
      },
      { status: 500 }
    );
  }
};

export const config: Config = {
  path: "/api/neon/health",
  method: ["GET"]
};
