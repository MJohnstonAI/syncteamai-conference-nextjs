import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
});

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
      <body className={playfair.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
