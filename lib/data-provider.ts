// O EBR usa Neon como fonte principal. Manter esse padrão evita que um build
// manual publicado no Netlify caia silenciosamente no modo local/Supabase.
export const dataProvider = process.env.NEXT_PUBLIC_DATA_PROVIDER ?? "neon";

export const isNeonProvider = dataProvider === "neon";

function readSessionToken() {
  if (typeof window === "undefined") return "";
  try {
    const saved = JSON.parse(sessionStorage.getItem("ebr-session") ?? "{}") as { token?: string };
    return saved.token ?? "";
  } catch {
    sessionStorage.removeItem("ebr-session");
    return "";
  }
}

export async function fetchNeonJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readSessionToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload && typeof payload.message === "string" ? payload.message : "Erro ao acessar o banco Neon.";
    throw new Error(message);
  }

  return payload as T;
}