import type { Metadata } from "next";
// import { Geist, Geist_Mono } from "next/font/google";
import "normalize.css";
import "./layout.css";

// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   subsets: ["latin"],
// });

// const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

export const metadata: Metadata = {
  title: " ",
  description: " ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="theme-color" content="" id="theme-color"></meta>
      </head>

      <body>
        {children}
      </body>
    </html>
  );
}
