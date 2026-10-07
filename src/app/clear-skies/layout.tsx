import { Baloo_2, Nunito } from "next/font/google";
import "@/clearskies/ui/clearskies.css";

const display = Baloo_2({ variable: "--font-cs-display", subsets: ["latin"], weight: ["700", "800"] });
const body = Nunito({ variable: "--font-cs-body", subsets: ["latin"] });

export default function ClearSkiesLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${body.variable} cs-fonts`}>{children}</div>;
}
