"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";

const PUSH_TOKEN_STORAGE_KEY = "ebr-fcm-token";
const TEAM_PUSH_TOKEN_STORAGE_KEY = "ebr-fcm-team-token";

function managementAuthorizationHeader(): Record<string, string> {
  try {
    const session = JSON.parse(sessionStorage.getItem("ebr-session") ?? "{}") as { token?: string };
    return session.token ? { Authorization: `Bearer ${session.token}` } : {};
  } catch {
    return {};
  }
}

function firebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? ""
  };
}

function firebaseConfigured() {
  const config = firebaseConfig();
  return Boolean(config.apiKey && config.projectId && config.messagingSenderId && config.appId && process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);
}

function serviceWorkerUrl() {
  const params = new URLSearchParams(firebaseConfig());
  return `/sw.js?${params.toString()}`;
}

export async function registerEbrServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) return null;
  return navigator.serviceWorker.register(serviceWorkerUrl(), { scope: "/", updateViaCache: "none" });
}

async function activeEbrServiceWorker() {
  const registration = await registerEbrServiceWorker();
  if (!registration) return null;
  const pendingWorker = registration.installing ?? registration.waiting;
  if (pendingWorker && pendingWorker.state !== "activated") {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("O serviço de notificações demorou para atualizar.")), 15000);
      pendingWorker.addEventListener("statechange", () => {
        if (pendingWorker.state === "activated") {
          window.clearTimeout(timeout);
          resolve();
        } else if (pendingWorker.state === "redundant") {
          window.clearTimeout(timeout);
          reject(new Error("Não foi possível atualizar o serviço de notificações."));
        }
      });
    });
  }
  return navigator.serviceWorker.ready;
}

function isIosBrowser() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function browserMessaging() {
  if (typeof window === "undefined" || !firebaseConfigured() || !(await isSupported())) return null;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig());
  return getMessaging(app);
}

export type PushRegistrationResult = {
  enabled: boolean;
  reason?: "unsupported" | "not-configured" | "denied" | "install-required" | "error";
  message: string;
};

export async function registerStudentPushToken(alunoId: number): Promise<PushRegistrationResult> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { enabled: false, reason: "unsupported", message: "Este navegador não oferece notificações push." };
  }
  if (isIosBrowser() && !isStandaloneApp()) {
    return { enabled: false, reason: "install-required", message: "No iPhone, toque em Compartilhar, escolha Adicionar à Tela de Início, abra o EBR pelo novo ícone e tente novamente." };
  }
  if (!("Notification" in window)) {
    return { enabled: false, reason: "unsupported", message: "Atualize o navegador ou abra o EBR pelo Chrome para ativar notificações." };
  }
  if (!window.isSecureContext) {
    return { enabled: false, reason: "unsupported", message: "As notificações precisam ser ativadas no endereço seguro do EBR." };
  }
  if (!firebaseConfigured()) {
    return { enabled: false, reason: "not-configured", message: "As notificações ainda não foram configuradas neste ambiente." };
  }

  try {
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "denied") {
      return { enabled: false, reason: "denied", message: "As notificações estão bloqueadas. Libere-as nas configurações do navegador e tente novamente." };
    }
    if (permission !== "granted") {
      return { enabled: false, reason: "denied", message: "A permissão não foi concluída. Toque em Ativar notificações e escolha Permitir." };
    }

    const messaging = await browserMessaging();
    if (!messaging) return { enabled: false, reason: "unsupported", message: "Este navegador não é compatível com as notificações do EBR." };

    const registration = await activeEbrServiceWorker();
    if (!registration) return { enabled: false, reason: "unsupported", message: "Este navegador não oferece notificações push." };
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token) return { enabled: false, reason: "error", message: "Não foi possível identificar este dispositivo. Reabra o EBR e tente novamente." };

    const response = await fetch("/api/push/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alunoId, token, plataforma: isIosBrowser() ? "ios-web" : "web" })
    });
    if (!response.ok) {
      const details = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(details?.message || "Falha ao registrar o dispositivo.");
    }
    localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    return { enabled: true, message: "Notificações ativadas neste dispositivo." };
  } catch (error) {
    console.error("[EBR push] Falha ao ativar notificações", error);
    return { enabled: false, reason: "error", message: error instanceof Error ? `Não foi possível ativar: ${error.message}` : "Não foi possível ativar as notificações agora." };
  }
}

