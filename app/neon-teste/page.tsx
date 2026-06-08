"use client";

import { useState } from "react";

type HealthResponse = {
  ok: boolean;
  provider: string;
  message?: string;
  database?: {
    checked_at: string;
    database_name: string;
    schema_name: string;
  };
};

export default function NeonTestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResponse | null>(null);

  async function testConnection() {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/neon/health");
      const data = (await response.json()) as HealthResponse;
      setResult(data);
    } catch (error) {
      setResult({
        ok: false,
        provider: "neon",
        message: error instanceof Error ? error.message : "Nao foi possivel testar a conexao."
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto flex max-w-2xl flex-col gap-6 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-2xl">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-blue-200">EBR laboratorio</p>
          <h1 className="mt-3 text-3xl font-extrabold">Teste paralelo com Neon</h1>
          <p className="mt-3 text-sm leading-6 text-slate-200">
            Esta pagina existe apenas na copia de teste. Ela verifica se a variavel DATABASE_URL esta conectando no banco Neon.
          </p>
        </div>

        <button
          type="button"
          onClick={testConnection}
          disabled={loading}
          className="rounded-2xl bg-blue-500 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Testando..." : "Testar conexao Neon"}
        </button>

        {result && (
          <div className={`rounded-2xl border p-4 text-sm ${result.ok ? "border-emerald-400/40 bg-emerald-400/10" : "border-red-400/40 bg-red-400/10"}`}>
            <p className="font-extrabold">{result.ok ? "Conexao funcionando" : "Conexao nao configurada ou com erro"}</p>
            {result.database ? (
              <div className="mt-3 space-y-1 text-slate-100">
                <p>Banco: {result.database.database_name}</p>
                <p>Schema: {result.database.schema_name}</p>
                <p>Horario: {new Date(result.database.checked_at).toLocaleString("pt-BR")}</p>
              </div>
            ) : (
              <p className="mt-3 text-slate-100">{result.message}</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
