import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BravoClient Customers Portal",
  description: "Customer operations and Climbo synchronization for BravoClient.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
