import type { Metadata, Viewport } from "next";
import { ClearSkiesLoader } from "@/clearskies/ui/ClearSkiesLoader";

export const metadata: Metadata = {
  title: "Clear Skies · Three decisions to clear a town's air",
  description: "A short sustainability game: a smoggy town, three decisions about power, traffic and nature, and a before-and-after view of the air you cleared.",
};

export const viewport: Viewport = {
  themeColor: "#9fb7c4",
};

export default function ClearSkiesPage() {
  return <ClearSkiesLoader />;
}
