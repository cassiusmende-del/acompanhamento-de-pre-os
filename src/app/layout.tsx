import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Histórico de preços",
  description: "Acompanhamento pessoal do histórico de preços da Amazon Brasil",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