export async function registerTeamPushToken(membroId: number): Promise<PushRegistrationResult> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) {
    return { enabled: false, reason: "unsupported", message: "Este navegador não oferece notificações push." };
  }
  if (isIosBrowser() && !isStandaloneApp()) {
    return { enabled: false, reason: "install-required", message: "No iPhone, adicione o EBR Gestão à Tela de Início, abra pelo novo ícone e tente novamente." };
  }
  if (!window.isSecureContext || !firebaseConfigured()) {
    return { enabled: false, reason: "not-configured", message: "As notificações não estão disponíveis neste ambiente." };
  }
  try {
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return { enabled: false, reason: "denied", message: "Permita as notificações nas configurações do navegador." };
    const messaging = await browserMessaging();
    if (!messaging) return { enabled: false, reason: "unsupported", message: "Este navegador não é compatível com as notificações do EBR." };
    const registration = await activeEbrServiceWorker();
    if (!registration) return { enabled: false, reason: "unsupported", message: "Este navegador não oferece notificações push." };
    const token = await getToken(messaging, { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { enabled: false, reason: "error", message: "Não foi possível identificar este dispositivo." };
    const response = await fetch("/api/push/team-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...managementAuthorizationHeader() },
      body: JSON.stringify({ membroId, token, plataforma: isIosBrowser() ? "ios-web" : "web" })
    });
    if (!response.ok) throw new Error("Falha ao registrar o dispositivo da equipe.");
    localStorage.setItem(TEAM_PUSH_TOKEN_STORAGE_KEY, token);
    return { enabled: true, message: "Notificações de aniversários ativadas." };
  } catch (error) {
    console.error("[EBR push] Falha ao ativar notificações da equipe", error);
    return { enabled: false, reason: "error", message: error instanceof Error ? error.message : "Não foi possível ativar as notificações." };
  }
}

export async function deactivateTeamPushToken(membroId: number) {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem(TEAM_PUSH_TOKEN_STORAGE_KEY);
  if (token) {
    await fetch("/api/push/team-tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...managementAuthorizationHeader() },
      body: JSON.stringify({ membroId, token })
    }).catch(() => undefined);
  }
  localStorage.removeItem(TEAM_PUSH_TOKEN_STORAGE_KEY);
}

export async function deactivateStudentPushToken(alunoId: number) {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (token) {
    await fetch("/api/push/tokens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alunoId, token })
    }).catch(() => undefined);
  }
  const messaging = await browserMessaging().catch(() => null);
  if (messaging) await deleteToken(messaging).catch(() => false);
  localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}

export async function listenForForegroundPush(onPush: (payload: { title: string; message: string; link: string }) => void) {
  const messaging = await browserMessaging().catch(() => null);
  if (!messaging) return () => undefined;
  return onMessage(messaging, (payload) => {
    const notification = {
      title: payload.notification?.title ?? payload.data?.title ?? "Nova notificação EBR",
      message: payload.notification?.body ?? payload.data?.message ?? "Você recebeu uma novidade.",
      link: payload.data?.link ?? "/aluno"
    };
    onPush(notification);
    if (Notification.permission === "granted" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then((registration) => registration.showNotification(notification.title, {
        body: notification.message,
        icon: "/ebr-logo.jpg",
        badge: "/ebr-logo.jpg",
        tag: payload.data?.notificationId ?? payload.data?.type ?? "ebr-notification",
        data: { link: notification.link }
      })).catch((error) => console.error("[EBR push] Falha ao exibir notificação em primeiro plano", error));
    }
  });
}
