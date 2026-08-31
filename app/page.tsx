"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  Copy,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Image as ImageIcon,
  LayoutDashboard,
  Link as LinkIcon,
  LogOut,
  Medal,
  MessageCircle,
  Menu,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Trophy,
  Upload,
  UserCog,
  UserRoundPlus,
  Users,
  X,
  XCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { fetchNeonJson, isNeonProvider } from "@/lib/data-provider";
import { listenForForegroundPush, registerEbrServiceWorker, registerTeamPushToken } from "@/lib/firebase-client";

type ViewKey =
  | "dashboard"
  | "students"
  | "rooms"
  | "attendance"
  | "exams"
  | "ranking"
  | "birthdays"
  | "finance"
  | "studentPortal"
  | "schedule"
  | "settings";

type Role = "admin" | "teacher";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type AppUser = {
  id: number;
  name: string;
  username: string;
  email: string;
  role: Role;
  avatar: string;
  room?: string;
};

type Student = {
  id: number;
  ra: string;
  name: string;
  phone: string;
  room: string;
  frequency: number;
  status: "Ativo" | "Acompanhar" | "Novo";
  birthday: string;
  age: number;
  avatar: string;
  photo?: string;
};

type Room = {
  id?: number;
  name: string;
  teacher: string;
  ageRange: string;
  students: number;
  avg: number;
  accent: string;
  planning?: string;
  planningDate?: string;
  planningUpdatedBy?: string;
};

type FinancialEntry = {
  id: number;
  type: "entrada" | "saida";
  title: string;
  category: string;
  value: number;
  date: string;
  month: number;
  year: number;
};

type PendingEnrollment = {
  id: number;
  name: string;
  phone: string;
  room: string;
  birthday: string;
  avatar: string;
};

type TeamMember = {
  id: number;
  name: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  role: Role;
  room: string;
  avatar: string;
  photo?: string;
};

type Exam = {
  id: number;
  title: string;
  room: string;
  month: number;
  maxScore: number;
  scores: Record<number, number>;
};

type AttendanceRecord = {
  id?: number;
  attendanceDate: string;
  room: string;
  studentId: number;
  present: boolean;
};


type PortalContentType = "video" | "message" | "lesson" | "notice";

type PortalContent = {
  id?: number;
  type: PortalContentType;
  title: string;
  body: string;
  mediaUrl: string;
  room: string;
  authorName: string;
  active: boolean;
  publishedAt: string;
};

type PortalContentDelivery = PortalContent & {
  pushDelivery?: { saved: number; sent: number };
};

type LibraryItem = {
  id?: number;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  paymentUrl: string;
  stockQuantity: number;
  active: boolean;
};

type MinistryItem = {
  id?: number;
  title: string;
  description: string;
  price: number;
  paymentKey: string;
  imageUrl: string;
  active: boolean;
  createdAt?: string;
};

type TeacherSchedule = {
  id?: number;
  scheduleDate: string;
  teacherId?: number;
  teacherName: string;
  position: string;
  location: string;
  notes: string;
  active: boolean;
};

type StudentInteraction = {
  id?: number;
  studentId?: number;
  studentName: string;
  room: string;
  message: string;
  status: string;
  response: string;
  createdAt: string;
};
type EbrData = {
  students: Student[];
  rooms: Room[];
  pendingEnrollments: PendingEnrollment[];
  team: TeamMember[];
  financialCategories: Record<FinancialEntry["type"], string[]>;
  financialEntries: FinancialEntry[];
  exams: Exam[];
  attendanceRecords: AttendanceRecord[];
  settings: Record<string, string>;
};

const navItems: Array<{ key: ViewKey; label: string; icon: LucideIcon; roles: Role[] }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "teacher"] },
  { key: "students", label: "Alunos", icon: Users, roles: ["admin", "teacher"] },
  { key: "rooms", label: "Salas", icon: BookOpenCheck, roles: ["admin", "teacher"] },
  { key: "attendance", label: "Chamada", icon: Check, roles: ["admin", "teacher"] },
  { key: "exams", label: "Provas", icon: FileText, roles: ["admin", "teacher"] },
  { key: "ranking", label: "Ranking", icon: Trophy, roles: ["admin", "teacher"] },
  { key: "birthdays", label: "Aniversariantes", icon: CalendarDays, roles: ["admin", "teacher"] },
  { key: "finance", label: "Financeiro", icon: DollarSign, roles: ["admin", "teacher"] },
  { key: "studentPortal", label: "Portal do Aluno", icon: MessageCircle, roles: ["admin", "teacher"] },
  { key: "schedule", label: "Escala", icon: CalendarDays, roles: ["admin", "teacher"] },
  { key: "settings", label: "Configurações", icon: Settings, roles: ["admin"] }
];

const DEFAULT_BIRTHDAY_MESSAGE = "Parabéns, {nome}! A EBR deseja um dia muito abençoado para você.";
const BIRTHDAY_MESSAGE_STORAGE_KEY = "ebr-birthday-message";

const demoUsers: AppUser[] = [
  { id: 1, name: "Pr. Renato", username: "admin", email: "admin@ebd.com", role: "admin", avatar: "PR" },
  { id: 2, name: "Larissa Melo", username: "professor", email: "professor@ebd.com", role: "teacher", avatar: "LM", room: "Adolescentes" }
];

const students: Student[] = [
  { id: 1, ra: "RA-01", name: "Ana Beatriz Lima", phone: "(85) 99121-4401", room: "Jovens 1", frequency: 98, status: "Ativo", birthday: "Hoje", age: 17, avatar: "AB" },
  { id: 2, ra: "RA-02", name: "Miguel Santos", phone: "(85) 98842-9030", room: "Adolescentes", frequency: 94, status: "Ativo", birthday: "23 mai", age: 14, avatar: "MS" },
  { id: 3, ra: "RA-03", name: "Clara Oliveira", phone: "(85) 98210-6309", room: "Juniores", frequency: 89, status: "Novo", birthday: "Hoje", age: 11, avatar: "CO" },
  { id: 4, ra: "RA-04", name: "Lucas Ferreira", phone: "(85) 99732-1290", room: "Adultos", frequency: 87, status: "Ativo", birthday: "04 jun", age: 32, avatar: "LF" },
  { id: 5, ra: "RA-05", name: "Sofia Martins", phone: "(85) 98410-7650", room: "Jovens 2", frequency: 83, status: "Acompanhar", birthday: "11 jun", age: 20, avatar: "SM" },
  { id: 6, ra: "RA-06", name: "Davi Rocha", phone: "(85) 98788-1180", room: "Adolescentes", frequency: 78, status: "Acompanhar", birthday: "Hoje", age: 15, avatar: "DR" },
  { id: 7, ra: "RA-07", name: "Helena Costa", phone: "(85) 99877-3312", room: "Infantil", frequency: 92, status: "Ativo", birthday: "18 mai", age: 8, avatar: "HC" }
];

const rooms: Room[] = [
  { name: "Infantil", teacher: "Priscila Nunes", ageRange: "4 a 8 anos", students: 28, avg: 92, accent: "#22C55E", planning: "Recepção, louvor com gestos e história bíblica ilustrada.", planningDate: getTodayInputDate(), planningUpdatedBy: "Priscila Nunes" },
  { name: "Juniores", teacher: "Marcos Paulo", ageRange: "9 a 12 anos", students: 22, avg: 88, accent: "#3B82F6", planning: "Revisão em grupos e atividade de memorização.", planningDate: getTodayInputDate(), planningUpdatedBy: "Marcos Paulo" },
  { name: "Adolescentes", teacher: "Larissa Melo", ageRange: "13 a 17 anos", students: 31, avg: 86, accent: "#F59E0B", planning: "Debate guiado, chamada ativa e acompanhamento dos ausentes.", planningDate: getTodayInputDate(), planningUpdatedBy: "Larissa Melo" },
  { name: "Jovens 1", teacher: "Rafael Castro", ageRange: "18 a 24 anos", students: 26, avg: 91, accent: "#1E3A5F", planning: "Aula dialogada com aplicação prática e tarefa semanal.", planningDate: getTodayInputDate(), planningUpdatedBy: "Rafael Castro" },
  { name: "Jovens 2", teacher: "Bianca Araujo", ageRange: "25 a 35 anos", students: 19, avg: 84, accent: "#8B5CF6", planning: "Estudo por perguntas e roda de compartilhamento.", planningDate: getTodayInputDate(), planningUpdatedBy: "Bianca Araujo" },
  { name: "Adultos", teacher: "Daniel Vieira", ageRange: "36 anos ou mais", students: 42, avg: 89, accent: "#0EA5E9", planning: "Exposição bíblica, debate e encaminhamento pastoral.", planningDate: getTodayInputDate(), planningUpdatedBy: "Daniel Vieira" }
];

const monthlyPresence: { month: string; presenca: number; engajamento: number }[] = [];

const roomFrequency = rooms.map((room) => ({ name: room.name, freq: room.avg }));

const initialFinancialEntries: FinancialEntry[] = [
  { id: 1, type: "entrada", title: "Oferta EBR", category: "ofertas", value: 1250, date: "08 mai", month: 5, year: 2026 },
  { id: 2, type: "saida", title: "Material didático", category: "materiais", value: 420, date: "10 mai", month: 5, year: 2026 },
  { id: 3, type: "entrada", title: "Evento de jovens", category: "eventos", value: 860, date: "12 mai", month: 5, year: 2026 },
  { id: 4, type: "saida", title: "Lanche das turmas", category: "alimentação", value: 310, date: "15 mai", month: 5, year: 2026 },
  { id: 5, type: "entrada", title: "Campanha missionária", category: "eventos", value: 980, date: "18 abr", month: 4, year: 2026 },
  { id: 6, type: "saida", title: "Impressão de apostilas", category: "materiais", value: 260, date: "22 abr", month: 4, year: 2026 },
  { id: 7, type: "entrada", title: "Saldo inicial", category: "ofertas", value: 700, date: "15 dez", month: 12, year: 2025 }
];

const financeMonthly = [
  { month: "Jan", entradas: 2100, saidas: 980 },
  { month: "Fev", entradas: 2450, saidas: 1150 },
  { month: "Mar", entradas: 2300, saidas: 1320 },
  { month: "Abr", entradas: 2760, saidas: 1210 },
  { month: "Mai", entradas: 2110, saidas: 730 }
];

const monthOptions = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Fev" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Abr" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Ago" },
  { value: 9, label: "Set" },
  { value: 10, label: "Out" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dez" }
];

const initialExams: Exam[] = [
  { id: 1, title: "Prova do trimestre", room: "Adolescentes", month: 5, maxScore: 10, scores: { 2: 9, 6: 7 } },
  { id: 2, title: "Revisão bíblica", room: "Jovens 1", month: 5, maxScore: 10, scores: { 1: 10 } },
  { id: 3, title: "Atividade mensal", room: "Infantil", month: 5, maxScore: 10, scores: { 7: 8 } },
  { id: 4, title: "Prova de fundamentos", room: "Juniores", month: 4, maxScore: 10, scores: { 3: 8 } },
  { id: 5, title: "Classe adultos", room: "Adultos", month: 5, maxScore: 10, scores: { 4: 9 } },
  { id: 6, title: "Desafio jovens", room: "Jovens 2", month: 5, maxScore: 10, scores: { 5: 7 } }
];

const initialAttendanceRecords: AttendanceRecord[] = [];

const pendingEnrollments: PendingEnrollment[] = [
  { id: 1, name: "Theo Almeida", phone: "(85) 98811-2288", room: "Juniores", birthday: "2014-05-20", avatar: "TA" },
  { id: 2, name: "Laura Mendes", phone: "(85) 99931-7710", room: "Infantil", birthday: "2018-03-12", avatar: "LM" }
];

const initialTeam: TeamMember[] = [];

const initialCategories: Record<FinancialEntry["type"], string[]> = {
  entrada: ["ofertas", "eventos", "campanhas"],
  saida: ["alimentação", "manutenção", "materiais"]
};

const initialEbrData: EbrData = {
  students,
  rooms,
  pendingEnrollments,
  team: initialTeam,
  financialCategories: initialCategories,
  financialEntries: initialFinancialEntries,
  exams: initialExams,
  attendanceRecords: initialAttendanceRecords,
  settings: {
    churchName: "Igreja Vida Plena",
    coordinator: "",
    defaultTime: "",
    welcomeMessage: "",
    sidebarTitle: "EBR",
    sidebarSubtitle: "Escola Bíblica Resgatai",
    sidebarImage: "/ebr-logo.jpg",
    loginTitle: "Gestão organizada para uma EBR mais presente.",
    loginSubtitle: "Login seguro",
    libraryPaymentUrl: "",
    ministryPaymentUrl: "",
    ministryWhatsapp: "",
    libraryWhatsapp: ""
  }
};

const EBR_DATA_STORAGE_KEY = "ebr-data";
const EBR_DELETED_STUDENTS_KEY = "ebr-deleted-students";
const EBR_SESSION_STORAGE_KEY = "ebr-session";
const EBR_ACTIVE_VIEW_STORAGE_KEY = "ebr-active-view";
const EBR_ATTENDANCE_START_DATE = "2026-01-11";

function getDeletedStudentKeys() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    return new Set(JSON.parse(localStorage.getItem(EBR_DELETED_STUDENTS_KEY) ?? "[]") as string[]);
  } catch {
    return new Set<string>();
  }
}

function isLocallyDeletedStudent(student: Student) {
  const keys = getDeletedStudentKeys();
  return keys.has(String(student.id));
}

function rememberDeletedStudent(student: Student) {
  if (typeof window === "undefined") return;
  const keys = getDeletedStudentKeys();
  keys.add(String(student.id));
  try {
    localStorage.setItem(EBR_DELETED_STUDENTS_KEY, JSON.stringify(Array.from(keys)));
  } catch {
    // Persistência local pode falhar em navegadores com armazenamento bloqueado.
  }
}

function normalizeRoomName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function sameRoomName(a?: string, b?: string) {
  return normalizeRoomName(a ?? "") === normalizeRoomName(b ?? "");
}

function isTeachersRoom(room: Room) {
  const normalized = normalizeRoomName(room.name);
  return normalized === "professores" || normalized === "professor";
}

function normalizeAvatar(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function readLocalEbrData(): EbrData {
  if (typeof window === "undefined") return initialEbrData;
  try {
    const stored = localStorage.getItem(EBR_DATA_STORAGE_KEY);
    if (!stored) return initialEbrData;
    const parsed = JSON.parse(stored) as Partial<EbrData>;
    return {
      students: (parsed.students ?? initialEbrData.students).filter((student) => !isLocallyDeletedStudent(student)),
      rooms: parsed.rooms ?? initialEbrData.rooms,
      pendingEnrollments: parsed.pendingEnrollments ?? initialEbrData.pendingEnrollments,
      team: parsed.team ?? initialEbrData.team,
      financialCategories: parsed.financialCategories ?? initialEbrData.financialCategories,
      financialEntries: parsed.financialEntries ?? initialEbrData.financialEntries,
      exams: parsed.exams ?? initialEbrData.exams,
      attendanceRecords: parsed.attendanceRecords ?? initialEbrData.attendanceRecords,
      settings: { ...initialEbrData.settings, ...(parsed.settings ?? {}) }
    };
  } catch {
    return initialEbrData;
  }
}

function writeLocalEbrData(data: EbrData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EBR_DATA_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Persistência local pode falhar em navegadores com armazenamento bloqueado.
  }
}

function fromDbRoom(row: any): Room {
  return {
    id: Number(row.id),
    name: row.name,
    teacher: row.teacher,
    ageRange: row.age_range,
    students: Number(row.students_count ?? 0),
    avg: Number(row.avg ?? 0),
    accent: row.accent ?? "#3B82F6",
    planning: row.planning ?? "",
    planningDate: row.planning_date ?? "",
    planningUpdatedBy: row.planning_updated_by ?? ""
  };
}

function toDbRoom(room: Room) {
  return {
    name: room.name,
    teacher: room.teacher,
    age_range: room.ageRange,
    students_count: room.students,
    avg: room.avg,
    accent: room.accent,
    planning: room.planning ?? "",
    planning_date: room.planningDate || null,
    planning_updated_by: room.planningUpdatedBy ?? ""
  };
}

const STUDENT_CORE_COLUMNS = "id,ra,name,phone,room,frequency,status,birthday,age,avatar";
const STUDENT_PHOTO_COLUMNS = "id,photo";
const TEAM_CORE_COLUMNS = "id,name,username,email,phone,password,role,room,avatar";

function fromDbStudent(row: any): Student {
  return {
    id: Number(row.id),
    ra: row.ra,
    name: row.name,
    phone: row.phone,
    room: row.room,
    frequency: Number(row.frequency ?? 0),
    status: row.status,
    birthday: row.birthday,
    age: calculateAge(row.birthday) || Number(row.age ?? 0),
    avatar: row.avatar || normalizeAvatar(row.name),
    photo: row.photo ?? undefined
  };
}

function toDbStudent(student: Student) {
  return {
    ra: student.ra,
    name: student.name,
    phone: student.phone,
    room: student.room,
    frequency: student.frequency,
    status: student.status,
    birthday: student.birthday,
    age: calculateAge(student.birthday) || student.age,
    avatar: student.avatar,
    photo: student.photo ?? null
  };
}

function fromDbPending(row: any): PendingEnrollment {
  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone,
    room: row.room,
    birthday: row.birthday,
    avatar: row.avatar || normalizeAvatar(row.name)
  };
}

function fromDbTeam(row: any): TeamMember {
  return {
    id: Number(row.id),
    name: row.name,
    username: row.username,
    email: row.email,
    phone: row.phone,
    password: row.password,
    role: row.role,
    room: row.room,
    avatar: row.avatar || normalizeAvatar(row.name),
    photo: row.photo ?? undefined
  };
}

function toDbTeam(member: TeamMember) {
  return {
    name: member.name,
    username: member.username,
    email: member.email,
    phone: member.phone,
    password: member.password,
    role: member.role,
    room: member.room,
    avatar: member.avatar,
    photo: member.photo ?? null
  };
}

function fromDbEntry(row: any): FinancialEntry {
  const month = Number(row.month);
  const year = Number(row.year);
  return {
    id: Number(row.id),
    type: row.type,
    title: row.title,
    category: row.category,
    value: Number(row.value ?? 0),
    date: normalizeFinancialEntryDate(row.date, month, year),
    month,
    year
  };
}

function toDbEntry(entry: FinancialEntry) {
  return {
    type: entry.type,
    title: entry.title,
    category: entry.category,
    value: entry.value,
    date: normalizeFinancialEntryDate(entry.date, entry.month, entry.year),
    month: entry.month,
    year: entry.year
  };
}

function fromDbExam(exam: any, scores: any[]): Exam {
  return {
    id: Number(exam.id),
    title: exam.title,
    room: exam.room,
    month: Number(exam.month),
    maxScore: Number(exam.max_score),
    scores: Object.fromEntries(scores.filter((score) => Number(score.exam_id) === Number(exam.id)).map((score) => [Number(score.student_id), Number(score.score)]))
  };
}

function normalizeStoredDate(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function fromDbAttendance(row: any): AttendanceRecord {
  return {
    id: Number(row.id),
    attendanceDate: normalizeStoredDate(row.attendance_date),
    room: row.room,
    studentId: Number(row.student_id),
    present: Boolean(row.present)
  };
}

function toDbAttendance(record: AttendanceRecord) {
  return {
    attendance_date: record.attendanceDate,
    room: record.room,
    student_id: record.studentId,
    present: record.present,
    updated_at: new Date().toISOString()
  };
}

async function loadEbrData(): Promise<EbrData> {
  if (isNeonProvider) {
    try {
      const data = await fetchNeonJson<Partial<EbrData>>("/api/neon/data");
      return {
        students: data.students ?? [],
        rooms: data.rooms ?? [],
        pendingEnrollments: data.pendingEnrollments ?? [],
        team: data.team ?? [],
        financialCategories: data.financialCategories ?? initialEbrData.financialCategories,
        financialEntries: data.financialEntries ?? [],
        exams: data.exams ?? [],
        attendanceRecords: data.attendanceRecords ?? [],
        settings: { ...initialEbrData.settings, ...(data.settings ?? {}) }
      };
    } catch (error) {
      console.error("Erro ao carregar Neon", error);
      return readLocalEbrData();
    }
  }

  if (!supabase) return readLocalEbrData();

  const [
    roomsResult,
    studentsResult,
    pendingResult,
    teamResult,
    categoryResult,
    entriesResult,
    examsResult,
    scoresResult,
    attendanceResult,
    settingsResult
  ] = await Promise.all([
    supabase.from("rooms").select("*").order("id"),
    supabase.from("students").select(STUDENT_CORE_COLUMNS).order("id"),
    supabase.from("pending_enrollments").select("*").order("id"),
    supabase.from("team_members").select(TEAM_CORE_COLUMNS).order("id"),
    supabase.from("financial_categories").select("*").order("name"),
    supabase.from("financial_entries").select("*").order("id", { ascending: false }),
    supabase.from("exams").select("*").order("id", { ascending: false }),
    supabase.from("exam_scores").select("*"),
    supabase.from("attendance_records").select("*").order("attendance_date", { ascending: false }),
    supabase.from("app_settings").select("*").eq("key", "general").maybeSingle()
  ]);

  const failedResults = { roomsResult, studentsResult, pendingResult, teamResult, categoryResult, entriesResult, examsResult, scoresResult, attendanceResult, settingsResult };
  const hasError = Object.values(failedResults).some((result) => result.error);
  if (hasError) {
    console.error("Erro parcial ao carregar Supabase", failedResults);
    const localData = readLocalEbrData();
    return {
      ...localData,
      settings: {
        ...initialEbrData.settings,
        ...localData.settings,
        ...((settingsResult.error ? null : settingsResult.data?.value as Record<string, string> | null) ?? {})
      }
    };
  }

  const categories = (categoryResult.error ? [] : categoryResult.data ?? []).reduce<Record<FinancialEntry["type"], string[]>>(
    (acc, category) => {
      acc[category.type as FinancialEntry["type"]].push(category.name);
      return acc;
    },
    { entrada: [], saida: [] }
  );

  return {
    students: (studentsResult.error ? [] : studentsResult.data ?? []).map(fromDbStudent),
    rooms: (roomsResult.error ? [] : roomsResult.data ?? []).map(fromDbRoom),
    pendingEnrollments: (pendingResult.error ? [] : pendingResult.data ?? []).map(fromDbPending),
    team: (teamResult.error ? [] : teamResult.data ?? []).map(fromDbTeam),
    financialCategories: {
      entrada: categories.entrada,
      saida: categories.saida
    },
    financialEntries: (entriesResult.error ? [] : entriesResult.data ?? []).map(fromDbEntry),
    exams: (examsResult.error ? [] : examsResult.data ?? []).map((exam) => fromDbExam(exam, scoresResult.error ? [] : scoresResult.data ?? [])),
    attendanceRecords: (attendanceResult.error ? [] : attendanceResult.data ?? []).map(fromDbAttendance),
    settings: {
      ...initialEbrData.settings,
      ...((settingsResult.error ? null : settingsResult.data?.value as Record<string, string> | null) ?? {})
    }
  };
}

async function loadStudentPhoto(studentId: number) {
  if (isNeonProvider || !supabase || !studentId) return "";
  const { data, error } = await supabase.from("students").select(STUDENT_PHOTO_COLUMNS).eq("id", studentId).maybeSingle();
  return error ? "" : String(data?.photo ?? "");
}

type NeonEntity = "student" | "room" | "team" | "financialEntry" | "financialEntryBatch" | "financialCategory" | "attendanceRecord" | "attendanceBatch" | "settings" | "schedule" | "exam" | "examScore" | "portalContent" | "libraryItem" | "ministryItem" | "interaction";
type NeonAction = "create" | "update" | "delete" | "replaceList" | "upsert";

async function neonMutate<T>(entity: NeonEntity, action: NeonAction, payload?: unknown, id?: number) {
  const result = await fetchNeonJson<{ ok: boolean; data: T }>("/api/neon/mutate", {
    method: "POST",
    body: JSON.stringify({ entity, action, payload, id })
  });
  return result.data;
}

function getNextRa(existingStudents: Student[]) {
  const usedNumbers = new Set(
    existingStudents
      .map((student) => Number(student.ra.match(/RA-(\d+)/)?.[1] ?? 0))
      .filter((value) => value > 0)
  );
  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) nextNumber += 1;
  return `RA-${String(nextNumber).padStart(2, "0")}`;
}

function phoneToWhatsapp(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/55${digits}`;
}

function formatBrazilPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function normalizeLoginValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function loginDigits(value: string) {
  return value.replace(/\D/g, "");
}

function memberMatchesLogin(member: TeamMember, login: string) {
  const normalizedLogin = normalizeLoginValue(login);
  const digits = loginDigits(login);
  if (!normalizedLogin) return false;
  return [member.username, member.email, member.name]
    .map((value) => normalizeLoginValue(value ?? ""))
    .some((value) => value === normalizedLogin) || Boolean(digits && loginDigits(member.phone ?? "") === digits);
}

function memberMatchesPassword(member: TeamMember, password: string) {
  return String(member.password ?? "").trim() === password.trim();
}

function formatCurrencyBRL(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeStudentIdentity(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function onlyPhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isDuplicateStudent(candidate: Pick<Student, "name" | "phone" | "birthday" | "room">, existingStudents: Student[], ignoreId?: number) {
  const candidateName = normalizeStudentIdentity(candidate.name);
  const candidatePhone = onlyPhoneDigits(candidate.phone);
  const candidateBirthday = normalizeDateInput(candidate.birthday);
  const candidateRoom = normalizeRoomName(candidate.room);

  return existingStudents.some((student) => {
    if (ignoreId && student.id === ignoreId) return false;
    const sameName = Boolean(candidateName && normalizeStudentIdentity(student.name) === candidateName);
    const samePhone = Boolean(candidatePhone && onlyPhoneDigits(student.phone) === candidatePhone);
    const sameBirthday = Boolean(candidateBirthday && normalizeDateInput(student.birthday) === candidateBirthday);
    const sameRoom = Boolean(candidateRoom && normalizeRoomName(student.room) === candidateRoom);
    return sameName && samePhone && sameBirthday && sameRoom;
  });
}

function normalizeDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayInputDate() {
  return toInputDate(new Date());
}

function getServiceDateOptions() {
  const today = new Date();
  const start = new Date(`${EBR_ATTENDANCE_START_DATE}T00:00:00`);
  const end = new Date(today);
  end.setDate(today.getDate() + 70);
  const options: string[] = [];

  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const day = cursor.getDay();
    if (day === 0 || day === 4) options.push(toInputDate(cursor));
  }

  return options.sort((a, b) => b.localeCompare(a));
}

function getDefaultAttendanceDate() {
  const today = new Date();
  for (let offset = 0; offset <= 6; offset += 1) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + offset);
    const day = candidate.getDay();
    if (day === 0 || day === 4) return toInputDate(candidate);
  }
  return getTodayInputDate();
}

function getUpcomingSundayOptions(reference = new Date()) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const options: string[] = [];
  for (let offset = 0; options.length < 14 && offset < 120; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    if (candidate.getDay() === 0) options.push(toInputDate(candidate));
  }
  return options;
}

function getNextSundayInputDate() {
  return getUpcomingSundayOptions()[0] ?? getTodayInputDate();
}

function calculateAge(birthday: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return 0;
  const birthDate = new Date(`${birthday}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return Math.max(age, 0);
}

function isBirthdayToday(birthday: string) {
  if (birthday === "Hoje") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return false;
  const [, month, day] = birthday.split("-").map(Number);
  const today = new Date();
  return today.getMonth() + 1 === month && today.getDate() === day;
}

function formatBirthdayLabel(birthday: string) {
  if (isBirthdayToday(birthday)) return "Hoje";
  if (/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    const [, month, day] = birthday.split("-").map(Number);
    return `${String(day).padStart(2, "0")} ${monthLabel(month).slice(0, 3).toLowerCase()}`;
  }
  return birthday || "Sem data";
}

function isPlanningActive(room: Room) {
  if (!room.planning?.trim()) return false;
  if (!room.planningDate) return true;
  return room.planningDate >= getTodayInputDate();
}

function getVisiblePlanning(room: Room) {
  return isPlanningActive(room) ? room.planning?.trim() ?? "" : "";
}

function formatPlanningDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "sem data definida";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getTeacherRoom(user: AppUser) {
  return user.role === "teacher" ? user.room ?? "Adolescentes" : undefined;
}

function scopeStudentsForUser(user: AppUser, source = students) {
  const teacherRoom = getTeacherRoom(user);
  return teacherRoom ? source.filter((student) => sameRoomName(student.room, teacherRoom)) : source;
}

function scopeRoomsForUser(user: AppUser, source = rooms) {
  const teacherRoom = getTeacherRoom(user);
  return teacherRoom ? source.filter((room) => sameRoomName(room.name, teacherRoom)) : source;
}

function monthLabel(month: number) {
  return monthOptions.find((item) => item.value === month)?.label ?? "Mês";
}

function normalizeFinancialEntryDate(value: unknown, month?: number, year?: number) {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const match = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/^(\d{1,2})\s+([a-z]{3})/);
  const monthAliases: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  const parsedDay = match ? Number(match[1]) : 0;
  const parsedMonth = match ? monthAliases[match[2]] : 0;
  const finalMonth = parsedMonth || Number(month) || getCurrentMonth();
  const finalYear = Number(year) || new Date().getFullYear();
  const finalDay = Math.max(1, Math.min(new Date(finalYear, finalMonth, 0).getDate(), parsedDay || 1));
  return finalYear + "-" + String(finalMonth).padStart(2, "0") + "-" + String(finalDay).padStart(2, "0");
}

function makeFinancialEntryDate(day: number, month: number, year: number) {
  return year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

function getFinancialEntryDay(entry: FinancialEntry) {
  const normalized = normalizeFinancialEntryDate(entry.date, entry.month, entry.year);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? Number(normalized.slice(8, 10)) : 0;
}

function formatFinancialEntryDate(entry: FinancialEntry) {
  return formatPlanningDate(normalizeFinancialEntryDate(entry.date, entry.month, entry.year));
}

function getFinancialDayOptions(month: string | number, year: number) {
  const monthNumber = Number(month) || getCurrentMonth();
  const totalDays = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: totalDays }, (_, index) => index + 1).filter((day) => new Date(year, monthNumber - 1, day).getDay() === 0);
}

function getFinancialFilterDayOptions(entries: FinancialEntry[], selectedMonth: string, selectedYear: number) {
  return Array.from(new Set(
    entries
      .filter((entry) => entry.year === selectedYear && (selectedMonth === "todos" || entry.month === Number(selectedMonth)))
      .map(getFinancialEntryDay)
      .filter((day) => day > 0)
  )).sort((a, b) => a - b);
}

function getDefaultFinancialSunday(month: string | number, year: number) {
  const monthNumber = Number(month) || getCurrentMonth();
  const options = getFinancialDayOptions(monthNumber, year);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === monthNumber;
  if (isCurrentMonth) return options.find((day) => day >= today.getDate()) ?? options[0] ?? 1;
  return options[0] ?? 1;
}

function getFinancialEntrySundayDay(entry: FinancialEntry) {
  const day = getFinancialEntryDay(entry);
  const options = getFinancialDayOptions(entry.month, entry.year);
  return options.includes(day) ? day : (options[0] ?? (day || 1));
}

function getCurrentMonth() {
  return new Date().getMonth() + 1;
}

function getCurrentYear() {
  return new Date().getFullYear();
}

function getExamTotal(studentId: number, exams = initialExams) {
  return exams.reduce((sum, exam) => sum + (exam.scores[studentId] ?? 0), 0);
}

