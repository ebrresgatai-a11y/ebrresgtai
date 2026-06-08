import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const supabaseEnvPath = process.env.SUPABASE_ENV_PATH || "C:/Users/ebr/.env.local";

function parseEnvFile(path) {
  const env = {};
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const sourceEnv = parseEnvFile(supabaseEnvPath);
const supabaseUrl = sourceEnv.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = sourceEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseDatabaseUrl = process.env.SUPABASE_DATABASE_URL || sourceEnv.SUPABASE_DATABASE_URL;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(`Nao encontrei as variaveis publicas do Supabase em ${supabaseEnvPath}.`);
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL do Neon nao foi carregada. Rode pelo Netlify dev:exec ou defina DATABASE_URL.");
}

const supabase = createClient(supabaseUrl, supabaseKey);
const sql = neon(databaseUrl);
const sourceSql = supabaseDatabaseUrl ? postgres(supabaseDatabaseUrl, { max: 1, prepare: false }) : null;

const sourceTables = [
  "rooms",
  "students",
  "pending_enrollments",
  "team_members",
  "financial_categories",
  "financial_entries",
  "attendance_records",
  "exams",
  "exam_scores",
  "student_portal_contents",
  "student_library_items",
  "student_ministry_items",
  "student_questions",
  "student_prayer_requests",
  "teacher_schedules",
  "app_settings"
];

