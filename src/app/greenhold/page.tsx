import type { Metadata, Viewport } from "next";
import { GreenholdLoader } from "@/greenhold/ui/GreenholdLoader";

export const metadata: Metadata = {
  title: "Greenhold · Build anything. The planet keeps score.",
  description: "An open-world town builder: build anything you like from blocks, roofs and machines, and grow it sustainably to earn five eco stars.",
};

export const viewport: Viewport = {
  themeColor: "#4aa3d8",
};

export default function GreenholdPage() {
  return <GreenholdLoader />;
}
