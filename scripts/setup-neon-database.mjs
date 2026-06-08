import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL nao informada.");
  console.error("Exemplo PowerShell:");
  console.error('$env:DATABASE_URL="postgresql://usuario:senha@host.neon.tech/banco?sslmode=require"; npm run neon:setup');
  process.exit(1);
}

const schemaPath = resolve("database", "neon-schema.sql");
const schema = (await readFile(schemaPath, "utf8"))
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
const statements = schema
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

const sql = neon(databaseUrl);

console.log(`Aplicando schema Neon: ${statements.length} comandos...`);

for (const [index, statement] of statements.entries()) {
  await sql.query(statement);
  console.log(`OK ${index + 1}/${statements.length}`);
}

const tables = await sql`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
  order by table_name
`;

console.log("\nSchema aplicado com sucesso.");
console.log("Tabelas:");
for (const table of tables) {
  console.log(`- ${table.table_name}`);
}


await sql`
  insert into app_settings (key, value)
  values (
    'general',
    ${JSON.stringify({
      churchName: "Escola Biblica Resgatai",
      sidebarTitle: "EBR",
      sidebarSubtitle: "Escola Biblica Resgatai",
      sidebarImage: "/ebr-logo.jpg",
      loginTitle: "Gestao organizada para uma EBR mais presente.",
      loginSubtitle: "Login seguro"
    })}::jsonb
  )
  on conflict (key) do nothing
`;

await sql`
  insert into team_members (name, username, email, phone, password, role, room, avatar)
  values
    ('Administrador EBR', 'admin', 'admin@ebr.com', '(85) 98800-1100', '123456', 'admin', 'Todas', 'AE'),
    ('Professor Teste', 'professor', 'professor@ebr.com', '(85) 99770-3300', '123456', 'teacher', 'JUVENIS', 'PT')
  on conflict (username) do nothing
`;

await sql`
  insert into rooms (name, teacher, age_range, students, avg, accent)
  values ('JUVENIS', 'Professor Teste', '12 a 15 anos', 0, 0, '#3B82F6')
  on conflict (name) do nothing
`;

await sql`
  insert into financial_categories (type, name)
  values
    ('entrada', 'ofertas'),
    ('entrada', 'eventos'),
    ('saida', 'materiais'),
    ('saida', 'manutencao')
  on conflict (type, name) do nothing
`;

console.log("\nDados iniciais garantidos:");
console.log("- admin / 123456");
console.log("- professor / 123456");
