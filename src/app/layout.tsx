import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Histórico de preços",
  description: "Acompanhamento pessoal do histórico de preços da Amazon Brasil",
};

const NAV = [
  { href: "/", label: "Produtos" },
  { href: "/capturar", label: "Capturar" },
  { href: "/registros", label: "Registros" },
  { href: "/configuracoes", label: "Configurações" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">
        <header className="border-b border-rule">
          <div className="mx-auto flex max-w-5xl flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-3">
            <Link href="/" className="font-semibold">
              Histórico de preços
            </Link>
            <nav className="flex gap-4 text-sm">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="text-muted hover:text-foreground">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
