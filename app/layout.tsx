import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Curio",
  description: "Learn by explaining with a curious AI novice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
