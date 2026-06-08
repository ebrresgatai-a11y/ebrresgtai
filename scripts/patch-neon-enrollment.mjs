import { readFile, writeFile } from "node:fs/promises";
const file = new URL("../app/matricula/page.tsx", import.meta.url);
let source = await readFile(file, "utf8");
function replaceRegex(regex, replacement, label) { const next = source.replace(regex, replacement); if (next === source) throw new Error(`Pattern not found: ${label}`); source = next; }
function replaceOnce(search, replacement, label) { if (!source.includes(search)) throw new Error(`Anchor not found: ${label}`); source = source.replace(search, replacement); }
if (!source.includes("@/lib/data-provider")) replaceOnce('import { supabase } from "@/lib/supabase";', 'import { supabase } from "@/lib/supabase";\nimport { fetchNeonJson, isNeonProvider } from "@/lib/data-provider";', "import");
if (!source.includes("async function neonMutate")) replaceOnce(`const fallbackRooms =`, `async function neonMutate<T>(entity: string, action: string, payload?: unknown, id?: number) {
  const result = await fetchNeonJson<{ ok: boolean; data: T }>("/api/neon/mutate", {
    method: "POST",
    body: JSON.stringify({ entity, action, payload, id })
  });
  return result.data;
}

const fallbackRooms =`, "helper");

replaceRegex(/    if \(!supabase\) return;\s+let active = true;\s+Promise\.all\(\[[\s\S]*?\n    return \(\) => \{\s+active = false;\s+\};/, `    let active = true;
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
    };`, "load enrollment meta");

replaceRegex(/    if \(supabase\) \{\s+const \{ data: existingRows, error: listError \} = await supabase\.from\("students"\)\.select\("ra,name,phone,birthday,room"\);[\s\S]*?\n      \}\n    \}/, `    if (isNeonProvider) {
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
        setFeedback("NÃ£o foi possÃ­vel consultar o banco. Tente novamente.");
        setSaving(false);
        return;
      }
      if (hasDuplicateEnrollment({ name, phone: formattedPhone, birthday, room }, existingRows ?? [])) {
        setFeedback("Este aluno jÃ¡ possui cadastro. Se precisar atualizar os dados, fale com a secretaria da EBR.");
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
        setFeedback("NÃ£o foi possÃ­vel salvar o cadastro. Tente novamente.");
        setSaving(false);
        return;
      }
    }`, "submit enrollment");

await writeFile(file, source, "utf8");
