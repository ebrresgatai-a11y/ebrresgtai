import { readFile, writeFile } from "node:fs/promises";
const file = new URL("../app/page.tsx", import.meta.url);
let source = await readFile(file, "utf8");
function replaceRegex(regex, replacement, label) {
  const next = source.replace(regex, replacement);
  if (next === source) throw new Error(`Pattern not found: ${label}`);
  source = next;
}
source = source.replace('type NeonEntity = "student" | "room" | "team";', 'type NeonEntity = "student" | "room" | "team" | "financialEntry" | "financialCategory" | "attendanceRecord" | "attendanceBatch";');
source = source.replace('type NeonAction = "create" | "update" | "delete";', 'type NeonAction = "create" | "update" | "delete" | "replaceList" | "upsert";');
replaceRegex(/    if \(supabase\) \{\s+const client = supabase;\s+const \{ data, error \} = await client\s+\.from\("attendance_records"\)\s+\.upsert\(recordsToSave[\s\S]*?\n    \} else \{/, `    if (isNeonProvider) {
      const persistedRecords = await neonMutate<AttendanceRecord[]>("attendanceBatch", "upsert", { records: recordsToSave, frequencyUpdates });
      setAttendanceRecords((current) => [
        ...current.filter((record) => !(record.attendanceDate === attendanceDate && sameRoomName(record.room, activeRoom))),
        ...persistedRecords
      ]);
    } else if (supabase) {
      const client = supabase;
      const { data, error } = await client
        .from("attendance_records")
        .upsert(recordsToSave.map(toDbAttendance), { onConflict: "attendance_date,room,student_id" })
        .select("*");
      if (error) {
        setAttendanceFeedback("NÃ£o foi possÃ­vel salvar a chamada. Tente novamente.");
        setSavingAttendance(false);
        return;
      }
      await Promise.all(frequencyUpdates.map((student) => client.from("students").update({ frequency: student.frequency }).eq("id", student.id)));
      const persistedRecords = (data ?? []).map(fromDbAttendance);
      setAttendanceRecords((current) => [
        ...current.filter((record) => !(record.attendanceDate === attendanceDate && sameRoomName(record.room, activeRoom))),
        ...persistedRecords
      ]);
    } else {`, "attendance batch");
replaceRegex(/    if \(supabase\) \{\s+const client = supabase;\s+const \{ data, error \} = await client\s+\.from\("attendance_records"\)\s+\.upsert\(toDbAttendance\(recordToSave\)[\s\S]*?\n    \} else \{/, `    if (isNeonProvider) {
      const persistedRecord = await neonMutate<AttendanceRecord>("attendanceRecord", "upsert", { ...recordToSave, frequency: nextFrequency });
      setAttendanceRecords((current) => [
        ...current.filter((record) => !(record.attendanceDate === attendanceDate && sameRoomName(record.room, activeRoom) && record.studentId === student.id)),
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
        setAttendanceFeedback("NÃ£o foi possÃ­vel salvar essa marcaÃ§Ã£o. Tente novamente.");
        setSavingStudentIds((current) => ({ ...current, [student.id]: false }));
        return;
      }
      if (delta !== 0) await client.from("students").update({ frequency: nextFrequency }).eq("id", student.id);
      const persistedRecord = fromDbAttendance(data);
      setAttendanceRecords((current) => [
        ...current.filter((record) => !(record.attendanceDate === attendanceDate && sameRoomName(record.room, activeRoom) && record.studentId === student.id)),
        persistedRecord
      ]);
    } else {`, "attendance single");
replaceRegex(/  async function persistCategoryList\(type: FinancialEntry\["type"\], nextList: string\[\]\) \{[\s\S]*?\n  \}\n\n  async function createCategory/, `  async function persistCategoryList(type: FinancialEntry["type"], nextList: string[]) {
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

  async function createCategory`, "financial category");
replaceRegex(/    if \(supabase\) \{\s+const \{ data \} = await supabase\.from\("financial_entries"\)\.insert\(toDbEntry\(newEntry\)\)\.select\("\*"\)\.single\(\);[\s\S]*?\n    \}\n  \}\n\n  async function saveEntryEdit/, `    if (isNeonProvider) {
      const data = await neonMutate<FinancialEntry>("financialEntry", "create", newEntry);
      if (data) setEntries((current) => current.map((entry) => (entry.id === newEntry.id ? data : entry)));
    } else if (supabase) {
      const { data } = await supabase.from("financial_entries").insert(toDbEntry(newEntry)).select("*").single();
      if (data) setEntries((current) => current.map((entry) => (entry.id === newEntry.id ? fromDbEntry(data) : entry)));
    }
  }

  async function saveEntryEdit`, "financial create");
replaceRegex(/    if \(supabase\) \{\s+const \{ error \} = await supabase\.from\("financial_entries"\)\.update\(toDbEntry\(payload\)\)\.eq\("id", payload\.id\);[\s\S]*?\n    \}\n    setEditingEntry/, `    if (isNeonProvider) {
      const data = await neonMutate<FinancialEntry>("financialEntry", "update", payload, payload.id);
      if (data) setEntries((current) => current.map((entry) => entry.id === payload.id ? data : entry));
    } else if (supabase) {
      const { error } = await supabase.from("financial_entries").update(toDbEntry(payload)).eq("id", payload.id);
      if (error) {
        setEntries((current) => current.map((entry) => entry.id === editingEntry.id ? editingEntry : entry));
        setFinanceFeedback({ kind: "error", message: "NÃ£o foi possÃ­vel editar o lanÃ§amento no banco." });
        return;
      }
    }
    setEditingEntry`, "financial edit");
await writeFile(file, source, "utf8");
