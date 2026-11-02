"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLiveContentRefresh } from "@/hooks/useLiveContentRefresh";
import { apiClient } from "@/integrations/api/client";
import type { Tables } from "@/integrations/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ANNOUNCEMENT_BANNER_CATEGORY, getAnnouncementBannerPhotos, isSafeAnnouncementLink } from "@/lib/announcementBanners";

type AnnouncementBanner = Tables<"information_blocks">;
type PhotoViewer = { photos: string[]; index: number; title: string } | null;

const AnnouncementBanners = () => {
  const [banners, setBanners] = useState<AnnouncementBanner[]>([]);
  const [photoViewer, setPhotoViewer] = useState<PhotoViewer>(null);

  const fetchBanners = useCallback(async () => {
    const { data } = await apiClient
      .from("information_blocks")
      .select("*")
      .eq("category", ANNOUNCEMENT_BANNER_CATEGORY)
      .eq("is_visible", true)
      .order("display_order", { ascending: true });

    if (data) setBanners(data);
  }, []);

  useLiveContentRefresh(fetchBanners);

  useEffect(() => {
    if (!photoViewer || photoViewer.photos.length < 2) return;

    const handleArrowKeys = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      setPhotoViewer((current) => current && {
        ...current,
        index: (current.index + direction + current.photos.length) % current.photos.length,
      });
    };

    window.addEventListener("keydown", handleArrowKeys);
    return () => window.removeEventListener("keydown", handleArrowKeys);
  }, [photoViewer]);

  const visibleBanners = banners.filter(
    (banner) => banner.title?.trim() || banner.content?.trim() || getAnnouncementBannerPhotos(banner.image_urls).length,
  );
  if (!visibleBanners.length) return null;

  return (
    <section aria-label="Homepage highlights" className="space-y-5 px-4 py-8">
      {visibleBanners.map((banner) => {
        const photos = getAnnouncementBannerPhotos(banner.image_urls);
        const href = banner.cta_url?.trim() || "";
        const showCta = Boolean(banner.cta_label?.trim() && href && isSafeAnnouncementLink(href));
        const isLocalLink = href.startsWith("/") || href.startsWith("#");
        const hasText = Boolean(banner.title?.trim() || banner.content?.trim() || banner.subtitle?.trim() || showCta);
        return (
          <article
            key={banner.id}
            className="mx-auto max-w-7xl overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8 lg:p-10"
          >
            <div className={hasText && photos.length ? "grid items-center gap-8 md:grid-cols-2 lg:gap-12" : ""}>
              {hasText ? (
                <div className="text-left">
                  {banner.title?.trim() ? (
                    <h2 className="font-display text-2xl font-bold leading-tight text-hero-bg sm:text-3xl lg:text-4xl">
                      {banner.title}
                    </h2>
                  ) : null}
                  {banner.content?.trim() ? (
                    <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                      {banner.content}
                    </p>
                  ) : null}
                  {banner.subtitle?.trim() ? (
                    <p className="mt-3 text-sm font-semibold text-teal">{banner.subtitle}</p>
                  ) : null}
                  {showCta ? (
                    isLocalLink ? (
                      <Link
                        href={href}
                        className="mt-5 inline-flex rounded-md bg-teal px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-teal/85"
                      >
                        {banner.cta_label}
                      </Link>
                    ) : (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-5 inline-flex rounded-md bg-teal px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-teal/85"
                      >
                        {banner.cta_label}
                      </a>
                    )
                  ) : null}
                </div>
              ) : null}

              {photos.length ? (
                <div
                  aria-label="Highlight photos"
                  className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3"
                  role="region"
                  tabIndex={0}
                >
                  {photos.map((url, index) => (
                    <div
                      key={`${url}-${index}`}
                      className="relative h-48 w-64 flex-none snap-start overflow-hidden rounded-lg bg-muted"
                    >
                      <button
                        type="button"
                        aria-label={`View photo ${index + 1} of ${photos.length}`}
                        className="absolute inset-0 h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-teal"
                        onClick={() => setPhotoViewer({
                          photos,
                          index,
                          title: banner.title?.trim() || "Homepage highlight",
                        })}
                      >
                        <Image
                          src={url}
                          alt=""
                          fill
                          unoptimized
                          sizes="256px"
                          className="object-cover transition-transform duration-200 hover:scale-105"
                        />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
      <Dialog open={Boolean(photoViewer)} onOpenChange={(isOpen) => !isOpen && setPhotoViewer(null)}>
        {photoViewer ? (
          <DialogContent className="w-[calc(100%-2rem)] max-w-5xl border-0 bg-black p-3 text-white sm:p-5">
            <DialogTitle className="sr-only">
              {photoViewer.title}, photo {photoViewer.index + 1} of {photoViewer.photos.length}
            </DialogTitle>
            <div className="relative flex min-h-[50vh] items-center justify-center sm:min-h-[70vh]">
              <Image
                src={photoViewer.photos[photoViewer.index]}
                alt={`${photoViewer.title}, photo ${photoViewer.index + 1}`}
                fill
                unoptimized
                sizes="90vw"
                className="object-contain"
              />
              {photoViewer.photos.length > 1 ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="Previous photo"
                    className="absolute left-2 z-10 rounded-full"
                    onClick={() => setPhotoViewer((current) => current && ({
                      ...current,
                      index: (current.index - 1 + current.photos.length) % current.photos.length,
                    }))}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="Next photo"
                    className="absolute right-2 z-10 rounded-full"
                    onClick={() => setPhotoViewer((current) => current && ({
                      ...current,
                      index: (current.index + 1) % current.photos.length,
                    }))}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              ) : null}
            </div>
            <p className="text-center text-sm text-white/80">
              {photoViewer.index + 1} / {photoViewer.photos.length}
            </p>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
};

export default AnnouncementBanners;
