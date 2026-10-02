"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PricingSection from "@/components/PricingSection";
import { useWebsiteContent } from "@/hooks/useWebsiteContent";

const Registration = () => {
  const { getSection } = useWebsiteContent();
  const heading = getSection("registration_heading", { title: "Registration" });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 hero-gradient py-16">
        <div className="container mx-auto max-w-5xl px-4">
          <div className="mb-5 h-1 w-16 rounded-full bg-gold" />
          <h1 className="mb-4 font-display text-4xl font-bold leading-tight text-white md:text-5xl">{heading.title}</h1>
          {heading.content ? <p className="max-w-2xl leading-relaxed text-hero-foreground/80">{heading.content}</p> : null}
        </div>
      </div>
      <PricingSection />
      <Footer />
    </div>
  );
};

export default Registration;
