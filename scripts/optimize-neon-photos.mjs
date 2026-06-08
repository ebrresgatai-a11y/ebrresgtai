import sharp from "sharp";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { buffer: Buffer.from(match[2], "base64") };
}

async function compressDataUrl(value) {
  const parsed = parseDataUrl(value);
  if (!parsed) return value;
  const output = await sharp(parsed.buffer)
    .rotate()
    .resize({ width: 420, height: 420, fit: "cover", withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${output.toString("base64")}`;
}

async function readRows(table) {
  return table === "students"
    ? sql`select id, photo from students where coalesce(photo, '') <> '' order by id`
    : sql`select id, photo from team_members where coalesce(photo, '') <> '' order by id`;
}

async function updatePhoto(table, id, photo) {
  if (table === "students") await sql`update students set photo = ${photo}, updated_at = now() where id = ${id}`;
  else await sql`update team_members set photo = ${photo}, updated_at = now() where id = ${id}`;
}

async function optimizeTable(table) {
  const rows = await readRows(table);
  let changed = 0;
  let before = 0;
  let after = 0;
  for (const row of rows) {
    const original = String(row.photo || "");
    before += original.length;
    const compressed = await compressDataUrl(original);
    after += compressed.length;
    if (compressed.length && compressed.length < original.length) {
      await updatePhoto(table, row.id, compressed);
      changed += 1;
    }
  }
  return { table, rows: rows.length, changed, before, after, saved: before - after };
}

const results = [];
results.push(await optimizeTable("students"));
results.push(await optimizeTable("team_members"));
console.log(JSON.stringify(results, null, 2));
