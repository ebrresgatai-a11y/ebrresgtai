import { readFile, writeFile } from "node:fs/promises";
const file = new URL("../app/aluno/page.tsx", import.meta.url);
let source = await readFile(file, "utf8");
function replaceRegex(regex, replacement, label) { const next = source.replace(regex, replacement); if (next === source) throw new Error(`Pattern not found: ${label}`); source = next; }
function replaceOnce(search, replacement, label) { if (!source.includes(search)) throw new Error(`Anchor not found: ${label}`); source = source.replace(search, replacement); }

if (!source.includes("@/lib/data-provider")) {
  replaceOnce('import { supabase } from "@/lib/supabase";', 'import { supabase } from "@/lib/supabase";\nimport { fetchNeonJson, isNeonProvider } from "@/lib/data-provider";', "import data provider");
}
if (!source.includes("async function neonMutate")) {
  replaceOnce(`const typeLabels = {`, `async function neonMutate<T>(entity: string, action: string, payload?: unknown, id?: number) {
  const result = await fetchNeonJson<{ ok: boolean; data: T }>("/api/neon/mutate", {
    method: "POST",
    body: JSON.stringify({ entity, action, payload, id })
  });
  return result.data;
}

const typeLabels = {`, "neon helper");
}

replaceRegex(/    if \(!student \|\| !supabase\) return;/, `    if (!student || isNeonProvider || !supabase) return;`, "subscription skip");

replaceRegex(/  async function loadStudentInteractions\(currentStudent: Student\) \{\s+if \(!supabase\) return;[\s\S]*?\n  \}\n\n  async function loadPortalForStudent/, `  async function loadStudentInteractions(currentStudent: Student) {
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

  async function loadPortalForStudent`, "load interactions");

replaceRegex(/  async function loadPortalForStudent\(found: Student\) \{\s+if \(!supabase\) return;[\s\S]*?\n    await loadStudentInteractions\(found\);\s+\}/, `  async function loadPortalForStudent(found: Student) {
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
      supabase.from("student_ministry_items").select("id,title,description,price,payment_key,active").eq("active", true).order("created_at", { ascending: false }),
      supabase.from("app_settings").select("*").eq("key", "general").maybeSingle()
    ]);
    setStudent(found);
    setContents((contentResult.data ?? []).map(fromDbContent));
    setLibraryItems((libraryResult.data ?? []).map(fromDbLibrary));
    setMinistryItems((ministryResult.data ?? []).map(fromDbMinistry));
    setSettings((settingsResult.data?.value as Record<string, string> | null) ?? {});
    await loadStudentInteractions(found);
  }`, "load portal student");

replaceRegex(/    if \(!savedId \|\| !supabase\) return;\s+setLoading\(true\);\s+supabase\.from\("students"\)[\s\S]*?\n    \}\);/, `    if (!savedId) return;
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
    });`, "saved session");

replaceRegex(/    if \(!supabase\) \{\s+setFeedback\("Portal indisponível no momento\."\);\s+setLoading\(false\);\s+return;\s+\}/, `    if (!isNeonProvider && !supabase) {
      setFeedback("Portal indisponível no momento.");
      setLoading(false);
      return;
    }`, "enter no supabase guard");

replaceRegex(/    const \{ data: studentRows, error \} = await supabase\.from\("students"\)\.select\(STUDENT_CORE_COLUMNS\);[\s\S]*?\n    await loadPortalForStudent\(selectedStudent\);\s+setLoading\(false\);/, `    if (isNeonProvider) {
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
    setLoading(false);`, "enter portal lookup");

replaceRegex(/    if \(!file \|\| !student \|\| !supabase\) return;/, `    if (!file || !student || (!isNeonProvider && !supabase)) return;`, "photo guard");
replaceRegex(/    if \(!student \|\| !supabase\) return;/, `    if (!student || (!isNeonProvider && !supabase)) return;`, "save name guard");
replaceRegex(/    const \{ error \} = await supabase\.from\("students"\)\.update\(\{ name: cleanName, avatar: nextStudent\.avatar \}\)\.eq\("id", student\.id\);/, `    const error = isNeonProvider ? null : (await supabase!.from("students").update({ name: cleanName, avatar: nextStudent.avatar }).eq("id", student.id)).error;
    if (isNeonProvider) await neonMutate<Student>("student", "update", nextStudent, student.id);`, "save name update");
replaceRegex(/    const \{ error \} = await supabase\.from\("students"\)\.update\(\{ photo \}\)\.eq\("id", student\.id\);/, `    const error = isNeonProvider ? null : (await supabase!.from("students").update({ photo }).eq("id", student.id)).error;
    if (isNeonProvider) await neonMutate<Student>("student", "update", nextStudent, student.id);`, "save photo update");

replaceRegex(/    if \(!student \|\| !supabase\) return;\s+const message = type === "question" \? question\.trim\(\) : prayer\.trim\(\);/, `    if (!student || (!isNeonProvider && !supabase)) return;
    const message = type === "question" ? question.trim() : prayer.trim();`, "send interaction guard");
replaceRegex(/    const \{ error \} = await supabase\.from\(table\)\.insert\(\{[\s\S]*?\n    \}\);\s+if \(error\) \{/, `    const error = isNeonProvider ? null : (await supabase!.from(table).insert({
      student_id: student.id,
      student_name: student.name,
      room: student.room,
      message,
      status: "novo",
      response: ""
    })).error;
    if (isNeonProvider) await neonMutate<StudentInteraction>("interaction", "create", { table, studentId: student.id, studentName: student.name, room: student.room, message, status: "novo", response: "" });
    if (error) {`, "send interaction insert");

replaceRegex(/      if \(supabase\) await supabase\.from\("student_library_items"\)\.update\(\{ stock_quantity: nextStock, updated_at: new Date\(\)\.toISOString\(\) \}\)\.eq\("id", target\.itemId\);/, `      if (isNeonProvider && item) await neonMutate<LibraryItem>("libraryItem", "update", { ...item, stockQuantity: nextStock }, target.itemId);
      else if (supabase) await supabase.from("student_library_items").update({ stock_quantity: nextStock, updated_at: new Date().toISOString() }).eq("id", target.itemId);`, "book stock");
replaceRegex(/    if \(supabase\) await supabase\.from\("app_settings"\)\.upsert\(\{ key: "general", value: nextSettings, updated_at: new Date\(\)\.toISOString\(\) \}\);/g, `    if (isNeonProvider) await neonMutate<Record<string, string>>("settings", "upsert", nextSettings);
    else if (supabase) await supabase.from("app_settings").upsert({ key: "general", value: nextSettings, updated_at: new Date().toISOString() });`, "settings upserts aluno");

await writeFile(file, source, "utf8");
