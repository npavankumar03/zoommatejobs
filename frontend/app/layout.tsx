import "./globals.css";
import type { Metadata } from "next";

import { AuthProvider } from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "zoommate",
  description: "Full-stack job search platform"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
