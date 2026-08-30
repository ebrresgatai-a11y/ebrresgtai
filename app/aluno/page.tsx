"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bell, BookOpenCheck, Camera, Check, DollarSign, ExternalLink, FileText, MessageCircle, MoreHorizontal, Search, Send, Sparkles, Trash2, Upload, UserRoundPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchNeonJson, isNeonProvider } from "@/lib/data-provider";
import { listenForForegroundPush, registerEbrServiceWorker, registerStudentPushToken } from "@/lib/firebase-client";

type Student = {
  id: number;
  ra: string;
  name: string;
  phone: string;
  room: string;
  avatar: string;
  photo?: string;
};

type PortalContent = {
  id: number;
  type: "video" | "message" | "lesson" | "notice";
  title: string;
  body: string;
  mediaUrl: string;
  room: string;
  authorName: string;
  publishedAt: string;
};

type LibraryItem = {
  id: number;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  paymentUrl: string;
  stockQuantity: number;
};

type MinistryItem = {
  id: number;
  title: string;
  description: string;
  price: number;
  paymentKey: string;
  imageUrl: string;
};

type MinistryUnavailableEntry = {
  releaseDate: string;
  studentName?: string;
  method?: string;
  chosenAt?: string;
};

type MinistryUnavailableMap = Record<string, MinistryUnavailableEntry>;

type StudentInteraction = {
  id: number;
  message: string;
  status: string;
  response: string;
  createdAt: string;
};

type InternalNotification = {
  id: number;
  studentId: number;
  roomId?: number;
  title: string;
  message: string;
  type: string;
  link: string;
  read: boolean;
  createdAt: string;
  readAt?: string;
};

type PaymentTarget = {
  type: "book" | "contribution" | "ministry";
  title: string;
  key: string;
  amount?: number;
  itemId?: number;
};

async function neonMutate<T>(entity: string, action: string, payload?: unknown, id?: number) {
  const result = await fetchNeonJson<{ ok: boolean; data: T }>("/api/neon/mutate", {
    method: "POST",
    body: JSON.stringify({ entity, action, payload, id })
  });
  return result.data;
}

const EBR_HELP_PIX_KEY = "ebrresgatai@gmail.com";

