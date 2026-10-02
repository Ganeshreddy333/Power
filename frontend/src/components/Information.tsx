"use client";

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/api/client";
import { useLiveContentRefresh } from "@/hooks/useLiveContentRefresh";
import type { Tables } from "@/integrations/api/types";

type InformationBlock = Tables<"information_blocks">;

const infoNav = [
  { id: "speaker-guidelines", title: "Speaker Guidelines" },
  { id: "publications-indexing", title: "Publications & Indexing" },
  { id: "awards-excellence", title: "Awards & Excellence" },
  { id: "registration-pricing", title: "Registration Pricing" },
  { id: "registration-includes", title: "Registration Includes" },
  { id: "cancellation-refund-policy", title: "Cancellation & Refund Policy" },
  { id: "terms-conditions", title: "Terms & Conditions" },
  { id: "frequently-asked-questions", title: "Frequently Asked Questions" },
  { id: "contact-us", title: "Contact Us" },
];

const speakerExpectations = [
  "Present original, research-driven or industry-relevant insights",
  "Maintain academic integrity and clarity",
  "Engage with an international audience of researchers and professionals",
  "Contribute to meaningful scientific discussion",
];

const recommendedFlow = [
  "Introduction & background",
  "Methodology / Approach",
  "Results / Findings",
  "Conclusion & future scope",
];

const slideRequirements = [
  "Clear, concise, and visually professional",
  "Properly cited (figures, data, references)",
  "Free from plagiarism",
];

const publications = [
  "Conference Proceedings (ISBN, MDPI, Short Abstracts)",
  "Indexed Journals (based on quality & review)",
  "Scopus (selected papers)",
  "Google Scholar",
  "International Journals",
];

const pricingRows = [
  ["Speaker", "$149", "$179", "$199"],
  ["Poster", "$99", "$129", "$149"],
  ["Student (Listener)", "$59", "$79", "$99"],
  ["Delegate", "$49", "$69", "$89"],
];

const inPersonIncludes = [
  "Full access to all conference sessions and presentations",
  "Opportunity to present your research in front of an international audience",
  "Conference kit (name badge & program booklet)",
  "E-copy of the Abstract Book",
  "Lunch and coffee breaks during the conference days",
  "Official Certificate of Participation/Presentation",
  "Publication of accepted papers in Conference Proceedings (with ISBN/e-ISBN)",
];

const virtualIncludes = [
  "Present your research from anywhere (home or workplace)",
  "Access to all live/recorded conference sessions",
  "E-copy of the Abstract Book and Program",
  "E-Certificate of Participation/Presentation",
  "Publication of accepted papers in Conference Proceedings (with ISBN/e-ISBN)",
];

const faqs = [
  ["Is this conference fully virtual?", "Yes, it is 100% online."],
  ["Will I get a certificate?", "Yes, all participants receive a certificate."],
  ["Can I present without a paper?", "Yes, poster/presentation-only options are available."],
  ["Is publication guaranteed?", "Subject to peer review."],
  ["How do I join the conference?", "A meeting link will be shared via email."],
];

