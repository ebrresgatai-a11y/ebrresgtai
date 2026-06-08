export const dataProvider = process.env.NEXT_PUBLIC_DATA_PROVIDER ?? "supabase";

export const isNeonProvider = dataProvider === "neon";

export async function fetchNeonJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
