import type { Metadata } from "next";
import FutureShiftClient from "./FutureShiftClient";

export const metadata: Metadata = {
  title: "FutureShift: Campus 2050",
  description: "Three choices. One future. Make three changes to a school and drag the Future Lens to see 2050.",
};

export default function FutureShiftPage() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- fonts are only used by this isolated route */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Nunito:wght@600;700;800;900&display=swap"
        precedence="default"
      />
      <FutureShiftClient />
    </>
  );
}
