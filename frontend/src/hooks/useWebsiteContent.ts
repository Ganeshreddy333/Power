"use client";

import { useCallback, useMemo, useState } from "react";
import { apiClient } from "@/integrations/api/client";
import type { Tables } from "@/integrations/api/types";
import { useLiveContentRefresh } from "@/hooks/useLiveContentRefresh";

type WebsiteContent = Pick<Tables<"website_content">, "section_key" | "title" | "content">;

type SectionFallback = {
  title?: string;
  content?: string;
};

const legacySectionKeys: Record<string, string> = {
  about_intro: "about_text",
};

export const useWebsiteContent = () => {
  const [rows, setRows] = useState<WebsiteContent[]>([]);

  const fetchContent = useCallback(async () => {
    const { data } = await apiClient.from("website_content").select("section_key,title,content");
    if (data) setRows(data);
  }, []);

  useLiveContentRefresh(fetchContent);

  const sections = useMemo(
    () => new Map(rows.map((row) => [row.section_key, row])),
    [rows],
  );
  const getSection = (key: string, fallback: SectionFallback = {}) => {
    const row = sections.get(key) || sections.get(legacySectionKeys[key]);

    return {
      title: row ? row.title ?? "" : fallback.title ?? "",
      content: row ? row.content ?? "" : fallback.content ?? "",
    };
  };

  return { getSection };
};

export const splitParagraphs = (value: string) =>
  value
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);

export const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
