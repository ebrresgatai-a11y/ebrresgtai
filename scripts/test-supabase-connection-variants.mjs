import postgres from "postgres";

const password = process.env.SUPABASE_DB_PASSWORD;
const projectRef = "xknrztbdcvdxbcpiabdn";
const host = "aws-1-sa-east-1.pooler.supabase.com";

if (!password) throw new Error("SUPABASE_DB_PASSWORD nao informada.");

const candidates = [
  { name: "session-project-user", user: `postgres.${projectRef}`, port: 5432, prepare: true },
  { name: "session-postgres-user", user: "postgres", port: 5432, prepare: true },
  { name: "transaction-project-user", user: `postgres.${projectRef}`, port: 6543, prepare: false },
  { name: "transaction-postgres-user", user: "postgres", port: 6543, prepare: false }
];

for (const candidate of candidates) {
  const connection = `postgresql://${candidate.user}:${encodeURIComponent(password)}@${host}:${candidate.port}/postgres?sslmode=require`;
  const sql = postgres(connection, { max: 1, connect_timeout: 8, prepare: candidate.prepare });
  try {
    const rows = await sql`select current_database() as database, current_user as user`;
    console.log(JSON.stringify({ ok: true, name: candidate.name, port: candidate.port, user: candidate.user, row: rows[0] }));
    await sql.end();
  } catch (error) {
    console.log(JSON.stringify({ ok: false, name: candidate.name, port: candidate.port, user: candidate.user, code: error.code, message: error.message }));
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}