async function fetchAll(table) {
  if (sourceSql) {
    return sourceSql.unsafe(`select * from "${table.replaceAll('"', '""')}"`);
  }

  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select("*").range(from, to);
    if (error) throw new Error(`Erro ao ler ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function firstSundayOfMonth(year, month) {
  const date = new Date(Date.UTC(year, Math.max(0, month - 1), 1));
  while (date.getUTCDay() !== 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function asDate(value, month = 1, year = new Date().getFullYear()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return firstSundayOfMonth(Number(year) || new Date().getFullYear(), Number(month) || 1);
}

function asTimestamp(value) {
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

function avatarFromName(name = "") {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function roomName(value) {
  const name = String(value ?? "").trim();
  return name || "Sem sala";
}

async function resetTarget() {
  await sql`
    truncate table
      exam_scores,
      attendance_records,
      student_questions,
      student_prayer_requests,
      student_portal_contents,
      student_library_items,
      student_ministry_items,
      teacher_schedules,
      financial_entries,
      financial_categories,
      pending_enrollments,
      students,
      exams,
      team_members,
      rooms,
      app_settings
    restart identity cascade
  `;
}

async function ensureRoom(name) {
  await sql`
    insert into rooms (name)
    values (${roomName(name)})
    on conflict (name) do nothing
  `;
}

async function importRooms(rows) {
  for (const row of rows) {
    await sql`
      insert into rooms (id, name, teacher, age_range, students, avg, accent, planning, planning_date, planning_updated_by, created_at, updated_at)
      values (
        ${row.id},
        ${roomName(row.name)},
        ${row.teacher ?? ""},
        ${row.age_range ?? row.ageRange ?? ""},
        ${Number(row.students_count ?? row.students ?? 0)},
        ${Number(row.avg ?? 0)},
        ${row.accent ?? "#3B82F6"},
        ${row.planning ?? ""},
        ${row.planning_date || null},
        ${row.planning_updated_by ?? ""},
        ${row.created_at ?? new Date().toISOString()},
        ${row.updated_at ?? new Date().toISOString()}
      )
      on conflict (id) do update set
        name = excluded.name,
        teacher = excluded.teacher,
        age_range = excluded.age_range,
        students = excluded.students,
        avg = excluded.avg,
        accent = excluded.accent,
        planning = excluded.planning,
        planning_date = excluded.planning_date,
        planning_updated_by = excluded.planning_updated_by,
        updated_at = excluded.updated_at
    `;
  }
}

async function importStudents(rows) {
  const seenRa = new Set();
  let fallbackRa = 1;
  for (const row of rows) {
    await ensureRoom(row.room);
    let ra = String(row.ra ?? "").trim();
    if (!/^RA-\d+$/i.test(ra) || seenRa.has(ra)) {
      while (seenRa.has(`RA-${String(fallbackRa).padStart(2, "0")}`)) fallbackRa += 1;
      ra = `RA-${String(fallbackRa).padStart(2, "0")}`;
    }
    seenRa.add(ra);
    await sql`
      insert into students (id, ra, name, phone, room, frequency, status, birthday, age, avatar, photo, created_at, updated_at)
      values (
        ${row.id},
        ${ra},
        ${row.name ?? "Aluno"},
        ${row.phone ?? ""},
        ${roomName(row.room)},
        ${Number(row.frequency ?? 0)},
        ${row.status ?? "Ativo"},
        ${row.birthday ?? ""},
        ${Number(row.age ?? 0)},
        ${row.avatar ?? avatarFromName(row.name)},
        ${row.photo ?? ""},
        ${row.created_at ?? new Date().toISOString()},
        ${row.updated_at ?? new Date().toISOString()}
      )
      on conflict (id) do update set
        ra = excluded.ra,
        name = excluded.name,
        phone = excluded.phone,
        room = excluded.room,
        frequency = excluded.frequency,
        status = excluded.status,
        birthday = excluded.birthday,
        age = excluded.age,
        avatar = excluded.avatar,
        photo = excluded.photo,
        updated_at = excluded.updated_at
    `;
  }
}

async function importPendingEnrollments(rows) {
  for (const row of rows) {
    await sql`
      insert into pending_enrollments (id, name, phone, room, birthday, avatar, photo, created_at)
      values (${row.id}, ${row.name ?? ""}, ${row.phone ?? ""}, ${row.room ?? ""}, ${row.birthday ?? ""}, ${row.avatar ?? avatarFromName(row.name)}, ${row.photo ?? ""}, ${row.created_at ?? new Date().toISOString()})
      on conflict (id) do update set name = excluded.name, phone = excluded.phone, room = excluded.room, birthday = excluded.birthday, avatar = excluded.avatar, photo = excluded.photo
    `;
  }
}

async function importTeam(rows) {
  const seenUsernames = new Set();
  for (const row of rows) {
    const fallbackUsername = String(row.email || row.name || `usuario-${row.id}`).toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
    let username = String(row.username || fallbackUsername || `usuario-${row.id}`).trim();
    if (seenUsernames.has(username)) username = `${username}.${row.id}`;
    seenUsernames.add(username);
    await sql`
      insert into team_members (id, name, username, email, phone, password, role, room, avatar, photo, created_at, updated_at)
      values (${row.id}, ${row.name ?? "Usuario"}, ${username}, ${row.email ?? ""}, ${row.phone ?? ""}, ${row.password ?? "123456"}, ${row.role === "admin" ? "admin" : "teacher"}, ${row.room ?? ""}, ${row.avatar ?? avatarFromName(row.name)}, ${row.photo ?? ""}, ${row.created_at ?? new Date().toISOString()}, ${row.updated_at ?? new Date().toISOString()})
      on conflict (id) do update set name = excluded.name, username = excluded.username, email = excluded.email, phone = excluded.phone, password = excluded.password, role = excluded.role, room = excluded.room, avatar = excluded.avatar, photo = excluded.photo, updated_at = excluded.updated_at
    `;
  }
}

async function importFinancialCategories(rows) {
  for (const row of rows) {
    if (row.type !== "entrada" && row.type !== "saida") continue;
    await sql`
      insert into financial_categories (id, type, name, created_at)
      values (${row.id}, ${row.type}, ${String(row.name ?? "").trim().toLowerCase()}, ${row.created_at ?? new Date().toISOString()})
      on conflict (type, name) do nothing
    `;
  }
}

async function importFinancialEntries(rows) {
  for (const row of rows) {
    const month = Number(row.month || new Date().getMonth() + 1);
    const year = Number(row.year || new Date().getFullYear());
    await sql`
      insert into financial_entries (id, type, title, category, value, date, month, year, created_at, updated_at)
      values (${row.id}, ${row.type === "saida" ? "saida" : "entrada"}, ${row.title ?? row.description ?? "Lancamento"}, ${row.category ?? ""}, ${Number(row.value ?? row.amount ?? 0)}, ${asDate(row.date, month, year)}, ${month}, ${year}, ${row.created_at ?? new Date().toISOString()}, ${row.updated_at ?? new Date().toISOString()})
      on conflict (id) do update set type = excluded.type, title = excluded.title, category = excluded.category, value = excluded.value, date = excluded.date, month = excluded.month, year = excluded.year, updated_at = excluded.updated_at
    `;
  }
}

async function importAttendance(rows) {
  for (const row of rows) {
    await ensureRoom(row.room);
    await sql`
      insert into attendance_records (id, attendance_date, room, student_id, present, created_at, updated_at)
      values (${row.id}, ${asDate(row.attendance_date ?? row.attendanceDate)}, ${roomName(row.room)}, ${row.student_id ?? row.studentId}, ${Boolean(row.present)}, ${row.created_at ?? new Date().toISOString()}, ${row.updated_at ?? new Date().toISOString()})
      on conflict (id) do update set attendance_date = excluded.attendance_date, room = excluded.room, student_id = excluded.student_id, present = excluded.present, updated_at = excluded.updated_at
    `;
  }
}

async function importExams(rows) {
  for (const row of rows) {
    await ensureRoom(row.room);
    await sql`
      insert into exams (id, title, room, month, max_score, created_at, updated_at)
      values (${row.id}, ${row.title ?? "Prova"}, ${roomName(row.room)}, ${Number(row.month ?? 1)}, ${Number(row.max_score ?? row.maxScore ?? 100)}, ${row.created_at ?? new Date().toISOString()}, ${row.updated_at ?? new Date().toISOString()})
      on conflict (id) do update set title = excluded.title, room = excluded.room, month = excluded.month, max_score = excluded.max_score, updated_at = excluded.updated_at
    `;
  }
}

async function importExamScores(rows) {
  for (const row of rows) {
    await sql`
      insert into exam_scores (exam_id, student_id, score, created_at, updated_at)
      values (${row.exam_id ?? row.examId}, ${row.student_id ?? row.studentId}, ${Number(row.score ?? 0)}, ${row.created_at ?? new Date().toISOString()}, ${row.updated_at ?? new Date().toISOString()})
      on conflict (exam_id, student_id) do update set score = excluded.score, updated_at = excluded.updated_at
    `;
  }
}

async function importPortalContents(rows) {
  for (const row of rows) {
    await sql`
      insert into student_portal_contents (id, type, title, body, media_url, room, author_name, active, published_at, created_at, updated_at)
      values (${row.id}, ${row.type ?? "notice"}, ${row.title ?? "Conteudo"}, ${row.body ?? ""}, ${row.media_url ?? row.mediaUrl ?? ""}, ${row.room ?? "Geral"}, ${row.author_name ?? row.authorName ?? ""}, ${row.active ?? true}, ${asTimestamp(row.published_at ?? row.publishedAt)}, ${row.created_at ?? new Date().toISOString()}, ${row.updated_at ?? new Date().toISOString()})
      on conflict (id) do update set type = excluded.type, title = excluded.title, body = excluded.body, media_url = excluded.media_url, room = excluded.room, author_name = excluded.author_name, active = excluded.active, published_at = excluded.published_at, updated_at = excluded.updated_at
    `;
  }
}

async function importLibraryItems(rows) {
  for (const row of rows) {
    await sql`
      insert into student_library_items (id, title, description, price, image_url, payment_url, stock_quantity, active, created_at, updated_at)
      values (${row.id}, ${row.title ?? "Livro"}, ${row.description ?? ""}, ${Number(row.price ?? 0)}, ${row.image_url ?? row.imageUrl ?? ""}, ${row.payment_url ?? row.paymentUrl ?? ""}, ${Number(row.stock_quantity ?? row.stockQuantity ?? 0)}, ${row.active ?? true}, ${row.created_at ?? new Date().toISOString()}, ${row.updated_at ?? new Date().toISOString()})
      on conflict (id) do update set title = excluded.title, description = excluded.description, price = excluded.price, image_url = excluded.image_url, payment_url = excluded.payment_url, stock_quantity = excluded.stock_quantity, active = excluded.active, updated_at = excluded.updated_at
    `;
  }
}

async function importMinistryItems(rows) {
  for (const row of rows) {
    await sql`
      insert into student_ministry_items (id, title, description, price, payment_key, active, created_at, updated_at)
      values (${row.id}, ${row.title ?? "Item"}, ${row.description ?? ""}, ${Number(row.price ?? 0)}, ${row.payment_key ?? row.paymentKey ?? ""}, ${row.active ?? true}, ${row.created_at ?? new Date().toISOString()}, ${row.updated_at ?? new Date().toISOString()})
      on conflict (id) do update set title = excluded.title, description = excluded.description, price = excluded.price, payment_key = excluded.payment_key, active = excluded.active, updated_at = excluded.updated_at
    `;
  }
}

async function importInteractions(table, rows, validStudentIds) {
  for (const row of rows) {
    const studentId = Number(row.student_id ?? row.studentId ?? 0);
    const safeStudentId = validStudentIds.has(studentId) ? studentId : null;
    const query = table === "student_prayer_requests"
      ? sql`insert into student_prayer_requests (id, student_id, student_name, room, message, status, response, created_at, updated_at) values (${row.id}, ${safeStudentId}, ${row.student_name ?? row.studentName ?? ""}, ${row.room ?? ""}, ${row.message ?? ""}, ${row.status ?? "Pendente"}, ${row.response ?? ""}, ${row.created_at ?? new Date().toISOString()}, ${row.updated_at ?? new Date().toISOString()}) on conflict (id) do update set status = excluded.status, response = excluded.response, updated_at = excluded.updated_at`
      : sql`insert into student_questions (id, student_id, student_name, room, message, status, response, created_at, updated_at) values (${row.id}, ${safeStudentId}, ${row.student_name ?? row.studentName ?? ""}, ${row.room ?? ""}, ${row.message ?? ""}, ${row.status ?? "Pendente"}, ${row.response ?? ""}, ${row.created_at ?? new Date().toISOString()}, ${row.updated_at ?? new Date().toISOString()}) on conflict (id) do update set status = excluded.status, response = excluded.response, updated_at = excluded.updated_at`;
    await query;
  }
}

async function importSchedules(rows) {
  for (const row of rows) {
    await sql`
      insert into teacher_schedules (id, schedule_date, teacher_id, teacher_name, position, location, notes, active, created_at, updated_at)
      values (${row.id}, ${asDate(row.schedule_date ?? row.scheduleDate)}, ${row.teacher_id ?? row.teacherId ?? null}, ${row.teacher_name ?? row.teacherName ?? ""}, ${row.position ?? ""}, ${row.location ?? ""}, ${row.notes ?? ""}, ${row.active ?? true}, ${row.created_at ?? new Date().toISOString()}, ${row.updated_at ?? new Date().toISOString()})
      on conflict (id) do update set schedule_date = excluded.schedule_date, teacher_id = excluded.teacher_id, teacher_name = excluded.teacher_name, position = excluded.position, location = excluded.location, notes = excluded.notes, active = excluded.active, updated_at = excluded.updated_at
    `;
  }
}

async function importSettings(rows) {
  for (const row of rows) {
    await sql`
      insert into app_settings (key, value, updated_at)
      values (${row.key ?? "general"}, ${JSON.stringify(row.value ?? {})}::jsonb, ${row.updated_at ?? new Date().toISOString()})
      on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
    `;
  }
}

async function fixSequences() {
  const sequenceTables = [
    "rooms",
    "students",
    "pending_enrollments",
    "team_members",
    "financial_categories",
    "financial_entries",
    "attendance_records",
    "exams",
    "student_portal_contents",
    "student_library_items",
    "student_ministry_items",
    "student_questions",
    "student_prayer_requests",
    "teacher_schedules"
  ];
  for (const table of sequenceTables) {
    await sql`
      select setval(
        pg_get_serial_sequence(${table}, 'id'),
        coalesce((select max(id) from ${sql.unsafe(table)}), 1),
        (select count(*) > 0 from ${sql.unsafe(table)})
      )
    `;
  }
}

async function main() {
  const source = {};
  for (const table of sourceTables) {
    source[table] = await fetchAll(table);
    console.log(`${table}: ${source[table].length}`);
  }

  await resetTarget();
  await importRooms(source.rooms);
  await importStudents(source.students);
  await importPendingEnrollments(source.pending_enrollments);
  await importTeam(source.team_members);
  await importFinancialCategories(source.financial_categories);
  await importFinancialEntries(source.financial_entries);
  await importExams(source.exams);
  await importExamScores(source.exam_scores);
  await importAttendance(source.attendance_records);
  await importPortalContents(source.student_portal_contents);
  await importLibraryItems(source.student_library_items);
  await importMinistryItems(source.student_ministry_items);
  const validStudentIds = new Set(source.students.map((student) => Number(student.id)).filter((id) => id > 0));
  await importInteractions("student_questions", source.student_questions, validStudentIds);
  await importInteractions("student_prayer_requests", source.student_prayer_requests, validStudentIds);
  await importSchedules(source.teacher_schedules);
  await importSettings(source.app_settings);
  await fixSequences();

  const counts = await sql`
    select
      (select count(*)::int from students) as students,
      (select count(*)::int from rooms) as rooms,
      (select count(*)::int from team_members) as team,
      (select count(*)::int from financial_entries) as financial_entries,
      (select count(*)::int from attendance_records) as attendance_records,
      (select count(*)::int from student_portal_contents) as portal_contents,
      (select count(*)::int from student_library_items) as library_items
  `;
  console.log("Importacao Neon concluida:");
  console.log(JSON.stringify(counts[0], null, 2));
  if (sourceSql) await sourceSql.end();
}

main().catch((error) => {
  console.error(error);
  if (sourceSql) sourceSql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
});