const typeLabels = {
  video: "Aulas em vídeo",
  message: "Mensagens do professor",
  lesson: "Lição do dia",
  notice: "Mural de avisos"
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function formatPortalPhone(value: string) {
  const clean = digits(value).slice(0, 11);
  if (clean.length <= 2) return clean;
  if (clean.length <= 6) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  if (clean.length <= 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
}

function normalizePersonName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function significantNameParts(value: string) {
  const ignored = new Set(["de", "da", "do", "das", "dos", "e"]);
  return normalizePersonName(value).split(" ").filter((part) => part && !ignored.has(part));
}

function firstNameAndSurname(value: string) {
  const rawParts = normalizePersonName(value).split(" ").filter(Boolean);
  const meaningfulParts = significantNameParts(value);
  return meaningfulParts.length >= 2 ? meaningfulParts.slice(0, 2).join(" ") : rawParts.slice(0, 2).join(" ");
}

function studentMatchesPortalLogin(studentName: string, query: string) {
  const normalizedStudent = normalizePersonName(studentName);
  const normalizedQuery = normalizePersonName(query);
  const meaningfulStudent = significantNameParts(studentName).join(" ");
  const meaningfulQuery = significantNameParts(query).join(" ");
  return normalizedStudent === normalizedQuery || firstNameAndSurname(studentName) === meaningfulQuery || meaningfulStudent.startsWith(meaningfulQuery + " ");
}

function lessonEndOfWeek(value: string) {
  const start = value ? new Date(value) : new Date();
  if (Number.isNaN(start.getTime())) return new Date();
  const end = new Date(start);
  const daysUntilSunday = (7 - end.getDay()) % 7;
  end.setDate(end.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);
  return end;
}

function isVisibleContent(item: PortalContent) {
  if (item.type !== "lesson") return true;
  return new Date() <= lessonEndOfWeek(item.publishedAt);
}

function isRecentInteraction(item: StudentInteraction) {
  if (!item.createdAt) return true;
  return new Date(item.createdAt).getTime() >= Date.now() - 3 * 24 * 60 * 60 * 1000;
}

function parseMinistryUnavailableItems(value?: string): MinistryUnavailableMap {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.entries(parsed as Record<string, unknown>).reduce<MinistryUnavailableMap>((acc, [key, raw]) => {
      if (typeof raw === "string") {
        acc[key] = { releaseDate: raw };
        return acc;
      }
      if (raw && typeof raw === "object") {
        const entry = raw as Record<string, unknown>;
        const releaseDate = String(entry.releaseDate || entry.until || entry.date || "");
        if (releaseDate) {
          acc[key] = {
            releaseDate,
            studentName: typeof entry.studentName === "string" ? entry.studentName : undefined,
            method: typeof entry.method === "string" ? entry.method : undefined,
            chosenAt: typeof entry.chosenAt === "string" ? entry.chosenAt : undefined
          };
        }
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function toLocalInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function getTodayInputDate() {
  return toLocalInputDate(new Date());
}

function getNextSundayInputDate(reference = new Date()) {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  const daysUntilSunday = (7 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + daysUntilSunday);
  return toLocalInputDate(date);
}

function whatsappTarget(value: string) {
  const clean = digits(value);
  if (!clean) return "";
  return clean.startsWith("55") ? clean : `55${clean}`;
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

const STUDENT_CORE_COLUMNS = "id,ra,name,phone,room,avatar";
const STUDENT_FULL_COLUMNS = STUDENT_CORE_COLUMNS + ",photo";

function fromDbStudent(row: any): Student {
  return {
    id: Number(row.id),
    ra: row.ra ?? "",
    name: row.name ?? "",
    phone: row.phone ?? "",
    room: row.room ?? "",
    avatar: row.avatar || initials(row.name ?? "Aluno"),
    photo: row.photo ?? undefined
  };
}

function fromDbContent(row: any): PortalContent {
  return {
    id: Number(row.id),
    type: row.type,
    title: row.title ?? "",
    body: row.body ?? "",
    mediaUrl: row.media_url ?? "",
    room: row.room ?? "Geral",
    authorName: row.author_name ?? "EBR",
    publishedAt: row.published_at ?? ""
  };
}

function fromDbLibrary(row: any): LibraryItem {
  return {
    id: Number(row.id),
    title: row.title ?? "",
    description: row.description ?? "",
    price: Number(row.price ?? 0),
    imageUrl: row.image_url ?? "",
    paymentUrl: row.payment_url ?? "",
    stockQuantity: Number(row.stock_quantity ?? 0)
  };
}

function fromDbMinistry(row: any): MinistryItem {
  return {
    id: Number(row.id),
    title: row.title ?? "",
    description: row.description ?? "",
    price: Number(row.price ?? 0),
    paymentKey: row.payment_key ?? "",
    imageUrl: row.image_url ?? ""
  };
}

function fromDbInteraction(row: any): StudentInteraction {
  return {
    id: Number(row.id),
    message: row.message ?? "",
    status: row.status ?? "novo",
    response: row.response ?? "",
    createdAt: row.created_at ?? ""
  };
}

function StudentAvatar({ student, large = false }: { student: Student; large?: boolean }) {
  const sizeClass = large ? "h-20 w-20 text-xl ring-4" : "h-16 w-16 text-lg ring-2 sm:ring-4";
  if (student.photo) return <img src={student.photo} alt={`Foto de ${student.name}`} className={`${sizeClass} shrink-0 rounded-full object-cover object-center ring-white/70`} />;
  return <div className={`grid ${sizeClass} shrink-0 place-items-center rounded-full bg-brand-blue font-extrabold text-white ring-white/70`}>{student.avatar}</div>;
}

function isImageMediaUrl(value: string) {
  return value.startsWith("data:image/") || /\.(?:avif|bmp|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(value);
}

function isPdfMediaUrl(value: string) {
  return value.startsWith("data:application/pdf") || /\.pdf(?:[?#].*)?$/i.test(value);
}

function openPdfMediaUrl(value: string, title: string) {
  if (typeof window === "undefined") return;
  if (!value.startsWith("data:application/pdf")) {
    window.open(value, "_blank", "noopener,noreferrer");
    return;
  }

  const [header, base64 = ""] = value.split(",");
  const mime = header.match(/^data:([^;]+)/)?.[1] || "application/pdf";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "material-ebr"}.pdf`;
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function MediaAttachment({ item, compact = false }: { item: PortalContent; compact?: boolean }) {
  if (!item.mediaUrl) return null;
  if (isImageMediaUrl(item.mediaUrl)) {
    return (
      <a href={item.mediaUrl} target="_blank" rel="noreferrer" className={`${compact ? "mt-2 rounded-xl" : "mt-3 rounded-2xl"} block overflow-hidden bg-slate-100 dark:bg-slate-800`}>
        <img src={item.mediaUrl} alt={item.title} className={`${compact ? "max-h-52" : "max-h-96"} w-full object-contain`} loading="lazy" />
      </a>
    );
  }
  if (isPdfMediaUrl(item.mediaUrl)) {
    return (
      <button type="button" onClick={() => openPdfMediaUrl(item.mediaUrl, item.title)} className={`${compact ? "mt-2 gap-1.5 px-3 py-1.5 text-[0.68rem]" : "mt-3 gap-2 px-4 py-2 text-xs"} inline-flex items-center rounded-full bg-brand-blue font-extrabold text-white transition hover:bg-brand-deep active:scale-95`}>
        <FileText className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> Abrir PDF
      </button>
    );
  }
  return (
    <a href={item.mediaUrl} target="_blank" rel="noreferrer" className={`${compact ? "mt-2 gap-1.5 px-3 py-1.5 text-[0.68rem]" : "mt-3 gap-2 px-4 py-2 text-xs"} inline-flex items-center rounded-full bg-brand-blue font-extrabold text-white`}>
      <ExternalLink className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> Abrir link
    </a>
  );
}

function ContentSection({ title, icon, items }: { title: string; icon: React.ReactNode; items: PortalContent[] }) {
  return (
    <section className="rounded-[1.6rem] bg-white p-4 shadow-soft dark:bg-slate-950 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-deep text-white">{icon}</div>
        <h2 className="text-lg font-extrabold text-brand-deep dark:text-white">{title}</h2>
      </div>
      <div className="grid gap-3">
        {items.length ? items.map((item) => (
          <article key={item.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
            <p className="text-xs font-bold uppercase text-brand-blue">{item.room}</p>
            <h3 className="mt-1 text-base font-extrabold text-brand-deep dark:text-white">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.body}</p>
            <MediaAttachment item={item} />
          </article>
        )) : <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-slate-900">Nada publicado ainda.</p>}
      </div>
    </section>
  );
}

function InteractionHistory({ title, items, emptyText }: { title: string; items: StudentInteraction[]; emptyText: string }) {
  return (
    <div className="rounded-[1.6rem] bg-white p-4 shadow-soft dark:bg-slate-950 sm:p-5">
      <h2 className="text-lg font-extrabold text-brand-deep dark:text-white">{title}</h2>
      <div className="mt-3 space-y-3">
        {items.length ? items.map((item) => (
          <article key={item.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-extrabold uppercase text-brand-blue">{item.status}</p>
              <p className="text-xs font-semibold text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleDateString("pt-BR") : ""}</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.message}</p>
            <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-brand-deep dark:bg-slate-800 dark:text-blue-100">
              {item.response || "Aguardando resposta do professor."}
            </div>
          </article>
        )) : <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-slate-900">{emptyText}</p>}
      </div>
    </div>
  );
}

export default function StudentPortalPage() {
  const [query, setQuery] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [contents, setContents] = useState<PortalContent[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [ministryItems, setMinistryItems] = useState<MinistryItem[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [question, setQuestion] = useState("");
  const [prayer, setPrayer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<StudentInteraction[]>([]);
  const [prayers, setPrayers] = useState<StudentInteraction[]>([]);
  const [purchaseFeedback, setPurchaseFeedback] = useState("");
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);
  const [copiedPaymentKey, setCopiedPaymentKey] = useState(false);
  const [selectedMinistryItemIds, setSelectedMinistryItemIds] = useState<number[]>([]);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const frontCameraInputRef = useRef<HTMLInputElement | null>(null);
  const backCameraInputRef = useRef<HTMLInputElement | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<"contents" | "library" | "talk" | "ministry">("contents");
  const [notifications, setNotifications] = useState<InternalNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pushFeedback, setPushFeedback] = useState("");
  const [pushActivating, setPushActivating] = useState(false);

  const visibleContents = useMemo(() => {
    if (!student) return [];
    return contents.filter((item) => (item.room === "Geral" || item.room === student.room) && isVisibleContent(item));
  }, [contents, student]);

  useEffect(() => {
    setProfileName(student?.name ?? "");
    setProfileFeedback("");
  }, [student?.id, student?.name]);

  useEffect(() => {
    setCopiedPaymentKey(false);
  }, [paymentTarget?.title, paymentTarget?.type]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const section = new URLSearchParams(window.location.search).get("section");
    if (section === "contents" || section === "library" || section === "talk" || section === "ministry") setMobileSection(section);
    void registerEbrServiceWorker().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!student || !isNeonProvider) return;
    let active = true;
    let stopForegroundListener: () => void = () => undefined;
    const currentStudent = student;
    void loadStudentNotifications(currentStudent.id);
    void listenForForegroundPush((payload) => {
      if (!active) return;
      setPushFeedback(payload.title + ": " + payload.message);
      void loadStudentNotifications(currentStudent.id);
    }).then((unsubscribe) => { stopForegroundListener = unsubscribe; });
    const timer = window.setInterval(() => void loadStudentNotifications(currentStudent.id), 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
      stopForegroundListener();
    };
  }, [student?.id]);

  useEffect(() => {
    if (!student || !isNeonProvider || typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    void registerStudentPushToken(student.id);
  }, [student?.id]);

  useEffect(() => {
    if (!student || isNeonProvider || !supabase) return;
    const db = supabase;
    const currentStudent = student;
    let syncTimer: number | null = null;
    function scheduleInteractionSync() {
      if (syncTimer) window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => void loadStudentInteractions(currentStudent), 900);
    }
    const channel = db
      .channel("ebr-student-interactions-" + currentStudent.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_questions", filter: "student_id=eq." + currentStudent.id }, scheduleInteractionSync)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_prayer_requests", filter: "student_id=eq." + currentStudent.id }, scheduleInteractionSync)
      .subscribe();
    return () => {
      if (syncTimer) window.clearTimeout(syncTimer);
      void db.removeChannel(channel);
    };
  }, [student?.id]);

  async function loadStudentNotifications(studentId: number) {
    try {
      const data = await fetchNeonJson<{ items: InternalNotification[]; unread: number }>("/api/push/notifications?" + new URLSearchParams({ alunoId: String(studentId) }).toString());
      setNotifications(data.items ?? []);
    } catch {
      setNotifications([]);
    }
  }

  async function enablePushNotifications(studentId: number) {
    if (pushActivating) return;
    setPushActivating(true);
    setPushFeedback("Solicitando permissão...");
    try {
      const result = await registerStudentPushToken(studentId);
      setPushFeedback(result.message);
    } finally {
      setPushActivating(false);
    }
  }

  function destinationSection(link: string) {
    try {
      const section = new URL(link, window.location.origin).searchParams.get("section");
      return section === "contents" || section === "library" || section === "talk" || section === "ministry" ? section : "contents";
    } catch {
      return "contents";
    }
  }

  async function openInternalNotification(item: InternalNotification) {
    if (!student) return;
    if (!item.read) {
      await fetch("/api/push/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alunoId: student.id, notificationId: item.id }) }).catch(() => undefined);
      setNotifications((current) => current.filter((entry) => entry.id !== item.id));
    }
    setMobileSection(destinationSection(item.link));
    setNotificationsOpen(false);
  }

  async function markAllNotificationsRead() {
    if (!student) return;
    await fetch("/api/push/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alunoId: student.id, markAll: true }) }).catch(() => undefined);
    setNotifications([]);
  }

  async function logoutStudent() {
    sessionStorage.removeItem("ebr-student-session");
    setNotifications([]);
    setStudent(null);
  }

  async function loadStudentInteractions(currentStudent: Student) {
    if (isNeonProvider) {
      const data = await fetchNeonJson<{ questions: StudentInteraction[]; prayers: StudentInteraction[] }>("/api/neon/portal?" + new URLSearchParams({ audience: "student", studentId: String(currentStudent.id), room: currentStudent.room }).toString());
      setQuestions((data.questions ?? []).filter(isRecentInteraction));
      setPrayers((data.prayers ?? []).filter(isRecentInteraction));
      return;
    }
    if (!supabase) return;
    const [questionResult, prayerResult] = await Promise.all([
      supabase.from("student_questions").select("*").eq("student_id", currentStudent.id).order("created_at", { ascending: false }).limit(60),
      supabase.from("student_prayer_requests").select("*").eq("student_id", currentStudent.id).order("created_at", { ascending: false }).limit(60)
    ]);
    setQuestions((questionResult.data ?? []).map(fromDbInteraction).filter(isRecentInteraction));
    setPrayers((prayerResult.data ?? []).map(fromDbInteraction).filter(isRecentInteraction));
  }

  async function loadPortalForStudent(found: Student) {
    if (isNeonProvider) {
      const data = await fetchNeonJson<{ contents: PortalContent[]; libraryItems: LibraryItem[]; ministryItems: MinistryItem[]; settings: Record<string, string>; questions: StudentInteraction[]; prayers: StudentInteraction[] }>("/api/neon/portal?" + new URLSearchParams({ audience: "student", studentId: String(found.id), room: found.room }).toString());
      setStudent(found);
      setContents(data.contents ?? []);
      setLibraryItems(data.libraryItems ?? []);
      setMinistryItems(data.ministryItems ?? []);
      setSettings(data.settings ?? {});
      setQuestions((data.questions ?? []).filter(isRecentInteraction));
      setPrayers((data.prayers ?? []).filter(isRecentInteraction));
      return;
    }
    if (!supabase) return;
    const [contentResult, libraryResult, ministryResult, settingsResult] = await Promise.all([
      supabase.from("student_portal_contents").select("*").eq("active", true).in("room", ["Geral", found.room]).order("published_at", { ascending: false }),
      supabase.from("student_library_items").select("id,title,description,price,image_url,payment_url,stock_quantity,active").eq("active", true).order("created_at", { ascending: false }),
      supabase.from("student_ministry_items").select("id,title,description,price,payment_key,image_url,active").eq("active", true).order("created_at", { ascending: false }),
      supabase.from("app_settings").select("*").eq("key", "general").maybeSingle()
    ]);
    setStudent(found);
    setContents((contentResult.data ?? []).map(fromDbContent));
    setLibraryItems((libraryResult.data ?? []).map(fromDbLibrary));
    setMinistryItems((ministryResult.data ?? []).map(fromDbMinistry));
    setSettings((settingsResult.data?.value as Record<string, string> | null) ?? {});
    await loadStudentInteractions(found);
  }

  useEffect(() => {
    const savedId = sessionStorage.getItem("ebr-student-session");
    if (!savedId) return;
    setLoading(true);
    if (isNeonProvider) {
      fetchNeonJson<{ students: Student[] }>("/api/neon/portal?audience=studentLookup").then(async ({ students }) => {
        const found = students.find((item) => item.id === Number(savedId));
        if (!found) {
          sessionStorage.removeItem("ebr-student-session");
          setLoading(false);
          return;
        }
        await loadPortalForStudent(found);
        setLoading(false);
      });
      return;
    }
    if (!supabase) return;
    supabase.from("students").select(STUDENT_FULL_COLUMNS).eq("id", Number(savedId)).maybeSingle().then(async ({ data }) => {
      if (!data) {
        sessionStorage.removeItem("ebr-student-session");
        setLoading(false);
        return;
      }
      await loadPortalForStudent(fromDbStudent(data));
      setLoading(false);
    });
  }, []);

  async function enterPortal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setLoading(true);
    if (!isNeonProvider && !supabase) {
      setFeedback("Portal indisponível no momento.");
      setLoading(false);
      return;
    }
    const cleanQuery = normalizePersonName(query);
    if (cleanQuery.split(" ").length < 2) {
      setFeedback("Digite seu nome e sobrenome para acessar.");
      setLoading(false);
      return;
    }
    if (isNeonProvider) {
      const { students } = await fetchNeonJson<{ students: Student[] }>("/api/neon/portal?audience=studentLookup");
      const found = (students ?? []).find((item) => studentMatchesPortalLogin(item.name, cleanQuery));
      if (!found) {
        setFeedback("Aluno não encontrado. Confira nome e sobrenome ou procure sua secretaria/professor.");
        setLoading(false);
        return;
      }
      sessionStorage.setItem("ebr-student-session", String(found.id));
      await loadPortalForStudent(found);
      setLoading(false);
      return;
    }
    const { data: studentRows, error } = await supabase!.from("students").select(STUDENT_CORE_COLUMNS);
    if (error) {
      setFeedback("Não foi possível consultar seu cadastro agora.");
      setLoading(false);
      return;
    }
    const found = (studentRows ?? []).map(fromDbStudent).find((item) => studentMatchesPortalLogin(item.name, cleanQuery));
    if (!found) {
      setFeedback("Aluno não encontrado. Confira nome e sobrenome ou procure sua secretaria/professor.");
      setLoading(false);
      return;
    }
    const { data: fullStudent } = await supabase!.from("students").select(STUDENT_FULL_COLUMNS).eq("id", found.id).maybeSingle();
    const selectedStudent = fullStudent ? fromDbStudent(fullStudent) : found;
    sessionStorage.setItem("ebr-student-session", String(selectedStudent.id));
    await loadPortalForStudent(selectedStudent);
    setLoading(false);
  }

  function readProfilePhoto(file?: File) {
    if (!file || !student || (!isNeonProvider && !supabase)) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await saveStudentPhoto(String(reader.result));
    };
    reader.readAsDataURL(file);
  }

  async function saveStudentName() {
    if (!student || (!isNeonProvider && !supabase)) return;
    const cleanName = profileName.trim().replace(/\s+/g, " ");
    if (!cleanName || cleanName.length < 3) {
      setProfileFeedback("Informe um nome valido.");
      return;
    }
    setProfileSaving(true);
    const nextStudent = { ...student, name: cleanName, avatar: initials(cleanName) };
    setStudent(nextStudent);
    const error = isNeonProvider ? null : (await supabase!.from("students").update({ name: cleanName, avatar: nextStudent.avatar }).eq("id", student.id)).error;
    if (isNeonProvider) await neonMutate<Student>("student", "update", nextStudent, student.id);
    setProfileSaving(false);
    setProfileFeedback(error ? "Não foi possível salvar o nome agora." : "Nome atualizado.");
    if (error) setStudent(student);
  }

  async function saveStudentPhoto(photo: string | null) {
    if (!student || !supabase) return;
    setProfileSaving(true);
    const nextStudent = { ...student, photo: photo || undefined };
    setStudent(nextStudent);
    const error = isNeonProvider ? null : (await supabase!.from("students").update({ photo }).eq("id", student.id)).error;
    if (isNeonProvider) await neonMutate<Student>("student", "update", nextStudent, student.id);
    setProfileSaving(false);
    setProfileFeedback(error ? "Não foi possível atualizar a foto agora." : photo ? "Foto atualizada." : "Foto removida.");
    if (error) setStudent(student);
  }

  async function sendInteraction(type: "question" | "prayer") {
    if (!student || (!isNeonProvider && !supabase)) return;
    const message = type === "question" ? question.trim() : prayer.trim();
    if (!message) return;
    const table = type === "question" ? "student_questions" : "student_prayer_requests";
    const error = isNeonProvider ? null : (await supabase!.from(table).insert({
      student_id: student.id,
      student_name: student.name,
      room: student.room,
      message,
      status: "novo",
      response: ""
    })).error;
    if (isNeonProvider) await neonMutate<StudentInteraction>("interaction", "create", { table, studentId: student.id, studentName: student.name, room: student.room, message, status: "novo", response: "" });
    if (error) {
      setFeedback("Não foi possível enviar agora. Tente novamente.");
      return;
    }
    if (type === "question") setQuestion("");
    else setPrayer("");
    setFeedback(type === "question" ? "Pergunta enviada ao professor." : "Pedido de oração enviado.");
    await loadStudentInteractions(student);
  }

  function crc16(payload: string) {
    let crc = 0xffff;
    for (let offset = 0; offset < payload.length; offset++) {
      crc ^= payload.charCodeAt(offset) << 8;
      for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
  }

  function pixField(id: string, value: string) {
    const clean = value.slice(0, 99);
    return id + String(new TextEncoder().encode(clean).length).padStart(2, "0") + clean;
  }

  function normalizePixKey(value: string) {
    const key = value.trim();
    if (key.startsWith("000201")) return key;
    if (key.includes("@")) return key.toLowerCase();
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(key)) return key.toLowerCase();
    const numeric = key.replace(/\D/g, "");
    if (key.startsWith("+")) return "+" + numeric;
    if ((numeric.length === 12 || numeric.length === 13) && numeric.startsWith("55")) return "+" + numeric;
    if ((numeric.length === 10 || numeric.length === 11) && (key !== numeric || numeric.length === 10 || numeric[2] === "9")) return "+55" + numeric;
    return key;
  }

  function pixPayload(target: PaymentTarget) {
    const key = normalizePixKey(target.key);
    if (key.startsWith("000201")) return key;
    const merchantName = (settings.churchName || "EBR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]/g, "").slice(0, 25) || "EBR";
    const merchantCity = "FORTALEZA";
    const merchantAccount = pixField("00", "BR.GOV.BCB.PIX") + pixField("01", key);
    let payload = pixField("00", "01") + pixField("26", merchantAccount) + pixField("52", "0000") + pixField("53", "986");
    if (target.amount && target.amount > 0) payload += pixField("54", target.amount.toFixed(2));
    payload += pixField("58", "BR") + pixField("59", merchantName) + pixField("60", merchantCity) + pixField("62", pixField("05", String(target.itemId ?? "EBR")));
    const withoutCrc = payload + "6304";
    return withoutCrc + crc16(withoutCrc);
  }

  function qrCodeUrl(target: PaymentTarget) {
    return "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" + encodeURIComponent(pixPayload(target));
  }

  async function copyPaymentKey(value: string) {
    const key = value.trim();
    if (!key) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(key);
        return true;
      }
    } catch {
      // Tenta o fallback abaixo para navegadores mobile com clipboard restrito.
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = key;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }

  async function copyPaymentKeyWithFeedback(target: PaymentTarget) {
    const copied = await copyPaymentKey(target.key);
    setCopiedPaymentKey(copied);
    const message = copied ? "Código Pix copiado." : "Copie o código Pix manualmente.";
    if (target.type === "book") setPurchaseFeedback(message);
    else setFeedback(message);
    if (copied) window.setTimeout(() => setCopiedPaymentKey(false), 2200);
  }

  function openPayment(target: PaymentTarget) {
    if (!target.key.trim()) {
      const message = "Chave de pagamento não cadastrada ainda.";
      if (target.type === "book") setPurchaseFeedback(message);
      else setFeedback(message);
      return;
    }
    setCopiedPaymentKey(false);
    setPaymentTarget(target);
    void copyPaymentKey(pixPayload(target));
  }

  function paymentResponsiblePhone(targetType: PaymentTarget["type"]) {
    return whatsappTarget(targetType === "book" ? settings.libraryWhatsapp ?? "" : settings.ministryWhatsapp ?? "");
  }

  function paymentNoticeText(target: PaymentTarget) {
    const studentName = student?.name ?? "Aluno";
    return target.type === "book"
      ? studentName + " confirmou pagamento do livro " + target.title + " no portal EBR. Valor: R$ " + (target.amount ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "."
      : target.type === "ministry"
        ? studentName + " confirmou pagamento de " + target.title + " no portal EBR. Valor: R$ " + (target.amount ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "."
        : studentName + " confirmou uma contribuição pelo portal EBR.";
  }

  function paymentWhatsappUrl(target: PaymentTarget) {
    const phone = paymentResponsiblePhone(target.type);
    return phone ? "https://wa.me/" + phone + "?text=" + encodeURIComponent(paymentNoticeText(target)) : "";
  }

  function openWhatsappUrl(url: string) {
    if (!url) return false;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  }

  function notifyPaymentResponsible(target: PaymentTarget) {
    return openWhatsappUrl(paymentWhatsappUrl(target));
  }

  function missingPaymentContactMessage(targetType: PaymentTarget["type"]) {
    return targetType === "book"
      ? "Pagamento confirmado, mas cadastre o WhatsApp da livraria no admin para receber avisos."
      : "Pagamento confirmado, mas cadastre o WhatsApp geral do ministério no admin para receber avisos.";
  }

  function ministryUnavailableMap() {
    return parseMinistryUnavailableItems(settings.ministryUnavailableItems);
  }

  function ministryReleaseDate() {
    return getNextSundayInputDate();
  }

  function ministryUnavailableEntry(item: MinistryItem) {
    const entry = ministryUnavailableMap()[String(item.id)];
    return entry?.releaseDate && entry.releaseDate > getTodayInputDate() ? entry : null;
  }

  function ministryUnavailableUntil(item: MinistryItem) {
    return ministryUnavailableEntry(item)?.releaseDate ?? "";
  }

  async function markMinistryItemsUnavailable(ids: number[], method: "pix" | "cash" | "take") {
    const nextUnavailable = ids.reduce<MinistryUnavailableMap>((current, id) => ({
      ...current,
      [String(id)]: {
        releaseDate: ministryReleaseDate(),
        studentName: student?.name ?? "Aluno",
        method,
        chosenAt: new Date().toISOString()
      }
    }), ministryUnavailableMap());
    const nextSettings = { ...settings, ministryUnavailableItems: JSON.stringify(nextUnavailable) };
    if (isNeonProvider) {
      const reserved = await neonMutate<{ ministryUnavailableItems: string }>("ministryChoice", "create", { itemIds: ids, studentId: student?.id, method });
      setSettings((current) => ({ ...current, ministryUnavailableItems: reserved.ministryUnavailableItems }));
      return;
    }
    setSettings(nextSettings);
    if (supabase) await supabase.from("app_settings").upsert({ key: "general", value: nextSettings, updated_at: new Date().toISOString() });
  }
  async function confirmPayment(target: PaymentTarget, options: { skipWhatsapp?: boolean } = {}) {
    const notified = options.skipWhatsapp ? Boolean(paymentResponsiblePhone(target.type)) : notifyPaymentResponsible(target);
    const copied = await copyPaymentKey(pixPayload(target));
    if (target.type === "book" && target.itemId) {
      const item = libraryItems.find((entry) => entry.id === target.itemId);
      const nextStock = Math.max(0, Number(item?.stockQuantity ?? 0) - 1);
      setLibraryItems((current) => current.map((entry) => entry.id === target.itemId ? { ...entry, stockQuantity: nextStock } : entry));
      if (isNeonProvider && item) await neonMutate<LibraryItem>("libraryItem", "update", { ...item, stockQuantity: nextStock }, target.itemId);
      else if (supabase) await supabase.from("student_library_items").update({ stock_quantity: nextStock, updated_at: new Date().toISOString() }).eq("id", target.itemId);
    }
    if (target.type === "ministry" && target.itemId) await markMinistryItemsUnavailable([target.itemId], "pix");
    const message = notified ? (copied ? "Pagamento confirmado. O código Pix foi copiado e o responsável foi avisado." : "Pagamento confirmado. O responsável foi avisado.") : missingPaymentContactMessage(target.type);
    if (target.type === "book") setPurchaseFeedback(message);
    else setFeedback(message);
    setPaymentTarget(null);
  }

  function handleBookPurchase(item: LibraryItem) {
    if (item.stockQuantity <= 0) { setPurchaseFeedback("Este livro está esgotado no momento."); return; }
    const libraryPix = String(settings.libraryPaymentUrl ?? "").trim();
    if (!libraryPix) { setPurchaseFeedback("Cadastre o Pix da livraria no admin para vender livros."); return; }
    openPayment({ type: "book", title: item.title, key: libraryPix, amount: item.price, itemId: item.id });
  }

  function handleContributionPayment() {
    openPayment({ type: "contribution", title: "Contribuição EBR", key: settings.ministryPaymentUrl ?? "" });
  }

  function toggleMinistryItem(itemId: number) {
    setSelectedMinistryItemIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
  }

  async function handleMinistryPayment(method: "pix" | "cash" | "take") {
    const selectedItems = ministryItems.filter((item) => selectedMinistryItemIds.includes(item.id) && !ministryUnavailableUntil(item));
    if (!selectedItems.length) {
      setFeedback("Escolha pelo menos um produto antes de informar o pagamento.");
      return;
    }
    const ministryPhone = paymentResponsiblePhone("ministry");
    const studentName = student?.name ?? "Aluno";
    const amount = selectedItems.reduce((sum, item) => sum + item.price, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const methodLabel = method === "pix" ? "pagar via Pix" : method === "cash" ? "pagar em dinheiro" : "levar";
    const itemList = selectedItems.map((item) => `${item.title} (R$ ${item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`).join(", ");
    const message = `${studentName} escolheu ${selectedItems.length} produto(s) no portal EBR: ${itemList}. Total: R$ ${amount}. Forma: ${methodLabel}.${method === "pix" ? ` Chave Pix: ${EBR_HELP_PIX_KEY}.` : ""}`;
    const whatsappUrl = ministryPhone ? "https://wa.me/" + ministryPhone + "?text=" + encodeURIComponent(message) : "";
    const notified = openWhatsappUrl(whatsappUrl);
    try {
      await markMinistryItemsUnavailable(selectedItems.map((item) => item.id), method);
      setSelectedMinistryItemIds([]);
      setFeedback(notified ? "Solicitação enviada ao responsável pelo WhatsApp." : "Produtos removidos da lista até o próximo domingo. Cadastre o WhatsApp geral do ministério no admin para receber avisos.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível registrar a escolha agora.");
    }
  }
  const visibleMinistryItems = ministryItems;
  const selectedMinistryItems = visibleMinistryItems.filter((item) => selectedMinistryItemIds.includes(item.id) && !ministryUnavailableUntil(item));
  const selectedMinistryTotal = selectedMinistryItems.reduce((sum, item) => sum + item.price, 0);

  const mobileSectionButtons = [
    { key: "contents", label: "Conteúdos", count: visibleContents.length },
    { key: "library", label: "Livraria", count: libraryItems.length },
    { key: "talk", label: "Perguntas", count: questions.length + prayers.length },
    { key: "ministry", label: "Lista", count: visibleMinistryItems.length }
  ] as const;

  const videos = visibleContents.filter((item) => item.type === "video");
  const messages = visibleContents.filter((item) => item.type === "message");
  const lessons = visibleContents.filter((item) => item.type === "lesson");
  const notices = visibleContents.filter((item) => item.type === "notice");
  const mobileContentItems = [...lessons, ...messages, ...notices, ...videos];
  const unreadItems = notifications.filter((item) => !item.read);
  const unreadNotifications = unreadItems.length;

  if (!student) {
    return (
      <main className="grid min-h-screen place-items-center px-4 py-8">
        <form onSubmit={enterPortal} className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-soft dark:bg-slate-950 sm:p-8">
          <div className="mb-6 flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-deep text-white"><UserRoundPlus className="h-7 w-7" /></div>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-blue">Portal do Aluno</p>
              <h1 className="text-3xl font-extrabold text-brand-deep dark:text-white">Entrar na EBR</h1>
            </div>
          </div>
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Nome e sobrenome</span>
            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <Search className="mr-2 h-4 w-4 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} type="text" autoCapitalize="words" className="w-full bg-transparent text-sm outline-none" placeholder="Ex: Ana Beatriz" />
            </div>
          </label>
          {feedback ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:bg-red-500/10 dark:text-red-200">{feedback}</p> : null}
          <button disabled={loading} className="mt-6 w-full rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white disabled:opacity-70">{loading ? "Entrando..." : "Acessar portal"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <section className="mx-auto max-w-6xl space-y-3 sm:space-y-5">
        <div className="rounded-[1.25rem] bg-brand-deep p-3 text-white shadow-soft sm:rounded-[2rem] sm:p-6">
          <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <StudentAvatar student={student} />
              <div className="min-w-0 flex-1">
                <p className="break-words text-[0.65rem] font-bold uppercase leading-4 tracking-[0.1em] text-blue-100 sm:text-sm sm:tracking-[0.18em]">Minha sala: {student.room}</p>
                <h1 className="mt-1 break-words text-lg font-extrabold leading-tight min-[380px]:text-xl sm:text-4xl">Olá, {student.name}</h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
              <div className="relative">
                <button type="button" aria-label="Notificações" title="Notificações" onClick={() => { setNotificationsOpen((current) => !current); setProfileMenuOpen(false); }} className="relative grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/15">
                  <Bell className="h-4 w-4" />
                  {unreadNotifications ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[0.65rem] font-extrabold text-white">{Math.min(unreadNotifications, 99)}</span> : null}
                </button>
                {notificationsOpen ? (
                  <div className="fixed inset-x-3 top-4 z-50 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[1.6rem] bg-white p-4 text-brand-deep shadow-2xl ring-1 ring-slate-200 dark:bg-slate-950 dark:text-white dark:ring-slate-800 sm:absolute sm:inset-auto sm:right-0 sm:top-12 sm:w-[min(25rem,calc(100vw-2rem))]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-brand-blue">Notificações</p>
                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{unreadNotifications} não lida(s)</p>
                      </div>
                      {unreadNotifications ? <button type="button" onClick={() => void markAllNotificationsRead()} className="text-xs font-extrabold text-brand-blue">Marcar todas</button> : null}
                    </div>
                    <div className="mt-3 space-y-2">
                      {unreadItems.length ? unreadItems.slice(0, 12).map((item) => (
                        <button key={item.id} type="button" onClick={() => void openInternalNotification(item)} className="w-full rounded-2xl bg-blue-50 p-3 text-left ring-1 ring-blue-100 transition dark:bg-blue-500/10 dark:ring-blue-500/20">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-extrabold text-brand-deep dark:text-white">{item.title}</p>
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-blue" />
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{item.message}</p>
                          <p className="mt-1 text-[0.68rem] font-bold text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleString("pt-BR") : ""}</p>
                        </button>
                      )) : <p className="rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-500 dark:bg-slate-900">Nenhuma notificação ainda.</p>}
                    </div>
                    {pushFeedback ? <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{pushFeedback}</p> : null}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" disabled={pushActivating} onClick={() => void enablePushNotifications(student.id)} className="rounded-full bg-brand-blue px-3 py-2 text-xs font-extrabold text-white transition disabled:cursor-wait disabled:opacity-60">{pushActivating ? "Ativando..." : "Ativar notificações"}</button>
                      <button type="button" onClick={() => setNotificationsOpen(false)} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Fechar</button>
                    </div>
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={() => { setProfileMenuOpen((current) => !current); setNotificationsOpen(false); }} className="inline-flex h-10 items-center gap-1 rounded-full bg-white/10 px-3 text-xs font-extrabold text-white transition hover:bg-white/15 sm:gap-2 sm:px-4 sm:text-sm">
                <span className="hidden min-[390px]:inline">Meu perfil</span>
                <MoreHorizontal className="h-4 w-4" />
              </button>
              <button onClick={() => void logoutStudent()} className="h-10 rounded-full bg-white/10 px-3 text-xs font-extrabold text-white transition hover:bg-white/15 sm:px-4 sm:text-sm">Sair</button>
              {profileMenuOpen ? (
                <div className="fixed inset-x-3 top-4 z-50 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[1.6rem] bg-white p-4 text-brand-deep shadow-2xl ring-1 ring-slate-200 dark:bg-slate-950 dark:text-white dark:ring-slate-800 sm:absolute sm:inset-auto sm:right-6 sm:top-28 sm:w-[min(24rem,calc(100vw-2rem))]">
                  <div className="flex items-start gap-3">
                    <StudentAvatar student={student} large />
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-brand-blue">Meu perfil</p>
                      <p className="break-words text-xs font-bold text-slate-500 dark:text-slate-400">Atualize nome e foto</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2">
                    <input
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                      className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      placeholder="Seu nome completo"
                    />
                    <button type="button" disabled={profileSaving} onClick={saveStudentName} className="rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5 disabled:opacity-70">
                      {profileSaving ? "Salvando..." : "Salvar nome"}
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                    <button type="button" onClick={() => galleryInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-extrabold text-brand-blue transition hover:bg-blue-100 dark:bg-blue-500/10"><Upload className="h-4 w-4" /> Galeria</button>
                    <button type="button" onClick={() => backCameraInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200"><Camera className="h-4 w-4" /> Traseira</button>
                    <button type="button" onClick={() => frontCameraInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"><Camera className="h-4 w-4" /> Frontal</button>
                    {student.photo ? <button type="button" onClick={() => void saveStudentPhoto(null)} className="inline-flex items-center justify-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-200"><Trash2 className="h-4 w-4" /> Remover</button> : null}
                  </div>
                  <input ref={galleryInputRef} className="sr-only" tabIndex={-1} type="file" accept="image/*" onChange={(event) => { readProfilePhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  <input ref={backCameraInputRef} className="sr-only" tabIndex={-1} type="file" accept="image/*" capture="environment" onChange={(event) => { readProfilePhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  <input ref={frontCameraInputRef} className="sr-only" tabIndex={-1} type="file" accept="image/*" capture="user" onChange={(event) => { readProfilePhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  {profileFeedback ? <p className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-brand-deep dark:bg-blue-500/10 dark:text-blue-100">{profileFeedback}</p> : null}
                  <button type="button" onClick={() => setProfileMenuOpen(false)} className="mt-3 w-full rounded-full bg-slate-100 px-4 py-3 text-sm font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Fechar perfil</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {feedback ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{feedback}</p> : null}

        <div className="space-y-3 lg:hidden">
          <div className="grid grid-cols-4 gap-2">
            {mobileSectionButtons.map((button) => (
              <button
                key={button.key}
                type="button"
                onClick={() => setMobileSection(button.key)}
                className={`rounded-2xl px-2 py-2 text-center text-[0.68rem] font-extrabold transition active:scale-95 ${mobileSection === button.key ? "bg-brand-deep text-white shadow-soft" : "bg-white text-slate-600 shadow-sm dark:bg-slate-950 dark:text-slate-200"}`}
              >
                <span className="block truncate">{button.label}</span>
                <span className={`mt-1 inline-flex min-w-6 justify-center rounded-full px-1.5 py-0.5 text-[0.65rem] ${mobileSection === button.key ? "bg-white/15 text-white" : "bg-slate-100 text-brand-blue dark:bg-slate-800"}`}>{button.count}</span>
              </button>
            ))}
          </div>

          {mobileSection === "contents" ? (
            <section className="max-h-[calc(100dvh-10.75rem)] overflow-y-auto rounded-[1.25rem] bg-white p-3 shadow-soft dark:bg-slate-950">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-extrabold text-brand-deep dark:text-white">Conteúdos da sala</h2>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-brand-blue dark:bg-blue-500/10">{student.room}</span>
              </div>
              <div className="mt-3 grid gap-2">
                {mobileContentItems.length ? mobileContentItems.slice(0, 3).map((item) => (
                  <article key={item.id} className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="text-[0.68rem] font-extrabold uppercase text-brand-blue">{typeLabels[item.type]}</p>
                    <h3 className="mt-1 line-clamp-1 text-sm font-extrabold text-brand-deep dark:text-white">{item.title}</h3>
                    {item.body ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{item.body}</p> : null}
                    <MediaAttachment item={item} compact />
                  </article>
                )) : <p className="rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-500 dark:bg-slate-900">Nada publicado ainda.</p>}
              </div>
            </section>
          ) : null}

          {mobileSection === "library" ? (
            <section className="max-h-[calc(100dvh-10.75rem)] overflow-y-auto rounded-[1.25rem] bg-white p-3 shadow-soft dark:bg-slate-950">
              <h2 className="text-base font-extrabold text-brand-deep dark:text-white">Livraria EBR</h2>
              {purchaseFeedback ? <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{purchaseFeedback}</p> : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {libraryItems.length ? libraryItems.map((item) => (
                  <article key={item.id} className="flex min-h-52 flex-col rounded-2xl bg-slate-50 p-2 shadow-sm dark:bg-slate-900">
                    <div className="mb-2 aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                      {item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="h-full w-full object-contain p-2" loading="lazy" /> : <div className="grid h-full w-full place-items-center px-2 text-center text-[0.68rem] font-extrabold text-slate-400">Sem capa</div>}
                    </div>
                    <h3 className="line-clamp-2 text-sm font-extrabold text-brand-deep dark:text-white">{item.title}</h3>
                    {item.description ? <p className="mt-1 line-clamp-2 text-[0.68rem] leading-4 text-slate-500 dark:text-slate-400">{item.description}</p> : null}
                    <div className="mt-auto pt-2">
                      <p className="text-sm font-extrabold text-brand-green">R$ {item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <p className={"mt-0.5 text-[0.68rem] font-extrabold " + (item.stockQuantity > 0 ? "text-slate-500" : "text-red-500")}>{item.stockQuantity > 0 ? item.stockQuantity + " disp." : "Esgotado"}</p>
                      <button type="button" disabled={item.stockQuantity <= 0} onClick={() => handleBookPurchase(item)} className="mt-2 w-full rounded-full bg-brand-green px-2 py-2 text-[0.68rem] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60">Pagamento</button>
                    </div>
                  </article>
                )) : <p className="col-span-2 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-500 dark:bg-slate-900">Nenhum item disponível ainda.</p>}
              </div>
            </section>
          ) : null}

          {mobileSection === "talk" ? (
            <section className="grid max-h-[calc(100dvh-10.75rem)] gap-3 overflow-y-auto">
              <div className="rounded-[1.25rem] bg-white p-3 shadow-soft dark:bg-slate-950">
                <h2 className="text-base font-extrabold text-brand-deep dark:text-white">Pergunte ao professor</h2>
                <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Escreva sua pergunta..." />
                <button onClick={() => void sendInteraction("question")} className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand-blue px-4 py-2 text-xs font-extrabold text-white"><Send className="h-4 w-4" /> Enviar pergunta</button>
              </div>
              <div className="rounded-[1.25rem] bg-white p-3 shadow-soft dark:bg-slate-950">
                <h2 className="text-base font-extrabold text-brand-deep dark:text-white">Pedido de oração</h2>
                <textarea value={prayer} onChange={(event) => setPrayer(event.target.value)} rows={2} className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Compartilhe seu pedido..." />
                <button onClick={() => void sendInteraction("prayer")} className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand-deep px-4 py-2 text-xs font-extrabold text-white"><Sparkles className="h-4 w-4" /> Enviar pedido</button>
              </div>
            </section>
          ) : null}

          {mobileSection === "ministry" ? (
            <section className="max-h-[calc(100dvh-10.75rem)] overflow-y-auto rounded-[1.25rem] bg-brand-deep p-3 text-white shadow-soft">
              <h2 className="text-base font-extrabold">Lista do ministério</h2>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-blue-100">{settings.ministryListText || settings.ministryPaymentText || "Escolha um produto e informe como deseja contribuir."}</p>
              <div className="mt-2 rounded-2xl bg-white/10 px-3 py-2 text-xs font-extrabold text-white">Chave Pix: {EBR_HELP_PIX_KEY}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {visibleMinistryItems.length ? visibleMinistryItems.map((item) => {
                  const unavailableInfo = ministryUnavailableEntry(item);
                  const unavailableUntil = unavailableInfo?.releaseDate ?? "";
                  const unavailable = Boolean(unavailableUntil);
                  const selected = selectedMinistryItemIds.includes(item.id);
                  return (
                    <article key={item.id} className={"flex min-h-36 flex-col rounded-2xl p-2 text-brand-deep shadow-sm " + (unavailable ? "bg-white/70 opacity-60" : selected ? "border-2 border-brand-green bg-emerald-50" : "bg-white")}>
                      {item.imageUrl ? <img src={item.imageUrl} alt="" className="mb-2 h-20 w-full rounded-xl bg-slate-100 p-1 object-contain dark:bg-slate-800" /> : null}
                      <h3 className="line-clamp-2 text-sm font-extrabold">{item.title}</h3>
                      <p className="mt-1 text-sm font-extrabold text-brand-green">R$ {item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      {unavailable ? <div className="mt-2 rounded-xl bg-amber-50 px-2 py-1 text-[0.65rem] font-extrabold text-amber-700">
                        <p className="truncate">Escolhido por {unavailableInfo?.studentName || "aluno"}</p>
                        <p>Até {new Date(unavailableUntil + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                      </div> : null}
                      <button type="button" disabled={unavailable} onClick={() => toggleMinistryItem(item.id)} className={"mt-auto w-full rounded-full px-2 py-2 text-[0.68rem] font-extrabold disabled:opacity-50 " + (selected ? "bg-slate-200 text-slate-700" : "bg-brand-green text-white")}>
                        {selected ? "Remover" : "Adicionar"}
                      </button>
                    </article>
                  );
                }) : <p className="col-span-2 rounded-2xl bg-white/10 p-3 text-xs font-bold text-blue-100">Nenhum item disponível no momento.</p>}
              </div>
              {selectedMinistryItems.length ? <div className="mt-3 rounded-2xl bg-white p-3 text-brand-deep shadow-sm"><p className="text-xs font-extrabold">{selectedMinistryItems.length} produto(s) selecionado(s)</p><p className="mt-1 text-sm font-extrabold text-brand-green">Total: R$ {selectedMinistryTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="mt-2 text-[0.68rem] font-bold text-slate-500">Agora escolha como deseja pagar.</p><div className="mt-2 grid grid-cols-3 gap-1"><button type="button" onClick={() => void handleMinistryPayment("pix")} className="rounded-full bg-brand-green px-1 py-2 text-[0.65rem] font-extrabold text-white">Pix</button><button type="button" onClick={() => void handleMinistryPayment("cash")} className="rounded-full bg-brand-deep px-1 py-2 text-[0.65rem] font-extrabold text-white">Din.</button><button type="button" onClick={() => void handleMinistryPayment("take")} className="rounded-full bg-slate-100 px-1 py-2 text-[0.65rem] font-extrabold text-slate-700">Levar</button></div></div> : <p className="mt-3 text-center text-[0.68rem] font-bold text-blue-100">Adicione um ou mais produtos para escolher o pagamento.</p>}
            </section>
          ) : null}
        </div>

        <div className="hidden gap-5 lg:grid lg:grid-cols-2">
          <ContentSection title={typeLabels.video} icon={<BookOpenCheck className="h-5 w-5" />} items={videos} />
          <ContentSection title={typeLabels.message} icon={<MessageCircle className="h-5 w-5" />} items={messages} />
          <ContentSection title={typeLabels.lesson} icon={<FileText className="h-5 w-5" />} items={lessons} />
          <ContentSection title={typeLabels.notice} icon={<Sparkles className="h-5 w-5" />} items={notices} />
        </div>

        <div className="hidden gap-5 lg:grid lg:grid-cols-[1fr_0.9fr]">
          <section className="rounded-[1.6rem] bg-white p-4 shadow-soft dark:bg-slate-950 sm:p-5">
            <h2 className="text-lg font-extrabold text-brand-deep dark:text-white">Livraria EBR</h2>
            {purchaseFeedback ? <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{purchaseFeedback}</p> : null}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {libraryItems.length ? libraryItems.map((item) => (
                <article key={item.id} className="flex min-h-64 flex-col rounded-2xl bg-slate-50 p-3 shadow-sm dark:bg-slate-900">
                  <div className="aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-contain p-1" /> : <div className="grid h-full w-full place-items-center px-2 text-center text-xs font-extrabold text-slate-400">Sem capa</div>}
                  </div>
                  <div className="mt-3 min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-sm font-extrabold text-brand-deep dark:text-white">{item.title}</h3>
                    {item.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.description}</p> : null}
                    <p className="mt-2 text-base font-extrabold text-brand-green">R$ {item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className={"mt-1 text-xs font-extrabold " + (item.stockQuantity > 0 ? "text-slate-500" : "text-red-500")}>{item.stockQuantity > 0 ? item.stockQuantity + " disponível(is)" : "Esgotado"}</p>
                  </div>
                  <button type="button" disabled={item.stockQuantity <= 0} onClick={() => handleBookPurchase(item)} className="mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-brand-green px-3 py-2 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"><DollarSign className="h-4 w-4" /> Pagamento</button>
                </article>
              )) : <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-slate-900">Nenhum item disponível ainda.</p>}
            </div>
          </section>

          <section className="space-y-5">
            <div className="rounded-[1.6rem] bg-white p-4 shadow-soft dark:bg-slate-950 sm:p-5">
              <h2 className="text-lg font-extrabold text-brand-deep dark:text-white">Pergunte ao professor</h2>
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Escreva sua pergunta..." />
              <button onClick={() => void sendInteraction("question")} className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white"><Send className="h-4 w-4" /> Enviar pergunta</button>
            </div>
            <div className="rounded-[1.6rem] bg-white p-4 shadow-soft dark:bg-slate-950 sm:p-5">
              <h2 className="text-lg font-extrabold text-brand-deep dark:text-white">Pedido de oração</h2>
              <textarea value={prayer} onChange={(event) => setPrayer(event.target.value)} rows={4} className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Compartilhe seu pedido..." />
              <button onClick={() => void sendInteraction("prayer")} className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-deep px-5 py-3 text-sm font-extrabold text-white"><Sparkles className="h-4 w-4" /> Enviar pedido</button>
            </div>
            <InteractionHistory title="Minhas perguntas e respostas" items={questions} emptyText="Suas perguntas enviadas vão aparecer aqui." />
            <InteractionHistory title="Meus pedidos de oração" items={prayers} emptyText="Seus pedidos enviados vão aparecer aqui." />
            <div className="rounded-[1.6rem] bg-brand-deep p-5 text-white shadow-soft">
              <h2 className="text-lg font-extrabold">Lista do ministério</h2>
              <p className="mt-2 text-sm leading-6 text-blue-100">{settings.ministryListText || settings.ministryPaymentText || "Escolha um produto e informe como deseja contribuir."}</p>
              <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-extrabold text-white">Chave Pix: {EBR_HELP_PIX_KEY}</div>
              {settings.ministryListValidUntil ? <p className="mt-2 text-xs font-extrabold text-blue-100">Válido até {new Date(settings.ministryListValidUntil + "T00:00:00").toLocaleDateString("pt-BR")}</p> : null}

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visibleMinistryItems.length ? visibleMinistryItems.map((item) => {
                  const unavailableInfo = ministryUnavailableEntry(item);
                  const unavailableUntil = unavailableInfo?.releaseDate ?? "";
                  const unavailable = Boolean(unavailableUntil);
                  const selected = selectedMinistryItemIds.includes(item.id);
                  return (
                    <article key={item.id} className={"flex min-h-52 flex-col rounded-2xl p-3 text-brand-deep shadow-sm " + (unavailable ? "bg-white/70 opacity-60" : selected ? "border-2 border-brand-green bg-emerald-50" : "bg-white")}>
                      <div className="min-w-0 flex-1">
                        {item.imageUrl ? <img src={item.imageUrl} alt="" className="mb-2 h-20 w-full rounded-xl bg-slate-100 p-1 object-contain dark:bg-slate-800" /> : null}
                      <h3 className="line-clamp-2 text-sm font-extrabold">{item.title}</h3>
                        {item.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.description}</p> : null}
                        <p className="mt-2 text-base font-extrabold text-brand-green">R$ {item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        {unavailable ? <div className="mt-2 rounded-xl bg-amber-50 px-2 py-1 text-[0.68rem] font-extrabold text-amber-700">
                          <p className="truncate">Escolhido por {unavailableInfo?.studentName || "aluno"}</p>
                          <p>Indisponível até {new Date(unavailableUntil + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                        </div> : null}
                      </div>
                      <button type="button" disabled={unavailable} onClick={() => toggleMinistryItem(item.id)} className={"mt-3 w-full rounded-full px-3 py-2 text-[0.7rem] font-extrabold disabled:cursor-not-allowed disabled:opacity-50 " + (selected ? "bg-slate-200 text-slate-700" : "bg-brand-green text-white")}>
                        {selected ? "Remover da escolha" : "Adicionar à escolha"}
                      </button>
                    </article>
                  );
                }) : <p className="rounded-2xl bg-white/10 p-4 text-sm font-bold text-blue-100">Nenhum item disponível no momento.</p>}
              </div>
              {selectedMinistryItems.length ? <div className="mt-4 rounded-2xl bg-white p-4 text-brand-deep shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-extrabold">{selectedMinistryItems.length} produto(s) selecionado(s)</p><p className="mt-1 text-base font-extrabold text-brand-green">Total: R$ {selectedMinistryTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div><p className="text-right text-xs font-bold text-slate-500">Escolha a forma de pagamento para todos os itens.</p></div><div className="mt-3 grid grid-cols-3 gap-2"><button type="button" onClick={() => void handleMinistryPayment("pix")} className="rounded-full bg-brand-green px-3 py-2 text-xs font-extrabold text-white">Pix</button><button type="button" onClick={() => void handleMinistryPayment("cash")} className="rounded-full bg-brand-deep px-3 py-2 text-xs font-extrabold text-white">Dinheiro</button><button type="button" onClick={() => void handleMinistryPayment("take")} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700">Levar</button></div></div> : <p className="mt-4 text-center text-xs font-bold text-blue-100">Adicione um ou mais produtos para escolher o pagamento.</p>}
            </div>
          </section>
        </div>
        {paymentTarget ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[1.8rem] bg-white p-5 text-center shadow-2xl dark:bg-slate-950">
              <h2 className="text-xl font-extrabold text-brand-deep dark:text-white">Pagamento</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">Escaneie o QR Code no app do banco ou cole o código Pix.</p>
              <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
                <img src={qrCodeUrl(paymentTarget)} alt="QR Code de pagamento" className="mx-auto h-60 w-60" />
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 break-all dark:bg-slate-900 dark:text-slate-300">{pixPayload(paymentTarget)}</div>
              <div className="mt-4 grid gap-2">
                <button type="button" onClick={() => void copyPaymentKeyWithFeedback({ ...paymentTarget, key: pixPayload(paymentTarget) })} className={`rounded-full px-5 py-3 text-sm font-extrabold text-white shadow-sm transition active:scale-95 ${copiedPaymentKey ? "bg-brand-green" : "bg-brand-blue hover:bg-brand-deep"}`}>{copiedPaymentKey ? "Código Pix copiado" : "Copiar código Pix"}</button>
                {copiedPaymentKey ? <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">Código Pix copiado</p> : null}
                {paymentWhatsappUrl(paymentTarget) ? (
                  <a href={paymentWhatsappUrl(paymentTarget)} target="_blank" rel="noopener noreferrer" onClick={() => void confirmPayment(paymentTarget, { skipWhatsapp: true })} className="rounded-full bg-brand-green px-5 py-3 text-sm font-extrabold text-white">Já realizei o pagamento</a>
                ) : (
                  <button type="button" onClick={() => void confirmPayment(paymentTarget)} className="rounded-full bg-brand-green px-5 py-3 text-sm font-extrabold text-white">Já realizei o pagamento</button>
                )}
                <button type="button" onClick={() => setPaymentTarget(null)} className="rounded-full bg-white px-5 py-3 text-sm font-extrabold text-slate-600 dark:bg-slate-900 dark:text-slate-200">Fechar</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}


