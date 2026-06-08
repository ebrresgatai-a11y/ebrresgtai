import { readFile, writeFile } from "node:fs/promises";

const file = new URL("../app/page.tsx", import.meta.url);
let source = await readFile(file, "utf8");

function replaceOnce(search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Anchor not found: ${label}`);
  }
  source = source.replace(search, replacement);
}

if (!source.includes("@/lib/data-provider")) {
  replaceOnce(
    'import { isSupabaseConfigured, supabase } from "@/lib/supabase";',
    'import { isSupabaseConfigured, supabase } from "@/lib/supabase";\nimport { fetchNeonJson, isNeonProvider } from "@/lib/data-provider";',
    "data-provider import"
  );
}

if (!source.includes('fetchNeonJson<Partial<EbrData>>("/api/neon/data")')) {
  replaceOnce(
    "async function loadEbrData(): Promise<EbrData> {\n  if (!supabase) return readLocalEbrData();",
    `async function loadEbrData(): Promise<EbrData> {
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

  if (!supabase) return readLocalEbrData();`,
    "loadEbrData neon branch"
  );
}

source = source.replace("useState(isSupabaseConfigured);", "useState(isSupabaseConfigured || isNeonProvider);");
source = source.replace("if (!dataReady || !supabase) return;", "if (!dataReady || isNeonProvider || !supabase) return;");
source = source.replace("if (!dataReady || supabase) return;", "if (!dataReady || supabase || isNeonProvider) return;");

await writeFile(file, source, "utf8");
