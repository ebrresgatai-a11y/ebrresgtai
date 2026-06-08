import { readFile, writeFile } from "node:fs/promises";
const file = new URL("../app/page.tsx", import.meta.url);
let source = await readFile(file, "utf8");
function replaceRegex(regex, replacement, label) { const next = source.replace(regex, replacement); if (next === source) throw new Error(`Pattern not found: ${label}`); source = next; }

replaceRegex(/  async function loadPortalData\(showLoading = true\) \{\s+if \(showLoading\) setLoading\(true\);\s+if \(!supabase\) \{\s+if \(showLoading\) setLoading\(false\);\s+return;\s+\}/,
`  async function loadPortalData(showLoading = true) {
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
    }`, "load portal neon");

replaceRegex(/    if \(!supabase\) return;\s+const db = supabase;/, `    if (isNeonProvider || !supabase) return;
    const db = supabase;`, "portal subscription skip");

replaceRegex(/    if \(supabase\) \{\s+if \(editingContentId\) await supabase\.from\("student_portal_contents"\)\.update\(toDbPortalContent\(payload\)\)\.eq\("id", editingContentId\);\s+else await supabase\.from\("student_portal_contents"\)\.insert\(toDbPortalContent\(payload\)\);\s+await loadPortalData\(\);\s+\} else \{/, `    if (isNeonProvider) {
      if (editingContentId) await neonMutate<PortalContent>("portalContent", "update", payload, editingContentId);
      else await neonMutate<PortalContent>("portalContent", "create", payload);
      await loadPortalData();
    } else if (supabase) {
      if (editingContentId) await supabase.from("student_portal_contents").update(toDbPortalContent(payload)).eq("id", editingContentId);
      else await supabase.from("student_portal_contents").insert(toDbPortalContent(payload));
      await loadPortalData();
    } else {`, "save content");

replaceRegex(/    if \(supabase\) \{\s+await supabase\.from\("student_portal_contents"\)\.insert\(toDbPortalContent\(payload\)\);\s+await loadPortalData\(\);\s+\} else \{/, `    if (isNeonProvider) {
      await neonMutate<PortalContent>("portalContent", "create", payload);
      await loadPortalData();
    } else if (supabase) {
      await supabase.from("student_portal_contents").insert(toDbPortalContent(payload));
      await loadPortalData();
    } else {`, "teacher content");

replaceRegex(/    if \(supabase\) \{\s+await supabase\.from\("student_portal_contents"\)\.delete\(\)\.eq\("id", id\);\s+await loadPortalData\(\);\s+\} else setContents/, `    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("portalContent", "delete", undefined, id);
      await loadPortalData();
    } else if (supabase) {
      await supabase.from("student_portal_contents").delete().eq("id", id);
      await loadPortalData();
    } else setContents`, "delete content");

replaceRegex(/    if \(supabase\) \{\s+if \(editingLibraryId\) await supabase\.from\("student_library_items"\)\.update\(toDbLibraryItem\(payload\)\)\.eq\("id", editingLibraryId\);\s+else await supabase\.from\("student_library_items"\)\.insert\(toDbLibraryItem\(payload\)\);\s+await loadPortalData\(\);\s+\} else \{/, `    if (isNeonProvider) {
      if (editingLibraryId) await neonMutate<LibraryItem>("libraryItem", "update", payload, editingLibraryId);
      else await neonMutate<LibraryItem>("libraryItem", "create", payload);
      await loadPortalData();
    } else if (supabase) {
      if (editingLibraryId) await supabase.from("student_library_items").update(toDbLibraryItem(payload)).eq("id", editingLibraryId);
      else await supabase.from("student_library_items").insert(toDbLibraryItem(payload));
      await loadPortalData();
    } else {`, "save library");

replaceRegex(/    if \(supabase\) \{\s+await supabase\.from\("student_library_items"\)\.delete\(\)\.eq\("id", id\);\s+await loadPortalData\(\);\s+\} else setLibraryItems/, `    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("libraryItem", "delete", undefined, id);
      await loadPortalData();
    } else if (supabase) {
      await supabase.from("student_library_items").delete().eq("id", id);
      await loadPortalData();
    } else setLibraryItems`, "delete library");

replaceRegex(/    if \(supabase\) \{\s+if \(editingMinistryId\) await supabase\.from\("student_ministry_items"\)\.update\(toDbMinistryItem\(payload\)\)\.eq\("id", editingMinistryId\);\s+else await supabase\.from\("student_ministry_items"\)\.insert\(toDbMinistryItem\(payload\)\);\s+await loadPortalData\(\);\s+\} else \{/, `    if (isNeonProvider) {
      if (editingMinistryId) await neonMutate<MinistryItem>("ministryItem", "update", payload, editingMinistryId);
      else await neonMutate<MinistryItem>("ministryItem", "create", payload);
      await loadPortalData();
    } else if (supabase) {
      if (editingMinistryId) await supabase.from("student_ministry_items").update(toDbMinistryItem(payload)).eq("id", editingMinistryId);
      else await supabase.from("student_ministry_items").insert(toDbMinistryItem(payload));
      await loadPortalData();
    } else {`, "save ministry");

replaceRegex(/    if \(supabase\) \{\s+await supabase\.from\("student_ministry_items"\)\.delete\(\)\.eq\("id", id\);\s+await loadPortalData\(\);\s+\} else setMinistryItems/, `    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("ministryItem", "delete", undefined, id);
      await loadPortalData();
    } else if (supabase) {
      await supabase.from("student_ministry_items").delete().eq("id", id);
      await loadPortalData();
    } else setMinistryItems`, "delete ministry");

replaceRegex(/    if \(supabase && item\.id\) \{\s+await supabase\.from\(table\)\.update\(\{ status: updated\.status, response: updated\.response, updated_at: new Date\(\)\.toISOString\(\) \}\)\.eq\("id", item\.id\);\s+\}/, `    if (isNeonProvider && item.id) {
      await neonMutate<StudentInteraction>("interaction", "update", { table, status: updated.status, response: updated.response }, item.id);
    } else if (supabase && item.id) {
      await supabase.from(table).update({ status: updated.status, response: updated.response, updated_at: new Date().toISOString() }).eq("id", item.id);
    }`, "update interaction");

await writeFile(file, source, "utf8");