function hasExamScoreTen(studentId: number, exams: Exam[]) {
  return exams.some((exam) => Number(exam.scores[studentId] ?? -1) === 10);
}

function getRankingScore(student: Student, exams = initialExams) {
  return student.frequency + getExamTotal(student.id, exams);
}

function getRoomAttendanceStats(roomName: string, studentsSource: Student[], attendanceRecords: AttendanceRecord[]) {
  const studentCount = studentsSource.filter((student) => sameRoomName(student.room, roomName)).length;
  const records = attendanceRecords.filter((record) => sameRoomName(record.room, roomName));
  const presentCount = records.filter((record) => record.present).length;
  const avg = records.length ? Math.round((presentCount / records.length) * 100) : 0;
  return { studentCount, avg, presentCount, recordsCount: records.length };
}

function buildMonthlyPresenceData(records: AttendanceRecord[], scopedRooms: Room[], year = getCurrentYear()) {
  const roomNames = new Set(scopedRooms.map((room) => normalizeRoomName(room.name)));
  const grouped = new Map<number, { present: number; total: number }>();
  records.forEach((record) => {
    const date = normalizeStoredDate(record.attendanceDate);
    if (date.slice(0, 4) !== String(year) || !roomNames.has(normalizeRoomName(record.room))) return;
    const month = Number(date.slice(5, 7));
    if (!month) return;
    const current = grouped.get(month) ?? { present: 0, total: 0 };
    current.total += 1;
    if (record.present) current.present += 1;
    grouped.set(month, current);
  });
  return monthOptions
    .map((month) => {
      const current = grouped.get(month.value);
      return current ? { month: month.label, presenca: Math.round((current.present / current.total) * 100) } : null;
    })
    .filter(Boolean) as { month: string; presenca: number }[];
}

function getAveragePresentByWeekday(records: AttendanceRecord[], weekday: number, roomName?: string, year = getCurrentYear()) {
  const presentByDate = new Map<string, Set<number>>();
  const datesWithRecords = new Set<string>();
  records.forEach((record) => {
    const date = normalizeStoredDate(record.attendanceDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 4) !== String(year)) return;
    if (roomName && !sameRoomName(record.room, roomName)) return;
    if (new Date(date + "T00:00:00").getDay() !== weekday) return;
    datesWithRecords.add(date);
    if (record.present) {
      const students = presentByDate.get(date) ?? new Set<number>();
      students.add(Number(record.studentId));
      presentByDate.set(date, students);
    }
  });
  if (!datesWithRecords.size) return 0;
  const totalPresent = Array.from(datesWithRecords).reduce((sum, date) => sum + (presentByDate.get(date)?.size ?? 0), 0);
  return Math.round((totalPresent / datesWithRecords.size) * 10) / 10;
}

function formatAverageStudents(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function withLiveRoomStats(room: Room, studentsSource: Student[], attendanceRecords: AttendanceRecord[]): Room {
  const stats = getRoomAttendanceStats(room.name, studentsSource, attendanceRecords);
  return {
    ...room,
    students: stats.studentCount,
    avg: stats.avg
  };
}

function isSundayDate(date: string) {
  const normalized = normalizeStoredDate(date);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && new Date(normalized + "T00:00:00").getDay() === 0;
}

function hasPerfectSundayAttendance(student: Student, attendanceRecords: AttendanceRecord[]) {
  const roomSundayDates = Array.from(new Set(attendanceRecords
    .filter((record) => sameRoomName(record.room, student.room) && isSundayDate(record.attendanceDate))
    .map((record) => normalizeStoredDate(record.attendanceDate))));
  if (!roomSundayDates.length) return false;
  return roomSundayDates.every((date) => attendanceRecords.some((record) =>
    Number(record.studentId) === Number(student.id) &&
    sameRoomName(record.room, student.room) &&
    normalizeStoredDate(record.attendanceDate) === date &&
    record.present
  ));
}

function daysBetweenDates(newerDate: string, olderDate: string) {
  const newer = new Date(newerDate + "T00:00:00").getTime();
  const older = new Date(olderDate + "T00:00:00").getTime();
  return Math.round((newer - older) / 86400000);
}

// Resolucoes ficam em settings para que professor e admin controlem seus proprios acompanhamentos.
type AbsenceFollowUpResolution = {
  resolvedThrough: string;
  resolvedAt: string;
  resolvedBy: string;
};

type AbsenceFollowUpResolutions = Record<string, AbsenceFollowUpResolution>;

function parseAbsenceFollowUpResolutions(value?: string): AbsenceFollowUpResolutions {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as AbsenceFollowUpResolutions : {};
  } catch {
    return {};
  }
}

function absenceFollowUpKey(user: AppUser, student: Student) {
  return `${user.role}:${user.id}:${student.id}`;
}

function getConsecutiveAbsenceInfo(user: AppUser, student: Student, attendanceRecords: AttendanceRecord[], resolutions: AbsenceFollowUpResolutions = {}) {
  const resolvedThrough = resolutions[absenceFollowUpKey(user, student)]?.resolvedThrough ?? "";
  const sundayRecords = attendanceRecords
    .filter((record) => {
      const attendanceDate = normalizeStoredDate(record.attendanceDate);
      return Number(record.studentId) === Number(student.id) &&
        sameRoomName(record.room, student.room) &&
        isSundayDate(attendanceDate) &&
        (!resolvedThrough || attendanceDate > resolvedThrough);
    })
    .sort((a, b) => normalizeStoredDate(b.attendanceDate).localeCompare(normalizeStoredDate(a.attendanceDate)));

  if (sundayRecords.length < 3) return null;
  const lastThreeSundays = sundayRecords.slice(0, 3).map((record) => ({ ...record, attendanceDate: normalizeStoredDate(record.attendanceDate) }));
  const areConsecutiveSundays =
    daysBetweenDates(lastThreeSundays[0].attendanceDate, lastThreeSundays[1].attendanceDate) === 7 &&
    daysBetweenDates(lastThreeSundays[1].attendanceDate, lastThreeSundays[2].attendanceDate) === 7;

  if (!areConsecutiveSundays || !lastThreeSundays.every((record) => !record.present)) return null;
  return {
    student,
    lastAbsenceDate: lastThreeSundays[0].attendanceDate,
    dates: lastThreeSundays.map((record) => record.attendanceDate)
  };
}

function getStudentsWithConsecutiveAbsences(user: AppUser, studentsSource: Student[], attendanceRecords: AttendanceRecord[], resolutions: AbsenceFollowUpResolutions = {}) {
  return scopeStudentsForUser(user, studentsSource).filter((student) => Boolean(getConsecutiveAbsenceInfo(user, student, attendanceRecords, resolutions)));
}

function getBirthdayMonth(student: Student) {
  if (student.birthday === "Hoje") return getCurrentMonth();
  if (/^\d{4}-\d{2}-\d{2}$/.test(student.birthday)) return Number(student.birthday.split("-")[1]);
  const lowerBirthday = student.birthday.toLowerCase();
  if (lowerBirthday.includes("jan")) return 1;
  if (lowerBirthday.includes("fev")) return 2;
  if (lowerBirthday.includes("mar")) return 3;
  if (lowerBirthday.includes("abr")) return 4;
  if (lowerBirthday.includes("mai")) return 5;
  if (lowerBirthday.includes("jun")) return 6;
  if (lowerBirthday.includes("jul")) return 7;
  if (lowerBirthday.includes("ago")) return 8;
  if (lowerBirthday.includes("set")) return 9;
  if (lowerBirthday.includes("out")) return 10;
  if (lowerBirthday.includes("nov")) return 11;
  if (lowerBirthday.includes("dez")) return 12;
  return getCurrentMonth();
}

function getBirthdayDay(birthday: string) {
  if (birthday === "Hoje") return new Date().getDate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return Number(birthday.split("-")[2]);
  const match = birthday.match(/\d{1,2}/);
  return match ? Number(match[0]) : 99;
}

const avatarPalette = [
  "from-blue-500 to-cyan-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-400",
  "from-sky-600 to-blue-400",
  "from-violet-500 to-indigo-400",
  "from-rose-500 to-red-400"
];

function Avatar({ initials, photo, size = "md", index = 0 }: { initials: string; photo?: string; size?: "sm" | "md" | "lg" | "xl"; index?: number }) {
  const sizes = {
    sm: "h-9 w-9 text-xs",
    md: "h-11 w-11 text-sm",
    lg: "h-14 w-14 text-base",
    xl: "h-20 w-20 text-xl"
  };

  if (photo) {
    return <img src={photo} alt="" className={`${sizes[size]} shrink-0 rounded-full object-cover shadow-sm ring-2 ring-white dark:ring-slate-800`} />;
  }

  return (
    <div className={`${sizes[size]} grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${avatarPalette[index % avatarPalette.length]} font-bold text-white shadow-sm`}>
      {initials}
    </div>
  );
}
async function compressImageFile(file: File, maxSize = 520, quality = 0.72) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const fallback = String(reader.result || "");
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(fallback);
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = () => resolve(fallback);
      image.src = fallback;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function compressCanvasPhoto(source: HTMLCanvasElement, maxSize = 520, quality = 0.72) {
  const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return source.toDataURL("image/jpeg", quality);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function PhotoCapture({ photo, onPhoto, previewInitials = "FT", label = "Foto" }: { photo: string; onPhoto: (value: string) => void; previewInitials?: string; label?: string }) {
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const frontCameraInputRef = useRef<HTMLInputElement | null>(null);
  const backCameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("environment");
  const [cameraError, setCameraError] = useState("");

  async function handlePhoto(file?: File) {
    if (!file) return;
    onPhoto(await compressImageFile(file));
  }

  async function openCamera(facing: "user" | "environment") {
    setCameraError("");
    setCameraFacing(facing);
    const touchDevice = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (touchDevice) {
      if (facing === "user") {
        frontCameraInputRef.current?.click();
      } else {
        backCameraInputRef.current?.click();
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      if (facing === "user") {
        frontCameraInputRef.current?.click();
      } else {
        backCameraInputRef.current?.click();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false
      });
      streamRef.current = stream;
      setCameraOpen(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => setCameraError("Não foi possível iniciar a câmera."));
        }
      }, 0);
    } catch {
      setCameraError("Não foi possível abrir a câmera. Verifique a permissão do navegador.");
      if (facing === "user") {
        frontCameraInputRef.current?.click();
      } else {
        backCameraInputRef.current?.click();
      }
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  function captureCameraPhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    onPhoto(compressCanvasPhoto(canvas));
    closeCamera();
  }

  return (
    <div className="mb-5 flex flex-col gap-4 rounded-[1.4rem] bg-slate-50 p-4 dark:bg-slate-900 sm:flex-row sm:items-center">
      {photo ? <img src={photo} alt="" className="h-20 w-20 rounded-full object-cover" /> : <Avatar initials={previewInitials} size="xl" />}
      <div className="flex-1">
        <p className="text-sm font-extrabold text-brand-deep dark:text-white">{label}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => galleryInputRef.current?.click()} className="inline-flex touch-manipulation items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-extrabold text-brand-deep shadow-sm transition active:scale-95 dark:bg-slate-800 dark:text-white">
            <Upload className="h-4 w-4 text-brand-blue" />
            Galeria
          </button>
          <button type="button" onClick={() => openCamera("environment")} className="inline-flex touch-manipulation items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-extrabold text-brand-deep shadow-sm transition active:scale-95 dark:bg-slate-800 dark:text-white">
            <Camera className="h-4 w-4 text-brand-green" />
            Traseira
          </button>
          <button type="button" onClick={() => openCamera("user")} className="inline-flex touch-manipulation items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-extrabold text-brand-deep shadow-sm transition active:scale-95 dark:bg-slate-800 dark:text-white">
            <Camera className="h-4 w-4 text-brand-blue" />
            Frontal
          </button>
          <input ref={galleryInputRef} className="sr-only" tabIndex={-1} type="file" accept="image/*" onChange={(event) => {
            handlePhoto(event.target.files?.[0]);
            event.currentTarget.value = "";
          }} />
          <input ref={backCameraInputRef} className="sr-only" tabIndex={-1} type="file" accept="image/*" capture="environment" onChange={(event) => {
            handlePhoto(event.target.files?.[0]);
            event.currentTarget.value = "";
          }} />
          <input ref={frontCameraInputRef} className="sr-only" tabIndex={-1} type="file" accept="image/*" capture="user" onChange={(event) => {
            handlePhoto(event.target.files?.[0]);
            event.currentTarget.value = "";
          }} />
        </div>
        {cameraError ? <p className="mt-2 text-xs font-bold text-brand-red">{cameraError}</p> : null}
        {cameraOpen ? (
          <div className="mt-4 rounded-[1.2rem] bg-slate-950 p-3">
            <video ref={videoRef} className="aspect-video w-full rounded-2xl object-cover" playsInline muted autoPlay />
            <p className="mt-2 text-center text-xs font-bold text-white/70">{cameraFacing === "environment" ? "Câmera traseira" : "Câmera frontal"}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={captureCameraPhoto} className="flex-1 rounded-full bg-brand-green px-4 py-3 text-sm font-extrabold text-white">Capturar foto</button>
              <button type="button" onClick={closeCamera} className="flex-1 rounded-full bg-white px-4 py-3 text-sm font-extrabold text-brand-deep">Fechar câmera</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BrandLogo({ compact = false, title = "EBR", subtitle = "Escola Bíblica Resgatai", image = "/ebr-logo.jpg" }: { compact?: boolean; title?: string; subtitle?: string; image?: string }) {
  const sizeClass = compact ? "h-12 w-12" : "h-14 w-14";
  const titleClass = compact ? "text-xl" : "text-2xl";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img src={image || "/ebr-logo.jpg"} alt={title || "EBR"} className={sizeClass + " shrink-0 rounded-2xl bg-black object-cover shadow-glow"} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className={titleClass + " break-words font-extrabold leading-tight text-brand-deep dark:text-white"}>{title || "EBR"}</p>
        <p className="mt-0.5 line-clamp-2 break-words text-[0.68rem] font-semibold uppercase leading-4 tracking-[0.12em] text-brand-blue">{subtitle || "Escola Bíblica Resgatai"}</p>
      </div>
    </div>
  );
}

function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-10 w-10 touch-manipulation place-items-center rounded-full border border-slate-200 bg-white/82 text-slate-600 transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-brand-blue hover:shadow-sm active:scale-95 dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-300"
    >
      {children}
    </button>
  );
}

function ConfirmModal({
  title = "Confirmar exclusao",
  message = "Deseja realmente excluir este registro?",
  onCancel,
  onConfirm
}: {
  title?: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <motion.div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={false} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }} className="w-full max-w-md rounded-[1.6rem] bg-white p-6 shadow-2xl dark:bg-slate-950">
        <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{message}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button onClick={onCancel} className="rounded-full px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900">Cancelar</button>
          <button onClick={() => void onConfirm()} className="rounded-full bg-brand-red px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5">Excluir</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: Student["status"] }) {
  const styles = {
    Ativo: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/12 dark:text-emerald-300 dark:ring-emerald-500/20",
    Acompanhar: "bg-red-50 text-red-700 ring-red-100 dark:bg-red-500/12 dark:text-red-300 dark:ring-red-500/20",
    Novo: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/12 dark:text-blue-300 dark:ring-blue-500/20"
  };

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${styles[status]}`}>{status}</span>;
}

function ClientOnlyChart({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="skeleton h-full w-full rounded-2xl" />;
  }

  return <>{children}</>;
}

type ManagementSession = { token: string; user: AppUser };

function LoginView({ settings, onLogin, onBack }: { settings: Record<string, string>; onLogin: (session: ManagementSession) => Promise<void>; onBack?: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    setUsername("");
    setPassword("");
    const clearAutofill = window.setTimeout(() => {
      setUsername("");
      setPassword("");
    }, 250);
    return () => window.clearTimeout(clearAutofill);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    try {
      const session = await fetchNeonJson<ManagementSession>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ login: username.trim(), password })
      });
      await onLogin(session);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível entrar agora.");
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-3 py-3 sm:px-4 sm:py-8">
      <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="grid w-full max-w-5xl overflow-hidden rounded-[1.35rem] bg-white shadow-soft dark:bg-slate-950 sm:rounded-[2rem] lg:grid-cols-[1fr_0.95fr]">
        <div className="bg-brand-deep p-4 text-white sm:p-10">
          <div className="mb-0 flex items-center gap-3 sm:mb-10">
            <img src={settings.sidebarImage || "/ebr-logo.jpg"} alt={settings.sidebarTitle || "EBR"} className="h-14 w-14 rounded-2xl bg-black object-cover ring-1 ring-white/20" />
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="break-words text-2xl font-extrabold leading-tight sm:text-3xl">{settings.sidebarTitle || "EBR"}</p>
              <p className="mt-1 line-clamp-1 break-words text-[0.65rem] font-semibold uppercase leading-4 tracking-[0.12em] text-blue-100 sm:line-clamp-2 sm:text-xs">{settings.sidebarSubtitle || settings.churchName || "Escola Bíblica Resgatai"}</p>
            </div>
          </div>
          <h1 className="hidden max-w-md text-4xl font-extrabold leading-tight sm:block sm:text-5xl">{settings.loginTitle || "Gestão organizada para uma EBR mais presente."}</h1>
        </div>

        <form onSubmit={submit} autoComplete="off" className="p-4 sm:p-10">
          <div className="mb-4 sm:mb-8">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-blue">{settings.loginSubtitle || "Login seguro"}</p>
            <h2 className="mt-1 text-2xl font-extrabold text-brand-deep dark:text-white sm:mt-2 sm:text-3xl">Bem-vindo de volta</h2>
          </div>
          <div className="mb-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-blue">Professor ou administrador</p>
          </div>
          <div className="space-y-3 sm:space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Usuário</span>
              <span className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                <UserCog className="mr-2 h-4 w-4 text-slate-400" />
                <input
                  name="ebr-access-user"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                  type="text"
                  autoComplete="new-password"
                  spellCheck={false}
                />
              </span>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Senha</span>
              <span className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                <KeyRound className="mr-2 h-4 w-4 text-slate-400" />
                <input
                  name="ebr-access-secret"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                  type="password"
                  autoComplete="new-password"
                />
              </span>
            </label>
          </div>
          {feedback ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:bg-red-500/10 dark:text-red-200">{feedback}</p> : null}
          {showRecovery ? (
            <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-brand-deep dark:bg-blue-500/10 dark:text-blue-100">
              Enviamos instrucoes de recuperacao para o email informado.
            </p>
          ) : null}
          <button type="submit" className="mt-6 w-full rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5 active:scale-[0.99]">Entrar</button>
          <button type="button" onClick={() => setShowRecovery(true)} className="mt-4 w-full text-sm font-bold text-brand-blue transition hover:text-brand-deep dark:hover:text-white">
            Recuperar senha
          </button>

          {onBack ? <button type="button" onClick={onBack} className="mt-4 w-full text-sm font-bold text-slate-500 transition hover:text-brand-deep dark:text-slate-400 dark:hover:text-white">Voltar para a página principal</button> : null}
        </form>
      </motion.div>
    </div>
  );
}

function getYoutubeVideoThumbnail(url: string) {
  try { const parsed = new URL(url); const id = parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop() || ""; return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : ""; } catch { return ""; }
}
function InstallAppButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInvitation, setShowInvitation] = useState(false);

  useEffect(() => {
    const invitationKey = "ebr-install-invitation-seen";
    const handler = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
      if (!localStorage.getItem(invitationKey)) setShowInvitation(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function requestInstall() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    localStorage.setItem("ebr-install-invitation-seen", "1");
    setShowInvitation(false);
    setPrompt(null);
  }

  function dismissInvitation() {
    localStorage.setItem("ebr-install-invitation-seen", "1");
    setShowInvitation(false);
  }

  return (
    <>
      {prompt ? <button type="button" onClick={() => void requestInstall()} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-extrabold text-brand-deep"><Download className="h-4 w-4" />Instalar app</button> : null}
      {prompt && showInvitation ? <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-3xl bg-white p-4 text-slate-900 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-deep text-white"><Download className="h-5 w-5" /></div><div><p className="font-extrabold">Instale o app EBR</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-300">Tenha acesso rápido à EBR direto pela tela do seu celular.</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={dismissInvitation} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-200">Agora não</button><button type="button" onClick={() => void requestInstall()} className="rounded-full bg-brand-green px-3 py-2 text-xs font-extrabold text-white">Instalar</button></div></div> : null}
    </>
  );
}
type PublicCatalogItem = {
  id?: number;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  href: string;
  available: boolean;
  unavailableLabel?: string;
};

function PublicCatalogCard({ title, subtitle, items, emptyMessage, tone }: { title: string; subtitle: string; items: PublicCatalogItem[]; emptyMessage: string; tone: "green" | "blue" }) {
  const toneClass = tone === "green" ? "text-brand-green" : "text-brand-blue";
  const buttonClass = tone === "green" ? "bg-brand-green" : "bg-brand-blue";
  return (
    <article className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-extrabold uppercase tracking-[0.16em] ${toneClass}`}>{title}</p>
          <h2 className="mt-1 text-2xl font-extrabold text-brand-deep dark:text-white">{subtitle}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Disponíveis agora</p>
        </div>
        <BookOpenCheck className={`h-7 w-7 ${toneClass}`} />
      </div>
      {items.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <article key={item.id ?? item.title} className={`flex min-h-64 flex-col rounded-2xl p-3 shadow-sm ${item.available ? "bg-slate-50 dark:bg-slate-900" : "border border-amber-300 bg-slate-300 shadow-inner dark:border-amber-800 dark:bg-slate-800"}`}>
              <div className={`aspect-[4/3] overflow-hidden rounded-xl ${item.available ? "bg-slate-100 dark:bg-slate-800" : "bg-white/70 dark:bg-slate-900/80"}`}>
                {item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="h-full w-full object-contain p-1" decoding="async" /> : <span className="grid h-full place-items-center text-xs font-extrabold text-slate-400">Sem imagem</span>}
              </div>
              <div className="mt-3 min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-extrabold text-brand-deep dark:text-white">{item.title}</h3>
                {item.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{item.description}</p> : null}
                <p className="mt-2 text-base font-extrabold text-brand-green">{item.price > 0 ? `R$ ${formatCurrencyBRL(item.price)}` : "Consultar"}</p>
                {!item.available ? <p className="mt-2 rounded-xl bg-amber-200 px-2 py-1 text-xs font-extrabold text-amber-900 dark:bg-amber-950/80 dark:text-amber-100">Indisponível{item.unavailableLabel ? ` · ${item.unavailableLabel}` : ""}</p> : null}
                <a href={item.href} className={`mt-3 inline-flex w-fit rounded-full px-4 py-2 text-xs font-extrabold text-white ${buttonClass}`}>Ver detalhes</a>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{emptyMessage}</p>}
    </article>
  );
}

function publicMinistryUnavailableUntil(value: string | undefined, itemId?: number) {
  if (!itemId || !value) return "";
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const raw = parsed[String(itemId)];
    const releaseDate = typeof raw === "string" ? raw : raw && typeof raw === "object" ? String((raw as Record<string, unknown>).releaseDate || (raw as Record<string, unknown>).until || "") : "";
    return releaseDate > getTodayInputDate() ? releaseDate : "";
  } catch {
    return "";
  }
}

