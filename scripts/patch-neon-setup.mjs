import { readFile, writeFile } from "node:fs/promises";

const envFile = new URL("../.env.example", import.meta.url);
let env = await readFile(envFile, "utf8");
if (!env.includes("NEXT_PUBLIC_DATA_PROVIDER=")) {
  env = env.replace("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\n", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\nNEXT_PUBLIC_DATA_PROVIDER=neon\n");
  await writeFile(envFile, env, "utf8");
}

const setupFile = new URL("./setup-neon-database.mjs", import.meta.url);
let setup = await readFile(setupFile, "utf8");

if (!setup.includes("Dados iniciais garantidos")) {
  setup += `

await sql\`
  insert into app_settings (key, value)
  values (
    'general',
    \${JSON.stringify({
      churchName: "Escola Biblica Resgatai",
      sidebarTitle: "EBR",
      sidebarSubtitle: "Escola Biblica Resgatai",
      sidebarImage: "/ebr-logo.jpg",
      loginTitle: "Gestao organizada para uma EBR mais presente.",
      loginSubtitle: "Login seguro"
    })}::jsonb
  )
  on conflict (key) do nothing
\`;

await sql\`
  insert into team_members (name, username, email, phone, password, role, room, avatar)
  values
    ('Administrador EBR', 'admin', 'admin@ebr.com', '(85) 98800-1100', '123456', 'admin', 'Todas', 'AE'),
    ('Professor Teste', 'professor', 'professor@ebr.com', '(85) 99770-3300', '123456', 'teacher', 'JUVENIS', 'PT')
  on conflict (username) do nothing
\`;

await sql\`
  insert into rooms (name, teacher, age_range, students, avg, accent)
  values ('JUVENIS', 'Professor Teste', '12 a 15 anos', 0, 0, '#3B82F6')
  on conflict (name) do nothing
\`;

await sql\`
  insert into financial_categories (type, name)
  values
    ('entrada', 'ofertas'),
    ('entrada', 'eventos'),
    ('saida', 'materiais'),
    ('saida', 'manutencao')
  on conflict (type, name) do nothing
\`;

console.log("\\nDados iniciais garantidos:");
console.log("- admin / 123456");
console.log("- professor / 123456");
`;

  await writeFile(setupFile, setup, "utf8");
}
