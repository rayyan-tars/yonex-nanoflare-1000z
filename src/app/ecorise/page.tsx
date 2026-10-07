import type { Metadata, Viewport } from "next";
import { EcoRiseLoader } from "@/ecorise/ui/EcoRiseLoader";

export const metadata: Metadata = {
  title: "Second Life: 2050 · Small actions. Shared impact. A different future.",
  description:
    "A school sustainability game: small missions from 2050, a shared school goal, and a campus that changes with every action.",
};

export const viewport: Viewport = {
  themeColor: "#74c4d6",
};

export default function EcoRisePage() {
  return <EcoRiseLoader />;
}
