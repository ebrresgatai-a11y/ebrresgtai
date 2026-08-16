import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { getNeonSql } from "./neon";

type Role = "admin" | "teacher" | "student";

export type SessionClaims = {
  sub: number;
  role: Role;
  name: string;
  room?: string;
  exp: number;
};

export class AuthError extends Error {
  constructor(message = "Sessão inválida ou expirada.", public status = 401) {
    super(message);
  }
}

type NetlifyEnv = { env: { get(name: string): string | undefined } };

function readEnv(name: string) {
  const netlify = (globalThis as typeof globalThis & { Netlify?: NetlifyEnv }).Netlify;
  return netlify?.env.get(name) ?? process.env[name];
}

function sessionSecret() {
  const secret = readEnv("EBR_AUTH_SESSION_SECRET") || readEnv("DATABASE_URL");
  if (!secret || secret.length < 32) throw new AuthError("Configuração de segurança indisponível.", 503);
  return secret;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signature(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSession(input: Omit<SessionClaims, "exp">, durationSeconds = 60 * 60 * 12) {
  const claims: SessionClaims = { ...input, exp: Math.floor(Date.now() / 1000) + durationSeconds };
  const payload = encode(JSON.stringify(claims));
  return `${payload}.${signature(payload)}`;
}

export function requireSession(req: Request): SessionClaims {
  const value = req.headers.get("authorization") ?? "";
  const token = value.startsWith("Bearer ") ? value.slice(7).trim() : "";
  const [payload, receivedSignature, ...extra] = token.split(".");
  if (!payload || !receivedSignature || extra.length) throw new AuthError();
  const expectedSignature = signature(payload);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new AuthError();
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
    if (!claims.sub || !claims.role || !claims.exp || claims.exp < Math.floor(Date.now() / 1000)) throw new AuthError();
    return claims;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError();
  }
}

export function requireManagementSession(req: Request) {
  const claims = requireSession(req);
  if (claims.role !== "admin" && claims.role !== "teacher") throw new AuthError("Acesso restrito à equipe.", 403);
  return claims;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const digest = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${digest}`;
}

function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith("scrypt$")) return stored === password;
  const [, salt, digest] = stored.split("$");
  if (!salt || !digest) return false;
  const expected = Buffer.from(digest, "base64url");
  const received = scryptSync(password, salt, 64);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function normalizedLogin(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export async function loginTeamMember(login: string, password: string) {
  const cleanLogin = normalizedLogin(login);
  const cleanPassword = password.trim();
  if (!cleanLogin || !cleanPassword) throw new AuthError("Usuário ou senha inválidos.");
  const sql = getNeonSql();
  const rows = await sql`select id, name, username, email, phone, password, role, room, avatar from team_members`;
  const member = rows.find((row) => {
    const textMatch = [row.username, row.email, row.name].some((value) => normalizedLogin(String(value ?? "")) === cleanLogin);
    const digits = phoneDigits(login);
    return textMatch || Boolean(digits && phoneDigits(String(row.phone ?? "")) === digits);
  });
  if (!member || !verifyPassword(cleanPassword, String(member.password ?? ""))) throw new AuthError("Usuário ou senha inválidos.");
  if (!String(member.password ?? "").startsWith("scrypt$")) {
    await sql`update team_members set password = ${hashPassword(cleanPassword)}, updated_at = now() where id = ${member.id}`;
  }
  const role = member.role === "admin" ? "admin" : "teacher";
  const user = { id: Number(member.id), name: String(member.name ?? ""), username: String(member.username ?? ""), email: String(member.email ?? ""), role, avatar: String(member.avatar ?? ""), room: role === "teacher" ? String(member.room ?? "") : undefined };
  return { token: createSession({ sub: user.id, role, name: user.name, room: user.room }), user };
}