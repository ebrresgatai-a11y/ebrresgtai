import { readFile, writeFile } from "node:fs/promises";
const file = new URL("../app/page.tsx", import.meta.url);
let source = await readFile(file, "utf8");
function replaceRegex(regex, replacement, label) { const next = source.replace(regex, replacement); if (next === source) throw new Error(`Pattern not found: ${label}`); source = next; }

source = source.replace('type NeonEntity = "student" | "room" | "team" | "financialEntry" | "financialCategory" | "attendanceRecord" | "attendanceBatch";', 'type NeonEntity = "student" | "room" | "team" | "financialEntry" | "financialCategory" | "attendanceRecord" | "attendanceBatch" | "settings" | "schedule" | "exam" | "examScore" | "portalContent" | "libraryItem" | "ministryItem" | "interaction";');

replaceRegex(/    if \(supabase\) \{\s+await supabase\.from\("exams"\)\.update\([\s\S]*?\n    \}\n    setEditingExam/, `    if (isNeonProvider) {
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
    setEditingExam`, "exam edit");

replaceRegex(/    if \(supabase\) \{\s+await supabase\.from\("exam_scores"\)\.delete\(\)\.eq\("exam_id", deleteExam\.id\);\s+await supabase\.from\("exams"\)\.delete\(\)\.eq\("id", deleteExam\.id\);\s+\}/, `    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("exam", "delete", undefined, deleteExam.id);
    } else if (supabase) {
      await supabase.from("exam_scores").delete().eq("exam_id", deleteExam.id);
      await supabase.from("exams").delete().eq("id", deleteExam.id);
    }`, "exam delete");

replaceRegex(/    if \(supabase\) \{\s+const \{ data \} = await supabase\.from\("exams"\)\.insert\([\s\S]*?\n    \} else \{\s+setSelectedExamId\(exam\.id\);\s+\}/, `    if (isNeonProvider) {
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
    }`, "exam create");

replaceRegex(/    if \(supabase\) \{\s+await supabase\.from\("exam_scores"\)\.upsert\(\{ exam_id: selectedExam\.id, student_id: studentId, score \}\);\s+\}/, `    if (isNeonProvider) {
      await neonMutate("examScore", "upsert", { examId: selectedExam.id, studentId, score });
    } else if (supabase) {
      await supabase.from("exam_scores").upsert({ exam_id: selectedExam.id, student_id: studentId, score });
    }`, "exam score");

replaceRegex(/    if \(supabase\) await supabase\.from\("app_settings"\)\.upsert\(\{ key: "general", value: nextSettings, updated_at: new Date\(\)\.toISOString\(\) \}\);/g, `    if (isNeonProvider) await neonMutate<Record<string, string>>("settings", "upsert", nextSettings);
    else if (supabase) await supabase.from("app_settings").upsert({ key: "general", value: nextSettings, updated_at: new Date().toISOString() });`, "settings upserts");

replaceRegex(/  async function loadSchedules\(\) \{\s+if \(!supabase\) return;\s+const \{ data \} = await supabase\.from\("teacher_schedules"\)\.select\("\*"\)\.order\("schedule_date", \{ ascending: true \}\);\s+setItems\(\(data \?\? \[\]\)\.map\(fromDbTeacherSchedule\)\);\s+\}/, `  async function loadSchedules() {
    if (isNeonProvider) {
      const data = await fetchNeonJson<{ items: TeacherSchedule[] }>("/api/neon/portal?audience=schedules");
      setItems(data.items ?? []);
      return;
    }
    if (!supabase) return;
    const { data } = await supabase.from("teacher_schedules").select("*").order("schedule_date", { ascending: true });
    setItems((data ?? []).map(fromDbTeacherSchedule));
  }`, "load schedules");

replaceRegex(/    if \(supabase\) \{\s+if \(editingId\) await supabase\.from\("teacher_schedules"\)\.update\(toDbTeacherSchedule\(payload\)\)\.eq\("id", editingId\);\s+else await supabase\.from\("teacher_schedules"\)\.insert\(toDbTeacherSchedule\(payload\)\);\s+await loadSchedules\(\);\s+\} else \{/, `    if (isNeonProvider) {
      if (editingId) await neonMutate<TeacherSchedule>("schedule", "update", payload, editingId);
      else await neonMutate<TeacherSchedule>("schedule", "create", payload);
      await loadSchedules();
    } else if (supabase) {
      if (editingId) await supabase.from("teacher_schedules").update(toDbTeacherSchedule(payload)).eq("id", editingId);
      else await supabase.from("teacher_schedules").insert(toDbTeacherSchedule(payload));
      await loadSchedules();
    } else {`, "save schedule");

replaceRegex(/    if \(supabase\) \{\s+await supabase\.from\("teacher_schedules"\)\.delete\(\)\.eq\("id", id\);\s+await loadSchedules\(\);\s+\} else setItems/, `    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("schedule", "delete", undefined, id);
      await loadSchedules();
    } else if (supabase) {
      await supabase.from("teacher_schedules").delete().eq("id", id);
      await loadSchedules();
    } else setItems`, "delete schedule");

replaceRegex(/    if \(supabase\) \{\s+await supabase\.from\("app_settings"\)\.upsert\(\{ key: "general", value: settings, updated_at: new Date\(\)\.toISOString\(\) \}\);\s+\}/, `    if (isNeonProvider) {
      await neonMutate<Record<string, string>>("settings", "upsert", settings);
    } else if (supabase) {
      await supabase.from("app_settings").upsert({ key: "general", value: settings, updated_at: new Date().toISOString() });
    }`, "save settings");

await writeFile(file, source, "utf8");
