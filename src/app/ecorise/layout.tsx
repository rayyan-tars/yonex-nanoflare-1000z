import { Fredoka, Nunito } from "next/font/google";
import "@/ecorise/ui/ecorise.css";

const display = Fredoka({
  variable: "--font-eco-display",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const body = Nunito({
  variable: "--font-eco-body",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export default function EcoRiseLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${body.variable} eco-fonts`}>{children}</div>;
}
