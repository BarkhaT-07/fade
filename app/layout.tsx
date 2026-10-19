import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fade: self-destructing notes",
  description: "Share text with a link that deletes itself.",
};

const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem("fade-theme");
    var theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
