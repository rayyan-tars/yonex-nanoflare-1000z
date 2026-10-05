import type { Metadata, Viewport } from "next";
import { EcoRiseLoader } from "@/ecorise/ui/EcoRiseLoader";

export const metadata: Metadata = {
  title: "EcoRise · Run the Lunch Council",
  description:
    "A city-building prototype about planning school lunches that feed everyone and waste less food.",
};

export const viewport: Viewport = {
  themeColor: "#74c4d6",
};

export default function EcoRisePage() {
  return <EcoRiseLoader />;
}
