import type { Config, Context } from "@netlify/functions";
import { AuthError, requireManagementSession } from "./_shared/auth";
import { getNeonSql, jsonResponse } from "./_shared/neon";

function dateOnly(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function rowsOf(value: unknown) {
  if (Array.isArray(value)) return value as any[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function roomFromRow(row: any) {
  return {
    id: Number(row.id),
    name: row.name ?? "",
    teacher: row.teacher ?? "",
    ageRange: row.age_range ?? "",
    students: Number(row.students_count ?? row.students ?? 0),
    avg: Number(row.avg ?? 0),
    accent: row.accent ?? "#3B82F6",
    planning: row.planning ?? "",
    planningDate: row.planning_date ?? "",
    planningUpdatedBy: row.planning_updated_by ?? ""
  };
}

function studentFromRow(row: any) {
  return {
    id: Number(row.id),
    ra: row.ra ?? "",
    name: row.name ?? "",
    phone: row.phone ?? "",
    room: row.room ?? "",
    frequency: Number(row.frequency ?? 0),
    status: row.status ?? "Ativo",
    birthday: row.birthday ?? "",
    age: Number(row.age ?? 0),
    avatar: row.avatar ?? "",
    photo: row.photo || undefined
  };
}

function teamFromRow(row: any) {
  return {
    id: Number(row.id),
    name: row.name ?? "",
    username: row.username ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    role: row.role ?? "teacher",
    room: row.room ?? "",
    avatar: row.avatar ?? "",
    photo: row.photo || undefined
  };
}

function pendingFromRow(row: any) {
  return {
    id: Number(row.id),
    name: row.name ?? "",
    phone: row.phone ?? "",
    room: row.room ?? "",
    birthday: row.birthday ?? "",
    avatar: row.avatar ?? ""
  };
}

function entryFromRow(row: any) {
  return {
    id: Number(row.id),
    type: row.type,
    title: row.title ?? "",
    category: row.category ?? "",
    value: Number(row.value ?? 0),
    date: dateOnly(row.date),
    month: Number(row.month ?? 0),
    year: Number(row.year ?? 0)
  };
}

function attendanceFromRow(row: any) {
  return {
    id: Number(row.id),
    attendanceDate: dateOnly(row.attendance_date),
    room: row.room ?? "",
    studentId: Number(row.student_id ?? 0),
    present: Boolean(row.present)
  };
}

function examFromRow(row: any, scores: any[]) {
  return {
    id: Number(row.id),
    title: row.title ?? "",
    room: row.room ?? "",
    month: Number(row.month ?? 0),
    maxScore: Number(row.max_score ?? 100),
    scores: Object.fromEntries(scores.filter((score) => Number(score.exam_id) === Number(row.id)).map((score) => [Number(score.student_id), Number(score.score ?? 0)]))
  };
}

export default async (req: Request, _context: Context) => {
  try {
    const session = requireManagementSession(req);
    const sql = getNeonSql();
    const rows = await sql`
      select
        (select coalesce(json_agg(r order by r.id), '[]'::json) from rooms r) as rooms,
        (select coalesce(json_agg(json_build_object('id', s.id, 'ra', s.ra, 'name', s.name, 'phone', s.phone, 'room', s.room, 'frequency', s.frequency, 'status', s.status, 'birthday', s.birthday, 'age', s.age, 'avatar', s.avatar, 'photo', s.photo) order by s.id), '[]'::json) from students s) as students,
        (select coalesce(json_agg(p order by p.id), '[]'::json) from pending_enrollments p) as pending,
        (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'username', t.username, 'email', t.email, 'phone', t.phone, 'role', t.role, 'room', t.room, 'avatar', t.avatar, 'photo', t.photo) order by t.id), '[]'::json) from team_members t) as team,
        (select coalesce(json_agg(c order by c.name), '[]'::json) from financial_categories c) as categories,
        (select coalesce(json_agg(e order by e.id desc), '[]'::json) from financial_entries e) as entries,
        (select coalesce(json_agg(ex order by ex.id desc), '[]'::json) from exams ex) as exams,
        (select coalesce(json_agg(sc), '[]'::json) from exam_scores sc) as scores,
        (select coalesce(json_agg(a order by a.attendance_date desc, a.id desc), '[]'::json) from (select max(id) as id, attendance_date, room, student_id, bool_or(present) as present from attendance_records group by attendance_date, room, student_id) a) as attendance,
        (select value from app_settings where key = 'general' limit 1) as settings
    `;
    const payload = rows[0] ?? {};
    const rooms = rowsOf(payload.rooms);
    const students = rowsOf(payload.students);
    const pending = rowsOf(payload.pending);
    const team = rowsOf(payload.team);
    const categories = rowsOf(payload.categories);
    const entries = rowsOf(payload.entries);
    const exams = rowsOf(payload.exams);
    const scores = rowsOf(payload.scores);
    const attendance = rowsOf(payload.attendance);
    const settingsValue = payload.settings ?? {};
    const room = String(session.room ?? "").trim().toLowerCase();
    const scoped = session.role === "teacher";
    const scopedStudents = scoped ? (students as any[]).filter((item) => String(item.room ?? "").trim().toLowerCase() === room) : students as any[];
    const scopedStudentIds = new Set(scopedStudents.map((item) => Number(item.id)));
    const scopedRooms = scoped ? (rooms as any[]).filter((item) => String(item.name ?? "").trim().toLowerCase() === room) : rooms as any[];
    const scopedAttendance = scoped ? (attendance as any[]).filter((item) => String(item.room ?? "").trim().toLowerCase() === room && scopedStudentIds.has(Number(item.student_id))) : attendance as any[];
    const scopedExams = scoped ? (exams as any[]).filter((item) => String(item.room ?? "").trim().toLowerCase() === room) : exams as any[];
    const scopedExamIds = new Set(scopedExams.map((item) => Number(item.id)));
    const scopedScores = scoped ? (scores as any[]).filter((item) => scopedExamIds.has(Number(item.exam_id)) && scopedStudentIds.has(Number(item.student_id))) : scores as any[];
    const financialCategories = (categories as any[]).reduce(
      (acc, category) => {
        if (category.type === "entrada" || category.type === "saida") acc[category.type].push(category.name);
        return acc;
      },
      { entrada: [] as string[], saida: [] as string[] }
    );

    return jsonResponse({
      students: scopedStudents.map(studentFromRow),
      rooms: scopedRooms.map(roomFromRow),
      pendingEnrollments: scoped ? [] : (pending as any[]).map(pendingFromRow),
      team: scoped ? (team as any[]).filter((item) => Number(item.id) === session.sub).map(teamFromRow) : (team as any[]).map(teamFromRow),
      financialCategories,
      financialEntries: (entries as any[]).map(entryFromRow),
      exams: scopedExams.map((exam) => examFromRow(exam, scopedScores)),
      attendanceRecords: scopedAttendance.map(attendanceFromRow),
      settings: settingsValue
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro ao carregar dados do Neon."
      },
      { status: error instanceof AuthError ? error.status : 500 }
    );
  }
};

export const config: Config = {
  path: "/api/neon/data",
  method: ["GET"]
};





