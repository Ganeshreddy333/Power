"use client";

import { motion } from "framer-motion";
import CountdownTimer from "./CountdownTimer";
import Link from "next/link";
import { useSiteData } from "@/hooks/useSiteData";
import { useWebsiteContent } from "@/hooks/useWebsiteContent";
import { CalendarDays, Download, Leaf, Lightbulb, Network, Send, Ticket, TrendingUp, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { apiClient } from "@/integrations/api/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const HeroSection = () => {
  const { values } = useSiteData();
  const { getSection } = useWebsiteContent();
  const { toast } = useToast();
  const [brochureDialogOpen, setBrochureDialogOpen] = useState(false);
  const [brochureSubmitted, setBrochureSubmitted] = useState(false);
  const [isSubmittingBrochure, setIsSubmittingBrochure] = useState(false);
  const configuredTitle = getSection("hero_title").content.trim();
  const configuredTitleLines = configuredTitle.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const ampersandIndex = configuredTitle.indexOf("&");
  const heroTitleLines = configuredTitleLines.length === 1 && ampersandIndex > 0
    ? [configuredTitle.slice(0, ampersandIndex).trim(), configuredTitle.slice(ampersandIndex).trim()]
    : configuredTitleLines;
  const configuredDateLine = getSection("hero_subtitle").content.trim();

  const handleBrochureSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmittingBrochure(true);

    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("fullName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const mobileNumber = String(formData.get("mobileNumber") || "").trim();
    const company = String(formData.get("company") || "").trim();
    const jobTitle = String(formData.get("jobTitle") || "").trim();
    const country = String(formData.get("country") || "").trim();
    const message = String(formData.get("message") || "").trim();

    const { error } = await apiClient.from("contact_messages").insert({
      name: fullName,
      email,
      subject: "Brochure download request",
      message: [
        `Mobile Number: ${mobileNumber}`,
        `Company / Organization: ${company}`,
        `Job Title / Designation: ${jobTitle}`,
        `Country: ${country}`,
        `Message: ${message || "Not provided"}`,
      ].join("\n"),
      status: "new",
    });

    setIsSubmittingBrochure(false);
    if (error) {
      toast({
        title: "Could not submit your details",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setBrochureSubmitted(true);
    toast({ title: "Details submitted", description: "Your brochure is ready to download." });
  };

  return (
    <section className="hero-gradient relative flex min-h-[620px] items-center overflow-hidden pb-24 pt-20 md:pb-28 md:pt-24">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(250,204,21,0.30),transparent_25%),linear-gradient(180deg,transparent,rgba(6,36,29,0.42))]" />
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-hero-bg/35 to-transparent" />

      <div className="relative z-10 mx-auto w-full px-4">
        <div className="flex justify-center">
          <div className="w-full text-center">
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-4 inline-flex rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-extrabold uppercase tracking-[0.18em] text-gold-light backdrop-blur"
            >
              {values.hero_eyebrow}
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-3 w-full max-w-none text-[clamp(1rem,3.2vw,3rem)] font-black uppercase leading-[1.05] tracking-[-0.035em] text-white"
            >
              {heroTitleLines.map((line, index) => (
                <span
                  key={`${line}-${index}`}
                  className={`block ${index === 1 ? "text-[clamp(1.125rem,2.3vw,2rem)] leading-[1.15] text-gold" : "md:whitespace-nowrap"}`}
                >
                  {line}
                </span>
              ))}
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-2 flex flex-wrap justify-center gap-3"
            >
              <span className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-3 text-sm font-extrabold text-hero-bg shadow-lg">
                <CalendarDays size={18} className="text-teal" />
                {configuredDateLine}
              </span>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mx-auto mb-6 max-w-3xl text-base font-medium leading-relaxed text-white/85 md:text-lg"
            >
              {values.hero_theme}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mx-auto mb-6 w-full max-w-[360px] rounded-md border border-white/20 bg-white/12 p-2 shadow-xl shadow-black/20 backdrop-blur-md"
            >
              <div className="rounded-md bg-white p-3">
                <p className="mb-2 text-center text-xs font-extrabold uppercase tracking-[0.1em] text-teal">
                  Conference Starts In
                </p>
                <CountdownTimer
                  startDateTime={values.conference_start_datetime_utc}
                  endDateTime={values.conference_end_datetime_utc}
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-4 sm:flex-row sm:flex-nowrap sm:justify-center"
            >
              <Link
                href="/abstract-submission#submit-abstract"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-md bg-gold px-7 py-4 text-base font-extrabold text-hero-bg shadow-xl shadow-black/15 transition-all hover:-translate-y-0.5 hover:bg-gold-light"
              >
                <Send size={19} />
                <span>Submit Your Abstract Now</span>
              </Link>
              <Link
                href="/registration"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-md bg-teal px-7 py-4 text-base font-extrabold text-white shadow-xl shadow-black/15 transition-all hover:-translate-y-0.5 hover:bg-teal/85"
              >
                <Ticket size={20} />
                <span>Register Now</span>
              </Link>
              <a
                href="#brochure-request"
                onClick={(event) => {
                  event.preventDefault();
                  setBrochureSubmitted(false);
                  setBrochureDialogOpen(true);
                }}
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-md border border-white/70 bg-white/10 px-7 py-4 text-base font-extrabold text-white shadow-xl shadow-black/15 transition-all hover:-translate-y-0.5 hover:bg-white/20"
              >
                <Download size={20} />
                <span>Brochure</span>
              </a>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="absolute right-8 top-1/2 z-10 hidden w-56 -translate-y-1/2 xl:block">
        {[
          { icon: Leaf, title: "Cleaner", subtitle: "Environment" },
          { icon: Users, title: "Stronger", subtitle: "Communities" },
          { icon: TrendingUp, title: "Brighter", subtitle: "Tomorrow" },
        ].map(({ icon: Icon, title, subtitle }) => (
          <div
            key={title}
            className="flex items-center gap-4 py-3 text-white"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-green-300 bg-teal/85 text-white shadow-[0_0_16px_rgba(34,197,94,0.35)]">
              <Icon size={30} strokeWidth={2.1} />
            </div>
            <div className="text-left text-sm font-normal uppercase leading-[1.2] tracking-wide drop-shadow-md">
              <span className="block">{title}</span>
              <span className="block">{subtitle}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 hidden border-t border-white/20 bg-white pt-5 xl:block">
        <div className="container mx-auto grid max-w-6xl grid-cols-4 gap-6 px-4 pb-5">
          {[
            { icon: Network, title: "Global Experts", subtitle: "Learn from thought leaders" },
            { icon: Lightbulb, title: "Innovative Ideas", subtitle: "Explore cutting-edge solutions" },
            { icon: Network, title: "Meaningful Connections", subtitle: "Network with a global community" },
            { icon: Leaf, title: "Sustainable Future", subtitle: "Be part of the change" },
          ].map(({ icon: Icon, title, subtitle }, index) => (
            <div key={title} className={`flex items-center gap-3 ${index > 0 ? "border-l border-teal/25 pl-5" : ""}`}>
              <Icon size={31} className="shrink-0 text-teal" />
              <div>
                <p className="text-sm font-extrabold text-hero-bg">{title}</p>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={brochureDialogOpen} onOpenChange={setBrochureDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Get the Conference Brochure</DialogTitle>
            <DialogDescription>
              Submit your details to unlock the brochure download.
            </DialogDescription>
          </DialogHeader>

          {brochureSubmitted ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Thank you. Your brochure is ready.
              </p>
              <a
                href="/brochure-2027.pdf"
                download="Renewable-Energy-2027-Conference-Brochure.pdf"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-teal px-4 py-3 text-sm font-extrabold text-white transition-colors hover:bg-teal/85"
              >
                <Download size={18} />
                Download Brochure
              </a>
            </div>
          ) : (
            <form className="grid gap-4 py-2" onSubmit={handleBrochureSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold">
                  Full Name*
                  <Input name="fullName" required />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold">
                  Work Email*
                  <Input name="email" type="email" required />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold">
                  Mobile Number*
                  <Input name="mobileNumber" type="tel" required />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold">
                  Company / Organization*
                  <Input name="company" required />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold">
                  Job Title / Designation*
                  <Input name="jobTitle" required />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold">
                  Country*
                  <Input name="country" required />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-semibold">
                Message
                <Textarea name="message" placeholder="Tell us anything you would like to share." />
              </label>
              <button
                type="submit"
                disabled={isSubmittingBrochure}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-gold px-4 py-3 text-sm font-extrabold text-hero-bg transition-colors hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingBrochure ? "Submitting..." : "Submit Details"}
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default HeroSection;
