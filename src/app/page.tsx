import { Navbar } from "@/components/ui/Navbar";
import { ProductHero } from "@/components/sections/ProductHero";
import { SpeedSequence } from "@/components/sections/SpeedSequence";
import { EngineeringSection } from "@/components/sections/EngineeringSection";
import { RacketAnatomy } from "@/components/sections/RacketAnatomy";
import { Specifications } from "@/components/sections/Specifications";
import { SpeedBreak } from "@/components/sections/SpeedBreak";
import { ProductFinale } from "@/components/sections/ProductFinale";
import { Footer } from "@/components/sections/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <ProductHero />
        <SpeedSequence />
        <EngineeringSection />
        <RacketAnatomy />
        <Specifications />
        <SpeedBreak />
        <ProductFinale />
      </main>
      <Footer />
    </>
  );
}
