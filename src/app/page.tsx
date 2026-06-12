import Hero from "@/components/sections/hero";
import Positioning from "@/components/sections/positioning";
import Vision from "@/components/sections/vision";
import Services from "@/components/sections/services";
import Expertise from "@/components/sections/expertise";
import Anatomy from "@/components/sections/anatomy";
import Brands from "@/components/sections/brands";
import Collections from "@/components/sections/collections";
import Atmosphere from "@/components/sections/atmosphere";
import Testimonials from "@/components/sections/testimonials";
import Salons from "@/components/sections/salons";
import CTA from "@/components/sections/cta";

export default function Home() {
  return (
    <>
      <Hero />
      <Positioning />
      <Vision />
      <Services />
      <Expertise />
      <Anatomy />
      <Brands />
      <Collections />
      <Atmosphere />
      <Testimonials />
      <Salons />
      <CTA />
    </>
  );
}
