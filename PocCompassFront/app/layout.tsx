import type { Metadata } from "next";
import "./globals.css";
import AppShell from "./components/AppShell";
import { ToastProvider } from "./components/ui/ToastProvider";
import { AppProvider } from "./contexts/AppContext";

export const metadata: Metadata = {
  title: "PoC Compass",
  description: "PoC・企画・業務改善の目的・仮説・成功条件とタスクを一元管理し、目的からのズレを AI が検知する",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">
        <ToastProvider>
          <AppProvider>
            <AppShell>{children}</AppShell>
          </AppProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
