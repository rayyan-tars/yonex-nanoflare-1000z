import { Lilita_One, Nunito } from "next/font/google";
import "@/greenhold/ui/greenhold.css";

const display = Lilita_One({ variable: "--font-gh-display", subsets: ["latin"], weight: "400" });
const body = Nunito({ variable: "--font-gh-body", subsets: ["latin"] });

export default function GreenholdLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${body.variable} gh-fonts`}>{children}</div>;
}
