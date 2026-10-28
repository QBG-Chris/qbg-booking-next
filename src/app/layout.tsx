import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BlendIQ Booking",
  description: "Find your stylist, choose your service, and make time for a fresh look!",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
