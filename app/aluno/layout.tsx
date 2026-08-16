import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EBR Aluno",
  description: "Portal do aluno da Escola Bíblica Resgatai",
  manifest: "/manifest-aluno.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EBR Aluno"
  },
  icons: {
    icon: "/ebr-logo.jpg",
    apple: "/ebr-logo.jpg"
  }
};

export default function StudentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
