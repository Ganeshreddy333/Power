"use client";

import { useMemo } from "react";
import { useSiteData } from "@/hooks/useSiteData";

export type ImportantDateItem = {
  id: string;
  title: string;
  date: string;
  desc: string;
  startDate?: string;
  endDate?: string;
};

export type PricingRow = {
  id: string;
  category: string;
  preEarly: number;
  earlyBird: number;
  midterm: number;
  onSpot: number;
};

export const importantDatesKey = "important_dates";
export const registrationPricingKey = "registration_pricing";

export const defaultImportantDates: ImportantDateItem[] = [

  {
    id: "early",
    title: "Early Bird Registration",
    date: "Till August 20, 2026",
    desc: "Opens after pre-early bird closes",
    endDate: "2026-08-20",
  },
  {
    id: "mid",
    title: "Mid Term Registration",
    date: "August 21 - September 20, 2026",
    desc: "Mid term registration window",
    startDate: "2026-08-21",
    endDate: "2026-09-20",
  },
  {
    id: "onspot",
    title: "On-spot Registration",
    date: "September 21, 2026 - March 03, 2027",
    desc: "Final registration window",
    startDate: "2026-09-21",
    endDate: "2027-03-03",
  },
  {
    id: "conference",
    title: "Conference Dates",
    date: "March 3-4, 2027",
    desc: "Virtual online live stream",
  },
];

export const defaultPricingRows: PricingRow[] = [
  { id: "speaker", category: "Speaker", preEarly: 109, earlyBird: 149, midterm: 179, onSpot: 199 },
  { id: "poster", category: "Poster", preEarly: 69, earlyBird: 99, midterm: 129, onSpot: 149 },
  { id: "student", category: "Student (Listener)", preEarly: 49, earlyBird: 59, midterm: 79, onSpot: 99 },
  { id: "delegate", category: "Delegate", preEarly: 39, earlyBird: 49, midterm: 69, onSpot: 89 },
];

const parseJsonArray = <T,>(value: string | undefined, fallback: T[]) => {
  if (!value) return fallback;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
};

export const parseImportantDates = (value?: string) =>
  parseJsonArray<ImportantDateItem>(value, defaultImportantDates);

export const parsePricingRows = (value?: string) =>
  parseJsonArray<PricingRow>(value, defaultPricingRows).map((row) => ({
    ...row,
    preEarly: Number(row.preEarly) || 0,
    earlyBird: Number(row.earlyBird) || 0,
    midterm: Number(row.midterm) || 0,
    onSpot: Number(row.onSpot) || 0,
  }));

export const useConferenceSettings = () => {
  const { values } = useSiteData();

  return useMemo(
    () => ({
      importantDates: parseImportantDates(values[importantDatesKey]),
      pricingRows: parsePricingRows(values[registrationPricingKey]),
    }),
    [values],
  );
};

export const toLocalDate = (value?: string) => {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};
