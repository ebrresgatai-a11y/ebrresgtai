import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL não configurada.");

const schema = await readFile(new URL("../database/fcm-notifications.sql", import.meta.url), "utf8");
const statements = schema
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);
const sql = neon(databaseUrl);

for (const statement of statements) await sql.query(statement);

const tables = await sql.query("select table_name from information_schema.tables where table_schema = 'public' and table_name in ('aluno_push_tokens', 'birthday_push_deliveries', 'equipe_push_tokens', 'notificacoes') order by table_name");
console.log("Migração FCM aplicada:", tables.map((row) => row.table_name).join(", "));
process.exit(0);

