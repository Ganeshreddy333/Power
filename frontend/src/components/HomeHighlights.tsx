"use client";

import { Building2, Globe2, Lightbulb, Users, Zap } from "lucide-react";
import { splitParagraphs, useWebsiteContent } from "@/hooks/useWebsiteContent";

const profiles = [
  {
    icon: Building2,
    title: "Research & Industry Profile",
    text: "Solar, wind, hydrogen, storage, grid systems, clean mobility, smart cities, policy, finance, and sustainable energy solutions.",
  },
  {
    icon: Users,
    title: "Participant Profile",
    text: "Researchers, academicians, students, engineers, policy leaders, consultants, innovators, investors, and clean energy professionals.",
  },
];

const highlights = [
  { icon: Zap, value: "300+", label: "Expert Speakers" },
  { icon: Users, value: "100+", label: "Expected Delegates" },
  { icon: Globe2, value: "30+", label: "Countries" },
  { icon: Lightbulb, value: "30+", label: "Sessions" },
];

const HomeHighlights = () => {
  const { getSection } = useWebsiteContent();
  const welcome = getSection("home_welcome", {
    title: "Energy Innovation, Research, and Global Collaboration",
    content:
      "Renewable Energy 2027 brings together clean-energy researchers, technology leaders, institutions, and policy voices for a focused virtual conference on practical pathways to sustainable power.\n\nThe experience is designed to feel direct, credible, and active: strong scientific sessions, clear registration paths, publication visibility, and international networking for presenters and delegates.",
  });
  const managedProfiles = profiles.map((profile, index) => {
    const section = getSection(index === 0 ? "home_profile_research" : "home_profile_participants", {
      title: profile.title,
      content: profile.text,
    });
    return { ...profile, ...section, text: section.content };
  });

  return (
    <>
      <section
        className="relative overflow-hidden bg-cover bg-center py-24"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(248,250,252,0.94), rgba(248,250,252,0.84), rgba(248,250,252,0.70)), url('https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1600&q=80')",
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(16,185,129,0.18),transparent_32%),radial-gradient(circle_at_85%_70%,rgba(234,179,8,0.20),transparent_28%)]" />
        <div className="container relative mx-auto px-4">
          <div>
            <p className="section-kicker mb-2">Welcome</p>
            <h2 className="mb-5 font-display text-3xl font-black uppercase leading-tight text-foreground md:text-5xl">
              {welcome.title}
            </h2>
            <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
              {splitParagraphs(welcome.content).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
              {managedProfiles.map((item) => (
                <div key={item.title} className="rounded-md border border-white/60 bg-white/90 p-5 shadow-xl shadow-teal/10 backdrop-blur">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-teal/10">
                    <item.icon className="text-teal" size={24} />
                  </div>
                  <h3 className="mb-2 font-display text-lg font-black text-card-foreground">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="expo-band py-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-5 md:grid-cols-4">
            {highlights.map((item) => (
              <div key={item.label} className="rounded-md border border-white/15 bg-white/95 p-6 text-center shadow-xl shadow-black/10">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-gold text-hero-bg">
                  <item.icon size={26} />
                </div>
                <p className="font-display text-4xl font-black text-red-600">{item.value}</p>
                <p className="mt-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

export default HomeHighlights;
