import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

type NetlifyEnv = { env: { get(name: string): string | undefined } };

function readEnv(name: string) {
  const netlify = (globalThis as typeof globalThis & { Netlify?: NetlifyEnv }).Netlify;
  return netlify?.env.get(name) ?? process.env[name];
}

export function firebaseAdminConfigured() {
  return Boolean(
    (readEnv("EBR_FIREBASE_PROJECT_ID") && readEnv("EBR_FIREBASE_CLIENT_EMAIL") && readEnv("EBR_FIREBASE_PRIVATE_KEY_B64")) ||
    readEnv("FIREBASE_SERVICE_ACCOUNT_BASE64") ||
    (readEnv("FIREBASE_PROJECT_ID") && readEnv("FIREBASE_CLIENT_EMAIL") && (readEnv("FIREBASE_PRIVATE_KEY_BASE64") || readEnv("FIREBASE_PRIVATE_KEY")))
  );
}

export function getFirebaseAdminMessaging() {
  const encodedServiceAccount = readEnv("FIREBASE_SERVICE_ACCOUNT_BASE64");
  const serviceAccount = encodedServiceAccount
    ? JSON.parse(Buffer.from(encodedServiceAccount, "base64").toString("utf8")) as { project_id?: string; client_email?: string; private_key?: string }
    : null;
  const projectId = readEnv("EBR_FIREBASE_PROJECT_ID") ?? serviceAccount?.project_id ?? readEnv("FIREBASE_PROJECT_ID");
  const clientEmail = readEnv("EBR_FIREBASE_CLIENT_EMAIL") ?? serviceAccount?.client_email ?? readEnv("FIREBASE_CLIENT_EMAIL");
  const ebrPrivateKey = readEnv("EBR_FIREBASE_PRIVATE_KEY_B64");
  const encodedPrivateKey = ebrPrivateKey ?? readEnv("FIREBASE_PRIVATE_KEY_BASE64");
  const privateKey = (
    serviceAccount?.private_key ??
    (encodedPrivateKey ? Buffer.from(encodedPrivateKey, "base64").toString("utf8") : readEnv("FIREBASE_PRIVATE_KEY"))
  )?.replace(/\\n/g, "\n").trim();
  if (!projectId || !clientEmail || !privateKey) throw new Error("Credenciais Firebase Admin não configuradas.");
  console.info("[push] Credencial Firebase selecionada.", {
    source: ebrPrivateKey ? "ebr-compact" : serviceAccount ? "unified" : encodedPrivateKey ? "compact" : "legacy",
    projectId
  });
  const existing = getApps().find((app) => app.name === "ebr-fcm");
  const app = existing ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, "ebr-fcm");
  return getMessaging(app);
}
