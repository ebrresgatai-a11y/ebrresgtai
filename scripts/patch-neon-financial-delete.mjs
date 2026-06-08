import { readFile, writeFile } from "node:fs/promises";
const file = new URL("../app/page.tsx", import.meta.url);
let source = await readFile(file, "utf8");
const regex = /    if \(supabase\) \{\s+const \{ data, error \} = await supabase\.from\("financial_entries"\)\.delete\(\)\.eq\("id", entryToDelete\.id\)\.select\("id"\);[\s\S]*?\n    \}\n    setFinanceFeedback/;
const replacement = `    if (isNeonProvider) {
      await neonMutate<{ deleted: boolean }>("financialEntry", "delete", undefined, entryToDelete.id);
    } else if (supabase) {
      const { data, error } = await supabase.from("financial_entries").delete().eq("id", entryToDelete.id).select("id");
      if (error || !data?.length) {
        setEntries((current) => current.some((entry) => entry.id === entryToDelete.id) ? current : [entryToDelete, ...current].sort((a, b) => b.id - a.id));
        setFinanceFeedback({ kind: "error", message: "Nao foi possivel excluir o lancamento no banco." });
        return;
      }
    }
    setFinanceFeedback`;
const next = source.replace(regex, replacement);
if (next === source) throw new Error("financial delete regex not found");
await writeFile(file, next, "utf8");
