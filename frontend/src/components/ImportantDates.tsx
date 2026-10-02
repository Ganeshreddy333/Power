"use client";

import { motion } from "framer-motion";
import { Calendar } from "lucide-react";
import { useConferenceSettings } from "@/lib/conferenceSettings";
import { useWebsiteContent } from "@/hooks/useWebsiteContent";

const ImportantDates = () => {
  const { importantDates } = useConferenceSettings();
  const { getSection } = useWebsiteContent();
  const heading = getSection("important_dates_heading", { title: "Dates", content: "Important" });

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <p className="section-kicker mb-2">{heading.content}</p>
          <h2 className="text-3xl font-extrabold text-foreground md:text-4xl">{heading.title}</h2>
        </div>

        <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-6">
          {importantDates.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="conference-card card-hover w-full p-6 text-center md:w-[calc(50%-0.75rem)] lg:w-[calc(25%-1.125rem)]"
            >
              <Calendar className="mx-auto mb-4 text-teal" size={32} />
              <h3 className="mb-2 text-lg font-extrabold text-card-foreground">{item.title}</h3>
              <p className="mb-1 text-xl font-bold text-gold">{item.date}</p>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ImportantDates;
