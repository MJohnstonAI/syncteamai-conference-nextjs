import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "SyncTeamAI - Multi-Agent AI Conferences",
  description:
    "Run collaborative AI conferences with multiple agents working together to solve complex problems",
  authors: [{ name: "SyncTeamAI" }],
  openGraph: {
    title: "SyncTeamAI - Multi-Agent AI Conferences",
    description:
      "Run collaborative AI conferences with multiple agents working together to solve complex problems",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
