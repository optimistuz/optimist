import Hero from "@/components/sections/hero";
import Positioning from "@/components/sections/positioning";
import Vision from "@/components/sections/vision";
import Services from "@/components/sections/services";
import Expertise from "@/components/sections/expertise";
import Anatomy from "@/components/sections/anatomy";
import Brands from "@/components/sections/brands";
import Collections from "@/components/sections/collections";
import FitQuiz from "@/components/sections/fit-quiz";
import Atmosphere from "@/components/sections/atmosphere";
import Testimonials from "@/components/sections/testimonials";
import Salons from "@/components/sections/salons";
import Faq from "@/components/sections/faq";
import CTA from "@/components/sections/cta";
import { FocalSeam } from "@/components/ui/focal-seam";

export default function Home() {
  return (
    <>
      <Hero />
      <Positioning />
      <Vision />
      <Services />
      {/* Шов наводки: услуги → экспертиза (стык глав, мотив редкости) */}
      <FocalSeam />
      <Expertise />
      <Anatomy />
      <Brands />
      <Collections />
      {/* Шов наводки: коллекции → подбор */}
      <FocalSeam />
      <FitQuiz />
      <Atmosphere />
      <Testimonials />
      <Salons />
      <Faq />
      <CTA />
    </>
  );
}
