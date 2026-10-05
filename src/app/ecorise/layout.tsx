import { Figtree, Fraunces } from "next/font/google";
import "@/ecorise/ui/ecorise.css";

const display = Fraunces({
  variable: "--font-eco-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
});

const body = Figtree({
  variable: "--font-eco-body",
  subsets: ["latin"],
});

export default function EcoRiseLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${body.variable} eco-fonts`}>{children}</div>;
}