const BulletList = ({ items }: { items: string[] }) => (
  <ul className="space-y-2">
    {items.map((item) => (
      <li key={item} className="flex gap-3 leading-relaxed text-muted-foreground">
        <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-teal" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

const FieldGroup = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="space-y-4">
    <h3 className="font-display text-xl font-bold text-card-foreground">{title}</h3>
    {children}
  </div>
);

const AwardsContent = () => (
  <div className="grid gap-4 md:grid-cols-2">
    {[
      ["1", "Best Speaker Award", "For outstanding presentation and delivery"],
      ["2", "Best Research Paper Award", "For exceptional research quality"],
      ["3", "Best Student Presentation", "For outstanding student research"],
      ["*", "Young Researcher Award", "For early-career researchers"],
    ].map(([marker, title, description]) => (
      <div key={title} className="rounded-md border border-border bg-muted/40 p-5">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-teal text-lg font-black text-white">
          {marker}
        </div>
        <h3 className="font-display text-xl font-bold text-card-foreground">{title}</h3>
        <p className="mt-2 text-muted-foreground">{description}</p>
        <p className="mt-4 text-sm font-medium text-card-foreground">
          Winners receive: Certificate of Excellence, Digital recognition, Featured on website
        </p>
      </div>
    ))}
  </div>
);

const Information = () => {
  const pathname = usePathname();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [managedBlocks, setManagedBlocks] = useState<InformationBlock[]>([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

  useEffect(() => {
    const selectSectionFromHash = () => {
      const requestedSection = window.location.hash.replace("#", "");
      setActiveSection(infoNav.some((item) => item.id === requestedSection) ? requestedSection : "");
    };

    selectSectionFromHash();
    window.addEventListener("hashchange", selectSectionFromHash);

    return () => window.removeEventListener("hashchange", selectSectionFromHash);
  }, [pathname]);

  const fetchBlocks = useCallback(async () => {
    const { data } = await apiClient
      .from("information_blocks")
      .select("*")
      .eq("is_visible", true)
      .order("display_order", { ascending: true });

    if (data) setManagedBlocks(data);
  }, []);

  useLiveContentRefresh(fetchBlocks);

  const activeTitle = useMemo(
    () => infoNav.find((item) => item.id === activeSection)?.title || "Information",
    [activeSection],
  );

  const updateForm = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const { error } = await (apiClient as any).from("contact_messages").insert({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      subject: form.subject.trim(),
      message: form.message.trim(),
    });

    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Message was not sent",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    toast({
      title: "Message submitted",
      description: "Your contact request has been saved successfully.",
    });
  };

  const renderActiveContent = () => {
    const managedBlock = managedBlocks.find((block) => block.category === activeSection);

    if (managedBlock && activeSection !== "contact-us") {
      return (
        <FieldGroup title={managedBlock.title}>
          {managedBlock.subtitle ? <p className="font-semibold text-teal">{managedBlock.subtitle}</p> : null}
          <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{managedBlock.content}</p>
          {managedBlock.cta_label && managedBlock.cta_url ? (
            <a className="inline-flex rounded-md bg-teal px-5 py-3 font-bold text-white" href={managedBlock.cta_url}>
              {managedBlock.cta_label}
            </a>
          ) : null}
        </FieldGroup>
      );
    }

    switch (activeSection) {
      case "publications-indexing":
        return (
          <FieldGroup title="Publication Opportunities">
            <p className="text-muted-foreground">All accepted abstracts/papers will be published in:</p>
            <BulletList items={publications} />
            <p className="rounded-md bg-muted p-4 text-sm font-medium text-card-foreground">
              Note: Publication depends on peer-review quality and journal scope.
            </p>
          </FieldGroup>
        );
      case "awards-excellence":
        return <AwardsContent />;
      case "registration-pricing":
        return (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-3 text-left font-bold text-card-foreground">Category</th>
                  <th className="px-3 py-3 text-left font-bold text-card-foreground">Early Bird</th>
                  <th className="px-3 py-3 text-left font-bold text-card-foreground">Midterm</th>
                  <th className="px-3 py-3 text-left font-bold text-card-foreground">On Spot</th>
                </tr>
              </thead>
              <tbody>
                {pricingRows.map(([category, early, midterm, onSpot]) => (
                  <tr key={category} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-3 font-medium text-card-foreground">{category}</td>
                    <td className="px-3 py-3 text-muted-foreground">{early}</td>
                    <td className="px-3 py-3 text-muted-foreground">{midterm}</td>
                    <td className="px-3 py-3 text-muted-foreground">{onSpot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "registration-includes":
        return (
          <>
            <FieldGroup title="For In-Person Speakers & Participants">
              <BulletList items={inPersonIncludes} />
            </FieldGroup>
            <FieldGroup title="For Virtual Speakers & Participants">
              <BulletList items={virtualIncludes} />
            </FieldGroup>
          </>
        );
      case "cancellation-refund-policy":
        return (
          <>
            <div className="space-y-3 text-muted-foreground">
              <p>
                <span className="font-bold text-card-foreground">Cancellation before 50 days:</span> 50% refund
              </p>
              <p>
                <span className="font-bold text-card-foreground">Cancellation before 40 days:</span> 30% refund
              </p>
              <p>
                <span className="font-bold text-card-foreground">Cancellation within 30 days:</span> No refund
              </p>
            </div>
            <FieldGroup title="Registration Transfer">
              <p className="text-muted-foreground">Registration can be transferred to another person.</p>
              <p className="text-muted-foreground">Refunds will be processed within 4 weeks after the conference ends.</p>
            </FieldGroup>
            <p className="rounded-md bg-gold/10 p-4 text-card-foreground">
              <span className="font-bold">Important:</span> If the conference is postponed due to unavoidable situations
              (like natural disasters or other major events), refunds will not be applicable. However, your registration
              will be safely transferred to a future event.
            </p>
          </>
        );
      case "terms-conditions":
        return (
          <div className="space-y-4 text-muted-foreground">
            <p>By registering, you agree to the conference terms and policies.</p>
            <p>The organizers may adjust the schedule, venue, or dates if required.</p>
            <p>In rare cases (beyond control), the event may be postponed or cancelled.</p>
            <div className="rounded-md border-l-4 border-teal bg-teal/10 p-4">
              <p className="font-bold text-card-foreground">If postponed:</p>
              <p>Your registration will remain valid for the next edition.</p>
            </div>
            <p>Please check the official conference website regularly for updates.</p>
            <p>The organizers are not responsible for personal loss, injury, or damage during the event.</p>
          </div>
        );
      case "frequently-asked-questions":
        return (
          <div className="space-y-5">
            {faqs.map(([question, answer]) => (
              <div key={question} className="rounded-md bg-muted/50 p-4">
                <h3 className="font-bold text-card-foreground">{question}</h3>
                <p className="mt-2 text-muted-foreground">{answer}</p>
              </div>
            ))}
          </div>
        );
      case "contact-us":
        return (
          <>
          {managedBlock ? (
            <FieldGroup title={managedBlock.title}>
              {managedBlock.subtitle ? <p className="font-semibold text-teal">{managedBlock.subtitle}</p> : null}
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{managedBlock.content}</p>
            </FieldGroup>
          ) : null}
          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Input required placeholder="Name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
              <Input required type="email" placeholder="Email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <Input required type="tel" placeholder="Phone Number" value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} />
              <Input required placeholder="Subject" value={form.subject} onChange={(event) => updateForm("subject", event.target.value)} />
            </div>
            <Textarea required placeholder="Enter Message" rows={6} value={form.message} onChange={(event) => updateForm("message", event.target.value)} />
            <Button type="submit" className="w-fit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Message"}
            </Button>
          </form>
          </>
        );
      default:
        return (
          <>
            <FieldGroup title="Speaker Role & Expectations">
              <BulletList items={speakerExpectations} />
            </FieldGroup>
            <FieldGroup title="Presentation Structure">
              <div className="grid gap-3 text-muted-foreground md:grid-cols-3">
                <p>
                  <span className="font-bold text-card-foreground">Total Duration:</span> 30-35 minutes
                </p>
                <p>
                  <span className="font-bold text-card-foreground">Presentation:</span> 25-30 minutes
                </p>
                <p>
                  <span className="font-bold text-card-foreground">Q&A Session:</span> 10 minutes
                </p>
              </div>
              <p className="font-bold text-card-foreground">Recommended flow:</p>
              <BulletList items={recommendedFlow} />
            </FieldGroup>
            <FieldGroup title="Presentation Requirements">
              <div className="space-y-3 text-muted-foreground">
                <p>
                  <span className="font-bold text-card-foreground">Format:</span> PowerPoint (PPT/PPTX) or PDF
                </p>
                <p>
                  <span className="font-bold text-card-foreground">Language:</span> English (mandatory)
                </p>
                <p className="font-bold text-card-foreground">Slides should be:</p>
              </div>
              <BulletList items={slideRequirements} />
              <p className="rounded-md bg-teal/10 p-4 font-semibold text-card-foreground">
                Company/Institution logo and speaker affiliation must be included.
              </p>
            </FieldGroup>
            <FieldGroup title="Pre-Conference Submission">
              <BulletList
                items={[
                  "Submit final presentation 20 days before the conference",
                  "Share a short speaker bio (100-150 words)",
                  "Provide a professional photograph (for website & promotion)",
                ]}
              />
            </FieldGroup>
            <FieldGroup title="Technical Guidelines">
              <p className="font-bold text-card-foreground">To ensure a smooth virtual session:</p>
              <BulletList items={["Use a stable high-speed internet connection", "Join via laptop/desktop (recommended)"]} />
              <p className="font-bold text-card-foreground">Ensure:</p>
              <BulletList items={["Working microphone", "HD camera (optional but preferred)"]} />
              <p className="rounded-md bg-gold/10 p-4 font-semibold text-card-foreground">
                Join your session at least 15 minutes in advance for technical checks.
              </p>
            </FieldGroup>
            <FieldGroup title="Session Protocol">
              <BulletList
                items={[
                  "Sessions will be hosted via Zoom / Microsoft Teams",
                  "All sessions may be recorded for academic and promotional purposes",
                  "Speakers are requested to remain available during Q&A",
                ]}
              />
            </FieldGroup>
            <FieldGroup title="Recognition & Certification">
              <BulletList
                items={[
                  "Official Speaker Certificate",
                  "Global recognition on conference website",
                  "Eligibility for Best Speaker Award",
                ]}
              />
            </FieldGroup>
            <FieldGroup title="Ethics & Professional Conduct">
              <BulletList
                items={[
                  "Present authentic and unpublished work",
                  "Avoid promotional or sales-oriented content",
                  "Respect diversity, inclusivity, and academic standards",
                ]}
              />
            </FieldGroup>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-20 hero-gradient py-16">
        <div className="container mx-auto max-w-5xl px-4 text-center">
          <p className="mb-3 font-body text-gold-light">Conference Information</p>
          <h1 className="font-display text-4xl font-bold text-gold md:text-6xl">Information</h1>
        </div>
      </div>

      <main className="container mx-auto max-w-5xl px-4 py-10">
        {activeSection ? (
          <section id={activeSection} className="scroll-mt-28">
            <div className="mb-6">
              <div>
                <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">{activeTitle}</h2>
                <div className="mt-3 h-1 w-24 rounded-full bg-gold" />
              </div>
            </div>
            <div className="space-y-8 rounded-md border border-border bg-card p-6 shadow-sm md:p-8">
              {renderActiveContent()}
            </div>
          </section>
        ) : null}
      </main>

      <Footer />
    </div>
  );
};

export default Information;
