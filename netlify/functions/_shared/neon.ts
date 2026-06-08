import { neon } from "@neondatabase/serverless";

type NetlifyEnv = {
  env: {
    get(name: string): string | undefined;
  };
};

function readEnv(name: string) {
  const netlify = (globalThis as typeof globalThis & { Netlify?: NetlifyEnv }).Netlify;
  return netlify?.env.get(name) ?? process.env[name];
}

export function getDatabaseUrl() {
  const databaseUrl = readEnv("DATABASE_URL") || readEnv("NETLIFY_DATABASE_URL");
  if (!databaseUrl) {
    throw new Error("DATABASE_URL nao configurada para o banco Neon.");
  }
  return databaseUrl;
}

export function getNeonSql() {
  return neon(getDatabaseUrl());
}

export function jsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init?.headers
    }
  });
}
