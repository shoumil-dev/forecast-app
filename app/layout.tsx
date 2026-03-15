import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UK Wind Forecast Accuracy",
  description: "Visualise actual vs forecasted UK national wind power generation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
