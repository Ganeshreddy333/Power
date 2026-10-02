"use client";

import { useEffect } from "react";
import { useWebsiteContent } from "@/hooks/useWebsiteContent";

const SiteDocumentTitle = () => {
  const { getSection } = useWebsiteContent();
  const pageTitle = getSection("hero_title").content.replace(/\s+/g, " ").trim();

  useEffect(() => {
    if (!pageTitle) return;

    const syncTitle = () => {
      if (document.title !== pageTitle) document.title = pageTitle;
    };
    const observer = new MutationObserver(syncTitle);

    syncTitle();
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  }, [pageTitle]);

  return null;
};

export default SiteDocumentTitle;
