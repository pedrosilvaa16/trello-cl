import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { Avisos } from "@/components/ui/avisos";

import "./globals.css";

/*
  IBM Plex Sans foi desenhada para interfaces densas e aguenta corpos pequenos
  sem se desfazer — que é o que uma ferramenta destas pede. A mono só aparece
  onde os caracteres têm de ser lidos um a um: tokens de convite.
*/
const fonteInterface = IBM_Plex_Sans({
  variable: "--fonte-interface",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const fonteMono = IBM_Plex_Mono({
  variable: "--fonte-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Quadros",
    template: "%s · Quadros",
  },
  description: "Ferramenta interna de gestão de tarefas.",
  // Ferramenta interna: não há nada aqui para indexar.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#131614" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-PT"
      className={`${fonteInterface.variable} ${fonteMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Avisos />
      </body>
    </html>
  );
}