function PublicLandingPage({ settings, onOpenStaffLogin }: { settings: Record<string, string>; onOpenStaffLogin: (role?: Role) => void }) {
  const [contents, setContents] = useState<PortalContent[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [ministryItems, setMinistryItems] = useState<MinistryItem[]>([]);
  const [publicSettings, setPublicSettings] = useState(settings);
  const [loading, setLoading] = useState(true);
  const [openCatalog, setOpenCatalog] = useState<"library" | "coffee" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPublicContent() {
      try {
        const data = await fetchNeonJson<{ contents?: PortalContent[]; libraryItems?: LibraryItem[]; ministryItems?: MinistryItem[]; settings?: Record<string, string> }>("/api/neon/portal?audience=student&room=Geral");
        if (cancelled) return;
        setPublicSettings((current) => ({ ...current, ...(data.settings ?? {}) }));
        setContents((data.contents ?? []).map(fromDbPortalContent).filter((item) => item.active));
        setLibraryItems((data.libraryItems ?? []).map(fromDbLibraryItem).filter((item) => item.active));
        setMinistryItems((data.ministryItems ?? []).map(fromDbMinistryItem).filter((item) => item.active));
      } catch {
        if (!cancelled) { setContents([]); setLibraryItems([]); setMinistryItems([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPublicContent();
    const refreshTimer = window.setInterval(() => void loadPublicContent(), 30000);
    return () => { cancelled = true; window.clearInterval(refreshTimer); };
  }, []);

  const title = publicSettings.sidebarTitle || "EBR";
  const subtitle = publicSettings.sidebarSubtitle || publicSettings.churchName || "Escola Bíblica Resgatai";
  const image = publicSettings.sidebarImage || "/ebr-logo.jpg";
  const lesson = contents.find((item) => item.type === "lesson");
  const videos = contents.filter((item) => item.type === "video");
  const notices = contents.filter((item) => item.type === "message" || item.type === "notice").slice(0, 4);
  const publicLibraryItems = libraryItems.map((item) => ({ id: item.id, title: item.title, description: item.description, price: item.price, imageUrl: item.imageUrl, href: "/aluno", available: item.stockQuantity > 0, unavailableLabel: item.stockQuantity > 0 ? undefined : "Esgotado" }));
  const publicMinistryItems = ministryItems.map((item) => {
    const unavailableUntil = publicMinistryUnavailableUntil(publicSettings.ministryUnavailableItems, item.id);
    return { id: item.id, title: item.title, description: item.description, price: item.price, imageUrl: item.imageUrl, href: "/aluno", available: !unavailableUntil, unavailableLabel: unavailableUntil ? new Date(unavailableUntil + "T00:00:00").toLocaleDateString("pt-BR") : undefined };
  });
  const selectedCatalog = openCatalog === "library"
    ? { title: "Livraria", subtitle: "Livros e materiais", items: publicLibraryItems, emptyMessage: "Os livros publicados aparecerão aqui.", tone: "green" as const }
    : { title: "Lista do café", subtitle: "Produtos e contribuições", items: publicMinistryItems, emptyMessage: "Os produtos publicados aparecerão aqui.", tone: "blue" as const };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white">
      <section className="bg-brand-deep px-5 py-6 text-white sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex w-fit rounded-2xl bg-white p-3 shadow-soft"><BrandLogo title={title} subtitle={subtitle} image={image} /></div>
            <InstallAppButton />
          </header>
          <div className="grid gap-7 py-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:py-14">
            <div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-100">Página principal da EBR</p><h1 className="mt-4 text-4xl font-extrabold leading-[1.03] sm:text-7xl">Tudo o que a EBR oferece, em um só lugar.</h1><p className="mt-5 text-base leading-7 text-blue-100 sm:text-lg">Acesse lições, vídeos, avisos e os recursos da Escola Bíblica Resgatai.</p></div>
            <div className="rounded-[2rem] border border-white/15 bg-white/10 p-5 sm:p-6"><div className="flex items-center gap-3"><Sparkles className="h-6 w-6 text-blue-100" /><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-blue-100">Uma experiência integrada</p><h2 className="mt-1 text-2xl font-extrabold">Aprender, acompanhar e participar</h2></div></div><div className="mt-5 grid grid-cols-3 gap-2"><div className="rounded-2xl bg-white/10 p-2.5 sm:p-4"><p className="text-xs font-extrabold sm:text-sm">Alunos</p><p className="mt-1 hidden text-xs text-blue-100 sm:block">Lições e atividades do portal.</p><a href="/aluno" className="mt-2 inline-flex w-full justify-center rounded-full bg-white px-2 py-2 text-[0.65rem] font-extrabold text-brand-deep sm:mt-3 sm:w-auto sm:px-3 sm:text-xs">Acessar</a></div><div className="rounded-2xl bg-white/10 p-2.5 sm:p-4"><p className="text-xs font-extrabold sm:text-sm">Professores</p><p className="mt-1 hidden text-xs text-blue-100 sm:block">Acompanhamento das suas turmas.</p><button type="button" onClick={() => onOpenStaffLogin("teacher")} className="mt-2 inline-flex w-full justify-center rounded-full bg-white px-2 py-2 text-[0.65rem] font-extrabold text-brand-deep sm:mt-3 sm:w-auto sm:px-3 sm:text-xs">Acessar</button></div><div className="rounded-2xl bg-white/10 p-2.5 sm:p-4"><p className="text-xs font-extrabold sm:text-sm">Gestão</p><p className="mt-1 hidden text-xs text-blue-100 sm:block">Visão ampla e gestão da EBR.</p><button type="button" onClick={() => onOpenStaffLogin("admin")} className="mt-2 inline-flex w-full justify-center rounded-full bg-white px-2 py-2 text-[0.65rem] font-extrabold text-brand-deep sm:mt-3 sm:w-auto sm:px-3 sm:text-xs">Acessar</button></div></div></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8 lg:px-12">
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-[1.6rem] bg-white p-5 shadow-sm dark:bg-slate-900"><h2 className="text-2xl font-extrabold text-brand-deep dark:text-white">Lição do dia</h2>{loading ? <div className="mt-6 h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" /> : lesson ? <div className="mt-4 rounded-2xl bg-blue-50 p-4 dark:bg-blue-950/30"><h3 className="text-xl font-extrabold text-brand-deep dark:text-white">{lesson.title}</h3><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{lesson.body || "A lição está disponível no Portal do Aluno."}</p><a href="/aluno" className="mt-4 inline-flex rounded-full bg-brand-blue px-4 py-2 text-sm font-extrabold text-white">Abrir portal</a></div> : <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-slate-800">A próxima lição aparecerá aqui quando for publicada.</p>}</article>
          <article className="rounded-[1.6rem] bg-white p-5 shadow-sm dark:bg-slate-900"><h2 className="text-2xl font-extrabold text-brand-deep dark:text-white">Vídeos recentes</h2>{loading ? <div className="mt-6 h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" /> : videos.length ? <div className="mt-4 grid gap-2">{videos.slice(0, 3).map((video) => { const thumbnail = getYoutubeVideoThumbnail(video.mediaUrl); return <div key={video.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">{thumbnail ? <img src={thumbnail} alt="" className="h-16 w-24 rounded-xl object-cover" /> : null}<p className="min-w-0 flex-1 truncate font-extrabold text-brand-deep dark:text-white">{video.title}</p>{video.mediaUrl ? <a href={video.mediaUrl} target="_blank" rel="noreferrer" className="rounded-full bg-brand-green px-3 py-2 text-xs font-extrabold text-white">Assistir</a> : null}</div>; })}</div> : <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-slate-800">Os vídeos publicados aparecerão aqui.</p>}</article>
        </div>
        <section className="mt-4 rounded-[1.6rem] bg-amber-50 p-5 dark:bg-amber-950/20"><h2 className="text-2xl font-extrabold text-brand-deep dark:text-white">Mural de avisos</h2>{notices.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{notices.map((notice) => <article key={notice.id} className="rounded-2xl bg-white/70 p-4 dark:bg-slate-900/80"><h3 className="font-extrabold text-brand-deep dark:text-white">{notice.title}</h3>{notice.body ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{notice.body}</p> : null}</article>)}</div> : <p className="mt-4 rounded-2xl bg-white/60 p-4 text-sm font-bold text-amber-800 dark:bg-slate-900/70 dark:text-amber-100">O mural de avisos será atualizado quando houver um comunicado geral.</p>}</section>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:hidden">
          <button type="button" onClick={() => setOpenCatalog((current) => current === "library" ? null : "library")} aria-expanded={openCatalog === "library"} className="rounded-2xl bg-brand-green px-5 py-4 text-center text-sm font-extrabold text-white shadow-sm">{openCatalog === "library" ? "Fechar livraria" : "Ver livraria"}</button>
          <button type="button" onClick={() => setOpenCatalog((current) => current === "coffee" ? null : "coffee")} aria-expanded={openCatalog === "coffee"} className="rounded-2xl bg-brand-blue px-5 py-4 text-center text-sm font-extrabold text-white shadow-sm">{openCatalog === "coffee" ? "Fechar lista do café" : "Ver lista do café"}</button>
        </div>
        {openCatalog ? <div className="mt-4 lg:hidden"><PublicCatalogCard {...selectedCatalog} /></div> : null}
        <div className="mt-6 hidden gap-4 lg:grid lg:grid-cols-2"><PublicCatalogCard title="Livraria" subtitle="Livros e materiais" items={publicLibraryItems} emptyMessage="Os livros publicados aparecerão aqui." tone="green" /><PublicCatalogCard title="Lista do café" subtitle="Produtos e contribuições" items={publicMinistryItems} emptyMessage="Os produtos publicados aparecerão aqui." tone="blue" /></div>
        <footer className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500 dark:border-slate-800"><p>{title} · {subtitle}</p></footer>
      </section>
    </main>
  );
}
function PageShell({
  children,
  activeView,
  setActiveView,
  user,
  onLogout,
  setSearchTerm,
  studentsSource,
  attendanceRecords,
  followUpStudents,
  onOpenFollowUpStudents,
  churchName,
  brandTitle,
  brandSubtitle,
  brandImage
}: {
  children: ReactNode;
  activeView: ViewKey;
  setActiveView: (view: ViewKey) => void;
  user: AppUser;
  onLogout: () => void;
  setSearchTerm: (value: string) => void;
  studentsSource: Student[];
  attendanceRecords: AttendanceRecord[];
  followUpStudents: Student[];
  onOpenFollowUpStudents: () => void;
  churchName: string;
  brandTitle: string;
  brandSubtitle: string;
  brandImage: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [teamPushFeedback, setTeamPushFeedback] = useState("");
  const activeLabel = navItems.find((item) => item.key === activeView)?.label ?? "Dashboard";
  const visibleNavItems = navItems.filter((item) => item.roles.includes(user.role));

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
    void registerTeamPushToken(user.id);
  }, [user.id]);

  useEffect(() => {
    let active = true;
    let stop: () => void = () => undefined;
    void listenForForegroundPush((payload) => {
      if (active) setTeamPushFeedback(`${payload.title}: ${payload.message}`);
    }).then((unsubscribe) => { stop = unsubscribe; });
    return () => {
      active = false;
      stop();
    };
  }, []);

  async function activateTeamNotifications() {
    setTeamPushFeedback("Ativando notificações...");
    const result = await registerTeamPushToken(user.id);
    if (!result.enabled) {
      setTeamPushFeedback(result.message);
      return;
    }
    setTeamPushFeedback("Notificações ativadas. Enviando teste...");
    try {
      const test = await fetchNeonJson<{ sent: number; failed: number; message: string }>("/api/push/team-test", { method: "POST" });
      setTeamPushFeedback(test.message);
    } catch (error) {
      setTeamPushFeedback(error instanceof Error ? error.message : "Notificações ativadas, mas o teste não pôde ser enviado.");
    }
  }

  function logoutWithPushCleanup() {
    onLogout();
  }

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen text-slate-900 dark:text-slate-100">
        <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 overflow-y-auto border-r border-white/70 bg-white/76 px-5 py-6 pb-10 backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/76 lg:block">
          <Sidebar activeView={activeView} setActiveView={setActiveView} items={visibleNavItems} user={user} setSearchTerm={setSearchTerm} studentsSource={studentsSource} attendanceRecords={attendanceRecords} followUpStudents={followUpStudents} onOpenFollowUpStudents={onOpenFollowUpStudents} churchName={churchName} brandTitle={brandTitle} brandSubtitle={brandSubtitle} brandImage={brandImage} />
        </aside>

        <AnimatePresence>
          {menuOpen ? (
            <motion.div
              className="fixed inset-0 z-50 bg-slate-950/35 p-3 backdrop-blur-sm lg:hidden"
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            >
              <motion.aside
                className="max-h-[calc(100vh-1.5rem)] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-[1.75rem] bg-white p-5 pb-24 shadow-2xl dark:bg-slate-950"
                initial={{ x: -320 }}
                animate={{ x: 0 }}
                exit={{ x: -320 }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex justify-end">
                  <IconButton label="Fechar menu" onClick={() => setMenuOpen(false)}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </div>
                <Sidebar
                  activeView={activeView}
                  items={visibleNavItems}
                  user={user}
                  setSearchTerm={setSearchTerm}
                  studentsSource={studentsSource}
                  attendanceRecords={attendanceRecords}
                  followUpStudents={followUpStudents}
                  onOpenFollowUpStudents={onOpenFollowUpStudents}
                  churchName={churchName}
                  brandTitle={brandTitle}
                  brandSubtitle={brandSubtitle}
                  brandImage={brandImage}
                  setActiveView={(view) => {
                    setActiveView(view);
                    setMenuOpen(false);
                  }}
                />
              </motion.aside>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main className="min-h-screen lg:pl-72">
          <header className="sticky top-0 z-30 border-b border-white/70 bg-brand-ice/82 px-4 py-3 backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/72 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <IconButton label="Abrir menu" onClick={() => setMenuOpen(true)}>
                <Menu className="h-4 w-4 lg:hidden" />
                <LayoutDashboard className="hidden h-4 w-4 lg:block" />
              </IconButton>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-brand-blue">{churchName || "EBR"}</p>
                <h1 className="truncate text-lg font-extrabold text-brand-deep dark:text-white sm:text-2xl">{activeLabel}</h1>
              </div>

              <div className="ml-auto" />

              <div className="relative">
                <IconButton label="Ativar notificações" onClick={() => void activateTeamNotifications()}>
                  <Bell className="h-4 w-4" />
                </IconButton>
                {teamPushFeedback ? (
                  <button type="button" onClick={() => setTeamPushFeedback("")} className="fixed inset-x-3 top-16 z-50 rounded-2xl bg-white px-4 py-3 text-left text-xs font-bold text-brand-deep shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700 sm:absolute sm:inset-auto sm:right-0 sm:top-12 sm:w-72">
                    {teamPushFeedback}
                  </button>
                ) : null}
              </div>
              <IconButton label={dark ? "Tema claro" : "Tema escuro"} onClick={() => setDark((value) => !value)}>
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </IconButton>
              <div className="hidden items-center gap-3 rounded-full border border-slate-200 bg-white/82 py-1.5 pl-2 pr-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/75 sm:flex">
                <Avatar initials={user.avatar} size="sm" index={4} />
                <div className="leading-tight">
                  <p className="text-sm font-bold">{user.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{user.role === "admin" ? "Administrador" : "Professor"}</p>
                </div>
              </div>
              <IconButton label="Sair" onClick={() => void logoutWithPushCleanup()}>
                <LogOut className="h-4 w-4" />
              </IconButton>
            </div>
          </header>
          <div className="px-3 py-4 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  activeView,
  setActiveView,
  items,
  user,
  setSearchTerm,
  studentsSource,
  attendanceRecords,
  followUpStudents,
  onOpenFollowUpStudents,
  churchName,
  brandTitle,
  brandSubtitle,
  brandImage
}: {
  activeView: ViewKey;
  setActiveView: (view: ViewKey) => void;
  items: typeof navItems;
  user: AppUser;
  setSearchTerm: (value: string) => void;
  studentsSource: Student[];
  attendanceRecords: AttendanceRecord[];
  followUpStudents: Student[];
  onOpenFollowUpStudents: () => void;
  churchName: string;
  brandTitle: string;
  brandSubtitle: string;
  brandImage: string;
}) {
  const followUpCount = followUpStudents.length;
  const firstFollowUp = followUpStudents[0];
  const followUpScope = user.role === "teacher" ? `na sala ${getTeacherRoom(user)}` : "em todas as salas";

  return (
    <div className="flex min-h-full flex-col pb-4">
      <div className="mb-8 flex items-center gap-3">
        <BrandLogo compact title={brandTitle} subtitle={brandSubtitle || churchName} image={brandImage} />
      </div>

      <nav className="space-y-2 pb-5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.key;

          return (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key)}
              className={`group relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
                active
                  ? "bg-brand-deep text-white shadow-glow"
                  : "text-slate-600 hover:bg-white hover:text-brand-deep hover:shadow-sm dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-white" : "text-slate-400 group-hover:text-brand-blue"}`} />
              {item.label}
              {active ? <span className="ml-auto h-2 w-2 rounded-full bg-brand-green" /> : null}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onOpenFollowUpStudents}
        disabled={!followUpCount}
        className="mt-4 rounded-[1.6rem] border border-blue-100 bg-blue-50/80 p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-blue hover:shadow-sm disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-none dark:border-blue-500/20 dark:bg-blue-500/10 lg:mt-auto"
      >
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-brand-blue shadow-sm dark:bg-slate-900">
          <Sparkles className="h-5 w-5" />
        </div>
        <p className="text-sm font-extrabold text-brand-deep dark:text-white">Resumo inteligente</p>
        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{followUpCount} alunos com 3 domingos consecutivos de falta {followUpScope}. Entre em contato para entender o que aconteceu.</p>
        {firstFollowUp ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/72 p-2 dark:bg-slate-900/70">
            <Avatar initials={firstFollowUp.avatar} photo={firstFollowUp.photo} size="sm" />
            <p className="min-w-0 truncate text-xs font-extrabold text-brand-blue">Ver lista: {firstFollowUp.name}{followUpCount > 1 ? ` +${followUpCount - 1}` : ""}</p>
          </div>
        ) : null}
      </button>
    </div>
  );
}

function Section({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {children}
    </motion.div>
  );
}

function MetricCard({ title, value, subtitle, icon, chart, tone, onClick }: { title: string; value: string; subtitle?: string; icon: ReactNode; chart: ReactNode; tone: string; onClick?: () => void }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
      className={`glass-panel overflow-hidden rounded-[1.6rem] p-5 shadow-soft ${onClick ? "cursor-pointer transition hover:ring-2 hover:ring-brand-gold/60 focus:outline-none focus:ring-2 focus:ring-brand-gold" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-extrabold text-brand-deep dark:text-white">{value}</p>
          {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
        <div className={`grid h-12 w-12 place-items-center rounded-2xl ${tone}`}>{icon}</div>
      </div>
      <div className="mt-5 h-12">{chart}</div>
    </motion.div>
  );
}

function TinyArea({ color }: { color: string }) {
  return (
    <ClientOnlyChart>
              <div className="chart-mobile-canvas">
              <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={monthlyPresence.slice(1, 7)}>
          <Area type="monotone" dataKey="presenca" stroke={color} fill={color} fillOpacity={0.14} strokeWidth={2.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
              </div>
            </ClientOnlyChart>
  );
}

function BirthdayTodayPreview({ students }: { students: Student[] }) {
  if (!students.length) return <p className="flex h-full items-center text-xs font-bold text-slate-400">Nenhum aniversariante hoje</p>;
  const first = students[0];
  return (
    <div className="flex h-full min-w-0 items-center gap-2 rounded-2xl bg-amber-50/80 px-2 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-400/30">
      <div className="rounded-full bg-amber-300 p-0.5 dark:bg-amber-400">
        <Avatar initials={first.avatar} photo={first.photo} size="sm" index={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold text-brand-deep dark:text-white">{first.name}</p>
        <p className="truncate text-xs font-extrabold text-amber-700 dark:text-amber-200">É hoje · {first.room}</p>
      </div>
      {students.length > 1 ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-extrabold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">+{students.length - 1}</span> : null}
    </div>
  );
}

function DashboardView({ user, studentsSource, roomsSource, attendanceRecords, onOpenBirthdays }: { user: AppUser; studentsSource: Student[]; roomsSource: Room[]; attendanceRecords: AttendanceRecord[]; onOpenBirthdays: () => void }) {
  const scopedStudents = scopeStudentsForUser(user, studentsSource);
  const scopedRooms = scopeRoomsForUser(user, roomsSource);
  const scopedRoomNames = new Set(scopedRooms.map((room) => room.name));
  const scopedAttendanceRecords = attendanceRecords.filter((record) => Array.from(scopedRoomNames).some((roomName) => sameRoomName(roomName, record.room)));
  const scopedRoomFrequency = scopedRooms.map((room) => ({ name: room.name, media: getAveragePresentByWeekday(attendanceRecords, 0, room.name) }));
  const scopedThursdayFrequency = scopedRooms.map((room) => ({ name: room.name, media: getAveragePresentByWeekday(attendanceRecords, 4, room.name) }));
  const monthlyPresenceData = buildMonthlyPresenceData(attendanceRecords, scopedRooms);
  const averagePresence = scopedAttendanceRecords.length
    ? Math.round((scopedAttendanceRecords.filter((record) => record.present).length / scopedAttendanceRecords.length) * 100)
    : 0;
  const birthdayStudentsToday = scopedStudents.filter((student) => isBirthdayToday(student.birthday));
  const birthdaysToday = birthdayStudentsToday.length;
  const todayPresenceCount = attendanceRecords.filter((record) => {
    const inUserScope = user.role === "admin" || sameRoomName(record.room, getTeacherRoom(user));
    return record.attendanceDate === getTodayInputDate() && record.present && inUserScope;
  }).length;
  const scopeLabel = user.role === "teacher" ? "da sua sala" : "geral";

  return (
    <Section>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <MetricCard title="Total de alunos" value={String(scopedStudents.length)} subtitle={`visao ${scopeLabel}`} icon={<Users className="h-5 w-5 text-white" />} tone="bg-brand-deep" chart={<TinyArea color="#3B82F6" />} />
        <MetricCard title="Presentes hoje" value={String(todayPresenceCount).padStart(2, "0")} subtitle="última chamada do dia" icon={<Check className="h-5 w-5 text-white" />} tone="bg-brand-green" chart={<TinyArea color="#22C55E" />} />
        <MetricCard title="Presença média" value={`${averagePresence}%`} subtitle={user.role === "teacher" ? "somente sua sala" : "+6% vs. mês anterior"} icon={<Check className="h-5 w-5 text-white" />} tone="bg-brand-green" chart={<TinyArea color="#22C55E" />} />
        <MetricCard title="Aniversariantes do dia" value={String(birthdaysToday).padStart(2, "0")} subtitle="clique para ver quem faz aniversário hoje" icon={<CalendarDays className="h-5 w-5 text-white" />} tone="bg-brand-gold" chart={<BirthdayTodayPreview students={birthdayStudentsToday} />} onClick={onOpenBirthdays} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-brand-deep dark:text-white">Presença mensal</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Percentual de frequência dos alunos por mês.</p>
            </div>
            <button className="inline-flex items-center gap-2 rounded-full bg-brand-deep px-4 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
              <Download className="h-4 w-4" />
              Exportar
            </button>
          </div>
          <div className="chart-mobile-scroll h-80">
            <ClientOnlyChart>
              <div className="chart-mobile-canvas">
              <ResponsiveContainer width="100%" height="100%">
                {monthlyPresenceData.length ? (
                  <LineChart data={monthlyPresenceData} margin={{ top: 14, right: 18, bottom: 4, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.28)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                    <Tooltip formatter={(value) => [`${value}%`, "Frequência"]} contentStyle={{ borderRadius: 16, border: "1px solid #E5E7EB", boxShadow: "0 16px 34px rgba(15,23,42,.12)" }} />
                    <Line type="monotone" dataKey="presenca" stroke="#3B82F6" strokeWidth={4} dot={{ r: 4, fill: "#3B82F6", strokeWidth: 3, stroke: "#fff" }} />
                  </LineChart>
                ) : <div className="grid h-full place-items-center rounded-2xl bg-slate-50 text-sm font-bold text-slate-400 dark:bg-slate-900">Sem presenças registradas para exibir.</div>}
              </ResponsiveContainer>
              </div>
            </ClientOnlyChart>
          </div>
        </div>

        <div className="grid gap-5">
          <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
            <h2 className="text-xl font-extrabold text-brand-deep dark:text-white">Média de alunos por sala</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Presenças médias aos domingos durante o ano.</p>
            <div className="chart-mobile-scroll mt-5 h-64">
              <ClientOnlyChart>
              <div className="chart-mobile-canvas">
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scopedRoomFrequency} layout="vertical" margin={{ top: 4, right: 20, left: 24, bottom: 4 }}>
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={92} tick={{ fill: "#64748B", fontSize: 12 }} />
                    <Tooltip cursor={{ fill: "rgba(59,130,246,.08)" }} formatter={(value) => [formatAverageStudents(Number(value)), "Alunos"]} contentStyle={{ borderRadius: 16, border: "1px solid #E5E7EB" }} />
                    <Bar dataKey="media" radius={[0, 10, 10, 0]} barSize={14}>
                      {scopedRoomFrequency.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "#3B82F6" : "#22C55E"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ClientOnlyChart>
            </div>
          </div>

          <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
            <h2 className="text-xl font-extrabold text-brand-deep dark:text-white">Média de alunos por sala às quintas</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Mesmas salas, com média numérica de presenças nas quintas-feiras.</p>
            <div className="chart-mobile-scroll mt-5 h-64">
              <ClientOnlyChart>
                <div className="chart-mobile-canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scopedThursdayFrequency} layout="vertical" margin={{ top: 4, right: 20, left: 24, bottom: 4 }}>
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={92} tick={{ fill: "#64748B", fontSize: 12 }} />
                      <Tooltip cursor={{ fill: "rgba(245,158,11,.08)" }} formatter={(value) => [formatAverageStudents(Number(value)), "Alunos"]} contentStyle={{ borderRadius: 16, border: "1px solid #E5E7EB" }} />
                      <Bar dataKey="media" radius={[0, 10, 10, 0]} barSize={14}>
                        {scopedThursdayFrequency.map((_, index) => (
                          <Cell key={`thursday-cell-${index}`} fill={index % 2 === 0 ? "#F59E0B" : "#3B82F6"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ClientOnlyChart>
            </div>
          </div>

        </div>
      </div>
    </Section>
  );
}

function StudentsView({
  user,
  searchTerm,
  setSearchTerm,
  studentList,
  setStudentList,
  pendingList,
  setPendingList,
  roomList,
  followUpFilterActive,
  followUpStudents,
  onClearFollowUpFilter,
  onResolveFollowUp
}: {
  user: AppUser;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  studentList: Student[];
  setStudentList: (updater: (current: Student[]) => Student[]) => void;
  pendingList: PendingEnrollment[];
  setPendingList: (updater: (current: PendingEnrollment[]) => PendingEnrollment[]) => void;
  roomList: Room[];
  followUpFilterActive: boolean;
  followUpStudents: Student[];
  onClearFollowUpFilter: () => void;
  onResolveFollowUp: (student: Student) => void | Promise<void>;
}) {
  const [room, setRoom] = useState("Todas");
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteStudent, setDeleteStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentFeedback, setStudentFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const visibleStudents = scopeStudentsForUser(user, studentList);
  const visibleRooms = scopeRoomsForUser(user, roomList);
  const followUpIds = useMemo(() => new Set(followUpStudents.map((student) => Number(student.id))), [followUpStudents]);
  const filtered = useMemo(
    () =>
      visibleStudents.filter((student) => {
        const search = searchTerm.toLowerCase().trim();
        const matchesQuery =
          !search ||
          student.name.toLowerCase().includes(search) ||
          student.ra.toLowerCase().includes(search) ||
          student.room.toLowerCase().includes(search) ||
          student.phone.includes(searchTerm);
        const matchesRoom = user.role === "teacher" || room === "Todas" || sameRoomName(student.room, room);
        const matchesFollowUp = !followUpFilterActive || followUpIds.has(Number(student.id));
        return matchesQuery && matchesRoom && matchesFollowUp;
      }),
    [searchTerm, room, visibleStudents, user.role, followUpFilterActive, followUpIds]
  );
  const nextRa = getNextRa(studentList);

  async function approveEnrollment(enrollment: PendingEnrollment) {
    if (isDuplicateStudent({ name: enrollment.name, phone: enrollment.phone, birthday: enrollment.birthday, room: enrollment.room }, studentList)) {
      setStudentFeedback({ kind: "error", message: "Este aluno já possui cadastro com todos os dados iguais. Confira antes de salvar novamente." });
      return false;
    }

    const approvedStudent: Student = {
      id: Math.max(...studentList.map((student) => student.id)) + 1,
      ra: getNextRa(studentList),
      name: enrollment.name,
      phone: enrollment.phone,
      room: enrollment.room,
      frequency: 0,
      status: "Novo",
      birthday: enrollment.birthday,
      age: 10,
      avatar: enrollment.avatar
    };

    setStudentList((current) => [...current, approvedStudent]);
    setPendingList((current) => current.filter((item) => item.id !== enrollment.id));
    if (isNeonProvider) {
      const data = await neonMutate<Student>("student", "create", approvedStudent);
      if (data) setStudentList((current) => current.map((student) => (student.id === approvedStudent.id ? data : student)));
    } else if (supabase) {
      const { data } = await supabase.from("students").insert(toDbStudent(approvedStudent)).select("*").single();
      await supabase.from("pending_enrollments").delete().eq("id", enrollment.id);
      if (data) {
        setStudentList((current) => current.map((student) => (student.id === approvedStudent.id ? fromDbStudent(data) : student)));
      }
    }
    setStudentFeedback({ kind: "success", message: "Matrícula aprovada." });
    return true;
  }

  async function saveStudentEdit(updatedStudent: Student) {
    if (isDuplicateStudent(updatedStudent, studentList, updatedStudent.id)) {
      setStudentFeedback({ kind: "error", message: "Já existe outro aluno com nome, telefone, nascimento e sala iguais." });
      return false;
    }
    setStudentList((current) => current.map((item) => (item.id === updatedStudent.id ? updatedStudent : item)));
    if (isNeonProvider) {
      const data = await neonMutate<Student>("student", "update", updatedStudent, updatedStudent.id);
      if (data) setStudentList((current) => current.map((item) => (item.id === updatedStudent.id ? data : item)));
    } else if (supabase) {
      await supabase.from("students").update(toDbStudent(updatedStudent)).eq("id", updatedStudent.id);
    }
    setEditingStudent(null);
    setStudentFeedback({ kind: "success", message: "Aluno atualizado." });
    return true;
  }

  async function openStudentDetails(student: Student) {
    setSelectedStudent(student);
    if (student.photo) return;
    const photo = await loadStudentPhoto(student.id);
    if (!photo) return;
    const nextStudent = { ...student, photo };
    setSelectedStudent(nextStudent);
    setStudentList((current) => current.map((item) => item.id === student.id ? { ...item, photo } : item));
  }

  async function openStudentEditor(student: Student) {
    if (student.photo) {
      setEditingStudent(student);
      return;
    }
    const photo = await loadStudentPhoto(student.id);
    const nextStudent = photo ? { ...student, photo } : student;
    setEditingStudent(nextStudent);
    if (photo) setStudentList((current) => current.map((item) => item.id === student.id ? { ...item, photo } : item));
  }

  async function confirmDeleteStudent() {
    if (!deleteStudent) return;
    const studentToDelete = deleteStudent;
    rememberDeletedStudent(studentToDelete);
    setStudentList((current) => current.filter((student) => student.id !== studentToDelete.id));
    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("student", "delete", undefined, studentToDelete.id);
    } else if (supabase) {
      const { error } = await supabase.from("students").delete().eq("id", studentToDelete.id);
      if (error) {
        await supabase.from("students").delete().eq("ra", studentToDelete.ra);
      }
    }
    setDeleteStudent(null);
  }

  function copyEnrollmentLink() {
    const url = `${window.location.origin}/matricula`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-brand-deep dark:text-white">Alunos cadastrados</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Lista simples com detalhes completos ao clicar no nome.</p>
        </div>
        {studentFeedback ? <span className={studentFeedback.kind === "error" ? "rounded-full bg-red-50 px-4 py-2 text-sm font-extrabold text-red-700 dark:bg-red-500/10 dark:text-red-200" : "rounded-full bg-emerald-50 px-4 py-2 text-sm font-extrabold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"}>{studentFeedback.message}</span> : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={copyEnrollmentLink} className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-100 bg-white px-5 py-3 text-sm font-extrabold text-brand-deep shadow-sm transition hover:-translate-y-0.5 dark:border-blue-500/20 dark:bg-slate-900 dark:text-white">
            {copied ? <Check className="h-4 w-4 text-brand-green" /> : <LinkIcon className="h-4 w-4 text-brand-blue" />}
            {copied ? "Link copiado" : "Gerar link de matrícula"}
          </button>
          <button onClick={() => setModalOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white shadow-glow transition hover:-translate-y-0.5">
            <UserRoundPlus className="h-4 w-4" />
            Novo Aluno
          </button>
        </div>
      </div>

      {followUpFilterActive ? (
        <div className="rounded-[1.6rem] border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">Acompanhamento de faltas</p>
              <h3 className="mt-1 text-lg font-extrabold text-brand-deep dark:text-white">{followUpStudents.length} aluno(s) com 3 domingos consecutivos de falta</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Marque como resolvido depois de entrar em contato. A contagem recomeça a partir das próximas chamadas.</p>
            </div>
            <button type="button" onClick={onClearFollowUpFilter} className="rounded-full bg-white px-5 py-3 text-sm font-extrabold text-slate-700 shadow-sm transition hover:-translate-y-0.5 dark:bg-slate-900 dark:text-slate-200">Ver todos</button>
          </div>
        </div>
      ) : null}

      <div className="glass-panel rounded-[1.8rem] p-4 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.3rem] bg-blue-50 px-4 py-3 dark:bg-blue-500/10">
          <div>
            <p className="text-sm font-extrabold text-brand-deep dark:text-white">Próximo ID automático</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Gerado a partir do último RA cadastrado, sem repetir números.</p>
          </div>
          <span className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-brand-blue shadow-sm dark:bg-slate-900">{nextRa}</span>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <label className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <Search className="mr-2 h-4 w-4 text-slate-400" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar por nome, ID ou sala" />
          </label>
          <label className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <select value={room} onChange={(event) => setRoom(event.target.value)} className="w-full bg-transparent text-sm font-semibold outline-none">
              {user.role === "admin" ? <option>Todas</option> : null}
              {visibleRooms.map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </label>
        </div>

        <div className="premium-scrollbar mobile-card-table overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-y-2 text-left">
            <thead>
              <tr className="text-xs font-bold uppercase text-slate-400">
                <th className="px-4 py-2">Aluno</th>
                <th className="px-4 py-2">Telefone</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student, index) => (
                <motion.tr key={student.id} layout className="rounded-2xl bg-white shadow-sm dark:bg-slate-900/80">
                  <td className="rounded-l-2xl px-4 py-3">
                    <button type="button" onClick={() => void openStudentDetails(student)} className="flex items-center gap-3 text-left">
                      <Avatar initials={student.avatar} photo={student.photo} index={index} />
                      <span className="font-bold text-slate-800 underline-offset-4 hover:underline dark:text-white">{student.name}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                    <a href={phoneToWhatsapp(student.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 font-bold text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200">
                      <MessageCircle className="h-4 w-4" />
                      {student.phone}
                    </a>
                  </td>
                  <td className="rounded-r-2xl px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {followUpFilterActive && followUpIds.has(Number(student.id)) ? (
                        <button type="button" onClick={() => void onResolveFollowUp(student)} className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20">Resolvido</button>
                      ) : null}
                      <IconButton label={`Editar ${student.name}`} onClick={() => void openStudentEditor(student)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton label={`Excluir ${student.name}`} onClick={() => setDeleteStudent(student)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {false && user.role === "admin" ? (
        <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">Auto cadastros pendentes</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Alunos enviados pelo link publico aguardam aprovacao.</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">{pendingList.length} pendentes</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {pendingList.map((enrollment, index) => (
              <div key={enrollment.id} className="rounded-[1.4rem] bg-white p-4 shadow-sm dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <Avatar initials={enrollment.avatar} index={index} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold">{enrollment.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{enrollment.phone} • {enrollment.room}</p>
                  </div>
                </div>
                <button onClick={() => approveEnrollment(enrollment)} className="mt-4 w-full rounded-full bg-brand-green px-4 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5">Aprovar matrícula</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <AnimatePresence>{modalOpen ? <StudentModal nextRa={nextRa} availableRooms={visibleRooms} lockedRoom={getTeacherRoom(user)} onClose={() => setModalOpen(false)} onCreate={async (student) => {
        if (isDuplicateStudent(student, studentList)) {
          setStudentFeedback({ kind: "error", message: "Este aluno já possui cadastro com todos os dados iguais. Confira antes de salvar novamente." });
          return false;
        }
        setStudentList((current) => [...current, student]);
        if (isNeonProvider) {
          const data = await neonMutate<Student>("student", "create", student);
          if (data) setStudentList((current) => current.map((item) => (item.id === student.id ? data : item)));
        } else if (supabase) {
          const { data } = await supabase.from("students").insert(toDbStudent(student)).select("*").single();
          if (data) {
            setStudentList((current) => current.map((item) => (item.id === student.id ? fromDbStudent(data) : item)));
          }
        }
        setStudentFeedback({ kind: "success", message: "Aluno cadastrado com sucesso." });
        return true;
      }} /> : null}</AnimatePresence>
      <AnimatePresence>{selectedStudent ? <StudentDetailsModal student={selectedStudent} onClose={() => setSelectedStudent(null)} onEdit={() => {
        setEditingStudent(selectedStudent);
        setSelectedStudent(null);
      }} /> : null}</AnimatePresence>
      <AnimatePresence>{editingStudent ? <StudentModal initialStudent={editingStudent} availableRooms={visibleRooms} lockedRoom={getTeacherRoom(user)} onClose={() => setEditingStudent(null)} onCreate={saveStudentEdit} /> : null}</AnimatePresence>
      <AnimatePresence>
        {deleteStudent ? (
          <ConfirmModal
            message={`Deseja realmente excluir o registro de ${deleteStudent.name}?`}
            onCancel={() => setDeleteStudent(null)}
            onConfirm={confirmDeleteStudent}
          />
        ) : null}
      </AnimatePresence>
    </Section>
  );
}

function StudentModal({
  nextRa,
  initialStudent,
  availableRooms,
  lockedRoom,
  onClose,
  onCreate
}: {
  nextRa?: string;
  initialStudent?: Student;
  availableRooms: typeof rooms;
  lockedRoom?: string;
  onClose: () => void;
  onCreate: (student: Student) => boolean | void | Promise<boolean | void>;
}) {
  const [name, setName] = useState(initialStudent?.name ?? "");
  const [phone, setPhone] = useState(initialStudent?.phone ?? "");
  const [birthday, setBirthday] = useState(normalizeDateInput(initialStudent?.birthday ?? ""));
  const [status, setStatus] = useState<Student["status"]>(initialStudent?.status ?? "Novo");
  const [room, setRoom] = useState(lockedRoom ?? initialStudent?.room ?? availableRooms[0]?.name ?? rooms[0].name);
  const [photo, setPhoto] = useState(initialStudent?.photo ?? "");
  const title = initialStudent ? "Editar aluno" : "Novo aluno";
  const ra = initialStudent?.ra ?? nextRa ?? getNextRa(students);
  const age = calculateAge(birthday);

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.form
        className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-[1.8rem] bg-white p-6 shadow-2xl dark:bg-slate-950"
        initial={false}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 16 }}
        onSubmit={async (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const result = await onCreate({
            id: initialStudent?.id ?? Date.now(),
            ra,
            name: name.trim() || "Novo aluno",
            phone: formatBrazilPhone(phone),
            room,
            frequency: initialStudent?.frequency ?? 0,
            status,
            birthday,
            age,
            avatar: normalizeAvatar(name || initialStudent?.name || "Aluno"),
            photo
          });
          if (result !== false) onClose();
        }}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-extrabold text-brand-deep dark:text-white">{title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Cadastro rapido com sala e contato.</p>
          </div>
          <IconButton label="Fechar modal" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="relative">
          <PhotoCapture photo={photo} onPhoto={setPhoto} previewInitials="RA" />
          <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-extrabold text-brand-blue dark:bg-blue-500/10">{ra}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Nome completo</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-blue focus:bg-white dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Telefone</span>
            <input value={phone} onChange={(event) => setPhone(formatBrazilPhone(event.target.value))} type="tel" inputMode="tel" placeholder="(85) 99999-9999" maxLength={15} required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-blue focus:bg-white dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Data de nascimento</span>
            <input value={birthday} onChange={(event) => setBirthday(event.target.value)} type="date" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-blue focus:bg-white dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Idade</span>
            <input value={age ? `${age} anos` : "Calculada pela data"} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-800" />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Sala</span>
            <select value={room} onChange={(event) => setRoom(event.target.value)} disabled={Boolean(lockedRoom)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-blue focus:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900">
              {availableRooms.map((room) => (
                <option key={room.name}>{room.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as Student["status"])} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-blue focus:bg-white dark:border-slate-700 dark:bg-slate-900">
              <option>Ativo</option>
              <option>Acompanhar</option>
              <option>Novo</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900">Cancelar</button>
          <button className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5">Salvar aluno</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function StudentDetailsModal({ student, onClose, onEdit }: { student: Student; onClose: () => void; onEdit: () => void }) {
  const details = [
    ["RA", student.ra],
    ["Sala", student.room],
    ["Telefone", student.phone],
    ["Data de nascimento", student.birthday || "-"],
    ["Idade", `${calculateAge(student.birthday) || student.age || 0} anos`],
    ["Presenças", String(student.frequency)],
    ["Status", student.status]
  ];

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-[1.8rem] bg-white p-6 shadow-2xl dark:bg-slate-950" initial={false} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 16 }}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar initials={student.avatar} photo={student.photo} size="lg" />
            <div>
              <h3 className="text-2xl font-extrabold text-brand-deep dark:text-white">{student.name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{student.room}</p>
            </div>
          </div>
          <IconButton label="Fechar detalhes" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
              <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
              <p className="mt-1 font-extrabold text-brand-deep dark:text-white">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <a href={phoneToWhatsapp(student.phone)} target="_blank" rel="noreferrer" className="rounded-full bg-emerald-500 px-5 py-3 text-center text-sm font-extrabold text-white transition hover:-translate-y-0.5">WhatsApp</a>
          <button type="button" onClick={onEdit} className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5">Editar aluno</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function RoomsView({
  user,
  searchTerm,
  setSearchTerm,
  roomList,
  setRoomList,
  team,
  setTeam,
  studentsSource,
  attendanceRecords,
  onOpenRoomStudents
}: {
  user: AppUser;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  roomList: Room[];
  setRoomList: (updater: (current: Room[]) => Room[]) => void;
  team: TeamMember[];
  setTeam: (updater: (current: TeamMember[]) => TeamMember[]) => void;
  studentsSource: Student[];
  attendanceRecords: AttendanceRecord[];
  onOpenRoomStudents: (roomName: string) => void;
}) {
  const visibleRooms = scopeRoomsForUser(user, roomList);
  const liveRooms = visibleRooms.map((room) => withLiveRoomStats(room, studentsSource, attendanceRecords));
  const [selectedRoom, setSelectedRoom] = useState(visibleRooms[0] ?? roomList[0]);
  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [planningRoom, setPlanningRoom] = useState<Room | null>(null);
  const [inlinePlanning, setInlinePlanning] = useState<Record<string, string>>({});
  const [inlinePlanningDate, setInlinePlanningDate] = useState<Record<string, string>>({});
  const scopedStudents = scopeStudentsForUser(user, studentsSource);
  const selectedRoomStats = liveRooms.find((room) => room.name === selectedRoom.name) ?? withLiveRoomStats(selectedRoom, studentsSource, attendanceRecords);
  const filteredRooms = liveRooms.filter((room) => {
    const search = searchTerm.toLowerCase().trim();
    return !search || room.name.toLowerCase().includes(search) || room.teacher.toLowerCase().includes(search);
  });

  useEffect(() => {
    if (!visibleRooms.some((room) => room.name === selectedRoom.name)) {
      setSelectedRoom(visibleRooms[0] ?? roomList[0]);
    }
  }, [roomList, selectedRoom.name, visibleRooms]);

  async function saveRoomEdit(updatedRoom: Room) {
    const previousName = editingRoom?.name ?? updatedRoom.name;
    setRoomList((current) => current.map((item) => (item.name === previousName ? updatedRoom : item)));
    setTeam((current) => current.map((member) => (member.role === "teacher" && member.name.toLowerCase() === updatedRoom.teacher.toLowerCase() ? { ...member, room: updatedRoom.name } : member)));
    setSelectedRoom((current) => (current.name === previousName ? updatedRoom : current));
    if (isNeonProvider) {
      const data = await neonMutate<Room>("room", "update", updatedRoom, updatedRoom.id);
      if (data) {
        setRoomList((current) => current.map((item) => (item.name === previousName || item.id === data.id ? data : item)));
        setSelectedRoom(data);
      }
    } else if (supabase) {
      await supabase.from("rooms").update(toDbRoom(updatedRoom)).eq("id", updatedRoom.id ?? 0);
      await supabase.from("team_members").update({ room: updatedRoom.name }).eq("role", "teacher").eq("name", updatedRoom.teacher);
    }
    setEditingRoom(null);
  }

  async function saveRoomPlanning(roomName: string, planning: string, planningDate: string) {
    const updatedBy = user.name;
    setRoomList((current) => current.map((room) => (room.name === roomName ? { ...room, planning, planningDate, planningUpdatedBy: updatedBy } : room)));
    setInlinePlanning((current) => {
      const next = { ...current };
      delete next[roomName];
      return next;
    });
    setInlinePlanningDate((current) => {
      const next = { ...current };
      delete next[roomName];
      return next;
    });
    if (isNeonProvider) {
      const roomToSave = roomList.find((room) => room.name === roomName);
      if (roomToSave) await neonMutate<Room>("room", "update", { ...roomToSave, planning, planningDate, planningUpdatedBy: updatedBy }, roomToSave.id);
    } else if (supabase) {
      await supabase.from("rooms").update({ planning, planning_date: planningDate || null, planning_updated_by: updatedBy }).eq("name", roomName);
    }
    setPlanningRoom(null);
  }

  function openRoomStudents(room: Room) {
    setSelectedRoom(room);
    onOpenRoomStudents(room.name);
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const teacher = String(formData.get("teacher") || "").trim() || "Professor a definir";
    const ageRange = String(formData.get("ageRange") || "").trim() || "Idade a definir";
    if (!name || roomList.some((room) => room.name.toLowerCase() === name.toLowerCase())) return;

    const newRoom = {
      name,
      teacher,
      ageRange,
      students: 0,
      avg: 0,
      accent: "#3B82F6"
    };
    setRoomList((current) => [...current, newRoom]);
    setTeam((current) => current.map((member) => (member.role === "teacher" && member.name.toLowerCase() === teacher.toLowerCase() ? { ...member, room: name } : member)));
    setSelectedRoom(newRoom);
    if (isNeonProvider) {
      const persistedRoom = await neonMutate<Room>("room", "create", newRoom);
      if (persistedRoom) {
        setRoomList((current) => current.map((item) => (item.name === newRoom.name ? persistedRoom : item)));
        setSelectedRoom(persistedRoom);
      }
    } else if (supabase) {
      const { data } = await supabase.from("rooms").insert(toDbRoom(newRoom)).select("*").single();
      await supabase.from("team_members").update({ room: name }).eq("role", "teacher").eq("name", teacher);
      if (data) {
        const persistedRoom = fromDbRoom(data);
        setRoomList((current) => current.map((item) => (item.name === newRoom.name ? persistedRoom : item)));
        setSelectedRoom(persistedRoom);
      }
    }
    setCreatingRoom(false);
    event.currentTarget.reset();
  }

  return (
    <Section>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex max-w-xl flex-1 items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <Search className="mr-2 h-4 w-4 text-slate-400" />
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar sala ou professor" />
        </label>
        {user.role === "admin" ? (
          <button type="button" onClick={() => setCreatingRoom((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white shadow-glow transition hover:-translate-y-0.5">
            <Plus className="h-4 w-4" />
            Criar nova sala
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {creatingRoom ? (
          <motion.form initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={createRoom} className="glass-panel grid gap-3 rounded-[1.8rem] p-5 shadow-soft md:grid-cols-[1fr_1fr_1fr_auto]">
            <input name="name" required className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Nome da sala" />
            <input name="teacher" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Professor da sala" />
            <input name="ageRange" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Idade dos alunos" />
            <button className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5">Salvar sala</button>
          </motion.form>
        ) : null}
      </AnimatePresence>
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {filteredRooms.map((room, index) => (
            <motion.div
              key={room.name}
              whileHover={{ y: -4 }}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedRoom(room)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedRoom(room);
                }
              }}
              className={`glass-panel cursor-pointer rounded-[1.25rem] p-4 text-left shadow-soft transition ${selectedRoom.name === room.name ? "ring-2 ring-brand-blue" : ""}`}
            >
              <div className="w-full text-left">
                <div className="mb-3 flex items-center justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: room.accent }}>
                  <BookOpenCheck className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{room.avg}% media</span>
                </div>
                <h3 className="text-lg font-extrabold leading-tight text-brand-deep dark:text-white">{room.name}</h3>
                <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">Prof. {room.teacher}</p>
                <p className="mt-1 text-sm font-bold text-brand-blue">{room.ageRange}</p>
                <div className="mt-3 flex items-end justify-between">
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{room.students} alunos</p>
                  <div className="flex -space-x-2">
                    {scopedStudents.filter((student) => sameRoomName(student.room, room.name)).slice(0, 3).map((student, item) => (
                      <Avatar key={student.id} initials={student.avatar} photo={student.photo} size="sm" index={index + item} />
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openRoomStudents(room);
                  }}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-deep px-4 py-2 text-xs font-extrabold text-white transition hover:-translate-y-0.5"
                >
                  <Users className="h-4 w-4" />
                  Ver alunos da sala
                </button>
              </div>
              {user.role === "teacher" ? (
                <form
                  onClick={(event) => event.stopPropagation()}
                  onFocus={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveRoomPlanning(
                      room.name,
                      (inlinePlanning[room.name] ?? room.planning ?? "").trim(),
                      inlinePlanningDate[room.name] ?? room.planningDate ?? getTodayInputDate()
                    );
                  }}
                  className="mt-3 rounded-[1rem] bg-blue-50 p-3 dark:bg-blue-500/10"
                >
                  <label className="block space-y-2">
                    <span className="text-xs font-extrabold uppercase text-brand-blue">Data do planejamento</span>
                    <input
                      value={inlinePlanningDate[room.name] ?? room.planningDate ?? getTodayInputDate()}
                      onChange={(event) => setInlinePlanningDate((current) => ({ ...current, [room.name]: event.target.value }))}
                      type="date"
                      className="w-full rounded-2xl border border-blue-100 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-blue dark:border-blue-500/20 dark:bg-slate-900"
                    />
                  </label>
                  <label className="mt-3 block space-y-2">
                    <span className="text-xs font-extrabold uppercase text-brand-blue">Planejamento da sala</span>
                    <textarea
                      value={inlinePlanning[room.name] ?? room.planning ?? ""}
                      onChange={(event) => setInlinePlanning((current) => ({ ...current, [room.name]: event.target.value }))}
                      rows={3}
                      className="w-full resize-none rounded-2xl border border-blue-100 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-blue dark:border-blue-500/20 dark:bg-slate-900"
                      placeholder="Escreva o planejamento da proxima aula..."
                    />
                  </label>
                  <button type="submit" className="mt-3 w-full rounded-full bg-brand-blue px-4 py-2 text-xs font-extrabold text-white transition hover:-translate-y-0.5">
                    Salvar planejamento
                  </button>
                </form>
              ) : null}
              {user.role === "admin" ? (
                <div onClick={(event) => event.stopPropagation()} className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <IconButton label={`Editar ${room.name}`} onClick={() => setEditingRoom(room)}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton label={`Excluir ${room.name}`} onClick={() => setDeleteRoom(room)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              ) : null}
            </motion.div>
          ))}
        </div>

        <div className="glass-panel rounded-[1.25rem] p-4 shadow-soft">
          <h2 className="text-lg font-extrabold text-brand-deep dark:text-white">Detalhes das salas</h2>
          <div className="mt-4 space-y-3">
            {filteredRooms.filter((room) => !isTeachersRoom(room)).map((room) => {
              const roomPlanning = getVisiblePlanning(room);
              return (
                <div key={room.name} className={`rounded-2xl border p-3 transition ${selectedRoomStats.name === room.name ? "border-brand-blue bg-blue-50/80 dark:border-blue-500/40 dark:bg-blue-500/10" : "border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900"}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: room.accent }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-extrabold text-brand-deep dark:text-white">{room.name}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">Prof. {room.teacher}</p>
                      <p className="truncate text-xs font-bold text-brand-blue">{room.ageRange}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
                      <p className="text-[0.68rem] font-bold uppercase text-slate-400">Alunos</p>
                      <p className="text-lg font-extrabold">{room.students}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
                      <p className="text-[0.68rem] font-bold uppercase text-slate-400">Freq.</p>
                      <p className="text-lg font-extrabold">{room.avg}%</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs text-brand-deep dark:bg-blue-500/10 dark:text-blue-100">
                    <p className="font-extrabold">Planejamento</p>
                    <p className="mt-1 line-clamp-2 text-slate-600 dark:text-slate-300">{roomPlanning || "Nenhum planejamento ativo para hoje."}</p>
                    {roomPlanning && room.planningDate ? <p className="mt-1 font-bold text-brand-blue">Até {formatPlanningDate(room.planningDate)}</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {editingRoom ? (
          <RoomEditorModal
            room={editingRoom}
            onClose={() => setEditingRoom(null)}
            onSave={saveRoomEdit}
          />
        ) : null}
        {deleteRoom ? (
          <ConfirmModal
            message={`Deseja realmente excluir a sala ${deleteRoom.name}?`}
            onCancel={() => setDeleteRoom(null)}
            onConfirm={() => {
              const roomToDelete = deleteRoom;
              setRoomList((current) => current.filter((room) => room.name !== roomToDelete.name));
              if (isNeonProvider) void neonMutate<{ deleted: boolean }>("room", "delete", undefined, roomToDelete.id);
              else if (supabase) supabase.from("rooms").delete().eq("id", roomToDelete.id ?? 0);
              setDeleteRoom(null);
            }}
          />
        ) : null}
        {planningRoom ? (
          <RoomPlanningModal
            room={planningRoom}
            onClose={() => setPlanningRoom(null)}
            onSave={saveRoomPlanning}
          />
        ) : null}
      </AnimatePresence>
    </Section>
  );
}

function RoomEditorModal({ room, onClose, onSave }: { room: Room; onClose: () => void; onSave: (room: Room) => void }) {
  const [name, setName] = useState(room.name);
  const [teacher, setTeacher] = useState(room.teacher);
  const [ageRange, setAgeRange] = useState(room.ageRange);
  const [studentsCount, setStudentsCount] = useState(String(room.students));
  const [avg, setAvg] = useState(String(room.avg));
  const [accent, setAccent] = useState(room.accent);

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.form
        className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-[1.8rem] bg-white p-6 shadow-2xl dark:bg-slate-950"
        initial={false}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...room,
            name: name.trim(),
            teacher: teacher.trim() || "Professor a definir",
            ageRange: ageRange.trim() || "Idade a definir",
            students: Number(studentsCount) || 0,
            avg: Math.max(0, Math.min(100, Number(avg) || 0)),
            accent
          });
        }}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-extrabold text-brand-deep dark:text-white">Editar sala</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Altere todas as informações da sala.</p>
          </div>
          <IconButton label="Fechar modal" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Nome da sala</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Responsável</span>
            <input value={teacher} onChange={(event) => setTeacher(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Idade dos alunos</span>
            <input value={ageRange} onChange={(event) => setAgeRange(event.target.value)} placeholder="Ex: 13 a 17 anos" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Quantidade de alunos</span>
            <input value={studentsCount} onChange={(event) => setStudentsCount(event.target.value)} type="number" min="0" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Frequencia media</span>
            <input value={avg} onChange={(event) => setAvg(event.target.value)} type="number" min="0" max="100" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Cor da sala</span>
            <input value={accent} onChange={(event) => setAccent(event.target.value)} type="color" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900" />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900">Cancelar</button>
          <button className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5">Salvar sala</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function RoomPlanningModal({
  room,
  onClose,
  onSave
}: {
  room: Room;
  onClose: () => void;
  onSave: (roomName: string, planning: string, planningDate: string) => void;
}) {
  const [planning, setPlanning] = useState(room.planning ?? "");
  const [planningDate, setPlanningDate] = useState(room.planningDate || getTodayInputDate());

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.form
        className="w-full max-w-xl rounded-[1.8rem] bg-white p-6 shadow-2xl dark:bg-slate-950"
        initial={false}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          onSave(room.name, planning.trim(), planningDate);
        }}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-extrabold text-brand-deep dark:text-white">Planejamento da sala</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{room.name} - visivel ate o fim do dia escolhido.</p>
          </div>
          <IconButton label="Fechar planejamento" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <label className="mb-4 block space-y-2">
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Disponível até</span>
          <input value={planningDate} onChange={(event) => setPlanningDate(event.target.value)} type="date" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Plano da proxima aula</span>
          <textarea
            value={planning}
            onChange={(event) => setPlanning(event.target.value)}
            rows={8}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900"
            placeholder="Tema, objetivos, materiais, atividades e observacoes da sala..."
          />
        </label>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900">Cancelar</button>
          <button className="rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5">Salvar planejamento</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function AttendanceView({
  user,
  roomsSource,
  studentsSource,
  attendanceRecords,
  setAttendanceRecords,
  setStudents
}: {
  user: AppUser;
  roomsSource: Room[];
  studentsSource: Student[];
  attendanceRecords: AttendanceRecord[];
  setAttendanceRecords: (updater: (current: AttendanceRecord[]) => AttendanceRecord[]) => void;
  setStudents: (updater: (current: Student[]) => Student[]) => void;
}) {
  const scopedRooms = scopeRoomsForUser(user, roomsSource);
  const scopedStudents = useMemo(() => scopeStudentsForUser(user, studentsSource), [user, studentsSource]);
  const [room, setRoom] = useState(scopedRooms[0]?.name ?? "Adolescentes");
  const attendanceDateOptions = useMemo(() => getServiceDateOptions(), []);
  const [attendanceDate, setAttendanceDate] = useState(getDefaultAttendanceDate());
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceFeedback, setAttendanceFeedback] = useState("");
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [savingStudentIds, setSavingStudentIds] = useState<Record<number, boolean>>({});
  const activeRoom = getTeacherRoom(user) ?? room;
  const roomStudents = useMemo(() => scopedStudents.filter((student) => activeRoom === "Todas" || sameRoomName(student.room, activeRoom)), [activeRoom, scopedStudents]);
  const attendanceStudents = useMemo(() => {
    const search = attendanceSearch.toLowerCase().trim();
    if (!search) return roomStudents;
    return roomStudents.filter((student) =>
      student.name.toLowerCase().includes(search) ||
      student.ra.toLowerCase().includes(search) ||
      student.phone.includes(attendanceSearch)
    );
  }, [attendanceSearch, roomStudents]);
  const savedAttendanceRecords = useMemo(
    () => attendanceRecords.filter((record) => normalizeStoredDate(record.attendanceDate) === attendanceDate && sameRoomName(record.room, activeRoom)),
    [attendanceDate, activeRoom, attendanceRecords]
  );
  const [attendance, setAttendance] = useState<Record<number, boolean>>(() => Object.fromEntries(studentsSource.map((student) => [student.id, false])));
  const presentCount = roomStudents.filter((student) => Boolean(attendance[student.id])).length;
  const absentCount = Math.max(0, roomStudents.length - presentCount);

  useEffect(() => {
    const savedByStudent = savedAttendanceRecords.reduce((acc, record) => {
      const studentId = Number(record.studentId);
      acc.set(studentId, Boolean(acc.get(studentId) || record.present));
      return acc;
    }, new Map<number, boolean>());
    setAttendance(Object.fromEntries(roomStudents.map((student) => [student.id, savedByStudent.get(Number(student.id)) ?? false])));
    setAttendanceFeedback("");
    setAttendanceSearch("");
  }, [attendanceDate, activeRoom, roomStudents, savedAttendanceRecords]);

  async function finishAttendance() {
    setSavingAttendance(true);
    setAttendanceFeedback("");
    const previousByStudent = savedAttendanceRecords.reduce((acc, record) => {
      const studentId = Number(record.studentId);
      acc.set(studentId, Boolean(acc.get(studentId) || record.present));
      return acc;
    }, new Map<number, boolean>());
    const recordsToSave = roomStudents.map((student) => ({
      attendanceDate,
      room: activeRoom,
      studentId: student.id,
      present: Boolean(attendance[student.id])
    }));
    const frequencyUpdates = roomStudents
      .map((student) => {
        const previous = previousByStudent.get(student.id) ?? false;
        const next = Boolean(attendance[student.id]);
        const delta = Number(next) - Number(previous);
        return { ...student, frequency: Math.max(0, student.frequency + delta), delta };
      })
      .filter((student) => student.delta !== 0);

    if (frequencyUpdates.length) {
      setStudents((current) => current.map((student) => frequencyUpdates.find((item) => item.id === student.id) ?? student));
    }

    if (isNeonProvider) {
      const persistedRecords = await neonMutate<AttendanceRecord[]>("attendanceBatch", "upsert", { records: recordsToSave, frequencyUpdates });
      setAttendanceRecords((current) => [
        ...current.filter((record) => !(normalizeStoredDate(record.attendanceDate) === attendanceDate && sameRoomName(record.room, activeRoom))),
        ...persistedRecords
      ]);
    } else if (supabase) {
      const client = supabase;
      const { data, error } = await client
        .from("attendance_records")
        .upsert(recordsToSave.map(toDbAttendance), { onConflict: "attendance_date,room,student_id" })
        .select("*");
      if (error) {
        setAttendanceFeedback("Não foi possível salvar a chamada. Tente novamente.");
        setSavingAttendance(false);
        return;
      }
      await Promise.all(frequencyUpdates.map((student) => client.from("students").update({ frequency: student.frequency }).eq("id", student.id)));
      const persistedRecords = (data ?? []).map(fromDbAttendance);
      setAttendanceRecords((current) => [
        ...current.filter((record) => !(normalizeStoredDate(record.attendanceDate) === attendanceDate && sameRoomName(record.room, activeRoom))),
        ...persistedRecords
      ]);
    } else {
      setAttendanceRecords((current) => [
        ...current.filter((record) => !(normalizeStoredDate(record.attendanceDate) === attendanceDate && sameRoomName(record.room, activeRoom))),
        ...recordsToSave
      ]);
    }

    setAttendanceFeedback("Chamada finalizada e salva.");
    setSavingAttendance(false);
  }

  async function saveStudentAttendance(student: Student, nextPresent: boolean) {
    const previousPresent = Boolean(attendance[student.id]);
    setAttendance((current) => ({ ...current, [student.id]: nextPresent }));
    setSavingStudentIds((current) => ({ ...current, [student.id]: true }));
    setAttendanceFeedback("Salvando marcação...");

    const savedRecord = savedAttendanceRecords.find((record) => Number(record.studentId) === Number(student.id));
    const delta = Number(nextPresent) - Number(previousPresent);
    const nextFrequency = Math.max(0, student.frequency + delta);
    const recordToSave = { attendanceDate, room: activeRoom, studentId: student.id, present: nextPresent };

    if (delta !== 0) {
      setStudents((current) => current.map((item) => item.id === student.id ? { ...item, frequency: nextFrequency } : item));
    }

    if (isNeonProvider) {
      const persistedRecord = await neonMutate<AttendanceRecord>("attendanceRecord", "upsert", { ...recordToSave, frequency: nextFrequency });
      setAttendanceRecords((current) => [
        ...current.filter((record) => !(normalizeStoredDate(record.attendanceDate) === attendanceDate && sameRoomName(record.room, activeRoom) && Number(record.studentId) === Number(student.id))),
        persistedRecord
      ]);
    } else if (supabase) {
      const client = supabase;
      const { data, error } = await client
        .from("attendance_records")
        .upsert(toDbAttendance(recordToSave), { onConflict: "attendance_date,room,student_id" })
        .select("*")
        .single();
      if (error) {
        setAttendance((current) => ({ ...current, [student.id]: previousPresent }));
        if (delta !== 0) setStudents((current) => current.map((item) => item.id === student.id ? { ...item, frequency: student.frequency } : item));
        setAttendanceFeedback("Não foi possível salvar essa marcação. Tente novamente.");
        setSavingStudentIds((current) => ({ ...current, [student.id]: false }));
        return;
      }
      if (delta !== 0) await client.from("students").update({ frequency: nextFrequency }).eq("id", student.id);
      const persistedRecord = fromDbAttendance(data);
      setAttendanceRecords((current) => [
        ...current.filter((record) => !(normalizeStoredDate(record.attendanceDate) === attendanceDate && sameRoomName(record.room, activeRoom) && Number(record.studentId) === Number(student.id))),
        persistedRecord
      ]);
    } else {
      setAttendanceRecords((current) => [
        ...current.filter((record) => !(normalizeStoredDate(record.attendanceDate) === attendanceDate && sameRoomName(record.room, activeRoom) && Number(record.studentId) === Number(student.id))),
        { ...recordToSave, id: savedRecord?.id ?? Date.now() }
      ]);
    }

    setAttendanceFeedback(nextPresent ? "Presença salva." : "Falta salva.");
    setSavingStudentIds((current) => ({ ...current, [student.id]: false }));
  }

  return (
    <Section>
      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
          <h2 className="text-2xl font-extrabold text-brand-deep dark:text-white">Chamada inteligente</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{user.role === "teacher" ? "Sua sala vinculada já foi carregada automaticamente." : "Selecione uma sala e marque presenças com feedback instantâneo."} O autosave confirma cada mudança.</p>
          <label className="mt-6 block space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Sala</span>
            <select value={activeRoom} disabled={user.role === "teacher"} onChange={(event) => setRoom(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900">
              {scopedRooms.map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="mt-4 block space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Data da chamada</span>
            <select value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
              {attendanceDateOptions.map((date) => (
                <option key={date} value={date}>{formatPlanningDate(date)} - {new Date(`${date}T00:00:00`).getDay() === 0 ? "domingo" : "quinta-feira"}</option>
              ))}
            </select>
          </label>
          <div className="mt-6 rounded-[1.4rem] bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
            <p className="text-sm font-extrabold">{savedAttendanceRecords.length ? "Chamada carregada" : "Nova chamada"}</p>
            <p className="mt-1 text-xs leading-5 opacity-80">{savedAttendanceRecords.length ? "Esta data já possui presenças salvas para conferência." : "Marque os alunos e cada alteração será gravada automaticamente."}</p>
            {attendanceFeedback ? <p className="mt-2 text-xs font-extrabold">{attendanceFeedback}</p> : null}
          </div>
        </div>

        <div className="glass-panel rounded-[1.8rem] p-4 shadow-soft">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">Lista de alunos</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{attendanceStudents.length} de {roomStudents.length} alunos em {activeRoom} - {formatPlanningDate(attendanceDate)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-extrabold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20">{presentCount} presentes</span>
              <span className="rounded-full bg-red-50 px-4 py-2 text-xs font-extrabold text-red-700 ring-1 ring-red-100 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-500/20">{absentCount} faltas</span>
              <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-200">{roomStudents.length} alunos</span>
            </div>
            <button disabled={savingAttendance} onClick={finishAttendance} className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70">
              {savingAttendance ? "Salvando..." : "Finalizar chamada"}
            </button>
          </div>
          <label className="mb-4 flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <Search className="mr-2 h-4 w-4 text-slate-400" />
            <input value={attendanceSearch} onChange={(event) => setAttendanceSearch(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar aluno por nome, RA ou telefone" />
          </label>
          <div className="space-y-3">
            {attendanceStudents.map((student, index) => {
              const present = attendance[student.id];

              return (
                <motion.div
                  key={student.id}
                  layout
                  className={`flex flex-col gap-3 rounded-[1.35rem] border p-4 transition sm:flex-row sm:items-center sm:justify-between ${
                    present ? "border-emerald-100 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10" : "border-red-100 bg-red-50/70 dark:border-red-500/20 dark:bg-red-500/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar initials={student.avatar} photo={student.photo} index={index} />
                    <div>
                      <p className="font-extrabold text-slate-800 dark:text-white">{student.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{student.phone}</p>
                    </div>
                  </div>
                  <button
                    disabled={Boolean(savingStudentIds[student.id])}
                    onClick={() => void saveStudentAttendance(student, !present)}
                    className={`flex w-full items-center justify-between rounded-full p-1 text-sm font-extrabold transition disabled:cursor-wait disabled:opacity-75 sm:w-52 ${
                      present ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                    }`}
                  >
                    <span className={`grid h-9 w-9 place-items-center rounded-full bg-white ${present ? "text-emerald-600" : "text-red-600"}`}>
                      {present ? <Check className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </span>
                    <span>{savingStudentIds[student.id] ? "Salvando" : present ? "Presente" : "Falta"}</span>
                    <span className="w-9" />
                  </button>
                </motion.div>
              );
            })}
            {!attendanceStudents.length ? <p className="rounded-2xl bg-white p-4 text-sm font-bold text-slate-500 shadow-sm dark:bg-slate-900">Nenhum aluno encontrado nessa busca.</p> : null}
          </div>
        </div>
      </div>
    </Section>
  );
}

function ExamsView({
  user,
  exams,
  setExams,
  roomsSource,
  studentsSource
}: {
  user: AppUser;
  exams: Exam[];
  setExams: (updater: (current: Exam[]) => Exam[]) => void;
  roomsSource: Room[];
  studentsSource: Student[];
}) {
  const scopedRooms = scopeRoomsForUser(user, roomsSource);
  const scopedStudents = scopeStudentsForUser(user, studentsSource);
  const visibleExams = exams.filter((exam) => user.role === "admin" || sameRoomName(exam.room, getTeacherRoom(user)));
  const [selectedExamId, setSelectedExamId] = useState(visibleExams[0]?.id ?? exams[0]?.id ?? 0);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [deleteExam, setDeleteExam] = useState<Exam | null>(null);
  const [examStudentSearch, setExamStudentSearch] = useState("");
  const selectedExam = visibleExams.find((exam) => exam.id === selectedExamId) ?? visibleExams[0];
  const examStudents = selectedExam ? scopedStudents.filter((student) => sameRoomName(student.room, selectedExam.room)) : [];
  const normalizedExamStudentSearch = examStudentSearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const filteredExamStudents = examStudents.filter((student) => {
    if (!normalizedExamStudentSearch) return true;
    const studentName = student.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return studentName.includes(normalizedExamStudentSearch) || student.ra.toLowerCase().includes(normalizedExamStudentSearch);
  });

  useEffect(() => {
    if (selectedExam && visibleExams.some((exam) => exam.id === selectedExamId)) return;
    setSelectedExamId(visibleExams[0]?.id ?? 0);
  }, [selectedExam?.id, selectedExamId, visibleExams]);

  useEffect(() => {
    setExamStudentSearch("");
  }, [selectedExam?.id]);

  async function saveExamEdit(updatedExam: Exam) {
    setExams((current) => current.map((exam) => (exam.id === updatedExam.id ? updatedExam : exam)));
    setSelectedExamId(updatedExam.id);
    if (isNeonProvider) {
      const data = await neonMutate<Exam>("exam", "update", updatedExam, updatedExam.id);
      if (data) setExams((current) => current.map((exam) => (exam.id === updatedExam.id ? data : exam)));
    } else if (supabase) {
      await supabase.from("exams").update({
        title: updatedExam.title,
        room: updatedExam.room,
        month: updatedExam.month,
        max_score: updatedExam.maxScore
      }).eq("id", updatedExam.id);
    }
    setEditingExam(null);
  }

  async function confirmDeleteExam() {
    if (!deleteExam) return;
    const remainingExams = exams.filter((exam) => exam.id !== deleteExam.id);
    setExams(() => remainingExams);
    if (selectedExamId === deleteExam.id) {
      const nextExam = remainingExams.find((exam) => user.role === "admin" || sameRoomName(exam.room, getTeacherRoom(user)));
      setSelectedExamId(nextExam?.id ?? 0);
    }
    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("exam", "delete", undefined, deleteExam.id);
    } else if (supabase) {
      await supabase.from("exam_scores").delete().eq("exam_id", deleteExam.id);
      await supabase.from("exams").delete().eq("id", deleteExam.id);
    }
    setDeleteExam(null);
  }

  async function createExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const room = getTeacherRoom(user) ?? String(formData.get("room") || scopedRooms[0]?.name || rooms[0].name);
    const title = String(formData.get("title") || "").trim();
    const maxScore = Number(formData.get("maxScore") || 10);
    const month = Number(formData.get("month") || 5);
    if (!title) return;

    const exam: Exam = {
      id: Date.now(),
      title,
      room,
      month,
      maxScore,
      scores: {}
    };
    setExams((current) => [exam, ...current]);
    if (isNeonProvider) {
      const persistedExam = await neonMutate<Exam>("exam", "create", exam);
      if (persistedExam) {
        setExams((current) => current.map((item) => (item.id === exam.id ? persistedExam : item)));
        setSelectedExamId(persistedExam.id);
      } else {
        setSelectedExamId(exam.id);
      }
    } else if (supabase) {
      const { data } = await supabase.from("exams").insert({
        title: exam.title,
        room: exam.room,
        month: exam.month,
        max_score: exam.maxScore
      }).select("*").single();
      if (data) {
        const persistedExam = fromDbExam(data, []);
        setExams((current) => current.map((item) => (item.id === exam.id ? persistedExam : item)));
        setSelectedExamId(persistedExam.id);
      } else {
        setSelectedExamId(exam.id);
      }
    } else {
      setSelectedExamId(exam.id);
    }
    event.currentTarget.reset();
  }

  async function updateScore(studentId: number, value: string) {
    const score = Math.max(0, Math.min(Number(value || 0), selectedExam?.maxScore ?? 10));
    if (!selectedExam) return;
    setExams((current) =>
      current.map((exam) => (exam.id === selectedExam.id ? { ...exam, scores: { ...exam.scores, [studentId]: score } } : exam))
    );
    if (isNeonProvider) {
      await neonMutate("examScore", "upsert", { examId: selectedExam.id, studentId, score });
    } else if (supabase) {
      await supabase.from("exam_scores").upsert({ exam_id: selectedExam.id, student_id: studentId, score });
    }
  }

  return (
    <Section>
      <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
        <div className="mb-5">
          <h2 className="text-2xl font-extrabold text-brand-deep dark:text-white">Provas</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">As notas lançadas aqui somam com a quantidade de presenças no ranking.</p>
        </div>
        <form onSubmit={createExam} className="grid gap-3 lg:grid-cols-[1.3fr_0.9fr_0.7fr_0.7fr_auto]">
          <input name="title" required className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Nome da prova" />
          <select name="room" disabled={user.role === "teacher"} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900">
            {scopedRooms.map((room) => <option key={room.name}>{room.name}</option>)}
          </select>
          <select name="month" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
            {monthOptions.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
          </select>
          <input name="maxScore" min="1" max="100" type="number" defaultValue={10} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Nota max." />
          <button className="rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5">Criar prova</button>
        </form>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <div className="glass-panel rounded-[1.8rem] p-4 shadow-soft">
          <h3 className="px-1 text-lg font-extrabold text-brand-deep dark:text-white">Provas cadastradas</h3>
          <div className="mt-4 space-y-2">
            {visibleExams.map((exam) => (
              <div
                key={exam.id}
                className={`rounded-2xl p-3 transition ${selectedExam?.id === exam.id ? "bg-brand-deep text-white shadow-glow" : "bg-white hover:-translate-y-0.5 hover:shadow-sm dark:bg-slate-900"}`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedExamId(exam.id)}
                  className="w-full text-left"
                >
                  <p className="font-extrabold">{exam.title}</p>
                  <p className={`mt-1 text-xs ${selectedExam?.id === exam.id ? "text-blue-100" : "text-slate-500 dark:text-slate-400"}`}>{exam.room} - {monthLabel(exam.month)} - {exam.maxScore} pts</p>
                </button>
                <div className="mt-3 flex justify-end gap-2">
                  <IconButton label={`Editar ${exam.title}`} onClick={() => setEditingExam(exam)}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton label={`Excluir ${exam.title}`} onClick={() => setDeleteExam(exam)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-[1.8rem] p-4 shadow-soft">
          <div className="mb-4 flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">{selectedExam?.title ?? "Selecione uma prova"}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Lance a nota de cada aluno. O ranking atualiza automaticamente.</p>
            </div>
            <label className="flex w-full items-center rounded-full border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:w-64">
              <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
              <input value={examStudentSearch} onChange={(event) => setExamStudentSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar aluno ou RA" />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {filteredExamStudents.map((student, index) => (
              <div key={student.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
                <Avatar initials={student.avatar} photo={student.photo} index={index} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold">{student.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{student.ra} - {student.frequency} presenças</p>
                </div>
                <input
                  value={selectedExam?.scores[student.id] ?? ""}
                  onChange={(event) => updateScore(student.id, event.target.value)}
                  min="0"
                  max={selectedExam?.maxScore ?? 10}
                  type="number"
                  className="w-20 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-extrabold outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-800"
                  placeholder="0"
                />
              </div>
            ))}
            {selectedExam && filteredExamStudents.length === 0 ? <p className="md:col-span-2 rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500 dark:bg-slate-900 dark:text-slate-400">Nenhum aluno encontrado para esta prova.</p> : null}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {editingExam ? (
          <ExamEditorModal
            exam={editingExam}
            roomsSource={scopedRooms}
            lockedRoom={getTeacherRoom(user)}
            onClose={() => setEditingExam(null)}
            onSave={saveExamEdit}
          />
        ) : null}
        {deleteExam ? (
          <ConfirmModal
            message={`Deseja realmente excluir a prova ${deleteExam.title}?`}
            onCancel={() => setDeleteExam(null)}
            onConfirm={confirmDeleteExam}
          />
        ) : null}
      </AnimatePresence>
    </Section>
  );
}

function ExamEditorModal({
  exam,
  roomsSource,
  lockedRoom,
  onClose,
  onSave
}: {
  exam: Exam;
  roomsSource: Room[];
  lockedRoom?: string;
  onClose: () => void;
  onSave: (exam: Exam) => void;
}) {
  const [title, setTitle] = useState(exam.title);
  const [room, setRoom] = useState(lockedRoom ?? exam.room);
  const [month, setMonth] = useState(exam.month);
  const [maxScore, setMaxScore] = useState(String(exam.maxScore));

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.form
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-[1.8rem] bg-white p-6 shadow-2xl dark:bg-slate-950"
        initial={false}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...exam,
            title: title.trim() || exam.title,
            room,
            month,
            maxScore: Math.max(1, Number(maxScore) || exam.maxScore)
          });
        }}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-extrabold text-brand-deep dark:text-white">Editar prova</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Atualize nome, sala, mês e nota máxima.</p>
          </div>
          <IconButton label="Fechar modal" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Nome da prova</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Sala</span>
            <select value={room} disabled={Boolean(lockedRoom)} onChange={(event) => setRoom(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900">
              {roomsSource.map((item) => <option key={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Mês</span>
            <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900">
              {monthOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Nota máxima</span>
            <input value={maxScore} onChange={(event) => setMaxScore(event.target.value)} min="1" max="100" type="number" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900">Cancelar</button>
          <button className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5">Salvar prova</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function RankingView({ user, searchTerm, setSearchTerm, exams, roomsSource, studentsSource, attendanceRecords }: { user: AppUser; searchTerm: string; setSearchTerm: (value: string) => void; exams: Exam[]; roomsSource: Room[]; studentsSource: Student[]; attendanceRecords: AttendanceRecord[] }) {
  const rankingRooms = roomsSource;
  const rankingStudents = studentsSource;
  const [room, setRoom] = useState("Todas");
  const [period, setPeriod] = useState("geral");
  const filteredRanking = useMemo(() => {
    const activeMonth = 5;
    const scoringExams = period === "mensal" ? exams.filter((exam) => exam.month === activeMonth) : exams;
    const base = (room !== "Todas" ? rankingStudents.filter((student) => sameRoomName(student.room, room)) : rankingStudents).filter((student) => {
      const search = searchTerm.toLowerCase().trim();
      return !search || student.name.toLowerCase().includes(search) || student.ra.toLowerCase().includes(search) || student.room.toLowerCase().includes(search);
    });
    return base
      .map((student) => {
        const examTotal = getExamTotal(student.id, scoringExams);
        return {
          ...student,
          presencePoints: student.frequency,
          examTotal,
          score: student.frequency + examTotal,
          perfectSundays: hasPerfectSundayAttendance(student, attendanceRecords),
          scoreTen: hasExamScoreTen(student.id, scoringExams)
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((student, index) => ({ ...student, position: index + 1 }));
  }, [room, period, searchTerm, rankingStudents, exams, attendanceRecords]);
  const perfectSundayStudents = filteredRanking.filter((student) => student.perfectSundays).slice(0, 6);
  const scoreTenStudents = filteredRanking.filter((student) => student.scoreTen).slice(0, 6);
  const podium = filteredRanking.slice(0, 5);
  const podiumTop = [podium[1], podium[0], podium[2]].filter(Boolean);
  const podiumRest = podium.slice(3);

  return (
    <Section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-brand-deep dark:text-white">Ranking EBR</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Classificação por quantidade de presenças + notas das provas.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex items-center rounded-full border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <Search className="mr-2 h-4 w-4 text-slate-400" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full bg-transparent text-sm outline-none sm:w-44" placeholder="Buscar ranking" />
          </label>
          <select value={room} onChange={(event) => setRoom(event.target.value)} className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
            <option>Todas</option>
            {rankingRooms.map((item) => <option key={item.name}>{item.name}</option>)}
          </select>
          <div className="flex rounded-full bg-white p-1 shadow-sm dark:bg-slate-900">
            {[
              ["geral", "Geral"],
              ["mensal", "Mensal"]
            ].map(([value, label]) => (
              <button key={value} onClick={() => setPeriod(value)} className={`rounded-full px-4 py-2 text-sm font-extrabold transition ${period === value ? "bg-brand-deep text-white" : "text-slate-500 hover:text-brand-deep dark:hover:text-white"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <HighlightStudentsCard title="Domingos sem falta" subtitle="Alunos presentes em todos os domingos registrados" tone="green" students={perfectSundayStudents} emptyText="Sem aluno com todos os domingos presentes neste filtro." />
        <HighlightStudentsCard title="Nota 10" subtitle="Alunos que tiraram 10 nas provas do período" tone="gold" students={scoreTenStudents} emptyText="Sem nota 10 neste filtro." />
      </div>
      <div className="glass-panel rounded-[1.8rem] p-4 shadow-soft sm:p-5">
        <div className="grid grid-cols-3 items-end gap-1.5 sm:gap-3">
          {podiumTop.map((student) => {
            const blockHeight = student.position === 1 ? "h-36 sm:h-44" : student.position === 2 ? "h-28 sm:h-36" : "h-24 sm:h-32";
            const blockTone = student.position === 1 ? "from-amber-50 via-white to-slate-100" : student.position === 2 ? "from-slate-100 via-white to-slate-200" : "from-orange-50 via-white to-slate-100";
            const prizeClass = student.position === 1 ? "text-amber-600" : student.position === 2 ? "text-slate-500" : "text-orange-600";
            const PrizeIcon = student.position === 1 ? Trophy : Medal;
            return (
              <motion.div key={student.id} whileHover={{ y: -3 }} className="min-w-0 text-center">
                <div className="mb-3 flex flex-col items-center gap-2 rounded-2xl bg-white/82 p-3 shadow-sm dark:bg-slate-900/75 sm:p-4">
                  <Avatar initials={student.avatar} photo={student.photo} size={student.position === 1 ? "xl" : "lg"} index={student.position - 1} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-brand-deep dark:text-white sm:text-base">{student.name}</p>
                    <p className="text-xs font-bold text-brand-blue sm:text-sm">{student.score} pts</p>
                  </div>
                </div>
                <div className={`flex ${blockHeight} flex-col items-center justify-center gap-2 rounded-t-xl border border-slate-300 bg-gradient-to-b ${blockTone} shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_8px_20px_rgba(15,23,42,.12)] dark:border-slate-700 dark:from-slate-800 dark:via-slate-900 dark:to-slate-950`}>
                  <PrizeIcon className={`h-7 w-7 sm:h-9 sm:w-9 ${prizeClass}`} />
                  <span className="text-5xl font-black text-slate-950 dark:text-white sm:text-7xl">{student.position}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
        {podiumRest.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {podiumRest.map((student) => (
              <div key={student.id} className="flex min-w-0 items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg font-black text-brand-deep dark:bg-slate-800 dark:text-white">{student.position}</span>
                <Avatar initials={student.avatar} photo={student.photo} size="sm" index={student.position - 1} />
                <Medal className="h-5 w-5 shrink-0 text-brand-blue" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold">{student.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{student.room}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-sm font-extrabold text-brand-blue">{student.score} pts</p>
                  <div className="flex flex-wrap justify-end gap-1">
                    {student.perfectSundays ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-extrabold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">Domingos 100%</span> : null}
                    {student.scoreTen ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-extrabold text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">Nota 10</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="glass-panel rounded-[1.8rem] p-4 shadow-soft">
        <h2 className="px-2 pb-3 text-xl font-extrabold text-brand-deep dark:text-white">Ranking completo</h2>
        <div className="space-y-2">
          {filteredRanking.map((student, index) => (
            <div key={student.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-sm font-extrabold text-brand-deep dark:bg-slate-800 dark:text-white">{student.position}</span>
              <Avatar initials={student.avatar} photo={student.photo} size="sm" index={index} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">{student.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{student.room}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {student.perfectSundays ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-extrabold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">Domingos 100%</span> : null}
                  {student.scoreTen ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-extrabold text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">Nota 10</span> : null}
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-extrabold text-brand-blue">{student.score} pts</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function HighlightStudentsCard({ title, subtitle, tone, students, emptyText }: { title: string; subtitle: string; tone: "green" | "gold"; students: Array<Student & { position: number; score: number }>; emptyText: string }) {
  const toneClasses = tone === "green"
    ? "from-emerald-50 to-white text-emerald-700 dark:from-emerald-500/10 dark:to-slate-950 dark:text-emerald-200"
    : "from-amber-50 to-white text-amber-700 dark:from-amber-500/10 dark:to-slate-950 dark:text-amber-200";
  const iconClass = tone === "green" ? "bg-emerald-500" : "bg-brand-gold";
  return (
    <div className={"glass-panel rounded-[1.8rem] bg-gradient-to-br p-4 shadow-soft " + toneClasses}>
      <div className="flex items-start gap-3">
        <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white " + iconClass}>{tone === "green" ? <Check className="h-5 w-5" /> : <Trophy className="h-5 w-5" />}</span>
        <div className="min-w-0">
          <h3 className="font-extrabold text-brand-deep dark:text-white">{title}</h3>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-300">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {students.length ? students.map((student, index) => (
          <div key={student.id} className="flex min-w-0 items-center gap-2 rounded-2xl bg-white/80 p-2 shadow-sm dark:bg-slate-900/80">
            <Avatar initials={student.avatar} photo={student.photo} size="sm" index={index} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-brand-deep dark:text-white">{student.name}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{student.room}</p>
            </div>
            <span className="shrink-0 text-xs font-black text-brand-blue">#{student.position}</span>
          </div>
        )) : <p className="rounded-2xl bg-white/70 p-3 text-xs font-bold text-slate-500 dark:bg-slate-900/70 dark:text-slate-300">{emptyText}</p>}
      </div>
    </div>
  );
}

function BirthdaysView({ user, searchTerm, setSearchTerm, roomsSource, studentsSource, todayOnly = false }: { user: AppUser; searchTerm: string; setSearchTerm: (value: string) => void; roomsSource: Room[]; studentsSource: Student[]; todayOnly?: boolean }) {
  const scopedRooms = scopeRoomsForUser(user, roomsSource);
  const scopedStudents = scopeStudentsForUser(user, studentsSource);
  const [birthdayMonth, setBirthdayMonth] = useState(getCurrentMonth());
  const [birthdayMessage, setBirthdayMessage] = useState(DEFAULT_BIRTHDAY_MESSAGE);
  useEffect(() => {
    try {
      const savedMessage = window.localStorage.getItem(BIRTHDAY_MESSAGE_STORAGE_KEY);
      if (savedMessage !== null) setBirthdayMessage(savedMessage);
    } catch {
      // O formulário continua funcionando mesmo quando o navegador bloqueia o armazenamento local.
    }
  }, []);

  function updateBirthdayMessage(value: string) {
    setBirthdayMessage(value);
    try {
      window.localStorage.setItem(BIRTHDAY_MESSAGE_STORAGE_KEY, value);
    } catch {
      // A mensagem permanece em memória nesta sessão quando o armazenamento não está disponível.
    }
  }
  const [room, setRoom] = useState(user.role === "teacher" ? scopedRooms[0]?.name ?? "Todas" : "Todas");
  const birthdayStudents = scopedStudents.filter((student) => {
    const matchesPeriod = todayOnly ? isBirthdayToday(student.birthday) : getBirthdayMonth(student) === birthdayMonth;
    const matchesRoom = user.role === "teacher" || room === "Todas" || sameRoomName(student.room, room);
    const search = searchTerm.toLowerCase().trim();
    const matchesQuery = !search || student.name.toLowerCase().includes(search) || student.ra.toLowerCase().includes(search) || student.room.toLowerCase().includes(search);
    return matchesPeriod && matchesRoom && matchesQuery;
  }).sort((a, b) => getBirthdayDay(a.birthday) - getBirthdayDay(b.birthday) || a.name.localeCompare(b.name, "pt-BR"));

  return (
    <Section>
      <div className="relative overflow-hidden rounded-[2rem] bg-brand-deep p-6 text-white shadow-soft">
        {[...Array(18)].map((_, index) => (
          <span
            key={index}
            className="confetti absolute h-2 w-2 rounded-sm"
            style={{
              left: `${6 + index * 5}%`,
              top: `${(index % 4) * 8}px`,
              background: ["#F59E0B", "#22C55E", "#3B82F6", "#EF4444"][index % 4],
              animationDelay: `${index * 0.16}s`
            }}
          />
        ))}
        <div className="relative">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-100">Celebracoes do dia</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-extrabold sm:text-4xl">Aniversariantes recebendo cuidado com carinho.</h2>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {todayOnly ? <span className="rounded-full bg-amber-100 px-4 py-3 text-sm font-extrabold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">Aniversariantes de hoje</span> : <select value={birthdayMonth} onChange={(event) => setBirthdayMonth(Number(event.target.value))} className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {monthOptions.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
        </select>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex items-center rounded-full border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <Search className="mr-2 h-4 w-4 text-slate-400" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full bg-transparent text-sm outline-none sm:w-44" placeholder="Buscar aniversariante" />
          </label>
        <select value={getTeacherRoom(user) ?? room} disabled={user.role === "teacher"} onChange={(event) => setRoom(event.target.value)} className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900">
          {user.role === "admin" ? <option>Todas</option> : null}
          {scopedRooms.map((item) => <option key={item.name}>{item.name}</option>)}
        </select>
        </div>
      </div>
      <label className="block rounded-[1.6rem] bg-white p-4 shadow-sm dark:bg-slate-900">
        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Mensagem de parabéns <span className="font-semibold text-slate-400">· salva automaticamente</span></span>
        <textarea value={birthdayMessage} onChange={(event) => updateBirthdayMessage(event.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-800" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {birthdayStudents.map((student, index) => (
          <motion.div key={student.id} whileHover={{ y: -4 }} className={`rounded-[1.8rem] p-5 shadow-soft ${isBirthdayToday(student.birthday) ? "border-2 border-amber-300 bg-amber-50/80 shadow-amber-200/60 dark:border-amber-400/60 dark:bg-amber-500/10 dark:shadow-amber-950/40" : "glass-panel"}`}>
            <div className="flex items-start justify-between">
              <Avatar initials={student.avatar} photo={student.photo} size="xl" index={index} />
              <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${isBirthdayToday(student.birthday) ? "bg-brand-gold text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"}`}>{isBirthdayToday(student.birthday) ? "É hoje!" : formatBirthdayLabel(student.birthday)}</span>
            </div>
            <h3 className="mt-5 text-xl font-extrabold text-brand-deep dark:text-white">{student.name}</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{calculateAge(student.birthday) || student.age} anos - {student.room}</p>
            <a
              href={`${phoneToWhatsapp(student.phone)}?text=${encodeURIComponent(birthdayMessage.replace("{nome}", student.name))}`}
              target="_blank"
              rel="noreferrer"
              className="mt-5 block w-full rounded-full bg-brand-gold px-4 py-3 text-center text-sm font-extrabold text-white transition hover:-translate-y-0.5"
            >
              Enviar mensagem
            </a>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

function FinanceView({
  categories,
  setCategories,
  entries,
  setEntries,
  readOnly = false
}: {
  categories: Record<FinancialEntry["type"], string[]>;
  setCategories: (updater: (current: Record<FinancialEntry["type"], string[]>) => Record<FinancialEntry["type"], string[]>) => void;
  entries: FinancialEntry[];
  setEntries: (updater: (current: FinancialEntry[]) => FinancialEntry[]) => void;
  readOnly?: boolean;
}) {
  const [categoryType, setCategoryType] = useState<FinancialEntry["type"]>("entrada");
  const [newCategory, setNewCategory] = useState("");
  const [editingCategory, setEditingCategory] = useState("");
  const [editValue, setEditValue] = useState("");
  const [deleteCategory, setDeleteCategory] = useState<{ type: FinancialEntry["type"]; name: string } | null>(null);
  const [editingEntry, setEditingEntry] = useState<FinancialEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<FinancialEntry | null>(null);
  const [financeFeedback, setFinanceFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [entryType, setEntryType] = useState<FinancialEntry["type"]>("entrada");
  const [entryMode, setEntryMode] = useState<"standard" | "installments">("standard");
  const [selectedMonth, setSelectedMonth] = useState<string>(String(getCurrentMonth()));
  const [selectedDay, setSelectedDay] = useState<string>("todos");
  const [selectedYear, setSelectedYear] = useState(getCurrentYear());
  const [entryMonth, setEntryMonth] = useState(getCurrentMonth());
  const availableYears = Array.from(new Set([getCurrentYear(), ...entries.map((entry) => entry.year)])).sort((a, b) => b - a);
  const availableDays = getFinancialFilterDayOptions(entries, selectedMonth, selectedYear);
  const entryDayOptions = getFinancialDayOptions(entryMonth, selectedYear);
  const defaultEntryDay = getDefaultFinancialSunday(entryMonth, selectedYear);
  const filteredEntries = entries.filter((entry) =>
    entry.year === selectedYear &&
    (selectedMonth === "todos" || entry.month === Number(selectedMonth)) &&
    (selectedDay === "todos" || getFinancialEntryDay(entry) === Number(selectedDay))
  );
  const totalEntradas = filteredEntries.filter((entry) => entry.type === "entrada").reduce((sum, entry) => sum + entry.value, 0);
  const totalSaidas = filteredEntries.filter((entry) => entry.type === "saida").reduce((sum, entry) => sum + entry.value, 0);
  const saldo = totalEntradas - totalSaidas;
  const filteredMonthly = monthOptions
    .map((month) => ({
      month: month.label,
      entradas: entries.filter((entry) => entry.year === selectedYear && entry.month === month.value && entry.type === "entrada").reduce((sum, entry) => sum + entry.value, 0),
      saidas: entries.filter((entry) => entry.year === selectedYear && entry.month === month.value && entry.type === "saida").reduce((sum, entry) => sum + entry.value, 0)
    }));

  async function persistCategoryList(type: FinancialEntry["type"], nextList: string[]) {
    const cleanList = Array.from(new Set(nextList.map((item) => item.trim().toLowerCase()).filter(Boolean)));
    if (isNeonProvider) {
      await neonMutate<{ type: FinancialEntry["type"]; items: string[] }>("financialCategory", "replaceList", { type, items: cleanList });
      return { error: null };
    }
    if (!supabase) return { error: null };
    const deleteResult = await supabase.from("financial_categories").delete().eq("type", type);
    if (deleteResult.error) return { error: deleteResult.error };
    if (!cleanList.length) return { error: null };
    return supabase.from("financial_categories").insert(cleanList.map((name) => ({ type, name })));
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    const normalized = newCategory.trim().toLowerCase();
    if (!normalized || categories[categoryType].includes(normalized)) return;
    const nextList = [...categories[categoryType], normalized];
    setCategories((current) => ({ ...current, [categoryType]: nextList }));
    const result = await persistCategoryList(categoryType, nextList);
    if (result.error) {
      setCategories((current) => ({ ...current, [categoryType]: current[categoryType].filter((item) => item !== normalized) }));
      setFinanceFeedback({ kind: "error", message: "Não foi possível criar a categoria no banco." });
      return;
    }
    setNewCategory("");
    setFinanceFeedback({ kind: "success", message: "Categoria salva." });
    window.setTimeout(() => setFinanceFeedback(null), 1800);
  }

  async function saveCategory(type: FinancialEntry["type"], oldName: string) {
    const normalized = editValue.trim().toLowerCase();
    if (!normalized) return;
    const previousList = categories[type];
    const nextList = previousList.map((category) => (category === oldName ? normalized : category));
    setCategories((current) => ({
      ...current,
      [type]: nextList
    }));
    if (supabase) {
      const categoryResult = await persistCategoryList(type, nextList);
      const entryResult = await supabase.from("financial_entries").update({ category: normalized }).eq("type", type).eq("category", oldName);
      if (categoryResult.error || entryResult.error) {
        setCategories((current) => ({ ...current, [type]: previousList }));
        setFinanceFeedback({ kind: "error", message: "Não foi possível editar a categoria no banco." });
        return;
      }
    }
    setEntries((current) => current.map((entry) => entry.type === type && entry.category === oldName ? { ...entry, category: normalized } : entry));
    setEditingCategory("");
    setEditValue("");
    setFinanceFeedback({ kind: "success", message: "Categoria atualizada." });
    window.setTimeout(() => setFinanceFeedback(null), 1800);
  }

  async function deleteFinancialCategory() {
    if (!deleteCategory) return;
    const categoryToDelete = deleteCategory;
    const previousList = categories[categoryToDelete.type];
    const nextList = previousList.filter((item) => item !== categoryToDelete.name);
    setDeleteCategory(null);
    setCategories((current) => ({ ...current, [categoryToDelete.type]: nextList }));
    const result = await persistCategoryList(categoryToDelete.type, nextList);
    if (result.error) {
      setCategories((current) => ({ ...current, [categoryToDelete.type]: previousList }));
      setFinanceFeedback({ kind: "error", message: "Não foi possível excluir a categoria no banco." });
      return;
    }
    setFinanceFeedback({ kind: "success", message: "Categoria excluída do banco." });
    window.setTimeout(() => setFinanceFeedback(null), 1800);
  }

  async function createEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") || "").trim();
    const value = Number(formData.get("value") || 0);
    const category = String(formData.get("category") || categories[entryType][0] || "sem categoria");
    const month = Number(formData.get("month") || new Date().getMonth() + 1);
    const year = Number(formData.get("year") || selectedYear);
    const day = Math.max(1, Math.min(31, Number(formData.get("day") || new Date().getDate())));
    if (!title || value <= 0) return;

    const newEntry: FinancialEntry = {
      id: Date.now(),
      type: entryType,
      title,
      category,
      value,
      month,
      year,
      date: makeFinancialEntryDate(day, month, year)
    };

    setEntries((current) => [newEntry, ...current]);
    const titleInput = event.currentTarget.elements.namedItem("title") as HTMLInputElement | null;
    const valueInput = event.currentTarget.elements.namedItem("value") as HTMLInputElement | null;
    if (titleInput) titleInput.value = "";
    if (valueInput) valueInput.value = "";
    setFinanceFeedback({ kind: "success", message: "Lançamento salvo. Descrição e valor limpos para o próximo." });
    window.setTimeout(() => setFinanceFeedback(null), 1800);
    if (isNeonProvider) {
      const data = await neonMutate<FinancialEntry>("financialEntry", "create", newEntry);
      if (data) setEntries((current) => current.map((entry) => (entry.id === newEntry.id ? data : entry)));
    } else if (supabase) {
      const { data } = await supabase.from("financial_entries").insert(toDbEntry(newEntry)).select("*").single();
      if (data) setEntries((current) => current.map((entry) => (entry.id === newEntry.id ? fromDbEntry(data) : entry)));
    }
  }

  async function createInstallmentEntries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("installmentTitle") || "").trim();
    const totalValue = Number(formData.get("installmentTotal") || 0);
    const category = String(formData.get("installmentCategory") || categories.saida[0] || "sem categoria");
    const month = Number(formData.get("installmentMonth") || entryMonth);
    const day = Math.max(1, Math.min(31, Number(formData.get("installmentDay") || defaultEntryDay)));
    const year = Number(formData.get("installmentYear") || selectedYear);
    const installments = Math.max(2, Math.min(24, Number(formData.get("installments") || 2)));
    const totalCents = Math.round(totalValue * 100);
    if (!title || totalCents <= 0) return;

    const baseCents = Math.floor(totalCents / installments);
    const remainderCents = totalCents % installments;
    const createdEntries: FinancialEntry[] = Array.from({ length: installments }, (_, index) => {
      const dueDate = new Date(year, month - 1 + (day > 5 ? 1 : 0) + index, 5);
      const dueMonth = dueDate.getMonth() + 1;
      const dueYear = dueDate.getFullYear();
      return {
        id: Date.now() + index,
        type: "saida",
        title: `${title} (${index + 1}/${installments})`,
        category,
        value: (baseCents + (index < remainderCents ? 1 : 0)) / 100,
        month: dueMonth,
        year: dueYear,
        date: makeFinancialEntryDate(5, dueMonth, dueYear)
      };
    });
    const pendingEntryIds = new Set(createdEntries.map((entry) => entry.id));

    setEntries((current) => [...createdEntries, ...current]);
    const titleInput = event.currentTarget.elements.namedItem("installmentTitle") as HTMLInputElement | null;
    const totalInput = event.currentTarget.elements.namedItem("installmentTotal") as HTMLInputElement | null;
    const installmentsInput = event.currentTarget.elements.namedItem("installments") as HTMLSelectElement | null;
    if (titleInput) titleInput.value = "";
    if (totalInput) totalInput.value = "";
    if (installmentsInput) installmentsInput.value = "2";

    try {
      if (isNeonProvider) {
        const data = await neonMutate<FinancialEntry[]>("financialEntryBatch", "create", { entries: createdEntries });
        setEntries((current) => [...current.filter((entry) => !pendingEntryIds.has(entry.id)), ...data].sort((a, b) => b.id - a.id));
      } else if (supabase) {
        const { data, error } = await supabase.from("financial_entries").insert(createdEntries.map(toDbEntry)).select("*");
        if (error) throw error;
        setEntries((current) => [...current.filter((entry) => !pendingEntryIds.has(entry.id)), ...(data ?? []).map(fromDbEntry)].sort((a, b) => b.id - a.id));
      }
      setFinanceFeedback({ kind: "success", message: `${installments} parcelas criadas com vencimento no dia 05.` });
      window.setTimeout(() => setFinanceFeedback(null), 2200);
    } catch {
      setEntries((current) => current.filter((entry) => !pendingEntryIds.has(entry.id)));
      setFinanceFeedback({ kind: "error", message: "Não foi possível salvar as parcelas no banco." });
    }
  }

  async function saveEntryEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingEntry) return;
    const formData = new FormData(event.currentTarget);
    const type = String(formData.get("type") || editingEntry.type) as FinancialEntry["type"];
    const month = Number(formData.get("month") || editingEntry.month);
    const day = Math.max(1, Math.min(31, Number(formData.get("day") || getFinancialEntryDay(editingEntry) || new Date().getDate())));
    const payload: FinancialEntry = {
      ...editingEntry,
      type,
      title: String(formData.get("title") || "").trim(),
      category: String(formData.get("category") || categories[type][0] || "sem categoria"),
      value: Number(formData.get("value") || 0),
      month,
      year: Number(formData.get("year") || selectedYear),
      date: makeFinancialEntryDate(day, month, Number(formData.get("year") || selectedYear))
    };
    if (!payload.title || payload.value <= 0) return;
    const previousEntry = editingEntry;
    setEntries((current) => current.map((entry) => entry.id === payload.id ? payload : entry));
    setEditingEntry(null);
    try {
      if (isNeonProvider) {
        const data = await neonMutate<FinancialEntry>("financialEntry", "update", payload, payload.id);
        if (data) setEntries((current) => current.map((entry) => entry.id === payload.id ? data : entry));
      } else if (supabase) {
        const { error } = await supabase.from("financial_entries").update(toDbEntry(payload)).eq("id", payload.id);
        if (error) throw error;
      }
      setFinanceFeedback({ kind: "success", message: "Lançamento atualizado." });
      window.setTimeout(() => setFinanceFeedback(null), 1800);
    } catch {
      setEntries((current) => current.map((entry) => entry.id === previousEntry.id ? previousEntry : entry));
      setFinanceFeedback({ kind: "error", message: "Não foi possível editar o lançamento no banco." });
    }
  }

  async function deleteFinancialEntry() {
    if (!deleteEntry) return;
    const entryToDelete = deleteEntry;
    setDeleteEntry(null);
    setEntries((current) => current.filter((entry) => entry.id !== entryToDelete.id));
    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("financialEntry", "delete", undefined, entryToDelete.id);
    } else if (supabase) {
      const { data, error } = await supabase.from("financial_entries").delete().eq("id", entryToDelete.id).select("id");
      if (error || !data?.length) {
        setEntries((current) => current.some((entry) => entry.id === entryToDelete.id) ? current : [entryToDelete, ...current].sort((a, b) => b.id - a.id));
        setFinanceFeedback({ kind: "error", message: "Não foi possível excluir o lançamento no banco." });
        return;
      }
    }
    setFinanceFeedback({ kind: "success", message: "Lançamento excluído do banco." });
    window.setTimeout(() => setFinanceFeedback(null), 1800);
  }


  return (
    <Section>
      {financeFeedback ? (
        <p className={`rounded-2xl px-4 py-3 text-sm font-extrabold ${financeFeedback.kind === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"}`}>
          {financeFeedback.message}
        </p>
      ) : null}

      <div className="glass-panel flex flex-col gap-3 rounded-[1.8rem] p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-brand-deep dark:text-white">Filtros financeiros</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <select value={selectedMonth} onChange={(event) => { setSelectedMonth(event.target.value); setSelectedDay("todos"); }} className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
            <option value="todos">Todos os meses</option>
            {monthOptions.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
          </select>
          <select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
            <option value="todos">Todos os dias</option>
            {availableDays.map((day) => <option key={day} value={day}>Dia {String(day).padStart(2, "0")}</option>)}
          </select>
          <select value={selectedYear} onChange={(event) => { setSelectedYear(Number(event.target.value)); setSelectedDay("todos"); }} className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
            {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Total entradas" value={`R$ ${formatCurrencyBRL(totalEntradas)}`} icon={<DollarSign className="h-5 w-5 text-white" />} tone="bg-brand-green" chart={<TinyArea color="#22C55E" />} />
        <MetricCard title="Total saídas" value={`R$ ${formatCurrencyBRL(totalSaidas)}`} icon={<Download className="h-5 w-5 text-white" />} tone="bg-brand-red" chart={<TinyArea color="#EF4444" />} />
        <MetricCard title="Saldo final" value={`R$ ${formatCurrencyBRL(saldo)}`} icon={<FileSpreadsheet className="h-5 w-5 text-white" />} tone="bg-brand-deep" chart={<TinyArea color="#3B82F6" />} />
      </div>

      {!readOnly ? (
      <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-brand-deep dark:text-white">Novo lançamento</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => { setEntryMode("standard"); setEntryType("entrada"); }} className={`rounded-full px-5 py-3 text-sm font-extrabold transition ${entryMode === "standard" && entryType === "entrada" ? "bg-brand-green text-white shadow-sm" : "bg-white text-slate-600 hover:text-brand-green dark:bg-slate-900 dark:text-slate-300"}`}>
              Inserir entrada
            </button>
            <button type="button" onClick={() => { setEntryMode("standard"); setEntryType("saida"); }} className={`rounded-full px-5 py-3 text-sm font-extrabold transition ${entryMode === "standard" && entryType === "saida" ? "bg-brand-red text-white shadow-sm" : "bg-white text-slate-600 hover:text-brand-red dark:bg-slate-900 dark:text-slate-300"}`}>
              Inserir saída
            </button>
            <button type="button" onClick={() => { setEntryMode("installments"); setEntryType("saida"); }} className={`rounded-full px-5 py-3 text-sm font-extrabold transition ${entryMode === "installments" ? "bg-amber-400 text-amber-950 shadow-sm" : "bg-white text-slate-600 hover:text-amber-600 dark:bg-slate-900 dark:text-slate-300"}`}>
              Saídas parceladas
            </button>
          </div>
        </div>
        {entryMode === "standard" ? (
          <form onSubmit={createEntry} className="mt-5 grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.55fr_0.55fr_0.55fr_0.65fr_auto]">
            <input name="title" required className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder={entryType === "entrada" ? "Descrição da entrada" : "Descrição da saída"} />
            <select name="category" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
              {categories[entryType].length ? categories[entryType].map((category) => <option key={category} value={category}>{category}</option>) : <option value="sem categoria">sem categoria</option>}
            </select>
            <input name="value" required min="0.01" step="0.01" type="number" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Valor" />
            <select name="month" value={entryMonth} onChange={(event) => setEntryMonth(Number(event.target.value))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
              {monthOptions.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
            </select>
            <select name="day" defaultValue={defaultEntryDay} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
              {entryDayOptions.map((day) => <option key={day} value={day}>Dia {String(day).padStart(2, "0")}</option>)}
            </select>
            <select name="year" defaultValue={selectedYear} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <button type="submit" className={`rounded-full px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5 ${entryType === "entrada" ? "bg-brand-green" : "bg-brand-red"}`}>
              Salvar
            </button>
          </form>
        ) : (
          <form onSubmit={createInstallmentEntries} className="mt-5 grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.55fr_0.55fr_0.55fr_0.65fr_auto]">
            <input name="installmentTitle" required className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Descrição da saída" />
            <select name="installmentCategory" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
              {categories.saida.length ? categories.saida.map((category) => <option key={category} value={category}>{category}</option>) : <option value="sem categoria">sem categoria</option>}
            </select>
            <input name="installmentTotal" required min="0.01" step="0.01" type="number" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Valor total" />
            <select name="installmentMonth" value={entryMonth} onChange={(event) => setEntryMonth(Number(event.target.value))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
              {monthOptions.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
            </select>
            <select name="installmentDay" defaultValue={defaultEntryDay} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
              {entryDayOptions.map((day) => <option key={day} value={day}>Dia {String(day).padStart(2, "0")}</option>)}
            </select>
            <select name="installmentYear" defaultValue={selectedYear} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <button type="submit" className="rounded-full bg-amber-400 px-5 py-3 text-sm font-extrabold text-amber-950 transition hover:-translate-y-0.5">
              Parcelar
            </button>
            <select name="installments" defaultValue="2" aria-label="Quantidade de parcelas" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
              {Array.from({ length: 23 }, (_, index) => index + 2).map((installment) => <option key={installment} value={installment}>{installment} parcelas</option>)}
            </select>
            <p className="lg:col-span-6 text-sm font-semibold text-slate-500 dark:text-slate-400">O valor total será dividido automaticamente. Até o dia 05, a primeira parcela vence no mesmo mês; após o dia 05, ela vence no mês seguinte.</p>
          </form>
        )}
      </div>

      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-brand-deep dark:text-white">Dashboard financeiro</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Entradas e saídas acompanhadas mês a mês.</p>
            </div>
            <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
              {availableYears.map((year) => <option key={year} value={year}>Ano {year}</option>)}
            </select>
          </div>
          <div className="chart-mobile-scroll mt-5 h-80">
            <ClientOnlyChart>
              <div className="chart-mobile-canvas">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredMonthly} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.28)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 16, border: "1px solid #E5E7EB" }} />
                  <Bar dataKey="entradas" fill="#22C55E" radius={[10, 10, 0, 0]} />
                  <Bar dataKey="saidas" fill="#EF4444" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </ClientOnlyChart>
          </div>
        </div>

        {!readOnly ? (
        <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
          <h2 className="text-xl font-extrabold text-brand-deep dark:text-white">Categorias</h2>
          <div className="mt-4 grid grid-cols-2 rounded-full bg-white p-1 shadow-sm dark:bg-slate-900">
            {[
              ["entrada", "Entradas"],
              ["saida", "Saídas"]
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategoryType(value as FinancialEntry["type"])}
                className={`rounded-full px-4 py-2 text-sm font-extrabold transition ${categoryType === value ? "bg-brand-deep text-white" : "text-slate-500 hover:text-brand-deep dark:hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={createCategory} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder={categoryType === "entrada" ? "Nova categoria de entrada" : "Nova categoria de saída"} />
            <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5 active:scale-95">
              <Plus className="h-4 w-4" />
              Criar
            </button>
          </form>
          <div className="mt-4 space-y-2">
            {categories[categoryType].map((category) => (
              <div key={category} className="flex items-center gap-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
                {editingCategory === category ? (
                  <input value={editValue} onChange={(event) => setEditValue(event.target.value)} className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-800" />
                ) : (
                  <span className="flex-1 text-sm font-extrabold capitalize">{category}</span>
                )}
                {editingCategory === category ? (
                  <IconButton label={`Salvar ${category}`} onClick={() => saveCategory(categoryType, category)}>
                    <Check className="h-4 w-4" />
                  </IconButton>
                ) : (
                  <IconButton label={`Editar ${category}`} onClick={() => {
                    setEditingCategory(category);
                    setEditValue(category);
                  }}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                )}
                <IconButton label={`Excluir ${category}`} onClick={() => setDeleteCategory({ type: categoryType, name: category })}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            ))}
          </div>
        </div>        ) : null}
      </div>

      <div className="glass-panel rounded-[1.8rem] p-4 shadow-soft">
        <h2 className="px-2 pb-3 text-xl font-extrabold text-brand-deep dark:text-white">Histórico financeiro</h2>
        <div className="space-y-2">
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900 sm:flex-row sm:items-center">
              <span className={`grid h-10 w-10 place-items-center rounded-full ${entry.type === "entrada" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200"}`}>
                {entry.type === "entrada" ? <Plus className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">{entry.title}</p>
                <p className="text-sm capitalize text-slate-500 dark:text-slate-400">{entry.category} • {formatFinancialEntryDate(entry)}</p>
              </div>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <p className={`text-lg font-extrabold ${entry.type === "entrada" ? "text-brand-green" : "text-brand-red"}`}>{entry.type === "entrada" ? "+" : "-"} R$ {formatCurrencyBRL(entry.value)}</p>
                {!readOnly ? (
                <IconButton label={`Editar lançamento ${entry.title}`} onClick={() => setEditingEntry(entry)}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
                ) : null}
                {!readOnly ? (
                <IconButton label={`Excluir lançamento ${entry.title}`} onClick={() => setDeleteEntry(entry)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {deleteCategory ? (
          <ConfirmModal
            message={`Deseja realmente excluir a categoria ${deleteCategory.name}?`}
            onCancel={() => setDeleteCategory(null)}
            onConfirm={deleteFinancialCategory}
          />
        ) : null}
        {deleteEntry ? (
          <ConfirmModal
            message={`Deseja realmente excluir o lançamento ${deleteEntry.title}?`}
            onCancel={() => setDeleteEntry(null)}
            onConfirm={deleteFinancialEntry}
          />
        ) : null}
        {editingEntry ? (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form onSubmit={saveEntryEdit} className="w-full max-w-xl rounded-[1.8rem] bg-white p-6 shadow-2xl dark:bg-slate-950" initial={false} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 16 }}>
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-extrabold text-brand-deep dark:text-white">Editar lançamento</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Atualize tipo, descrição, categoria, valor, dia, mês e ano.</p>
                </div>
                <IconButton label="Fechar edição" onClick={() => setEditingEntry(null)}><X className="h-4 w-4" /></IconButton>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Tipo</span>
                  <select name="type" value={editingEntry.type} onChange={(event) => setEditingEntry((current) => current ? { ...current, type: event.target.value as FinancialEntry["type"], category: categories[event.target.value as FinancialEntry["type"]][0] || "sem categoria" } : current)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">
                    <option value="entrada">entrada</option>
                    <option value="saida">saída</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Categoria</span>
                  <select name="category" value={editingEntry.category} onChange={(event) => setEditingEntry((current) => current ? { ...current, category: event.target.value } : current)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">
                    {categories[editingEntry.type].length ? categories[editingEntry.type].map((category) => <option key={category} value={category}>{category}</option>) : <option value="sem categoria">sem categoria</option>}
                  </select>
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Descrição</span>
                  <input name="title" defaultValue={editingEntry.title} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Valor</span>
                  <input name="value" defaultValue={editingEntry.value} min="0.01" step="0.01" type="number" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Mês</span>
                  <select name="month" value={editingEntry.month} onChange={(event) => setEditingEntry((current) => current ? { ...current, month: Number(event.target.value) } : current)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">
                    {monthOptions.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Dia</span>
                  <select name="day" value={getFinancialEntryDay(editingEntry)} onChange={(event) => setEditingEntry((current) => current ? { ...current, date: makeFinancialEntryDate(Number(event.target.value), current.month, current.year) } : current)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">
                    {Array.from(new Set([getFinancialEntryDay(editingEntry), ...getFinancialDayOptions(editingEntry.month, editingEntry.year)])).filter((day) => day > 0).sort((a, b) => a - b).map((day) => <option key={day} value={day}>Dia {String(day).padStart(2, "0")}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Ano</span>
                  <select name="year" value={editingEntry.year} onChange={(event) => setEditingEntry((current) => current ? { ...current, year: Number(event.target.value) } : current)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">
                    {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingEntry(null)} className="rounded-full px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900">Cancelar</button>
                <button className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5">Salvar lançamento</button>
              </div>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Section>
  );
}

function ReportsView({ studentsSource, roomsSource }: { studentsSource: Student[]; roomsSource: Room[] }) {
  const [reportRoom, setReportRoom] = useState("Todos");
  const [reportPeriod, setReportPeriod] = useState("Ultimos 30 dias");
  const [reportStudent, setReportStudent] = useState("Todos");
  const filteredReportStudents = studentsSource.filter((student) => {
    const roomMatches = reportRoom === "Todos" || sameRoomName(student.room, reportRoom);
    const studentMatches = reportStudent === "Todos" || student.name === reportStudent;
    return roomMatches && studentMatches;
  });
  const reportLines = [
    `Relatório EBR`,
    `Sala: ${reportRoom}`,
    `Periodo: ${reportPeriod}`,
    `Aluno: ${reportStudent}`,
    "",
    ...filteredReportStudents.map((student) => `${student.ra} - ${student.name} - ${student.room} - ${student.frequency} presenças`)
  ];

  function downloadReport(format: "pdf" | "excel") {
    if (format === "pdf") {
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;
      printWindow.document.write(`
        <html>
          <head><title>Relatório EBR</title></head>
          <body style="font-family: Arial, sans-serif; padding: 32px;">
            <h1>Relatório EBR</h1>
            <p><strong>Sala:</strong> ${reportRoom}</p>
            <p><strong>Periodo:</strong> ${reportPeriod}</p>
            <p><strong>Aluno:</strong> ${reportStudent}</p>
            <hr />
            <ul>
              ${filteredReportStudents.map((student) => `<li>${student.ra} - ${student.name} - ${student.room} - ${student.frequency} presenças</li>`).join("")}
            </ul>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      return;
    }

    const rows = filteredReportStudents
      .map((student) => `
        <tr>
          <td>${escapeHtml(student.ra)}</td>
          <td>${escapeHtml(student.name)}</td>
          <td>${escapeHtml(student.room)}</td>
          <td>${student.frequency}</td>
          <td>${escapeHtml(student.status)}</td>
          <td>${student.age}</td>
          <td>${escapeHtml(student.phone)}</td>
        </tr>
      `)
      .join("");
    const content = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <table>
            <thead>
              <tr>
                <th>RA</th>
                <th>Aluno</th>
                <th>Sala</th>
                <th>Presenças</th>
                <th>Status</th>
                <th>Idade</th>
                <th>Telefone</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([content], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-ebr.xls";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Section>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
          <h2 className="text-2xl font-extrabold text-brand-deep dark:text-white">Relatórios</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Sala</span>
              <select value={reportRoom} onChange={(event) => setReportRoom(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">
                <option>Todos</option>
                {roomsSource.map((room) => <option key={room.name}>{room.name}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Periodo</span>
              <select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">
                <option>Ultimos 30 dias</option>
                <option>Trimestre atual</option>
                <option>Ano atual</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Aluno</span>
              <select value={reportStudent} onChange={(event) => setReportStudent(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">
                <option>Todos</option>
                {studentsSource.map((student) => <option key={student.id}>{student.name}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <button onClick={() => downloadReport("pdf")} className="flex items-center justify-between rounded-[1.4rem] border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-blue hover:shadow-soft dark:border-slate-700 dark:bg-slate-900">
              <span>
                <span className="block font-extrabold text-brand-deep dark:text-white">Exportar PDF</span>
              </span>
              <FileText className="h-6 w-6 text-brand-blue" />
            </button>
            <button onClick={() => downloadReport("excel")} className="flex items-center justify-between rounded-[1.4rem] border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-green hover:shadow-soft dark:border-slate-700 dark:bg-slate-900">
              <span>
                <span className="block font-extrabold text-brand-deep dark:text-white">Exportar Excel</span>
              </span>
              <FileSpreadsheet className="h-6 w-6 text-brand-green" />
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
          <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">Prévia do relatorio</h3>
          <div className="mt-5 rounded-[1.4rem] bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
            <p className="font-extrabold text-brand-deep dark:text-white">{filteredReportStudents.length} registros</p>
            <div className="mt-3 space-y-2">
              {filteredReportStudents.slice(0, 5).map((student, index) => (
                <div key={student.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
                  <Avatar initials={student.avatar} photo={student.photo} size="sm" index={index} />
                  <p className="min-w-0 flex-1 truncate">{student.ra} - {student.name} - {student.room}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}



function StatCard({ title, value, icon, tone }: { title: string; value: number | string; icon: ReactNode; tone: string }) {
  return (
    <div className="glass-panel rounded-[1.35rem] p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">{title}</p>
          <p className="mt-1 text-2xl font-extrabold text-brand-deep dark:text-white">{value}</p>
        </div>
        <div className={"grid h-11 w-11 place-items-center rounded-2xl " + tone}>{icon}</div>
      </div>
    </div>
  );
}
const portalTypeLabels: Record<PortalContentType, string> = {
  video: "Aula em vídeo",
  message: "Mensagem do professor",
  lesson: "Lição do dia",
  notice: "Aviso"
};

function fromDbPortalContent(row: any): PortalContent {
  return {
    id: Number(row.id),
    type: row.type,
    title: row.title ?? "",
    body: row.body ?? "",
    mediaUrl: row.mediaUrl ?? row.media_url ?? "",
    room: row.room ?? "Geral",
    authorName: row.authorName ?? row.author_name ?? "",
    active: Boolean(row.active ?? true),
    publishedAt: row.publishedAt ?? row.published_at ?? ""
  };
}

function toDbPortalContent(content: PortalContent) {
  return {
    type: content.type,
    title: content.title,
    body: content.body,
    media_url: content.mediaUrl,
    room: content.room || "Geral",
    author_name: content.authorName,
    active: content.active,
    published_at: content.publishedAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function fromDbLibraryItem(row: any): LibraryItem {
  return {
    id: Number(row.id),
    title: row.title ?? "",
    description: row.description ?? "",
    price: Number(row.price ?? 0),
    imageUrl: row.imageUrl || row.image_url || row.image || row.cover || row.photo || "",
    paymentUrl: row.paymentUrl ?? row.payment_url ?? "",
    stockQuantity: Number(row.stockQuantity ?? row.stock_quantity ?? 0),
    active: Boolean(row.active)
  };
}

function toDbLibraryItem(item: LibraryItem) {
  return {
    title: item.title,
    description: item.description,
    price: item.price,
    image_url: item.imageUrl,
    payment_url: item.paymentUrl,
    stock_quantity: Math.max(0, Number(item.stockQuantity ?? 0)),
    active: item.active,
    updated_at: new Date().toISOString()
  };
}

function fromDbMinistryItem(row: any): MinistryItem {
  return {
    id: Number(row.id),
    title: row.title ?? "",
    description: row.description ?? "",
    price: Number(row.price ?? 0),
    paymentKey: row.paymentKey ?? row.payment_key ?? "",
    imageUrl: row.imageUrl || row.image_url || row.image || row.cover || row.photo || "",
    active: Boolean(row.active ?? true),
    createdAt: row.createdAt ?? row.created_at ?? ""
  };
}

function toDbMinistryItem(item: MinistryItem) {
  return {
    title: item.title,
    description: item.description,
    price: item.price,
    payment_key: item.paymentKey,
    image_url: item.imageUrl,
    active: item.active,
    updated_at: new Date().toISOString()
  };
}

function fromDbTeacherSchedule(row: any): TeacherSchedule {
  return {
    id: Number(row.id),
    scheduleDate: normalizeStoredDate(row.schedule_date),
    teacherId: row.teacher_id ? Number(row.teacher_id) : undefined,
    teacherName: row.teacher_name ?? "",
    position: row.position ?? "",
    location: row.location ?? "",
    notes: row.notes ?? "",
    active: Boolean(row.active)
  };
}

function toDbTeacherSchedule(item: TeacherSchedule) {
  return {
    schedule_date: normalizeStoredDate(item.scheduleDate),
    teacher_id: item.teacherId ?? null,
    teacher_name: item.teacherName,
    position: item.position,
    location: item.location,
    notes: item.notes,
    active: item.active,
    updated_at: new Date().toISOString()
  };
}

function fromDbInteraction(row: any): StudentInteraction {
  return {
    id: Number(row.id),
    studentId: row.student_id ? Number(row.student_id) : undefined,
    studentName: row.student_name ?? "",
    room: row.room ?? "",
    message: row.message ?? "",
    status: row.status ?? "novo",
    response: row.response ?? "",
    createdAt: row.createdAt ?? row.created_at ?? ""
  };
}

function StudentPortalAdminView({ user, roomsSource, settings, setSettings }: { user: AppUser; roomsSource: Room[]; settings: Record<string, string>; setSettings: (updater: (current: Record<string, string>) => Record<string, string>) => void }) {
  const teacherRoom = getTeacherRoom(user) ?? roomsSource[0]?.name ?? "Geral";
  const availableRooms = user.role === "teacher" ? [teacherRoom] : ["Geral", ...roomsSource.filter((room) => !isTeachersRoom(room)).map((room) => room.name)];
  const [contents, setContents] = useState<PortalContent[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [ministryItems, setMinistryItems] = useState<MinistryItem[]>([]);
  const [questions, setQuestions] = useState<StudentInteraction[]>([]);
  const [prayers, setPrayers] = useState<StudentInteraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [editingContentId, setEditingContentId] = useState<number | null>(null);
  const [editingLibraryId, setEditingLibraryId] = useState<number | null>(null);
  const [editingMinistryId, setEditingMinistryId] = useState<number | null>(null);
  const [ministryModalOpen, setMinistryModalOpen] = useState(false);
  const defaultContentType: PortalContentType = user.role === "teacher" ? "lesson" : "video";
  const contentTypeOptions = Object.entries(portalTypeLabels).filter(([value]) => user.role === "admin" || value === "message" || value === "lesson");
  const [contentForm, setContentForm] = useState<PortalContent>({ type: defaultContentType, title: "", body: "", mediaUrl: "", room: availableRooms[0] ?? "Geral", authorName: user.name, active: true, publishedAt: new Date().toISOString() });
  type TeacherContentDraft = { title: string; body: string; mediaUrl: string; publishedAt: string };
  const emptyTeacherDraft = (): TeacherContentDraft => ({ title: "", body: "", mediaUrl: "", publishedAt: new Date().toISOString() });
  const [lessonDraft, setLessonDraft] = useState<TeacherContentDraft>(emptyTeacherDraft);
  const [messageDraft, setMessageDraft] = useState<TeacherContentDraft>(emptyTeacherDraft);
  const [libraryForm, setLibraryForm] = useState<LibraryItem>({ title: "", description: "", price: 0, imageUrl: "", paymentUrl: "", stockQuantity: 0, active: true });
  const [ministryForm, setMinistryForm] = useState<MinistryItem>({ title: "", description: "", price: 0, paymentKey: "", imageUrl: "", active: true });
  const [ministryUrl, setMinistryUrl] = useState(settings.ministryPaymentUrl ?? "");
  const [ministryText, setMinistryText] = useState(settings.ministryPaymentText ?? "Ajude o ministério EBR a continuar alcançando alunos.");
  const [libraryPaymentUrl, setLibraryPaymentUrl] = useState(settings.libraryPaymentUrl ?? "");
  const [ministryWhatsapp, setMinistryWhatsapp] = useState(settings.ministryWhatsapp ?? "");
  const [libraryWhatsapp, setLibraryWhatsapp] = useState(settings.libraryWhatsapp ?? "");
  const [ministryListText, setMinistryListText] = useState(settings.ministryListText ?? "Escolha um item da lista e informe como deseja contribuir.");
  const [ministryListValidUntil, setMinistryListValidUntil] = useState(settings.ministryListValidUntil ?? getTodayInputDate());

  async function loadPortalData(showLoading = true) {
    if (showLoading) setLoading(true);
    if (isNeonProvider) {
      const params = new URLSearchParams({ audience: "admin", role: user.role, room: teacherRoom });
      const data = await fetchNeonJson<{ contents: PortalContent[]; libraryItems: LibraryItem[]; ministryItems: MinistryItem[]; questions: StudentInteraction[]; prayers: StudentInteraction[] }>("/api/neon/portal?" + params.toString());
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const recentInteraction = (item: StudentInteraction) => !item.createdAt || new Date(item.createdAt).getTime() >= threeDaysAgo;
      const interactionFilter = (item: { room: string }) => user.role === "admin" || sameRoomName(item.room, teacherRoom);
      const contentFilter = (item: PortalContent) => user.role === "admin" || (sameRoomName(item.room, teacherRoom) && (item.type === "lesson" || item.type === "message"));
      setContents((data.contents ?? []).filter(contentFilter));
      setLibraryItems(user.role === "admin" ? data.libraryItems ?? [] : []);
      setMinistryItems(user.role === "admin" ? data.ministryItems ?? [] : []);
      setQuestions((data.questions ?? []).filter(recentInteraction).filter(interactionFilter));
      setPrayers((data.prayers ?? []).filter(recentInteraction).filter(interactionFilter));
      if (showLoading) setLoading(false);
      return;
    }
    if (!supabase) {
      if (showLoading) setLoading(false);
      return;
    }
    const roomFilter = user.role === "admin" ? null : teacherRoom;
    const contentQuery = supabase.from("student_portal_contents").select("*").order("published_at", { ascending: false });
    const questionQuery = supabase.from("student_questions").select("*").order("created_at", { ascending: false }).limit(120);
    const prayerQuery = supabase.from("student_prayer_requests").select("*").order("created_at", { ascending: false }).limit(120);
    const [contentResult, libraryResult, ministryResult, questionResult, prayerResult] = await Promise.all([
      roomFilter ? contentQuery.in("room", ["Geral", roomFilter]) : contentQuery,
      user.role === "admin" ? supabase.from("student_library_items").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      user.role === "admin" ? supabase.from("student_ministry_items").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      roomFilter ? questionQuery.eq("room", roomFilter) : questionQuery,
      roomFilter ? prayerQuery.eq("room", roomFilter) : prayerQuery
    ]);
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const recentInteraction = (item: StudentInteraction) => !item.createdAt || new Date(item.createdAt).getTime() >= threeDaysAgo;
    const interactionFilter = (item: { room: string }) => user.role === "admin" || sameRoomName(item.room, teacherRoom);
    const contentFilter = (item: PortalContent) => user.role === "admin" || (sameRoomName(item.room, teacherRoom) && (item.type === "lesson" || item.type === "message"));
    setContents((contentResult.data ?? []).map(fromDbPortalContent).filter(contentFilter));
    setLibraryItems(user.role === "admin" ? (libraryResult.data ?? []).map(fromDbLibraryItem) : []);
    setMinistryItems(user.role === "admin" ? (ministryResult.data ?? []).map(fromDbMinistryItem) : []);
    setQuestions((questionResult.data ?? []).map(fromDbInteraction).filter(recentInteraction).filter(interactionFilter));
    setPrayers((prayerResult.data ?? []).map(fromDbInteraction).filter(recentInteraction).filter(interactionFilter));
    if (showLoading) setLoading(false);
  }

  useEffect(() => {
    void loadPortalData();
    if (isNeonProvider || !supabase) return;
    const db = supabase;
    let syncTimer: number | null = null;
    function schedulePortalSync() {
      if (syncTimer) window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => void loadPortalData(false), 900);
    }
    const channel = db
      .channel("ebr-portal-admin-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "student_portal_contents" }, schedulePortalSync)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_questions" }, schedulePortalSync)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_prayer_requests" }, schedulePortalSync)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_library_items" }, schedulePortalSync)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_ministry_items" }, schedulePortalSync)
      .subscribe();
    return () => {
      if (syncTimer) window.clearTimeout(syncTimer);
      void db.removeChannel(channel);
    };
  }, [user.role, teacherRoom]);

  function contentDateValue(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? getTodayInputDate() : toInputDate(date);
  }

  function isoFromInputDate(value: string) {
    return value ? new Date(`${value}T12:00:00`).toISOString() : new Date().toISOString();
  }

  function resetContentForm() {
    setEditingContentId(null);
    setContentForm({ type: defaultContentType, title: "", body: "", mediaUrl: "", room: availableRooms[0] ?? "Geral", authorName: user.name, active: true, publishedAt: new Date().toISOString() });
  }

  function resetLibraryForm() {
    setEditingLibraryId(null);
    setLibraryForm({ title: "", description: "", price: 0, imageUrl: "", paymentUrl: "", stockQuantity: 0, active: true });
  }

  function resetMinistryForm() {
    setEditingMinistryId(null);
    setMinistryModalOpen(false);
    setMinistryForm({ title: "", description: "", price: 0, paymentKey: "", imageUrl: "", active: true });
  }

  async function saveContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contentForm.title.trim()) return;
    const safeType: PortalContentType = user.role === "teacher" && contentForm.type === "video" ? "lesson" : contentForm.type;
    const payload = { ...contentForm, type: safeType, title: contentForm.title.trim(), authorName: user.name, room: user.role === "teacher" ? teacherRoom : contentForm.room, publishedAt: contentForm.publishedAt || new Date().toISOString() };
    setFeedback("Salvando conteúdo...");
    let delivery: { saved: number; sent: number } | undefined;
    if (isNeonProvider) {
      const saved = editingContentId
        ? await neonMutate<PortalContentDelivery>("portalContent", "update", payload, editingContentId)
        : await neonMutate<PortalContentDelivery>("portalContent", "create", payload);
      delivery = saved.pushDelivery;
      await loadPortalData();
    } else if (supabase) {
      if (editingContentId) await supabase.from("student_portal_contents").update(toDbPortalContent(payload)).eq("id", editingContentId);
      else await supabase.from("student_portal_contents").insert(toDbPortalContent(payload));
      await loadPortalData();
    } else {
      setContents((current) => editingContentId ? current.map((item) => item.id === editingContentId ? { ...payload, id: editingContentId } : item) : [{ ...payload, id: Date.now() }, ...current]);
    }
    resetContentForm();
    setFeedback(delivery ? `Conteúdo salvo. ${delivery.saved} notificação(ões) interna(s) e ${delivery.sent} push enviado(s).` : "Conteúdo salvo no portal do aluno.");
  }

  function readPortalPdf(file: File | undefined, onRead: (value: string) => void) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onRead(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function readPortalImage(file: File | undefined, onRead: (value: string) => void) {
    if (!file) return;
    setFeedback("Preparando foto...");
    const image = await compressImageFile(file, 1080, 0.8);
    if (!image) {
      setFeedback("Não foi possível carregar esta foto.");
      return;
    }
    onRead(image);
    setFeedback("Foto anexada. Publique para enviar ao aluno.");
  }

  async function saveTeacherContent(type: "lesson" | "message", draft: TeacherContentDraft, resetDraft: () => void) {
    if (!draft.title.trim() && !draft.body.trim() && !draft.mediaUrl.trim()) return;
    const payload: PortalContent = {
      type,
      title: draft.title.trim() || (type === "lesson" ? "Lição do dia" : "Mensagem do professor"),
      body: draft.body.trim(),
      mediaUrl: draft.mediaUrl.trim(),
      room: teacherRoom,
      authorName: user.name,
      active: true,
      publishedAt: draft.publishedAt || new Date().toISOString()
    };
    setFeedback("Publicando no portal do aluno...");
    let delivery: { saved: number; sent: number } | undefined;
    if (isNeonProvider) {
      const saved = await neonMutate<PortalContentDelivery>("portalContent", "create", payload);
      delivery = saved.pushDelivery;
      await loadPortalData();
    } else if (supabase) {
      await supabase.from("student_portal_contents").insert(toDbPortalContent(payload));
      await loadPortalData();
    } else {
      setContents((current) => [{ ...payload, id: Date.now() }, ...current]);
    }
    resetDraft();
    setFeedback(delivery ? `${type === "lesson" ? "Lição" : "Mensagem"} publicada. ${delivery.saved} notificação(ões) interna(s) e ${delivery.sent} push enviado(s).` : type === "lesson" ? "Lição publicada no portal do aluno." : "Mensagem publicada no portal do aluno.");
  }

  async function deleteContent(id?: number) {
    if (!id) return;
    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("portalContent", "delete", undefined, id);
      await loadPortalData();
    } else if (supabase) {
      await supabase.from("student_portal_contents").delete().eq("id", id);
      await loadPortalData();
    } else setContents((current) => current.filter((item) => item.id !== id));
  }

  async function saveLibrary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!libraryForm.title.trim()) return;
    const payload = { ...libraryForm, title: libraryForm.title.trim(), price: Number(libraryForm.price || 0), stockQuantity: Math.max(0, Number(libraryForm.stockQuantity || 0)), paymentUrl: "" };
    setFeedback("Salvando item da livraria...");
    if (isNeonProvider) {
      if (editingLibraryId) await neonMutate<LibraryItem>("libraryItem", "update", payload, editingLibraryId);
      else await neonMutate<LibraryItem>("libraryItem", "create", payload);
      await loadPortalData();
    } else if (supabase) {
      if (editingLibraryId) await supabase.from("student_library_items").update(toDbLibraryItem(payload)).eq("id", editingLibraryId);
      else await supabase.from("student_library_items").insert(toDbLibraryItem(payload));
      await loadPortalData();
    } else {
      setLibraryItems((current) => editingLibraryId ? current.map((item) => item.id === editingLibraryId ? { ...payload, id: editingLibraryId } : item) : [{ ...payload, id: Date.now() }, ...current]);
    }
    resetLibraryForm();
    setFeedback("Item da livraria salvo.");
  }

  async function deleteLibraryItem(id?: number) {
    if (!id) return;
    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("libraryItem", "delete", undefined, id);
      await loadPortalData();
    } else if (supabase) {
      await supabase.from("student_library_items").delete().eq("id", id);
      await loadPortalData();
    } else setLibraryItems((current) => current.filter((item) => item.id !== id));
  }

  async function saveMinistryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ministryForm.title.trim()) return;
    const payload = { ...ministryForm, title: ministryForm.title.trim(), price: Number(ministryForm.price || 0), paymentKey: ministryForm.paymentKey.trim() || ministryUrl.trim() };
    setFeedback("Salvando item do ministério...");
    if (isNeonProvider) {
      if (editingMinistryId) await neonMutate<MinistryItem>("ministryItem", "update", payload, editingMinistryId);
      else await neonMutate<MinistryItem>("ministryItem", "create", payload);
      await loadPortalData();
    } else if (supabase) {
      if (editingMinistryId) await supabase.from("student_ministry_items").update(toDbMinistryItem(payload)).eq("id", editingMinistryId);
      else await supabase.from("student_ministry_items").insert(toDbMinistryItem(payload));
      await loadPortalData();
    } else {
      setMinistryItems((current) => editingMinistryId ? current.map((item) => item.id === editingMinistryId ? { ...payload, id: editingMinistryId } : item) : [{ ...payload, id: Date.now() }, ...current]);
    }
    resetMinistryForm();
    setFeedback("Item do ministério salvo.");
  }

  async function deleteMinistryItem(id?: number) {
    if (!id) return;
    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("ministryItem", "delete", undefined, id);
      await loadPortalData();
    } else if (supabase) {
      await supabase.from("student_ministry_items").delete().eq("id", id);
      await loadPortalData();
    } else setMinistryItems((current) => current.filter((item) => item.id !== id));
  }

  async function updateInteraction(table: "student_questions" | "student_prayer_requests", item: StudentInteraction, patch: Partial<StudentInteraction>) {
    const updated = { ...item, ...patch };
    if (table === "student_questions") setQuestions((current) => current.map((entry) => entry.id === item.id ? updated : entry));
    else setPrayers((current) => current.map((entry) => entry.id === item.id ? updated : entry));
    if (isNeonProvider && item.id) {
      await neonMutate<StudentInteraction>("interaction", "update", { table, status: updated.status, response: updated.response }, item.id);
    } else if (supabase && item.id) {
      await supabase.from(table).update({ status: updated.status, response: updated.response, updated_at: new Date().toISOString() }).eq("id", item.id);
    }
    if (patch.response !== undefined) {
      setFeedback(table === "student_questions" ? "Resposta enviada ao aluno." : "Acompanhamento enviado ao aluno.");
    } else {
      setFeedback("Status atualizado.");
    }
  }

  async function copyAdminPixKey(value: string) {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      setFeedback("Chave de pagamento copiada.");
    } catch {
      setFeedback("Copie a chave de pagamento manualmente.");
    }
  }

  async function saveMinistrySettings() {
    const nextSettings = { ...settings, ministryPaymentUrl: ministryUrl, ministryPaymentText: ministryText, ministryListText, ministryListValidUntil, libraryPaymentUrl, ministryWhatsapp, libraryWhatsapp };
    setSettings(() => nextSettings);
    if (isNeonProvider) await neonMutate<Record<string, string>>("settings", "upsert", nextSettings);
    else if (supabase) await supabase.from("app_settings").upsert({ key: "general", value: nextSettings, updated_at: new Date().toISOString() });
    setFeedback("Pagamentos e contatos atualizados.");
  }

  const pendingQuestions = questions.filter((item) => item.status === "novo").length;
  const pendingPrayers = prayers.filter((item) => item.status === "novo").length;

  return (
    <Section>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-brand-deep dark:text-white">Portal do Aluno</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Publique aulas, lições, avisos e acompanhe interações dos alunos.</p>
        </div>
      </div>



      {feedback ? <p className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-brand-blue dark:bg-blue-500/10">{feedback}</p> : null}
      {loading ? <div className="glass-panel rounded-[1.8rem] p-5 text-sm font-bold text-slate-500 shadow-soft">Carregando portal...</div> : null}

      <div className={user.role === "teacher" ? "grid gap-5" : "grid gap-5 xl:grid-cols-[1fr_0.9fr]"}>
        {user.role === "teacher" ? (
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="glass-panel min-h-[34rem] rounded-[1.8rem] p-5 shadow-soft">
              <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">Lição do dia</h3>
              <div className="mt-4 grid gap-3">
                <input value={lessonDraft.title} onChange={(event) => setLessonDraft((current) => ({ ...current, title: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Título da lição" />
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Data da lição</span>
                  <input type="date" value={contentDateValue(lessonDraft.publishedAt)} onChange={(event) => setLessonDraft((current) => ({ ...current, publishedAt: isoFromInputDate(event.target.value) }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" />
                </label>
                <textarea value={lessonDraft.body} onChange={(event) => setLessonDraft((current) => ({ ...current, body: event.target.value }))} rows={6} className="resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Escreva a lição, pontos principais, sugestões e aplicações." />
                <input value={lessonDraft.mediaUrl} onChange={(event) => setLessonDraft((current) => ({ ...current, mediaUrl: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Link opcional de apoio ou PDF" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-slate-100 px-4 py-3 text-xs font-extrabold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">
                    <Upload className="h-4 w-4" /> Anexar PDF
                    <input className="sr-only" type="file" accept="application/pdf" onChange={(event) => { readPortalPdf(event.target.files?.[0], (value) => setLessonDraft((current) => ({ ...current, mediaUrl: value }))); event.currentTarget.value = ""; }} />
                  </label>
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-blue-50 px-4 py-3 text-xs font-extrabold text-brand-blue transition hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-100">
                    <ImageIcon className="h-4 w-4" /> Anexar foto
                    <input className="sr-only" type="file" accept="image/*" onChange={(event) => { void readPortalImage(event.target.files?.[0], (value) => setLessonDraft((current) => ({ ...current, mediaUrl: value }))); event.currentTarget.value = ""; }} />
                  </label>
                </div>
                {lessonDraft.mediaUrl.startsWith("data:image/") ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900"><img src={lessonDraft.mediaUrl} alt="Prévia da foto" className="max-h-64 w-full rounded-xl object-contain" /></div> : null}
                {lessonDraft.mediaUrl ? <button type="button" onClick={() => setLessonDraft((current) => ({ ...current, mediaUrl: "" }))} className="text-xs font-extrabold text-red-600">Remover anexo</button> : null}
                <button type="button" onClick={() => void saveTeacherContent("lesson", lessonDraft, () => setLessonDraft(emptyTeacherDraft()))} className="rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white">Publicar lição</button>
              </div>
            </div>
            <div className="glass-panel min-h-[34rem] rounded-[1.8rem] p-5 shadow-soft">
              <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">Mensagem do professor</h3>
              <div className="mt-4 grid gap-3">
                <input value={messageDraft.title} onChange={(event) => setMessageDraft((current) => ({ ...current, title: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Título da mensagem" />
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Data da mensagem</span>
                  <input type="date" value={contentDateValue(messageDraft.publishedAt)} onChange={(event) => setMessageDraft((current) => ({ ...current, publishedAt: isoFromInputDate(event.target.value) }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" />
                </label>
                <textarea value={messageDraft.body} onChange={(event) => setMessageDraft((current) => ({ ...current, body: event.target.value }))} rows={6} className="resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Escreva uma reflexão, palavra de evangelho, aviso pastoral ou orientação." />
                <input value={messageDraft.mediaUrl} onChange={(event) => setMessageDraft((current) => ({ ...current, mediaUrl: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Link opcional de áudio, vídeo ou PDF" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-slate-100 px-4 py-3 text-xs font-extrabold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">
                    <Upload className="h-4 w-4" /> Anexar PDF
                    <input className="sr-only" type="file" accept="application/pdf" onChange={(event) => { readPortalPdf(event.target.files?.[0], (value) => setMessageDraft((current) => ({ ...current, mediaUrl: value }))); event.currentTarget.value = ""; }} />
                  </label>
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-blue-50 px-4 py-3 text-xs font-extrabold text-brand-blue transition hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-100">
                    <ImageIcon className="h-4 w-4" /> Anexar foto
                    <input className="sr-only" type="file" accept="image/*" onChange={(event) => { void readPortalImage(event.target.files?.[0], (value) => setMessageDraft((current) => ({ ...current, mediaUrl: value }))); event.currentTarget.value = ""; }} />
                  </label>
                </div>
                {messageDraft.mediaUrl.startsWith("data:image/") ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900"><img src={messageDraft.mediaUrl} alt="Prévia da foto" className="max-h-64 w-full rounded-xl object-contain" /></div> : null}
                {messageDraft.mediaUrl ? <button type="button" onClick={() => setMessageDraft((current) => ({ ...current, mediaUrl: "" }))} className="text-xs font-extrabold text-red-600">Remover anexo</button> : null}
                <button type="button" onClick={() => void saveTeacherContent("message", messageDraft, () => setMessageDraft(emptyTeacherDraft()))} className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white">Publicar mensagem</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
            <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">Publicar conteúdo</h3>
            <form onSubmit={saveContent} className="mt-4 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <select value={contentForm.type} onChange={(event) => setContentForm((current) => ({ ...current, type: event.target.value as PortalContentType }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
                  {contentTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select value={contentForm.room} onChange={(event) => setContentForm((current) => ({ ...current, room: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
                  {availableRooms.map((room) => <option key={room}>{room}</option>)}
                </select>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-900">
                  <input type="checkbox" checked={contentForm.active} onChange={(event) => setContentForm((current) => ({ ...current, active: event.target.checked }))} /> Ativo
                </label>
              </div>
              <input value={contentForm.title} onChange={(event) => setContentForm((current) => ({ ...current, title: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Título" />
              <input value={contentForm.mediaUrl} onChange={(event) => setContentForm((current) => ({ ...current, mediaUrl: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder={contentForm.type === "video" ? "Link externo do vídeo" : "Link externo opcional de áudio, vídeo ou material"} />
              <label className="space-y-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Data do conteúdo</span>
                <input type="date" value={contentDateValue(contentForm.publishedAt)} onChange={(event) => setContentForm((current) => ({ ...current, publishedAt: isoFromInputDate(event.target.value) }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" />
              </label>
              <textarea value={contentForm.body} onChange={(event) => setContentForm((current) => ({ ...current, body: event.target.value }))} rows={4} className="resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Texto, lição, aviso ou descricao" />
              <div className="flex flex-col gap-2 sm:flex-row">
                <button className="rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white">{editingContentId ? "Salvar alterações" : "Publicar"}</button>
                {editingContentId ? <button type="button" onClick={resetContentForm} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-200">Cancelar</button> : null}
              </div>
            </form>
          </div>
        )}

        {user.role === "admin" ? (
          <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
            <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">Pagamentos e contatos</h3>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-2">
                <span className="text-sm font-extrabold text-brand-deep dark:text-white">Pix geral do ministério</span>
                <input value={ministryUrl} onChange={(event) => setMinistryUrl(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Usado para ajuda e produtos do ministério" />
              </label>
              <label className="grid gap-2 rounded-3xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <span className="text-sm font-extrabold text-brand-deep dark:text-white">Pix da livraria</span>
                <input value={libraryPaymentUrl} onChange={(event) => setLibraryPaymentUrl(event.target.value)} className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm outline-none dark:border-emerald-500/30 dark:bg-slate-900" placeholder="Chave única usada em todos os livros" />
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-200">Esta chave é separada do Pix geral e vale para todos os livros cadastrados.</span>
              </label>
              {libraryPaymentUrl ? <button type="button" onClick={() => void copyAdminPixKey(libraryPaymentUrl)} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-200">Copiar Pix da livraria</button> : null}
              {ministryUrl ? <button type="button" onClick={() => void copyAdminPixKey(ministryUrl)} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-200">Copiar chave Pix</button> : null}
              <label className="grid gap-2">
                <span className="text-sm font-extrabold text-brand-deep dark:text-white">WhatsApp geral do ministério</span>
                <input value={ministryWhatsapp} onChange={(event) => setMinistryWhatsapp(formatBrazilPhone(event.target.value))} type="tel" inputMode="tel" maxLength={15} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Recebe avisos de ajuda e produtos do ministério" />
              </label>
              <label className="grid gap-2 rounded-3xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <span className="text-sm font-extrabold text-brand-deep dark:text-white">WhatsApp da livraria</span>
                <input value={libraryWhatsapp} onChange={(event) => setLibraryWhatsapp(formatBrazilPhone(event.target.value))} type="tel" inputMode="tel" maxLength={15} className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm outline-none dark:border-emerald-500/30 dark:bg-slate-900" placeholder="Recebe avisos de pagamentos de livros" />
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-200">Este contato é separado do contato geral e recebe apenas avisos da livraria.</span>
              </label>
              <button type="button" onClick={() => void saveMinistrySettings()} className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white">Salvar pagamentos e contatos</button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
          <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">Conteúdos publicados</h3>
          <div className="mt-4 space-y-3">
            {contents.map((content) => (
              <div key={content.id} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-brand-blue">{portalTypeLabels[content.type]} - {content.room}</p>
                    <h4 className="mt-1 font-extrabold text-brand-deep dark:text-white">{content.title}</h4>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{content.body}</p>
                  </div>
                  {(user.role === "admin" || ((content.type === "message" || content.type === "lesson") && sameRoomName(content.room, teacherRoom))) ? (
                    <div className="flex gap-2">
                      <IconButton label="Editar conteúdo" onClick={() => { setEditingContentId(content.id ?? null); setContentForm(content); }}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label="Excluir conteúdo" onClick={() => void deleteContent(content.id)}><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
        {user.role === "admin" ? (
          <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
            <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">Livraria</h3>
            <form onSubmit={saveLibrary} className="mt-4 grid gap-3">
              <PhotoCapture photo={libraryForm.imageUrl} onPhoto={(value) => setLibraryForm((current) => ({ ...current, imageUrl: value }))} previewInitials="LV" label="Capa do livro" />
              <input value={libraryForm.title} onChange={(event) => setLibraryForm((current) => ({ ...current, title: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Produto ou livro" />
              <textarea value={libraryForm.description} onChange={(event) => setLibraryForm((current) => ({ ...current, description: event.target.value }))} rows={3} className="resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Descrição" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <input value={libraryForm.price} onChange={(event) => setLibraryForm((current) => ({ ...current, price: Number(event.target.value) }))} type="number" min="0" step="0.01" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Preço" />
                <input value={libraryForm.stockQuantity} onChange={(event) => setLibraryForm((current) => ({ ...current, stockQuantity: Math.max(0, Number(event.target.value || 0)) }))} type="number" min="0" step="1" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Quantidade em estoque" aria-label="Quantidade em estoque" />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 xl:col-span-2">Todos os livros usam somente o Pix da livraria configurado em Pagamentos e contatos.</p>
                {libraryPaymentUrl ? <button type="button" onClick={() => void copyAdminPixKey(libraryPaymentUrl)} className="rounded-full bg-slate-100 px-4 py-3 text-xs font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-200">Copiar Pix da livraria</button> : null}
              </div>
              <button className="rounded-full bg-brand-green px-5 py-3 text-sm font-extrabold text-white">{editingLibraryId ? "Salvar item" : "Cadastrar item"}</button>
              {editingLibraryId ? <button type="button" onClick={resetLibraryForm} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-200">Cancelar edição</button> : null}
            </form>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {libraryItems.map((item) => (
                <article key={item.id} className="flex min-h-52 flex-col rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
                  {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-24 w-full rounded-xl bg-slate-100 p-2 object-contain dark:bg-slate-800" /> : <div className="grid h-24 w-full place-items-center rounded-xl bg-slate-100 text-xs font-extrabold text-slate-400 dark:bg-slate-800">Sem imagem</div>}
                  <div className="mt-3 min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-extrabold text-brand-deep dark:text-white">{item.title}</p>
                    <p className="mt-1 text-sm font-bold text-brand-green">R$ {formatCurrencyBRL(item.price)}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">Estoque: {item.stockQuantity}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setEditingLibraryId(item.id ?? null); setLibraryForm(item); }} className="inline-flex items-center justify-center gap-1 rounded-full bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                    <button type="button" onClick={() => void deleteLibraryItem(item.id)} className="inline-flex items-center justify-center gap-1 rounded-full bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-200"><Trash2 className="h-3.5 w-3.5" /> Excluir</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
        {user.role === "admin" ? (
          <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
            <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">Produtos do ministério</h3>
            <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900">
              <p className="text-sm font-extrabold text-brand-deep dark:text-white">Texto do card no portal do aluno</p>
              <div className="mt-3 grid gap-3">
                <textarea value={ministryText} onChange={(event) => setMinistryText(event.target.value)} rows={3} className="resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-800" placeholder="Ex: Ajude o ministério da EBR!" />
                <textarea value={ministryListText} onChange={(event) => setMinistryListText(event.target.value)} rows={3} className="resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-800" placeholder="Texto antes da lista de produtos" />
                <label className="space-y-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Validade da lista</span>
                  <input value={ministryListValidUntil} onChange={(event) => setMinistryListValidUntil(event.target.value)} type="date" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-800" />
                </label>
                <button type="button" onClick={() => void saveMinistrySettings()} className="rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white">Salvar texto e validade</button>
              </div>
            </div>
            <form onSubmit={saveMinistryItem} className={ministryModalOpen ? "hidden" : "mt-4 grid gap-3"}>
              <input value={ministryForm.title} onChange={(event) => setMinistryForm((current) => ({ ...current, title: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Produto ou contribuição" />
              <textarea value={ministryForm.description} onChange={(event) => setMinistryForm((current) => ({ ...current, description: event.target.value }))} rows={3} className="resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Descrição" />
              <PhotoCapture photo={ministryForm.imageUrl} onPhoto={(value) => setMinistryForm((current) => ({ ...current, imageUrl: value }))} previewInitials="AJ" label="Foto do produto" />
              <div className="grid gap-3 sm:grid-cols-3">
                <input value={ministryForm.price} onChange={(event) => setMinistryForm((current) => ({ ...current, price: Number(event.target.value) }))} type="number" min="0" step="0.01" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Valor" />
                <input value={ministryForm.paymentKey} onChange={(event) => setMinistryForm((current) => ({ ...current, paymentKey: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900 sm:col-span-2" placeholder="Chave de pagamento deste produto" />
              </div>
              <button className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white">{editingMinistryId ? "Salvar produto" : "Cadastrar produto"}</button>
              {editingMinistryId ? <button type="button" onClick={resetMinistryForm} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-200">Cancelar edição</button> : null}
            </form>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ministryItems.map((item) => (
                <article key={item.id} className="flex min-h-44 flex-col rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
                  <div className="mb-3 aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="h-full w-full object-contain p-2" loading="lazy" /> : <div className="grid h-full w-full place-items-center px-2 text-center text-xs font-extrabold text-slate-400">Sem imagem</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-extrabold text-brand-deep dark:text-white">{item.title}</p>
                    <p className="mt-1 text-sm font-bold text-brand-green">R$ {formatCurrencyBRL(item.price)}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{item.active ? "Ativo" : "Indisponível"}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setEditingMinistryId(item.id ?? null); setMinistryForm(item); setMinistryModalOpen(true); }} className="inline-flex items-center justify-center gap-1 rounded-full bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                    <button type="button" onClick={() => void deleteMinistryItem(item.id)} className="inline-flex items-center justify-center gap-1 rounded-full bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-200"><Trash2 className="h-3.5 w-3.5" /> Excluir</button>
                  </div>
                </article>
              ))}
            </div>
            {ministryModalOpen ? (
              <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="editar-produto-ajuda" onClick={resetMinistryForm}>
                <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[1.8rem] bg-white p-5 shadow-2xl dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-blue">Lista de ajuda</p>
                      <h4 id="editar-produto-ajuda" className="mt-1 text-xl font-extrabold text-brand-deep dark:text-white">Editar produto</h4>
                    </div>
                    <button type="button" onClick={resetMinistryForm} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200" aria-label="Fechar edição"><X className="h-4 w-4" /></button>
                  </div>
                  <form onSubmit={saveMinistryItem} className="mt-5 grid gap-3">
                    <input autoFocus value={ministryForm.title} onChange={(event) => setMinistryForm((current) => ({ ...current, title: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Produto ou contribuição" />
                    <textarea value={ministryForm.description} onChange={(event) => setMinistryForm((current) => ({ ...current, description: event.target.value }))} rows={3} className="resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Descrição" />
                    <PhotoCapture photo={ministryForm.imageUrl} onPhoto={(value) => setMinistryForm((current) => ({ ...current, imageUrl: value }))} previewInitials="AJ" label="Foto do produto" />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <input value={ministryForm.price} onChange={(event) => setMinistryForm((current) => ({ ...current, price: Number(event.target.value) }))} type="number" min="0" step="0.01" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Valor" />
                      <input value={ministryForm.paymentKey} onChange={(event) => setMinistryForm((current) => ({ ...current, paymentKey: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900 sm:col-span-2" placeholder="Chave de pagamento deste produto" />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white">Salvar alterações</button>
                      <button type="button" onClick={resetMinistryForm} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-200">Cancelar</button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <InteractionPanel title="Perguntas ao professor" table="student_questions" items={questions} onUpdate={updateInteraction} canRespond={user.role === "teacher"} />
        <InteractionPanel title="Pedidos de oração" table="student_prayer_requests" items={prayers} onUpdate={updateInteraction} prayer canRespond={user.role === "teacher"} />
      </div>
    </Section>
  );
}

function InteractionPanel({ title, table, items, onUpdate, prayer = false, canRespond = true }: { title: string; table: "student_questions" | "student_prayer_requests"; items: StudentInteraction[]; onUpdate: (table: "student_questions" | "student_prayer_requests", item: StudentInteraction, patch: Partial<StudentInteraction>) => void | Promise<void>; prayer?: boolean; canRespond?: boolean }) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      items.forEach((item) => {
        if (item.id && next[item.id] === undefined) next[item.id] = item.response;
      });
      return next;
    });
  }, [items]);

  function sendResponse(item: StudentInteraction) {
    if (!item.id) return;
    const response = (drafts[item.id] ?? item.response).trim();
    if (!response) return;
    void Promise.resolve(onUpdate(table, item, { response, status: prayer ? "concluido" : "respondido" })).then(() => {
      setDrafts((current) => ({ ...current, [item.id!]: "" }));
    });
  }

  return (
    <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
      <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length ? items.map((item) => {
          const draft = item.id ? drafts[item.id] ?? item.response : item.response;
          return (
            <div key={item.id} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-extrabold text-brand-deep dark:text-white">{item.studentName}</p>
                  <p className="text-xs font-bold text-brand-blue">{item.room}</p>
                </div>
                {canRespond ? <select value={item.status} onChange={(event) => void onUpdate(table, item, { status: event.target.value })} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                  {prayer ? <><option value="novo">novo</option><option value="acompanhando">acompanhando</option><option value="concluido">concluido</option></> : <><option value="novo">novo</option><option value="respondido">respondido</option><option value="arquivado">arquivado</option></>}
                </select> : <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-extrabold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-300">{item.status}</span>}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.message}</p>
              {canRespond ? (<>
                <textarea value={draft} onChange={(event) => item.id ? setDrafts((current) => ({ ...current, [item.id!]: event.target.value })) : undefined} rows={3} className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-800" placeholder={prayer ? "Resposta ou acompanhamento" : "Resposta do professor"} />
                <button type="button" onClick={() => sendResponse(item)} className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-blue px-5 py-2.5 text-xs font-extrabold text-white transition hover:-translate-y-0.5">
                  <Send className="h-4 w-4" />
                  {prayer ? "Enviar acompanhamento" : "Enviar resposta"}
                </button>
              </>) : item.response ? <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-brand-deep dark:bg-slate-800 dark:text-blue-100">{item.response}</p> : null}
            </div>
          );
        }) : <p className="rounded-2xl bg-white p-4 text-sm font-bold text-slate-500 dark:bg-slate-900">Nenhum registro ainda.</p>}
      </div>
    </div>
  );
}

function parseScheduleLocations(value?: string) {
  const defaults = ["Recepção", "Portão", "Sala dos professores", "Apoio infantil", "Recepção dos alunos"];
  try {
    const parsed = JSON.parse(value || "[]");
    if (Array.isArray(parsed)) {
      const clean = parsed.map((item) => String(item || "").trim()).filter(Boolean);
      return clean.length ? Array.from(new Set(clean)) : defaults;
    }
  } catch {}
  return defaults;
}

function TeacherScheduleView({ user, team, settings, setSettings }: { user: AppUser; team: TeamMember[]; settings: Record<string, string>; setSettings: (updater: (current: Record<string, string>) => Record<string, string>) => void }) {
  const teachers = team.filter((member) => member.role === "teacher" || member.role === "admin");
  const initialLocations = parseScheduleLocations(settings.scheduleLocations);
  const [items, setItems] = useState<TeacherSchedule[]>([]);
  const [locations, setLocations] = useState<string[]>(initialLocations);
  const [newLocation, setNewLocation] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [scheduleFilterDate, setScheduleFilterDate] = useState("");
  const sundayOptions = useMemo(() => getUpcomingSundayOptions(), []);
  const [form, setForm] = useState<TeacherSchedule>({ scheduleDate: getNextSundayInputDate(), teacherId: teachers[0]?.id, teacherName: teachers[0]?.name ?? "", position: initialLocations[0] ?? "", location: initialLocations[0] ?? "", notes: "", active: true });

  async function persistLocations(nextLocations: string[]) {
    const clean = Array.from(new Set(nextLocations.map((item) => item.trim()).filter(Boolean)));
    setLocations(clean);
    const nextSettings = { ...settings, scheduleLocations: JSON.stringify(clean) };
    setSettings(() => nextSettings);
    if (isNeonProvider) await neonMutate<Record<string, string>>("settings", "upsert", nextSettings);
    else if (supabase) await supabase.from("app_settings").upsert({ key: "general", value: nextSettings, updated_at: new Date().toISOString() });
    setFeedback("Locais de trabalho atualizados.");
    window.setTimeout(() => setFeedback(""), 1800);
  }

  async function addLocation() {
    const name = newLocation.trim();
    if (!name) return;
    await persistLocations([...locations, name]);
    setNewLocation("");
    setForm((current) => current.location ? current : { ...current, location: name, position: name });
  }

  async function removeLocation(name: string) {
    await persistLocations(locations.filter((item) => item !== name));
    setForm((current) => current.location === name ? { ...current, location: "", position: "" } : current);
  }

  async function loadSchedules() {
    if (isNeonProvider) {
      const data = await fetchNeonJson<{ items: TeacherSchedule[] }>("/api/neon/portal?audience=schedules");
      setItems((data.items ?? []).map((item) => ({ ...item, scheduleDate: normalizeStoredDate(item.scheduleDate) })));
      return;
    }
    if (!supabase) return;
    const { data } = await supabase.from("teacher_schedules").select("*").order("schedule_date", { ascending: true });
    setItems((data ?? []).map(fromDbTeacherSchedule));
  }

  useEffect(() => {
    void loadSchedules();
  }, []);

  function resetForm() {
    const firstLocation = locations[0] ?? "";
    setEditingId(null);
    setForm({ scheduleDate: getNextSundayInputDate(), teacherId: teachers[0]?.id, teacherName: teachers[0]?.name ?? "", position: firstLocation, location: firstLocation, notes: "", active: true });
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.scheduleDate || !form.teacherName.trim() || !form.location.trim()) return;
    const selectedTeacher = teachers.find((teacher) => teacher.id === Number(form.teacherId));
    const payload = { ...form, scheduleDate: normalizeStoredDate(form.scheduleDate), teacherId: selectedTeacher?.id ?? form.teacherId, teacherName: selectedTeacher?.name ?? form.teacherName, position: form.location, location: form.location };
    if (isNeonProvider) {
      if (editingId) await neonMutate<TeacherSchedule>("schedule", "update", payload, editingId);
      else await neonMutate<TeacherSchedule>("schedule", "create", payload);
      await loadSchedules();
    } else if (supabase) {
      if (editingId) await supabase.from("teacher_schedules").update(toDbTeacherSchedule(payload)).eq("id", editingId);
      else await supabase.from("teacher_schedules").insert(toDbTeacherSchedule(payload));
      await loadSchedules();
    } else {
      setItems((current) => editingId ? current.map((item) => item.id === editingId ? { ...payload, id: editingId } : item) : [{ ...payload, id: Date.now() }, ...current]);
    }
    resetForm();
    setFeedback("Escala salva.");
    window.setTimeout(() => setFeedback(""), 1800);
  }

  async function deleteSchedule(id?: number) {
    if (!id) return;
    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("schedule", "delete", undefined, id);
      await loadSchedules();
    } else if (supabase) {
      await supabase.from("teacher_schedules").delete().eq("id", id);
      await loadSchedules();
    } else setItems((current) => current.filter((item) => item.id !== id));
  }

  const todayInput = getTodayInputDate();
  const roleVisibleItems = (user.role === "teacher" ? items.filter((item) => item.teacherId === user.id || item.teacherName.toLowerCase() === user.name.toLowerCase()) : items)
    .filter((item) => {
      const scheduleDate = normalizeStoredDate(item.scheduleDate);
      return isSundayDate(scheduleDate) && scheduleDate >= todayInput;
    });
  const visibleItems = scheduleFilterDate ? roleVisibleItems.filter((item) => normalizeStoredDate(item.scheduleDate) === scheduleFilterDate) : roleVisibleItems;

  return (
    <Section>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-brand-deep dark:text-white">Escala da escola</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Organize as datas e os locais de trabalho definidos pelo admin.</p>
        </div>
        {feedback ? <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-extrabold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{feedback}</span> : null}
      </div>

      {user.role === "admin" ? (
        <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
            <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">Locais de trabalho</h3>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input value={newLocation} onChange={(event) => setNewLocation(event.target.value)} className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Novo local de trabalho" />
              <button type="button" onClick={() => void addLocation()} className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white">Adicionar local</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {locations.map((location) => (
                <span key={location} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {location}
                  <button type="button" onClick={() => void removeLocation(location)} className="grid h-6 w-6 place-items-center rounded-full bg-white text-slate-500 hover:text-red-600 dark:bg-slate-900" aria-label={'Remover ' + location}><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
            </div>
          </div>

          <form onSubmit={saveSchedule} className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
            <h3 className="text-xl font-extrabold text-brand-deep dark:text-white">Criar ou editar escala</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Data</span>
                <select value={form.scheduleDate} onChange={(event) => setForm((current) => ({ ...current, scheduleDate: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">
                  {Array.from(new Set([form.scheduleDate, ...sundayOptions])).filter(Boolean).map((date) => <option key={date} value={date}>{formatPlanningDate(date)}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Professor ou admin</span>
                <select value={form.teacherId ?? ""} onChange={(event) => { const teacher = teachers.find((item) => item.id === Number(event.target.value)); setForm((current) => ({ ...current, teacherId: teacher?.id, teacherName: teacher?.name ?? "" })); }} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">
                  {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Local de trabalho</span>
                <select value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value, position: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">
                  <option value="">Selecione um local</option>
                  {locations.map((location) => <option key={location} value={location}>{location}</option>)}
                </select>
              </label>
            </div>
            <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Observações" />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button className="rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white">{editingId ? "Salvar escala" : "Criar escala"}</button>
              {editingId ? <button type="button" onClick={resetForm} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-200">Cancelar edição</button> : null}
            </div>
          </form>
        </div>
      ) : null}

      <div className="glass-panel flex flex-col gap-3 rounded-[1.4rem] p-4 shadow-soft sm:flex-row sm:items-end sm:justify-between">
        <label className="space-y-2">
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Filtrar por data</span>
          <select value={scheduleFilterDate} onChange={(event) => setScheduleFilterDate(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">
            <option value="">Todos os próximos domingos</option>
            {sundayOptions.map((date) => <option key={date} value={date}>{formatPlanningDate(date)}</option>)}
          </select>
        </label>
        {scheduleFilterDate ? <button type="button" onClick={() => setScheduleFilterDate("")} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-200">Limpar filtro</button> : null}
      </div>

      <div className="grid gap-3">
        {visibleItems.length ? visibleItems.map((item) => {
          const displayLocation = item.location || item.position;
          return (
            <article key={item.id} className="glass-panel rounded-[1.4rem] p-4 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-extrabold text-brand-blue">{formatPlanningDate(item.scheduleDate)}</p>
                  <h3 className="mt-1 text-xl font-extrabold text-brand-deep dark:text-white">{displayLocation}</h3>
                  <p className="mt-1 text-sm font-bold text-slate-600 dark:text-slate-300">{item.teacherName}</p>
                  {item.notes ? <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{item.notes}</p> : null}
                </div>
                {user.role === "admin" ? (
                  <div className="flex gap-2">
                    <IconButton label="Editar escala" onClick={() => { const displayLocation = item.location || item.position; setEditingId(item.id ?? null); setForm({ ...item, location: displayLocation, position: displayLocation }); }}><Pencil className="h-4 w-4" /></IconButton>
                    <IconButton label="Excluir escala" onClick={() => void deleteSchedule(item.id)}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                ) : null}
              </div>
            </article>
          );
        }) : <p className="rounded-2xl bg-white p-4 text-sm font-bold text-slate-500 shadow-sm dark:bg-slate-900">Nenhuma escala cadastrada.</p>}
      </div>
    </Section>
  );
}

function SettingsView({
  team,
  setTeam,
  roomsSource,
  settings,
  setSettings
}: {
  team: TeamMember[];
  setTeam: (updater: (current: TeamMember[]) => TeamMember[]) => void;
  roomsSource: Room[];
  settings: Record<string, string>;
  setSettings: (updater: (current: Record<string, string>) => Record<string, string>) => void;
}) {
  const [photo, setPhoto] = useState("");
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [deleteMember, setDeleteMember] = useState<TeamMember | null>(null);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [teamFeedback, setTeamFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [accessFormKey, setAccessFormKey] = useState(0);
  const [accessForm, setAccessForm] = useState({ name: "", username: "", email: "", password: "" });
  const [newMemberRole, setNewMemberRole] = useState<Role>("teacher");

  async function addTeamMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = accessForm.name.trim() || "Novo professor";
    const role = newMemberRole;
    const newMember: TeamMember = {
      id: Date.now(),
      name,
      username: accessForm.username.trim() || normalizeAvatar(name).toLowerCase(),
      phone: formatBrazilPhone(newMemberPhone),
      email: accessForm.email.trim(),
      password: accessForm.password.trim() || "123456",
      role,
      room: role === "teacher" ? String(formData.get("room") || roomsSource[0]?.name || rooms[0].name) : "Todas",
      avatar: normalizeAvatar(name),
      photo
    };
    setTeam((current) => [...current, newMember]);
    setAccessForm({ name: "", username: "", email: "", password: "" });
    setPhoto("");
    setNewMemberPhone("");
    setNewMemberRole("teacher");
    setAccessFormKey((current) => current + 1);
    if (isNeonProvider) {
      const data = await neonMutate<TeamMember>("team", "create", newMember);
      if (data) setTeam((current) => current.map((member) => (member.id === newMember.id ? data : member)));
    } else if (supabase) {
      const { data } = await supabase.from("team_members").insert(toDbTeam(newMember)).select("*").single();
      if (data) {
        setTeam((current) => current.map((member) => (member.id === newMember.id ? fromDbTeam(data) : member)));
      }
    }
    event.currentTarget.reset();
  }

  function handlePhoto(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function saveMemberEdit(updatedMember: TeamMember) {
    setTeam((current) => current.map((item) => (item.id === updatedMember.id ? updatedMember : item)));
    if (isNeonProvider) {
      const data = await neonMutate<TeamMember>("team", "update", updatedMember, updatedMember.id);
      if (data) setTeam((current) => current.map((item) => (item.id === updatedMember.id ? data : item)));
    } else if (supabase) {
      await supabase.from("team_members").update(toDbTeam(updatedMember)).eq("id", updatedMember.id);
    }
    setEditingMember(null);
  }

  async function confirmDeleteMember() {
    if (!deleteMember) return;

    const memberToDelete = deleteMember;
    setDeleteMember(null);
    setTeam((current) => current.filter((member) => member.id !== memberToDelete.id));
    setTeamFeedback(null);

    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("team", "delete", undefined, memberToDelete.id);
    } else if (supabase) {
      const primaryDelete = await supabase.from("team_members").delete().eq("id", memberToDelete.id).select("id");
      let deleteError = primaryDelete.error;
      let deletedRows = primaryDelete.data ?? [];

      if (!deleteError && deletedRows.length === 0 && memberToDelete.username) {
        const fallbackDelete = await supabase.from("team_members").delete().eq("username", memberToDelete.username).select("id");
        deleteError = fallbackDelete.error;
        deletedRows = fallbackDelete.data ?? [];
      }

      if (deleteError || deletedRows.length === 0) {
        setTeam((current) => (current.some((member) => member.id === memberToDelete.id) ? current : [...current, memberToDelete].sort((a, b) => a.id - b.id)));
        setTeamFeedback({ kind: "error", message: "Não foi possível excluir esse acesso no banco. Tente novamente." });
        return;
      }
    }

    setTeamFeedback({ kind: "success", message: "Acesso excluído do banco." });
    window.setTimeout(() => setTeamFeedback(null), 2200);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isNeonProvider) {
      await neonMutate<Record<string, string>>("settings", "upsert", settings);
    } else if (supabase) {
      await supabase.from("app_settings").upsert({ key: "general", value: settings, updated_at: new Date().toISOString() });
    }
    setSettingsSaved(true);
    window.setTimeout(() => setSettingsSaved(false), 1800);
  }

  return (
    <Section>
      <form onSubmit={saveSettings} className="glass-panel max-w-4xl rounded-[1.8rem] p-5 shadow-soft">
        <h2 className="text-2xl font-extrabold text-brand-deep dark:text-white">Configurações</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Nome da igreja</span>
            <input value={settings.churchName} onChange={(event) => setSettings((current) => ({ ...current, churchName: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Coordenador</span>
            <input value={settings.coordinator} onChange={(event) => setSettings((current) => ({ ...current, coordinator: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Horário padrão</span>
            <input value={settings.defaultTime} onChange={(event) => setSettings((current) => ({ ...current, defaultTime: event.target.value }))} type="time" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Mensagem de boas-vindas</span>
            <input value={settings.welcomeMessage} onChange={(event) => setSettings((current) => ({ ...current, welcomeMessage: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Título da gaveta</span>
            <input value={settings.sidebarTitle ?? ""} onChange={(event) => setSettings((current) => ({ ...current, sidebarTitle: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" placeholder="EBR" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Subtítulo da gaveta</span>
            <input value={settings.sidebarSubtitle ?? ""} onChange={(event) => setSettings((current) => ({ ...current, sidebarSubtitle: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" placeholder="Escola Bíblica Resgatai" />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Imagem da gaveta</span>
            <PhotoCapture photo={settings.sidebarImage ?? "/ebr-logo.jpg"} onPhoto={(value) => setSettings((current) => ({ ...current, sidebarImage: value }))} previewInitials="EB" label="Imagem da gaveta" />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Título da página de login</span>
            <input value={settings.loginTitle ?? ""} onChange={(event) => setSettings((current) => ({ ...current, loginTitle: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" placeholder="Gestão organizada para uma EBR mais presente." />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Subtítulo da página de login</span>
            <input value={settings.loginSubtitle ?? ""} onChange={(event) => setSettings((current) => ({ ...current, loginSubtitle: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" placeholder="Login seguro" />
          </label>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="submit" className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5">Salvar configurações</button>
          {settingsSaved ? <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-extrabold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">Configurações salvas</span> : null}
        </div>
      </form>

      <div className="glass-panel rounded-[1.8rem] p-5 shadow-soft">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-brand-deep dark:text-white">Professores e administradores</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Cadastro com tipo de acesso para controle de permissões.</p>
          </div>
          <ShieldCheck className="h-7 w-7 text-brand-blue" />
        </div>
        {teamFeedback ? (
          <p className={`mb-5 rounded-2xl px-4 py-3 text-sm font-extrabold ${teamFeedback.kind === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"}`}>
            {teamFeedback.message}
          </p>
        ) : null}

        <form key={accessFormKey} onSubmit={addTeamMember} className="grid gap-4" autoComplete="off">
          <PhotoCapture photo={photo} onPhoto={setPhoto} previewInitials="PF" label="Foto do acesso" />
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["Nome", "name", "text", accessForm.name],
              ["Usuário", "username", "text", accessForm.username],
              ["Email", "email", "email", accessForm.email],
              ["Senha", "password", "password", accessForm.password]
            ].map(([label, name, type, value]) => (
              <label key={name} className="space-y-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{label}</span>
                <input
                  name={name}
                  type={type}
                  value={String(value)}
                  onChange={(event) => setAccessForm((current) => ({ ...current, [String(name)]: event.target.value }))}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
            ))}
            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Telefone</span>
              <input
                name="phone"
                value={newMemberPhone}
                onChange={(event) => setNewMemberPhone(formatBrazilPhone(event.target.value))}
                type="tel"
                inputMode="tel"
                maxLength={15}
                placeholder="(85) 99999-9999"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Tipo de acesso</span>
              <select name="role" value={newMemberRole} onChange={(event) => setNewMemberRole(event.target.value as Role)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900">
                <option value="teacher">professor</option>
                <option value="admin">administrador</option>
              </select>
            </label>
            {newMemberRole === "teacher" ? (
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Sala vinculada</span>
                <select name="room" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900">
                  {roomsSource.map((room) => <option key={room.name}>{room.name}</option>)}
                </select>
              </label>
            ) : null}
            <button className="rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5 md:col-span-2">Cadastrar acesso</button>
          </div>
        </form>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {team.map((member, index) => (
            <div key={member.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
              <Avatar initials={member.avatar} index={index} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">{member.name}</p>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">{member.email || member.username} - {member.role === "admin" ? "sem sala vinculada" : member.room}</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-brand-blue dark:bg-blue-500/10">{member.role === "admin" ? "admin" : "professor"}</span>
              <IconButton label={`Editar ${member.name}`} onClick={() => setEditingMember(member)}>
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton label={`Excluir ${member.name}`} onClick={() => setDeleteMember(member)}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {editingMember ? (
          <MemberEditorModal
            member={editingMember}
            roomsSource={roomsSource}
            onClose={() => setEditingMember(null)}
            onSave={saveMemberEdit}
          />
        ) : null}
        {deleteMember ? (
          <ConfirmModal
            message={`Deseja realmente excluir o acesso de ${deleteMember.name}?`}
            onCancel={() => setDeleteMember(null)}
            onConfirm={confirmDeleteMember}
          />
        ) : null}
      </AnimatePresence>
    </Section>
  );
}

function MemberEditorModal({
  member,
  roomsSource,
  onClose,
  onSave
}: {
  member: TeamMember;
  roomsSource: Room[];
  onClose: () => void;
  onSave: (member: TeamMember) => void;
}) {
  const [name, setName] = useState(member.name);
  const [username, setUsername] = useState(member.username);
  const [phone, setPhone] = useState(member.phone);
  const [email, setEmail] = useState(member.email);
  const [password, setPassword] = useState(member.password);
  const [role, setRole] = useState<Role>(member.role);
  const [room, setRoom] = useState(member.room === "Todas" ? roomsSource[0]?.name ?? "Todas" : member.room);
  const [photo, setPhoto] = useState(member.photo ?? "");

  function handlePhoto(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.form
        className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-[1.8rem] bg-white p-6 shadow-2xl dark:bg-slate-950"
        initial={false}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          const cleanName = name.trim() || member.name;
          onSave({
            ...member,
            name: cleanName,
            username: username.trim() || member.username,
            phone: formatBrazilPhone(phone),
            email: email.trim(),
            password: password.trim() || member.password,
            role,
            room: role === "teacher" ? room : "Todas",
            avatar: normalizeAvatar(cleanName),
            photo
          });
        }}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-extrabold text-brand-deep dark:text-white">Editar acesso</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Atualize cadastro, usuario, senha e sala vinculada.</p>
          </div>
          <IconButton label="Fechar modal" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="mb-5 rounded-[1.4rem] bg-slate-50 p-4 dark:bg-slate-900">
          {photo ? <img src={photo} alt="" className="h-24 w-24 rounded-full object-cover" /> : <Avatar initials={member.avatar} size="xl" />}
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-extrabold text-brand-deep shadow-sm dark:bg-slate-800 dark:text-white">
            <Upload className="h-4 w-4 text-brand-blue" />
            Foto
            <input className="hidden" type="file" accept="image/*" onChange={(event) => handlePhoto(event.target.files?.[0])} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Nome</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Usuário</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Telefone</span>
            <input value={phone} onChange={(event) => setPhone(formatBrazilPhone(event.target.value))} type="tel" inputMode="tel" maxLength={15} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Senha</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Tipo de acesso</span>
            <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900">
              <option value="admin">administrador</option>
              <option value="teacher">professor</option>
            </select>
          </label>
          {role === "teacher" ? (
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Sala vinculada</span>
              <select value={room} onChange={(event) => setRoom(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900">
                {roomsSource.map((room) => <option key={room.name}>{room.name}</option>)}
              </select>
            </label>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900">Cancelar</button>
          <button className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5">Salvar acesso</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function getStoredActiveView(): ViewKey {
  if (typeof window === "undefined") return "dashboard";
  const stored = sessionStorage.getItem(EBR_ACTIVE_VIEW_STORAGE_KEY) as ViewKey | null;
  return stored && navItems.some((item) => item.key === stored) ? stored : "dashboard";
}

export default function Home() {
  const [activeView, setActiveView] = useState<ViewKey>(getStoredActiveView);
  const [birthdaysTodayOnly, setBirthdaysTodayOnly] = useState(false);
  const [searchTerms, setSearchTerms] = useState<Partial<Record<ViewKey, string>>>({});
  const [studentList, setStudentList] = useState<Student[]>(initialEbrData.students);
  const [roomList, setRoomList] = useState<Room[]>(initialEbrData.rooms);
  const [pendingList, setPendingList] = useState<PendingEnrollment[]>(initialEbrData.pendingEnrollments);
  const [team, setTeam] = useState<TeamMember[]>(initialEbrData.team);
  const [financialCategories, setFinancialCategories] = useState<Record<FinancialEntry["type"], string[]>>(initialEbrData.financialCategories);
  const [financialEntries, setFinancialEntries] = useState<FinancialEntry[]>(initialEbrData.financialEntries);
  const [examList, setExamList] = useState<Exam[]>(initialEbrData.exams);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(initialEbrData.attendanceRecords);
  const [settings, setSettings] = useState<Record<string, string>>(initialEbrData.settings);
  const [followUpFilterActive, setFollowUpFilterActive] = useState(false);
  const [dataLoading, setDataLoading] = useState(isSupabaseConfigured);
  const [showStaffLogin, setShowStaffLogin] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const backGuardReadyRef = useRef(false);
  const absenceFollowUpResolutions = useMemo(() => parseAbsenceFollowUpResolutions(settings.absenceFollowUpResolutions), [settings.absenceFollowUpResolutions]);
  const followUpStudents = useMemo(() => user ? getStudentsWithConsecutiveAbsences(user, studentList, attendanceRecords, absenceFollowUpResolutions) : [], [user, studentList, attendanceRecords, absenceFollowUpResolutions]);

  function applyLoadedData(data: EbrData) {
    setStudentList(data.students);
    setRoomList(data.rooms);
    setPendingList(data.pendingEnrollments);
    setTeam(data.team);
    setFinancialCategories(data.financialCategories);
    setFinancialEntries(data.financialEntries);
    setExamList(data.exams);
    setAttendanceRecords(data.attendanceRecords);
    setSettings(data.settings);
  }

  function refreshLoggedUser(data: EbrData) {
    setUser((current) => {
      if (!current) return current;
      const member = data.team.find((item) => item.id === current.id || item.username === current.username);
      if (!member) return current;
      return {
        id: member.id,
        name: member.name,
        username: member.username,
        email: member.email,
        role: member.role,
        avatar: member.avatar,
        room: member.role === "teacher" ? member.room : undefined
      };
    });
  }

  async function persistSettings(nextSettings: Record<string, string>) {
    setSettings(nextSettings);
    if (isNeonProvider) await neonMutate<Record<string, string>>("settings", "upsert", nextSettings);
    else if (supabase) await supabase.from("app_settings").upsert({ key: "general", value: nextSettings, updated_at: new Date().toISOString() });
  }

  async function resolveAbsenceFollowUp(student: Student) {
    if (!user) return;
    const info = getConsecutiveAbsenceInfo(user, student, attendanceRecords, absenceFollowUpResolutions);
    if (!info) return;
    const nextResolutions: AbsenceFollowUpResolutions = {
      ...absenceFollowUpResolutions,
      [absenceFollowUpKey(user, student)]: {
        resolvedThrough: info.lastAbsenceDate,
        resolvedAt: new Date().toISOString(),
        resolvedBy: user.name
      }
    };
    await persistSettings({ ...settings, absenceFollowUpResolutions: JSON.stringify(nextResolutions) });
  }

  useEffect(() => {
    let active = true;
    void registerEbrServiceWorker().catch(() => undefined);
    let savedSession: ManagementSession = {} as ManagementSession;
    try { savedSession = JSON.parse(sessionStorage.getItem(EBR_SESSION_STORAGE_KEY) ?? "{}") as ManagementSession; } catch { sessionStorage.removeItem(EBR_SESSION_STORAGE_KEY); }
    if (isNeonProvider && !savedSession.token) { setDataLoading(false); setDataReady(true); return () => { active = false; }; }
    loadEbrData().then((data) => {
      if (!active) return;
      applyLoadedData(data);
      if (savedSession.token && savedSession.user) setUser(savedSession.user); else sessionStorage.removeItem(EBR_SESSION_STORAGE_KEY);
      setDataLoading(false);
      setDataReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!dataReady || isNeonProvider || !supabase) return;
    const db = supabase;
    let cancelled = false;
    let syncTimer: number | null = null;

    async function syncRemoteData() {
      if (cancelled) return;
      const data = await loadEbrData();
      if (cancelled) return;
      applyLoadedData(data);
      refreshLoggedUser(data);
    }

    function scheduleSync() {
      if (syncTimer) window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => void syncRemoteData(), 4000);
    }

    const channel = db
      .channel("ebr-main-data-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, scheduleSync)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, scheduleSync)
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_enrollments" }, scheduleSync)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members" }, scheduleSync)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_records" }, scheduleSync)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, scheduleSync)
      .subscribe();

    return () => {
      cancelled = true;
      if (syncTimer) window.clearTimeout(syncTimer);
      void db.removeChannel(channel);
    };
  }, [dataReady]);

  useEffect(() => {
    if (!dataReady || supabase || isNeonProvider) return;
    writeLocalEbrData({
      students: studentList,
      rooms: roomList,
      pendingEnrollments: pendingList,
      team,
      financialCategories,
      financialEntries,
      exams: examList,
      attendanceRecords,
      settings
    });
  }, [dataReady, studentList, roomList, pendingList, team, financialCategories, financialEntries, examList, attendanceRecords, settings]);

  useEffect(() => {
    if (!user || typeof window === "undefined") {
      backGuardReadyRef.current = false;
      return;
    }

    if (!backGuardReadyRef.current) {
      window.history.pushState({ ebrBackGuard: true }, "", window.location.href);
      backGuardReadyRef.current = true;
    }

    function handleBackNavigation() {
      setSearchTerms({});
      setActiveView("dashboard");
      sessionStorage.setItem(EBR_ACTIVE_VIEW_STORAGE_KEY, "dashboard");
      window.history.pushState({ ebrBackGuard: true }, "", window.location.href);
    }

    window.addEventListener("popstate", handleBackNavigation);
    return () => window.removeEventListener("popstate", handleBackNavigation);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const canAccess = navItems.find((item) => item.key === activeView)?.roles.includes(user.role);
    if (!canAccess) {
      setActiveView("dashboard");
      sessionStorage.setItem(EBR_ACTIVE_VIEW_STORAGE_KEY, "dashboard");
      return;
    }
    sessionStorage.setItem(EBR_ACTIVE_VIEW_STORAGE_KEY, activeView);
  }, [activeView, user]);

  function logout() {
    backGuardReadyRef.current = false;
    sessionStorage.removeItem(EBR_SESSION_STORAGE_KEY);
    sessionStorage.removeItem(EBR_ACTIVE_VIEW_STORAGE_KEY);
    setUser(null);
    setActiveView("dashboard");
  }

  if (dataLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="glass-panel rounded-[1.8rem] p-6 text-center shadow-soft">
          <div className="skeleton mx-auto h-16 w-16 rounded-2xl" />
          <p className="mt-4 text-sm font-bold text-slate-500 dark:text-slate-300">Carregando banco EBR...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (!showStaffLogin) return <PublicLandingPage settings={settings} onOpenStaffLogin={() => setShowStaffLogin(true)} />;
    return <LoginView settings={settings} onBack={() => setShowStaffLogin(false)} onLogin={async (session) => {
      sessionStorage.setItem(EBR_SESSION_STORAGE_KEY, JSON.stringify(session));
      setUser(session.user);
      setDataLoading(true);
      try { const data = await loadEbrData(); applyLoadedData(data); setDataReady(true); } finally { setDataLoading(false); }
    }} />;
  }
  function setSearchForView(view: ViewKey, value: string) {
    setSearchTerms((current) => ({ ...current, [view]: value }));
  }

  function changeView(view: ViewKey) {
    setFollowUpFilterActive(false);
    setBirthdaysTodayOnly(false);
    setSearchTerms((current) => ({ ...current, [activeView]: "" }));
    setActiveView(view);
  }

  function openTodayBirthdays() {
    setFollowUpFilterActive(false);
    setBirthdaysTodayOnly(true);
    setSearchTerms((current) => ({ ...current, [activeView]: "", birthdays: "" }));
    setActiveView("birthdays");
  }

  function openAbsenceFollowUps() {
    setFollowUpFilterActive(true);
    setSearchTerms((current) => ({ ...current, [activeView]: "", students: "" }));
    setActiveView("students");
  }

  function openRoomStudents(roomName: string) {
    setFollowUpFilterActive(false);
    setSearchTerms((current) => ({ ...current, [activeView]: "", students: roomName }));
    setActiveView("students");
  }

  const views: Record<ViewKey, ReactNode> = {
    dashboard: <DashboardView user={user} studentsSource={studentList} roomsSource={roomList} attendanceRecords={attendanceRecords} onOpenBirthdays={openTodayBirthdays} />,
    students: <StudentsView user={user} searchTerm={searchTerms.students ?? ""} setSearchTerm={(value) => setSearchForView("students", value)} studentList={studentList} setStudentList={setStudentList} pendingList={pendingList} setPendingList={setPendingList} roomList={roomList} followUpFilterActive={followUpFilterActive} followUpStudents={followUpStudents} onClearFollowUpFilter={() => setFollowUpFilterActive(false)} onResolveFollowUp={resolveAbsenceFollowUp} />,
    rooms: <RoomsView user={user} searchTerm={searchTerms.rooms ?? ""} setSearchTerm={(value) => setSearchForView("rooms", value)} roomList={roomList} setRoomList={setRoomList} team={team} setTeam={setTeam} studentsSource={studentList} attendanceRecords={attendanceRecords} onOpenRoomStudents={openRoomStudents} />,
    attendance: <AttendanceView user={user} roomsSource={roomList} studentsSource={studentList} attendanceRecords={attendanceRecords} setAttendanceRecords={setAttendanceRecords} setStudents={setStudentList} />,
    exams: <ExamsView user={user} exams={examList} setExams={setExamList} roomsSource={roomList} studentsSource={studentList} />,
    ranking: <RankingView user={user} searchTerm={searchTerms.ranking ?? ""} setSearchTerm={(value) => setSearchForView("ranking", value)} exams={examList} roomsSource={roomList} studentsSource={studentList} attendanceRecords={attendanceRecords} />,
    birthdays: <BirthdaysView user={user} searchTerm={searchTerms.birthdays ?? ""} setSearchTerm={(value) => setSearchForView("birthdays", value)} roomsSource={roomList} studentsSource={studentList} todayOnly={birthdaysTodayOnly} />,
    finance: <FinanceView categories={financialCategories} setCategories={setFinancialCategories} entries={financialEntries} setEntries={setFinancialEntries} readOnly={user.role !== "admin"} />,
    studentPortal: <StudentPortalAdminView user={user} roomsSource={roomList} settings={settings} setSettings={setSettings} />,
    schedule: <TeacherScheduleView user={user} team={team} settings={settings} setSettings={setSettings} />,
    settings: <SettingsView team={team} setTeam={setTeam} roomsSource={roomList} settings={settings} setSettings={setSettings} />
  };

  return (
    <PageShell activeView={activeView} setActiveView={changeView} user={user} onLogout={logout} setSearchTerm={(value) => setSearchForView("students", value)} studentsSource={studentList} attendanceRecords={attendanceRecords} followUpStudents={followUpStudents} onOpenFollowUpStudents={openAbsenceFollowUps} churchName={settings.churchName} brandTitle={settings.sidebarTitle || "EBR"} brandSubtitle={settings.sidebarSubtitle || settings.churchName || "Escola Bíblica Resgatai"} brandImage={settings.sidebarImage || "/ebr-logo.jpg"}>
      <AnimatePresence mode="wait">
        <motion.div key={activeView}>{views[activeView]}</motion.div>
      </AnimatePresence>
      <button
        aria-label="Novo aluno"
        title="Novo aluno"
        onClick={() => changeView("students")}
        className="fixed bottom-5 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-brand-blue text-white shadow-glow transition hover:-translate-y-1 hover:bg-blue-600 lg:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>
    </PageShell>
  );
}






