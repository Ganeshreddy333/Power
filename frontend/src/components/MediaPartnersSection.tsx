"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { Globe2 } from "lucide-react";
import { apiClient } from "@/integrations/api/client";
import { useLiveContentRefresh } from "@/hooks/useLiveContentRefresh";
import type { Tables } from "@/integrations/api/types";

type MediaPartner = Tables<"media_partners">;

const getCardCount = (value: number | null) => Math.max(0, Math.floor(value || 0));

const MediaPartnersSection = () => {
  const [partners, setPartners] = useState<MediaPartner[]>([]);

  const fetchPartners = useCallback(async () => {
    const { data } = await apiClient
      .from("media_partners")
      .select("*")
      .eq("is_visible", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (data) {
      setPartners(data.filter((partner: MediaPartner) => partner.is_visible && getCardCount(partner.display_order) > 0));
    }
  }, []);

  useLiveContentRefresh(fetchPartners);

  const repeatedPartners = partners.flatMap((partner) =>
    Array.from({ length: getCardCount(partner.display_order) }, (_, index) => ({
      partner,
      instance: index,
    })),
  );

  if (repeatedPartners.length === 0) {
    return (
      <section className="py-20 bg-slate-950">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-8">
            <p className="text-gold text-sm uppercase tracking-wider font-body mb-2">Visibility</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white font-display">Media Partners Coming Soon</h2>
          </div>
          <div className="rounded-[2rem] border border-gold/30 bg-gradient-to-br from-slate-900/95 via-slate-950 to-slate-900/95 p-12 text-center shadow-[0_30px_90px_rgba(234,179,8,0.12)]">
            <p className="text-slate-200 leading-8">
              Media partners will appear here once they are finalized.
                         </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20 bg-muted/40">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-gold text-sm uppercase tracking-wider font-body mb-2">Visibility</p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground font-display">Media Partners</h2>
        </div>

        <div className="media-marquee overflow-hidden rounded-3xl border border-border bg-background p-4">
          <div className="media-marquee-track">
            {[repeatedPartners, repeatedPartners].map((track, trackIndex) => (
              <div key={trackIndex} className="flex shrink-0 items-stretch gap-6" aria-hidden={trackIndex === 1}>
                {track.map(({ partner, instance }) => (
                  <a
                    key={`${partner.id}-${trackIndex}-${instance}`}
                    href={partner.website_url || "#"}
                    target={partner.website_url ? "_blank" : undefined}
                    rel={partner.website_url ? "noreferrer" : undefined}
                    className="w-[300px] shrink-0 rounded-3xl border border-border bg-card p-6"
                  >
                <div className="relative mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl gold-gradient">
                  {partner.logo_url ? (
                    <Image src={partner.logo_url} alt={partner.name} fill sizes="56px" className="object-cover" />
                  ) : (
                    <Globe2 className="text-hero-bg" size={24} />
                  )}
                </div>
                <p className="text-xs uppercase tracking-[0.2em] text-gold mb-2">{partner.tier || "Media Partner"}</p>
                <h3 className="font-display text-xl text-card-foreground mb-2">{partner.name}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{partner.description || "Trusted outreach and publication support for the conference."}</p>
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default MediaPartnersSection;
