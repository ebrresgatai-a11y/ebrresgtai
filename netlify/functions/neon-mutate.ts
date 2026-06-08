import type { Config, Context } from "@netlify/functions";
import { getNeonSql, jsonResponse } from "./_shared/neon";

function dateOnly(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

type MutationBody = {
  entity:
    | "student"
    | "room"
    | "team"
    | "financialEntry"
    | "financialCategory"
    | "attendanceRecord"
    | "attendanceBatch"
    | "settings"
    | "schedule"
    | "exam"
    | "examScore"
    | "portalContent"
    | "libraryItem"
    | "ministryItem"
    | "interaction";
  action: "create" | "update" | "delete" | "replaceList" | "upsert";
  payload?: any;
  id?: number;
};

function ensurePayload(body: MutationBody) {
  if (!body.payload && body.action !== "delete") throw new Error("Dados obrigatórios não enviados.");
  return body.payload ?? {};
}

function mapStudent(row: any) {
  return { id: Number(row.id), ra: row.ra ?? "", name: row.name ?? "", phone: row.phone ?? "", room: row.room ?? "", frequency: Number(row.frequency ?? 0), status: row.status ?? "Ativo", birthday: row.birthday ?? "", age: Number(row.age ?? 0), avatar: row.avatar ?? "", photo: row.photo || undefined };
}

function mapRoom(row: any) {
  return { id: Number(row.id), name: row.name ?? "", teacher: row.teacher ?? "", ageRange: row.age_range ?? "", students: Number(row.students ?? 0), avg: Number(row.avg ?? 0), accent: row.accent ?? "#3B82F6", planning: row.planning ?? "", planningDate: row.planning_date ?? "", planningUpdatedBy: row.planning_updated_by ?? "" };
}

function mapTeam(row: any) {
  return { id: Number(row.id), name: row.name ?? "", username: row.username ?? "", email: row.email ?? "", phone: row.phone ?? "", password: row.password ?? "", role: row.role ?? "teacher", room: row.room ?? "", avatar: row.avatar ?? "", photo: row.photo || undefined };
}

function mapFinancialEntry(row: any) {
  return { id: Number(row.id), type: row.type, title: row.title ?? "", category: row.category ?? "", value: Number(row.value ?? 0), date: dateOnly(row.date), month: Number(row.month ?? 0), year: Number(row.year ?? 0) };
}

function mapAttendance(row: any) {
  return { id: Number(row.id), attendanceDate: dateOnly(row.attendance_date), room: row.room ?? "", studentId: Number(row.student_id ?? 0), present: Boolean(row.present) };
}

function mapSchedule(row: any) {
  return { id: Number(row.id), scheduleDate: dateOnly(row.schedule_date), teacherId: row.teacher_id ? Number(row.teacher_id) : undefined, teacherName: row.teacher_name ?? "", position: row.position ?? "", location: row.location ?? "", notes: row.notes ?? "", active: Boolean(row.active) };
}

function mapExam(row: any, scores: any[] = []) {
  return { id: Number(row.id), title: row.title ?? "", room: row.room ?? "", month: Number(row.month ?? 0), maxScore: Number(row.max_score ?? 100), scores: Object.fromEntries(scores.filter((score) => Number(score.exam_id) === Number(row.id)).map((score) => [Number(score.student_id), Number(score.score ?? 0)])) };
}

function mapContent(row: any) {
  return { id: Number(row.id), type: row.type, title: row.title ?? "", body: row.body ?? "", mediaUrl: row.media_url ?? "", room: row.room ?? "Geral", authorName: row.author_name ?? "", active: Boolean(row.active), publishedAt: row.published_at ?? "" };
}

function mapLibrary(row: any) {
  return { id: Number(row.id), title: row.title ?? "", description: row.description ?? "", price: Number(row.price ?? 0), imageUrl: row.image_url ?? "", paymentUrl: row.payment_url ?? "", stockQuantity: Number(row.stock_quantity ?? 0), active: Boolean(row.active) };
}

function mapMinistry(row: any) {
  return { id: Number(row.id), title: row.title ?? "", description: row.description ?? "", price: Number(row.price ?? 0), paymentKey: row.payment_key ?? "", active: Boolean(row.active), createdAt: row.created_at ?? "" };
}

function mapInteraction(row: any) {
  return { id: Number(row.id), studentId: row.student_id ? Number(row.student_id) : undefined, studentName: row.student_name ?? "", room: row.room ?? "", message: row.message ?? "", status: row.status ?? "novo", response: row.response ?? "", createdAt: row.created_at ?? "" };
}

async function mutateStudent(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  if (body.action === "delete") {
    if (!body.id) throw new Error("ID do aluno não informado.");
    await sql`delete from students where id = ${body.id}`;
    return { deleted: true, id: body.id };
  }
  const item = ensurePayload(body);
  if (body.action === "create") {
    const rows = await sql`insert into students (ra, name, phone, room, frequency, status, birthday, age, avatar, photo) values (${item.ra}, ${item.name}, ${item.phone}, ${item.room}, ${item.frequency ?? 0}, ${item.status ?? "Ativo"}, ${item.birthday ?? ""}, ${item.age ?? 0}, ${item.avatar ?? ""}, ${item.photo ?? ""}) returning *`;
    return mapStudent(rows[0]);
  }
  if (!body.id) throw new Error("ID do aluno não informado.");
  const rows = await sql`update students set ra = ${item.ra}, name = ${item.name}, phone = ${item.phone}, room = ${item.room}, frequency = ${item.frequency ?? 0}, status = ${item.status ?? "Ativo"}, birthday = ${item.birthday ?? ""}, age = ${item.age ?? 0}, avatar = ${item.avatar ?? ""}, photo = ${item.photo ?? ""}, updated_at = now() where id = ${body.id} returning *`;
  return mapStudent(rows[0]);
}

async function mutateRoom(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  if (body.action === "delete") {
    if (!body.id) throw new Error("ID da sala não informado.");
    await sql`delete from rooms where id = ${body.id}`;
    return { deleted: true, id: body.id };
  }
  const item = ensurePayload(body);
  if (body.action === "create") {
    const rows = await sql`insert into rooms (name, teacher, age_range, students, avg, accent, planning, planning_date, planning_updated_by) values (${item.name}, ${item.teacher ?? ""}, ${item.ageRange ?? ""}, ${item.students ?? 0}, ${item.avg ?? 0}, ${item.accent ?? "#3B82F6"}, ${item.planning ?? ""}, ${item.planningDate || null}, ${item.planningUpdatedBy ?? ""}) returning *`;
    if (item.teacher) await sql`update team_members set room = ${item.name}, updated_at = now() where role = 'teacher' and lower(name) = lower(${item.teacher})`;
    return mapRoom(rows[0]);
  }
  if (!body.id) throw new Error("ID da sala não informado.");
  const rows = await sql`update rooms set name = ${item.name}, teacher = ${item.teacher ?? ""}, age_range = ${item.ageRange ?? ""}, students = ${item.students ?? 0}, avg = ${item.avg ?? 0}, accent = ${item.accent ?? "#3B82F6"}, planning = ${item.planning ?? ""}, planning_date = ${item.planningDate || null}, planning_updated_by = ${item.planningUpdatedBy ?? ""}, updated_at = now() where id = ${body.id} returning *`;
  if (item.teacher) await sql`update team_members set room = ${item.name}, updated_at = now() where role = 'teacher' and lower(name) = lower(${item.teacher})`;
  return mapRoom(rows[0]);
}

async function mutateTeam(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  if (body.action === "delete") {
    if (!body.id) throw new Error("ID do acesso não informado.");
    await sql`delete from team_members where id = ${body.id}`;
    return { deleted: true, id: body.id };
  }
  const item = ensurePayload(body);
  if (body.action === "create") {
    const rows = await sql`insert into team_members (name, username, email, phone, password, role, room, avatar, photo) values (${item.name}, ${item.username}, ${item.email ?? ""}, ${item.phone ?? ""}, ${item.password}, ${item.role}, ${item.room ?? ""}, ${item.avatar ?? ""}, ${item.photo ?? ""}) returning *`;
    return mapTeam(rows[0]);
  }
  if (!body.id) throw new Error("ID do acesso não informado.");
  const rows = await sql`update team_members set name = ${item.name}, username = ${item.username}, email = ${item.email ?? ""}, phone = ${item.phone ?? ""}, password = ${item.password}, role = ${item.role}, room = ${item.room ?? ""}, avatar = ${item.avatar ?? ""}, photo = ${item.photo ?? ""}, updated_at = now() where id = ${body.id} returning *`;
  return mapTeam(rows[0]);
}

async function mutateFinancialEntry(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  if (body.action === "delete") {
    if (!body.id) throw new Error("ID do lançamento não informado.");
    await sql`delete from financial_entries where id = ${body.id}`;
    return { deleted: true, id: body.id };
  }
  const item = ensurePayload(body);
  if (body.action === "create") {
    const rows = await sql`insert into financial_entries (type, title, category, value, date, month, year) values (${item.type}, ${item.title}, ${item.category}, ${item.value ?? 0}, ${item.date}, ${item.month}, ${item.year}) returning *`;
    return mapFinancialEntry(rows[0]);
  }
  if (!body.id) throw new Error("ID do lançamento não informado.");
  const rows = await sql`update financial_entries set type = ${item.type}, title = ${item.title}, category = ${item.category}, value = ${item.value ?? 0}, date = ${item.date}, month = ${item.month}, year = ${item.year}, updated_at = now() where id = ${body.id} returning *`;
  return mapFinancialEntry(rows[0]);
}

async function mutateFinancialCategory(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  const item = ensurePayload(body);
  if (!item.type) throw new Error("Tipo da categoria não informado.");
  const cleanList = Array.from(new Set((item.items ?? []).map((name: unknown) => String(name || "").trim().toLowerCase()).filter(Boolean)));
  await sql`delete from financial_categories where type = ${item.type}`;
  for (const name of cleanList) {
    await sql`insert into financial_categories (type, name) values (${item.type}, ${name}) on conflict (type, name) do nothing`;
  }
  return { type: item.type, items: cleanList };
}

async function mutateAttendanceRecord(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  const item = ensurePayload(body);
  let rows;
  if (item.id) {
    rows = await sql`update attendance_records set attendance_date = ${item.attendanceDate}, room = ${item.room}, student_id = ${item.studentId}, present = ${Boolean(item.present)}, updated_at = now() where id = ${item.id} returning *`;
  } else {
    const existing = await sql`select id from attendance_records where attendance_date = ${item.attendanceDate} and room = ${item.room} and student_id = ${item.studentId} order by id desc limit 1`;
    rows = existing[0]
      ? await sql`update attendance_records set present = ${Boolean(item.present)}, updated_at = now() where attendance_date = ${item.attendanceDate} and room = ${item.room} and student_id = ${item.studentId} returning *`
      : await sql`insert into attendance_records (attendance_date, room, student_id, present) values (${item.attendanceDate}, ${item.room}, ${item.studentId}, ${Boolean(item.present)}) returning *`;
  }
  if (typeof item.frequency === "number") await sql`update students set frequency = ${item.frequency}, updated_at = now() where id = ${item.studentId}`;
  return mapAttendance(rows[0]);
}

async function mutateAttendanceBatch(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  const item = ensurePayload(body);
  const saved = [];
  for (const record of item.records ?? []) {
    let rows;
    if (record.id) {
      rows = await sql`update attendance_records set attendance_date = ${record.attendanceDate}, room = ${record.room}, student_id = ${record.studentId}, present = ${Boolean(record.present)}, updated_at = now() where id = ${record.id} returning *`;
    } else {
      const existing = await sql`select id from attendance_records where attendance_date = ${record.attendanceDate} and room = ${record.room} and student_id = ${record.studentId} order by id desc limit 1`;
      rows = existing[0]
        ? await sql`update attendance_records set present = ${Boolean(record.present)}, updated_at = now() where attendance_date = ${record.attendanceDate} and room = ${record.room} and student_id = ${record.studentId} returning *`
        : await sql`insert into attendance_records (attendance_date, room, student_id, present) values (${record.attendanceDate}, ${record.room}, ${record.studentId}, ${Boolean(record.present)}) returning *`;
    }
    saved.push(mapAttendance(rows[0]));
  }
  for (const student of item.frequencyUpdates ?? []) {
    await sql`update students set frequency = ${student.frequency ?? 0}, updated_at = now() where id = ${student.id}`;
  }
  return saved;
}

async function mutateSettings(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  const item = ensurePayload(body);
  await sql`insert into app_settings (key, value, updated_at) values ('general', ${JSON.stringify(item)}::jsonb, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`;
  return item;
}

async function mutateSchedule(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  if (body.action === "delete") {
    if (!body.id) throw new Error("ID da escala não informado.");
    await sql`delete from teacher_schedules where id = ${body.id}`;
    return { deleted: true, id: body.id };
  }
  const item = ensurePayload(body);
  if (body.action === "create") {
    const rows = await sql`insert into teacher_schedules (schedule_date, teacher_id, teacher_name, position, location, notes, active) values (${dateOnly(item.scheduleDate)}, ${item.teacherId ?? null}, ${item.teacherName}, ${item.position ?? ""}, ${item.location ?? ""}, ${item.notes ?? ""}, ${item.active ?? true}) returning *`;
    return mapSchedule(rows[0]);
  }
  if (!body.id) throw new Error("ID da escala não informado.");
  const rows = await sql`update teacher_schedules set schedule_date = ${dateOnly(item.scheduleDate)}, teacher_id = ${item.teacherId ?? null}, teacher_name = ${item.teacherName}, position = ${item.position ?? ""}, location = ${item.location ?? ""}, notes = ${item.notes ?? ""}, active = ${item.active ?? true}, updated_at = now() where id = ${body.id} returning *`;
  return mapSchedule(rows[0]);
}

async function mutateExam(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  if (body.action === "delete") {
    if (!body.id) throw new Error("ID da prova não informado.");
    await sql`delete from exam_scores where exam_id = ${body.id}`;
    await sql`delete from exams where id = ${body.id}`;
    return { deleted: true, id: body.id };
  }
  const item = ensurePayload(body);
  if (body.action === "create") {
    const rows = await sql`insert into exams (title, room, month, max_score) values (${item.title}, ${item.room}, ${item.month}, ${item.maxScore ?? 100}) returning *`;
    return mapExam(rows[0], []);
  }
  if (!body.id) throw new Error("ID da prova não informado.");
  const rows = await sql`update exams set title = ${item.title}, room = ${item.room}, month = ${item.month}, max_score = ${item.maxScore ?? 100}, updated_at = now() where id = ${body.id} returning *`;
  const scores = await sql`select * from exam_scores where exam_id = ${body.id}`;
  return mapExam(rows[0], scores);
}

async function mutateExamScore(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  const item = ensurePayload(body);
  await sql`insert into exam_scores (exam_id, student_id, score) values (${item.examId}, ${item.studentId}, ${item.score ?? 0}) on conflict (exam_id, student_id) do update set score = excluded.score, updated_at = now()`;
  return item;
}

async function mutatePortalContent(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  if (body.action === "delete") {
    if (!body.id) throw new Error("ID do conteúdo não informado.");
    await sql`delete from student_portal_contents where id = ${body.id}`;
    return { deleted: true, id: body.id };
  }
  const item = ensurePayload(body);
  if (body.action === "create") {
    const rows = await sql`insert into student_portal_contents (type, title, body, media_url, room, author_name, active, published_at) values (${item.type}, ${item.title}, ${item.body ?? ""}, ${item.mediaUrl ?? ""}, ${item.room ?? "Geral"}, ${item.authorName ?? ""}, ${item.active ?? true}, ${item.publishedAt ?? new Date().toISOString()}) returning *`;
    return mapContent(rows[0]);
  }
  if (!body.id) throw new Error("ID do conteúdo não informado.");
  const rows = await sql`update student_portal_contents set type = ${item.type}, title = ${item.title}, body = ${item.body ?? ""}, media_url = ${item.mediaUrl ?? ""}, room = ${item.room ?? "Geral"}, author_name = ${item.authorName ?? ""}, active = ${item.active ?? true}, published_at = ${item.publishedAt ?? new Date().toISOString()}, updated_at = now() where id = ${body.id} returning *`;
  return mapContent(rows[0]);
}

async function mutateLibraryItem(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  if (body.action === "delete") {
    if (!body.id) throw new Error("ID do livro não informado.");
    await sql`delete from student_library_items where id = ${body.id}`;
    return { deleted: true, id: body.id };
  }
  const item = ensurePayload(body);
  if (body.action === "create") {
    const rows = await sql`insert into student_library_items (title, description, price, image_url, payment_url, stock_quantity, active) values (${item.title}, ${item.description ?? ""}, ${item.price ?? 0}, ${item.imageUrl ?? ""}, ${item.paymentUrl ?? ""}, ${item.stockQuantity ?? 0}, ${item.active ?? true}) returning *`;
    return mapLibrary(rows[0]);
  }
  if (!body.id) throw new Error("ID do livro não informado.");
  const rows = await sql`update student_library_items set title = ${item.title}, description = ${item.description ?? ""}, price = ${item.price ?? 0}, image_url = ${item.imageUrl ?? ""}, payment_url = ${item.paymentUrl ?? ""}, stock_quantity = ${item.stockQuantity ?? 0}, active = ${item.active ?? true}, updated_at = now() where id = ${body.id} returning *`;
  return mapLibrary(rows[0]);
}

async function mutateMinistryItem(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  if (body.action === "delete") {
    if (!body.id) throw new Error("ID do item não informado.");
    await sql`delete from student_ministry_items where id = ${body.id}`;
    return { deleted: true, id: body.id };
  }
  const item = ensurePayload(body);
  if (body.action === "create") {
    const rows = await sql`insert into student_ministry_items (title, description, price, payment_key, active) values (${item.title}, ${item.description ?? ""}, ${item.price ?? 0}, ${item.paymentKey ?? ""}, ${item.active ?? true}) returning *`;
    return mapMinistry(rows[0]);
  }
  if (!body.id) throw new Error("ID do item não informado.");
  const rows = await sql`update student_ministry_items set title = ${item.title}, description = ${item.description ?? ""}, price = ${item.price ?? 0}, payment_key = ${item.paymentKey ?? ""}, active = ${item.active ?? true}, updated_at = now() where id = ${body.id} returning *`;
  return mapMinistry(rows[0]);
}

async function mutateInteraction(sql: ReturnType<typeof getNeonSql>, body: MutationBody) {
  const item = ensurePayload(body);
  const table = item.table === "student_prayer_requests" ? "student_prayer_requests" : "student_questions";
  if (body.action === "create") {
    const rows = table === "student_prayer_requests"
      ? await sql`insert into student_prayer_requests (student_id, student_name, room, message, status, response) values (${item.studentId ?? null}, ${item.studentName}, ${item.room}, ${item.message}, ${item.status ?? "novo"}, ${item.response ?? ""}) returning *`
      : await sql`insert into student_questions (student_id, student_name, room, message, status, response) values (${item.studentId ?? null}, ${item.studentName}, ${item.room}, ${item.message}, ${item.status ?? "novo"}, ${item.response ?? ""}) returning *`;
    return mapInteraction(rows[0]);
  }
  if (!body.id) throw new Error("ID da interação não informado.");
  const rows = table === "student_prayer_requests"
    ? await sql`update student_prayer_requests set status = ${item.status ?? "novo"}, response = ${item.response ?? ""}, updated_at = now() where id = ${body.id} returning *`
    : await sql`update student_questions set status = ${item.status ?? "novo"}, response = ${item.response ?? ""}, updated_at = now() where id = ${body.id} returning *`;
  return mapInteraction(rows[0]);
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return jsonResponse({ message: "Método não permitido." }, { status: 405 });
  try {
    const body = (await req.json()) as MutationBody;
    const sql = getNeonSql();
    const result =
      body.entity === "student" ? await mutateStudent(sql, body) :
      body.entity === "room" ? await mutateRoom(sql, body) :
      body.entity === "team" ? await mutateTeam(sql, body) :
      body.entity === "financialEntry" ? await mutateFinancialEntry(sql, body) :
      body.entity === "financialCategory" ? await mutateFinancialCategory(sql, body) :
      body.entity === "attendanceRecord" ? await mutateAttendanceRecord(sql, body) :
      body.entity === "attendanceBatch" ? await mutateAttendanceBatch(sql, body) :
      body.entity === "settings" ? await mutateSettings(sql, body) :
      body.entity === "schedule" ? await mutateSchedule(sql, body) :
      body.entity === "exam" ? await mutateExam(sql, body) :
      body.entity === "examScore" ? await mutateExamScore(sql, body) :
      body.entity === "portalContent" ? await mutatePortalContent(sql, body) :
      body.entity === "libraryItem" ? await mutateLibraryItem(sql, body) :
      body.entity === "ministryItem" ? await mutateMinistryItem(sql, body) :
      await mutateInteraction(sql, body);
    return jsonResponse({ ok: true, data: result });
  } catch (error) {
    return jsonResponse({ ok: false, message: error instanceof Error ? error.message : "Erro ao salvar no Neon." }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/neon/mutate",
  method: ["POST"]
};




