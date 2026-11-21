import { About } from "@/components/About";
import { Archive } from "@/components/Archive";
import { Featured } from "@/components/Featured";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { Nav } from "@/components/Nav";
import { Platforms } from "@/components/Platforms";
import { ResultSection } from "@/components/Result";
import { GridLines } from "@/components/ui";

export default function Home() {
  return (
    <>
      <GridLines />
      <Nav />
      <main className="relative z-10">
        <Hero />
        <ResultSection />
        <Featured />
        <Archive />
        <Platforms />
        <About />
      </main>
      <div className="relative z-10">
        <Footer />
      </div>
    </>
  );
}
