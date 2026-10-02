"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { splitLines, useWebsiteContent } from "@/hooks/useWebsiteContent";
import { useSiteData } from "@/hooks/useSiteData";

const schedule = [
  {
    day: "Day 1",
    date: "",
    events: [
      { time: "09:00 - 09:30", title: "Registration & Networking" },
      { time: "09:30 - 09:45", title: "Opening Ceremony & Welcome Address" },
      { time: "09:45 - 10:15", title: "Plenary Speaker Session" },
      { time: "10:15 - 10:45", title: "Keynote Speaker Session" },
      { time: "10:45 - 11:00", title: "Coffee Break" },
      { time: "11:00 - 11:30", title: "Keynote Speaker Session" },
      { time: "11:30 - 12:00", title: "Invited Speaker Session" },
      { time: "12:00 - 12:30", title: "Oral Presentations" },
      { time: "12:30 - 13:15", title: "Lunch Break" },
      { time: "13:15 - 13:45", title: "Plenary Speaker Session" },
      { time: "13:45 - 14:15", title: "Keynote Speaker Session" },
      { time: "14:15 - 14:45", title: "Invited Speaker Session" },
      { time: "14:45 - 15:00", title: "Networking Break" },
      { time: "15:00 - 16:00", title: "Technical Sessions" },
      { time: "16:00 - 16:30", title: "Panel Discussion" },
      { time: "16:30 - 17:00", title: "Q&A and Closing Remarks" },
    ],
  },
  {
    day: "Day 2",
    date: "",
    events: [
      { time: "09:00 - 09:15", title: "Welcome Note" },
      { time: "09:15 - 09:45", title: "Plenary Speaker Session" },
      { time: "09:45 - 10:15", title: "Keynote Speaker Session" },
      { time: "10:15 - 10:45", title: "Invited Speaker Session" },
      { time: "10:45 - 11:00", title: "Coffee Break" },
      { time: "11:00 - 12:00", title: "Technical Sessions" },
      { time: "12:00 - 12:30", title: "Young Researcher Presentations" },
      { time: "12:30 - 13:15", title: "Lunch Break" },
      { time: "13:15 - 13:45", title: "Keynote Speaker Session" },
      { time: "13:45 - 14:15", title: "Oral Presentations" },
      { time: "14:15 - 14:45", title: "Poster Presentation Session" },
      { time: "14:45 - 15:00", title: "Networking Break" },
      { time: "15:00 - 15:45", title: "Panel Discussion" },
      { time: "15:45 - 16:15", title: "Awards & Certificate Distribution" },
      { time: "16:15 - 16:30", title: "Closing Ceremony & Vote of Thanks" },
    ],
  },
];

const ScheduleSection = () => {
  const [activeDay, setActiveDay] = useState(0);
  const { getSection } = useWebsiteContent();
  const { values } = useSiteData();
  const heading = getSection("schedule_heading", { title: "Conference Schedule", content: "Conference Agenda" });
  const conferenceStart = values.conference_start_datetime_utc
    ? new Date(values.conference_start_datetime_utc)
    : null;
  const managedSchedule = schedule.map((day, index) => {
    const scheduledDate = conferenceStart && !Number.isNaN(conferenceStart.getTime())
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC",
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(new Date(conferenceStart.getTime() + index * 24 * 60 * 60 * 1000))
      : "";
    const section = getSection(`schedule_day_${index + 1}`, {
      title: scheduledDate || "Date to be announced",
      content: day.events.map((event) => `${event.time} | ${event.title}`).join("\n"),
    });

    return {
      ...day,
      date: section.title,
      events: splitLines(section.content).map((line) => {
        const [time, ...titleParts] = line.split("|");
        return { time: time.trim(), title: titleParts.join("|").trim() || time.trim() };
      }),
    };
  });

  return (
    <section id="schedule" className="bg-[#f2eee5] py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <p className="section-kicker mb-2">{heading.content}</p>
          <h2 className="text-3xl font-extrabold text-foreground md:text-4xl">{heading.title}</h2>
        </div>

        <div className="mb-8 flex flex-col justify-center gap-3 sm:flex-row">
          {managedSchedule.map((day, i) => (
            <button
              key={i}
              onClick={() => setActiveDay(i)}
              className={`rounded-lg border px-6 py-3 text-sm font-bold transition-all ${
                activeDay === i
                  ? "border-teal bg-teal text-white shadow-lg shadow-teal/20"
                  : "border-[#d8d3c7] bg-white text-card-foreground shadow-sm hover:border-teal/40 hover:bg-[#f8faf7]"
              }`}
            >
              <span className="block text-base">{day.day}</span>
              <span className="block text-xs font-semibold opacity-80">{day.date}</span>
            </button>
          ))}
        </div>

        <div className="mx-auto max-w-4xl overflow-hidden rounded-lg border border-[#dfd7c8] bg-white shadow-md">
          <div className="border-b border-[#dfd7c8] bg-[#fbf5e7] px-6 py-4 text-foreground">
            <p className="text-sm font-semibold uppercase tracking-wider text-teal">{managedSchedule[activeDay].day}</p>
            <h3 className="text-2xl font-extrabold">{managedSchedule[activeDay].date}</h3>
          </div>

          <div className="divide-y divide-[#ece5d8]">
            {managedSchedule[activeDay].events.map((event, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="grid gap-2 bg-white px-5 py-4 even:bg-[#f7f3eb] sm:grid-cols-[150px_1fr] sm:items-center sm:px-6"
              >
                <span className="font-mono text-sm font-bold text-teal">{event.time}</span>
                <span className="text-base font-semibold text-card-foreground">{event.title}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ScheduleSection;
