"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";

const ScrollToTop = () => {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    window.history.scrollRestoration = "manual";

    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    if (hash) {
      const frameId = requestAnimationFrame(() => {
        document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      return () => cancelAnimationFrame(frameId);
    }
  }, [hash, pathname]);

  return null;
};

export default ScrollToTop;
