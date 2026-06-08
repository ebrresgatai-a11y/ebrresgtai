import type { Config, Context } from "@netlify/functions";
import { getNeonSql, jsonResponse } from "./_shared/neon";

function content(row: any) {
  return { id: Number(row.id), type: row.type, title: row.title ?? "", body: row.body ?? "", mediaUrl: row.media_url ?? "", room: row.room ?? "Geral", authorName: row.author_name ?? "", active: Boolean(row.active), publishedAt: row.published_at ?? "" };
}
function library(row: any) {
  return { id: Number(row.id), title: row.title ?? "", description: row.description ?? "", price: Number(row.price ?? 0), imageUrl: row.image_url ?? "", paymentUrl: row.payment_url ?? "", stockQuantity: Number(row.stock_quantity ?? 0), active: Boolean(row.active) };
}
function ministry(row: any) {
  return { id: Number(row.id), title: row.title ?? "", description: row.description ?? "", price: Number(row.price ?? 0), paymentKey: row.payment_key ?? "", active: Boolean(row.active), createdAt: row.created_at ?? "" };
}
function dateOnly(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
function interaction(row: any) {
  return { id: Number(row.id), studentId: row.student_id ? Number(row.student_id) : undefined, studentName: row.student_name ?? "", room: row.room ?? "", message: row.message ?? "", status: row.status ?? "novo", response: row.response ?? "", createdAt: row.created_at ?? "" };
}
function schedule(row: any) {
  return { id: Number(row.id), scheduleDate: dateOnly(row.schedule_date), teacherId: row.teacher_id ? Number(row.teacher_id) : undefined, teacherName: row.teacher_name ?? "", position: row.position ?? "", location: row.location ?? "", notes: row.notes ?? "", active: Boolean(row.active) };
}
function student(row: any) {
  return { id: Number(row.id), ra: row.ra ?? "", name: row.name ?? "", phone: row.phone ?? "", room: row.room ?? "", avatar: row.avatar ?? "", photo: row.photo || undefined, birthday: row.birthday ?? "", age: Number(row.age ?? 0), frequency: Number(row.frequency ?? 0), status: row.status ?? "Ativo" };
}

export default async (req: Request, _context: Context) => {
  try {
    const sql = getNeonSql();
    const url = new URL(req.url);
    const audience = url.searchParams.get("audience") ?? "admin";
    const role = url.searchParams.get("role") ?? "admin";
    const room = url.searchParams.get("room") ?? "";
    const studentId = Number(url.searchParams.get("studentId") ?? 0);

    if (audience === "schedules") {
      const rows = await sql`select * from teacher_schedules order by schedule_date asc`;
      return jsonResponse({ items: rows.map(schedule) });
    }

    if (audience === "enrollment") {
      const [rooms, settingsRows, students] = await Promise.all([
        sql`select name from rooms order by name`,
        sql`select value from app_settings where key = 'general' limit 1`,
        sql`select ra, name, phone, birthday, room from students`
      ]);
      return jsonResponse({ rooms, settings: settingsRows[0]?.value ?? {}, students });
    }

    if (audience === "student") {
      const [contents, libraryItems, ministryItems, settingsRows, questions, prayers] = await Promise.all([
        sql`select * from student_portal_contents where active = true and room in ('Geral', ${room}) order by published_at desc`,
        sql`select * from student_library_items where active = true order by created_at desc`,
        sql`select * from student_ministry_items where active = true order by created_at desc`,
        sql`select value from app_settings where key = 'general' limit 1`,
        studentId ? sql`select * from student_questions where student_id = ${studentId} order by created_at desc limit 60` : Promise.resolve([]),
        studentId ? sql`select * from student_prayer_requests where student_id = ${studentId} order by created_at desc limit 60` : Promise.resolve([])
      ]);
      return jsonResponse({ contents: contents.map(content), libraryItems: libraryItems.map(library), ministryItems: ministryItems.map(ministry), settings: settingsRows[0]?.value ?? {}, questions: questions.map(interaction), prayers: prayers.map(interaction) });
    }

    if (audience === "studentLookup") {
      const rows = await sql`select id, ra, name, phone, room, avatar, photo, birthday, age, frequency, status from students`;
      return jsonResponse({ students: rows.map(student) });
    }

    const [contents, questions, prayers, libraryItems, ministryItems] = role === "teacher"
      ? await Promise.all([
          sql`select * from student_portal_contents where room in ('Geral', ${room}) order by published_at desc`,
          sql`select * from student_questions where room = ${room} order by created_at desc limit 120`,
          sql`select * from student_prayer_requests where room = ${room} order by created_at desc limit 120`,
          Promise.resolve([]),
          Promise.resolve([])
        ])
      : await Promise.all([
          sql`select * from student_portal_contents order by published_at desc`,
          sql`select * from student_questions order by created_at desc limit 120`,
          sql`select * from student_prayer_requests order by created_at desc limit 120`,
          sql`select * from student_library_items order by created_at desc`,
          sql`select * from student_ministry_items order by created_at desc`
        ]);

    return jsonResponse({ contents: contents.map(content), questions: questions.map(interaction), prayers: prayers.map(interaction), libraryItems: libraryItems.map(library), ministryItems: ministryItems.map(ministry) });
  } catch (error) {
    return jsonResponse({ ok: false, message: error instanceof Error ? error.message : "Erro ao carregar dados do portal Neon." }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/neon/portal",
  method: ["GET"]
};
