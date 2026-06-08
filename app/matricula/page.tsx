"use client";

import { Camera, Check, Upload, UserRoundPlus } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchNeonJson, isNeonProvider } from "@/lib/data-provider";

async function neonMutate<T>(entity: string, action: string, payload?: unknown, id?: number) {
  const result = await fetchNeonJson<{ ok: boolean; data: T }>("/api/neon/mutate", {
    method: "POST",
    body: JSON.stringify({ entity, action, payload, id })
  });
  return result.data;
}

const fallbackRooms = ["Infantil", "Juniores", "Adolescentes", "Jovens 1", "Jovens 2", "Adultos"];

function normalizeAvatar(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function normalizeRoomName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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

function hasDuplicateEnrollment(candidate: { name: string; phone: string; birthday: string; room: string }, rows: Array<{ name: string | null; phone: string | null; birthday: string | null; room: string | null }>) {
  const candidateName = normalizeStudentIdentity(candidate.name);
  const candidatePhone = onlyPhoneDigits(candidate.phone);
  const candidateBirthday = candidate.birthday;
  const candidateRoom = normalizeRoomName(candidate.room);

  return rows.some((row) => {
    const sameName = Boolean(candidateName && normalizeStudentIdentity(String(row.name ?? "")) === candidateName);
    const samePhone = Boolean(candidatePhone && onlyPhoneDigits(String(row.phone ?? "")) === candidatePhone);
    const sameBirthday = Boolean(candidateBirthday && String(row.birthday ?? "") === candidateBirthday);
    const sameRoom = Boolean(candidateRoom && normalizeRoomName(String(row.room ?? "")) === candidateRoom);
    return sameName && samePhone && sameBirthday && sameRoom;
  });
}

function isPublicEnrollmentRoom(name: string) {
  return Boolean(name.trim());
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

function getNextRaFromRows(rows: Array<{ ra: string | null }>) {
  const usedNumbers = new Set(
    rows
      .map((row) => Number(String(row.ra ?? "").match(/RA-(\d+)/)?.[1] ?? 0))
      .filter((value) => value > 0)
  );
  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) nextNumber += 1;
  return `RA-${String(nextNumber).padStart(2, "0")}`;
}

export default function EnrollmentPage() {
  const [photo, setPhoto] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<string[]>(fallbackRooms);
  const [churchName, setChurchName] = useState("EBR");
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const frontCameraInputRef = useRef<HTMLInputElement | null>(null);
  const backCameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("environment");

  useEffect(() => {
    let active = true;
    if (isNeonProvider) {
      fetchNeonJson<{ rooms: Array<{ name: string }>; settings: Record<string, string>; students: Array<{ ra: string | null; name: string | null; phone: string | null; birthday: string | null; room: string | null }> }>("/api/neon/portal?audience=enrollment").then((data) => {
        if (!active) return;
        const roomNames = (data.rooms ?? []).map((room) => String(room.name ?? "")).filter(isPublicEnrollmentRoom);
        if (roomNames.length) setAvailableRooms(roomNames);
        setChurchName(data.settings?.churchName || "EBR");
      });
      return () => { active = false; };
    }
    if (!supabase) return;
    Promise.all([
      supabase.from("rooms").select("name").order("name"),
      supabase.from("app_settings").select("*").eq("key", "general").maybeSingle()
    ]).then(([roomsResult, settingsResult]) => {
      if (!active) return;
      const roomNames = (roomsResult.data ?? []).map((room) => String(room.name ?? "")).filter(isPublicEnrollmentRoom);
      if (roomNames.length) setAvailableRooms(roomNames);
      const settings = settingsResult.data?.value as Record<string, string> | null;
      setChurchName(settings?.churchName || "EBR");
    });
    return () => {
      active = false;
    };
  }, []);

  function formatBrazilPhone(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
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

  async function handlePhoto(file?: File) {
    if (!file) return;
    setPhoto(await compressImageFile(file));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setSaving(true);
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const birthday = String(formData.get("birthday") || "");
    const room = String(formData.get("room") || availableRooms[0] || fallbackRooms[0]);
    const formattedPhone = formatBrazilPhone(phone);

    if (!name || !formattedPhone || !birthday) {
      setFeedback("Preencha nome, telefone e data de nascimento.");
      setSaving(false);
      return;
    }

    if (isNeonProvider) {
      const { students: existingRows } = await fetchNeonJson<{ students: Array<{ ra: string | null; name: string | null; phone: string | null; birthday: string | null; room: string | null }> }>("/api/neon/portal?audience=enrollment");
      if (hasDuplicateEnrollment({ name, phone: formattedPhone, birthday, room }, existingRows ?? [])) {
        setFeedback("Este aluno já possui cadastro. Se precisar atualizar os dados, fale com a secretaria da EBR.");
        setSaving(false);
        return;
      }
      await neonMutate("student", "create", {
        ra: getNextRaFromRows(existingRows ?? []),
        name,
        phone: formattedPhone,
        room,
        frequency: 0,
        status: "Novo",
        birthday,
        age: calculateAge(birthday),
        avatar: normalizeAvatar(name),
        photo: photo || null
      });
    } else if (supabase) {
      const { data: existingRows, error: listError } = await supabase.from("students").select("ra,name,phone,birthday,room");
      if (listError) {
        setFeedback("Não foi possível consultar o banco. Tente novamente.");
        setSaving(false);
        return;
      }
      if (hasDuplicateEnrollment({ name, phone: formattedPhone, birthday, room }, existingRows ?? [])) {
        setFeedback("Este aluno já possui cadastro. Se precisar atualizar os dados, fale com a secretaria da EBR.");
        setSaving(false);
        return;
      }
      const { error } = await supabase.from("students").insert({
        ra: getNextRaFromRows(existingRows ?? []),
        name,
        phone: formattedPhone,
        room,
        frequency: 0,
        status: "Novo",
        birthday,
        age: calculateAge(birthday),
        avatar: normalizeAvatar(name),
        photo: photo || null
      });
      if (error) {
        setFeedback("Não foi possível salvar o cadastro. Tente novamente.");
        setSaving(false);
        return;
      }
    }

    setSent(true);
    setSaving(false);
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
    setPhoto(compressCanvasPhoto(canvas));
    closeCamera();
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <form onSubmit={submit} className="w-full max-w-3xl rounded-[2rem] bg-white p-6 shadow-soft dark:bg-slate-950 sm:p-8">
        <div className="mb-6 flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-deep text-white">
            <UserRoundPlus className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-blue">Auto cadastro</p>
            <h1 className="mt-1 text-3xl font-extrabold text-brand-deep dark:text-white">Matrícula EBR</h1>
          </div>
        </div>

        {sent ? (
          <div className="rounded-[1.5rem] bg-emerald-50 p-6 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
            <Check className="mb-3 h-8 w-8" />
            <p className="text-xl font-extrabold">Cadastro realizado</p>
            <p className="mt-2 text-sm leading-6">Seu cadastro entrou direto na lista de alunos da EBR.</p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-col gap-4 rounded-[1.4rem] bg-slate-50 p-4 dark:bg-slate-900 sm:flex-row sm:items-center">
              {photo ? <img src={photo} alt="" className="h-20 w-20 rounded-full object-cover" /> : <div className="grid h-20 w-20 rounded-full bg-brand-deep text-xl font-extrabold text-white place-items-center">FT</div>}
              <div className="flex-1">
                <p className="text-sm font-extrabold text-brand-deep dark:text-white">Foto</p>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Nome</span>
                <input required name="name" type="text" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-blue focus:bg-white dark:border-slate-700 dark:bg-slate-900" />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Telefone</span>
                <input required name="phone" value={phone} onChange={(event) => setPhone(formatBrazilPhone(event.target.value))} type="tel" inputMode="tel" maxLength={15} placeholder="(85) 99999-9999" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-blue focus:bg-white dark:border-slate-700 dark:bg-slate-900" />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Data de nascimento</span>
                <input required name="birthday" type="date" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-blue focus:bg-white dark:border-slate-700 dark:bg-slate-900" />
              </label>
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Sala desejada</span>
                <select name="room" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-brand-blue focus:bg-white dark:border-slate-700 dark:bg-slate-900">
                  {availableRooms.map((room) => <option key={room}>{room}</option>)}
                </select>
              </label>
            </div>
            {feedback ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:bg-red-500/10 dark:text-red-200">{feedback}</p> : null}
            <button disabled={saving} className="mt-6 w-full rounded-full bg-brand-blue px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70">
              {saving ? "Salvando..." : "Enviar cadastro"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
