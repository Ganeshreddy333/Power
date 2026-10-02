"use client";

import { useState, useEffect } from "react";

const emptyTimeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };

const getTimeLeft = (start: number, now: number) => {
  const diff = start - now;
  if (diff <= 0) return emptyTimeLeft;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
};

interface CountdownTimerProps {
  startDateTime?: string;
  endDateTime?: string;
}

const CountdownTimer = ({ startDateTime, endDateTime }: CountdownTimerProps) => {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  const start = startDateTime ? new Date(startDateTime).getTime() : Number.NaN;
  const end = endDateTime ? new Date(endDateTime).getTime() : Number.NaN;
  const validStart = Number.isFinite(start);
  const validEnd = Number.isFinite(end);
  const finished = validStart && validEnd && now !== null && now >= end;
  const underway = validStart && now !== null && now >= start && (!validEnd || now < end);

  if (!validStart) {
    return <p className="py-3 text-center text-sm font-semibold text-muted-foreground">Conference date not configured</p>;
  }
  if (finished) {
    return <p className="py-3 text-center text-sm font-semibold text-muted-foreground">Conference has concluded</p>;
  }
  if (underway) {
    return <p className="py-3 text-center text-sm font-semibold text-teal">Conference is underway</p>;
  }

  const timeLeft = now === null ? emptyTimeLeft : getTimeLeft(start, now);
  const units = [
    { value: timeLeft.days, label: "Days" },
    { value: timeLeft.hours, label: "Hours" },
    { value: timeLeft.minutes, label: "Minutes" },
    { value: timeLeft.seconds, label: "Seconds" },
  ];

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {units.map((unit) => (
        <div key={unit.label} className="rounded-md border border-teal/15 bg-teal/5 px-1.5 py-2 text-center">
          <div className="font-display text-2xl font-extrabold text-teal">
            {String(unit.value).padStart(2, "0")}
          </div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            {unit.label}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CountdownTimer;
