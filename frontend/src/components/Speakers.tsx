"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SpeakersSection from "@/components/SpeakersSection";
import { splitLines, splitParagraphs, useWebsiteContent } from "@/hooks/useWebsiteContent";

const Speakers = () => {
  const { getSection } = useWebsiteContent();
  const intro = getSection("speakers_intro", {
    title: "Where Ideas Meet Impact",
    content:
      "The Scientific Committee of Renewable Energy - 2027 comprises a globally distinguished panel of leading academicians, researchers, and industry experts dedicated to advancing innovation in renewable and sustainable energy.",
  });
  const overview = getSection("speakers_overview", {
    title: "Speakers",
    content:
      "At Renewable Energy - 2027, our speakers are not just presenters. They are the minds shaping the future of global energy. From renowned professors and pioneering researchers to visionary industry leaders, each speaker brings a story of innovation, discovery, and real-world impact.",
  });
  const platform = getSection("speakers_platform", {
    title: "A Platform for Thought Leaders",
    content:
      "Every speaker at this conference is carefully selected for their contribution to science, technology, and sustainability. Here, you will experience:\n\nResearch that challenges conventional thinking\nIdeas that inspire global change\nConversations that lead to collaboration",
  });
  const speakerTypes = [
    getSection("speakers_plenary", {
      title: "Plenary Speakers",
      content:
        "Our plenary speakers are globally respected leaders whose work has influenced the direction of renewable energy research and policy.",
    }),
    getSection("speakers_keynote", {
      title: "Keynote Speakers",
      content:
        "Our keynote speakers bring powerful insights into where energy innovation is heading and how sustainability is evolving globally.",
    }),
    getSection("speakers_invited", {
      title: "Invited Speakers",
      content:
        "Our invited speakers bridge the gap between research and real-world implementation through practical applications and industry-driven innovation.",
    }),
  ];
  const closing = getSection("speakers_closing", {
    title: "More Than Just Talks",
    content:
      "Being part of the speaker sessions means engaging with ideas that matter, connecting with global experts, exploring collaborations beyond borders, and being part of conversations that shape the future.",
  });
  const platformParts = splitParagraphs(platform.content);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="pt-20 hero-gradient py-16">
        <div className="container mx-auto max-w-5xl px-4">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.22em] text-gold-light">Scientific Committee</p>
          <div className="mb-5 h-1 w-16 rounded-full bg-gold" />
          <h1 className="mb-4 font-display text-4xl font-bold leading-tight text-white md:text-5xl">{intro.title}</h1>
          <p className="max-w-3xl leading-8 text-hero-foreground/80">{intro.content}</p>
        </div>
      </div>

      <section className="bg-gradient-to-b from-background via-teal/5 to-background py-16 md:py-20">
        <div className="container mx-auto max-w-5xl px-4">
          <div className="mb-12 max-w-3xl">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-gold">Speakers</p>
            <div className="mb-5 h-1 w-14 rounded-full bg-gold" />
            <h2 className="mb-4 font-display text-3xl font-bold leading-tight text-foreground md:text-4xl">{overview.title}</h2>
            <p className="leading-8 text-muted-foreground">{overview.content}</p>
          </div>

          <div className="space-y-10">
            <div className="border-l-4 border-teal/20 pl-6 md:pl-8">
              <h3 className="mb-3 font-display text-2xl font-bold text-teal">{platform.title}</h3>
              <p className="mb-4 leading-8 text-muted-foreground">{platformParts[0]}</p>
              <ul className="list-inside list-disc space-y-3 leading-8 text-muted-foreground">
                {splitLines(platformParts.slice(1).join("\n")).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            {speakerTypes.map((item, index) => (
              <div key={item.title} className="border-t border-border/70 pt-8">
                <div className="flex items-start gap-4">
                  <span className={`mt-2 h-3 w-3 shrink-0 rounded-full ${index === 1 ? "bg-teal" : "bg-gold"}`} />
                  <div>
                    <h3 className={`mb-3 font-display text-2xl font-bold ${index === 1 ? "text-teal" : "text-gold"}`}>
                      {item.title}
                    </h3>
                    <p className="max-w-4xl leading-8 text-muted-foreground">{item.content}</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="border-t border-border/70 pt-8">
              <h3 className="mb-3 font-display text-2xl font-bold text-teal">{closing.title}</h3>
              <p className="leading-8 text-muted-foreground">{closing.content}</p>
            </div>
          </div>
        </div>
      </section>

      <SpeakersSection />
      <Footer />
    </div>
  );
};

export default Speakers;
