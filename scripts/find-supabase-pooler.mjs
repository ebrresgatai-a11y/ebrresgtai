import postgres from "postgres";

const projectRef = process.env.SUPABASE_PROJECT_REF;
const password = process.env.SUPABASE_DB_PASSWORD;

if (!projectRef || !password) {
  throw new Error("Informe SUPABASE_PROJECT_REF e SUPABASE_DB_PASSWORD no ambiente.");
}

const regions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "ca-central-1",
  "sa-east-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-central-2",
  "eu-north-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2"
];

for (const region of regions) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const connection = `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@${host}:6543/postgres?sslmode=require`;
  const sql = postgres(connection, { max: 1, connect_timeout: 5, idle_timeout: 1 });
  try {
    const rows = await sql`select current_database() as database, current_user as user`;
    console.log(JSON.stringify({ ok: true, region, host, database: rows[0]?.database, user: rows[0]?.user }));
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({ ok: false, region, host, message: error instanceof Error ? error.message : String(error) }));
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

process.exit(1);
