"use client";

import { useEffect } from "react";
import { PUBLIC_CONTENT_UPDATED_EVENT } from "@/integrations/api/publicContentEvents";

export const useLiveContentRefresh = (refresh: () => Promise<void>) => {
  useEffect(() => {
    let active = true;
    let refreshing = false;

    const runRefresh = async (initial = false) => {
      if (!active || refreshing || (!initial && document.visibilityState !== "visible")) return;
      refreshing = true;
      try {
        await refresh();
      } finally {
        refreshing = false;
      }
    };

    const refreshWhenVisible = () => void runRefresh();
    void runRefresh(true);
    const interval = window.setInterval(() => void runRefresh(), 5000);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener(PUBLIC_CONTENT_UPDATED_EVENT, refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener(PUBLIC_CONTENT_UPDATED_EVENT, refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);
};
