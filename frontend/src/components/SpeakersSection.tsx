"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { apiClient } from "@/integrations/api/client";
import { useLiveContentRefresh } from "@/hooks/useLiveContentRefresh";
import type { PublicSpeakerProfile, PublicSpeakerSession, Tables } from "@/integrations/api/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Speaker = Tables<"speakers">;

const isCommitteeMember = (speaker: Speaker) =>
  (speaker.session_type || "").toLowerCase().includes("committee");

const getCardCount = (value: number | null) => Math.max(0, Math.floor(value || 0));

const safeExternalUrl = (value: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const formatSessionTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

const SpeakerPortrait = ({
  speaker,
  className,
  alt,
}: {
  speaker: Speaker;
  className: string;
  alt: string;
}) => {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl =
    speaker.image_url && speaker.image_url !== failedImageUrl ? speaker.image_url : null;

  return (
    <div className={className}>
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={alt}
          fill
          sizes="(max-width: 640px) 80vw, 192px"
          unoptimized
          className="object-cover"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      ) : (
        <span className="font-display text-3xl font-bold text-gold">
          {speaker.name.split(" ").slice(-1)[0]?.[0] || speaker.name[0]}
        </span>
      )}
    </div>
  );
};

const SessionCard = ({ session }: { session: PublicSpeakerSession }) => (
  <article className="rounded-md border border-border bg-background/60 p-4">
    <h4 className="font-semibold text-card-foreground">{session.title}</h4>
    <p className="mt-1 text-sm text-muted-foreground">
      {formatSessionTime(session.startTime)}
      {session.endTime ? ` – ${formatSessionTime(session.endTime)}` : ""}
      {session.room ? ` · ${session.room}` : ""}
    </p>
    {session.description ? (
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{session.description}</p>
    ) : null}
  </article>
);

interface SpeakersSectionProps {
  showEmptyState?: boolean;
}

const SpeakersSection = ({ showEmptyState = true }: SpeakersSectionProps) => {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicSpeakerProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const activeSpeakerId = useRef<string | null>(null);
  const profileRequest = useRef(0);
  const profileLoaded = useRef(false);

  const fetchSpeakers = useCallback(async () => {
    const { data, error } = await apiClient
      .from("speakers")
      .select("*")
      .eq("is_visible", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      setListError(error.message);
      setIsLoading(false);
      return;
    }

    setSpeakers(
      (data || []).filter(
        (speaker: Speaker) =>
          !isCommitteeMember(speaker) && speaker.is_visible && getCardCount(speaker.display_order) > 0,
      ),
    );
    setListError(null);
    setIsLoading(false);
  }, []);

  const fetchProfile = useCallback(async () => {
    const speakerId = selectedSpeakerId;
    if (!speakerId) return;

    const requestId = ++profileRequest.current;
    if (!profileLoaded.current) setIsProfileLoading(true);
    setProfileError(null);
    const { data, error } = await apiClient.speakers.getProfile(speakerId);

    if (requestId !== profileRequest.current || activeSpeakerId.current !== speakerId) return;
    setIsProfileLoading(false);
    if (error) {
      profileLoaded.current = false;
      setProfile(null);
      setProfileError(
        error.message.toLowerCase().includes("not found")
          ? "This speaker is no longer available."
          : `Could not load this speaker profile: ${error.message}`,
      );
      return;
    }

    profileLoaded.current = true;
    setProfile(data);
  }, [selectedSpeakerId]);

  useLiveContentRefresh(fetchSpeakers);
  useLiveContentRefresh(fetchProfile);

  const openProfile = (speakerId: string) => {
    activeSpeakerId.current = speakerId;
    profileLoaded.current = false;
    setProfile(null);
    setProfileError(null);
    setIsProfileLoading(true);
    setSelectedSpeakerId(speakerId);
  };

  const closeProfile = (open: boolean) => {
    if (open) return;
    activeSpeakerId.current = null;
    profileRequest.current += 1;
    profileLoaded.current = false;
    setSelectedSpeakerId(null);
    setProfile(null);
    setProfileError(null);
    setIsProfileLoading(false);
  };

  const repeatedSpeakers = speakers.flatMap((speaker) =>
    Array.from({ length: getCardCount(speaker.display_order) }, (_, index) => ({
      speaker,
      instance: index,
    })),
  );

  if (repeatedSpeakers.length === 0 && !isLoading && !listError) {
    if (!showEmptyState) return null;

    return (
      <section className="bg-slate-950 py-16">
        <div className="container mx-auto max-w-3xl px-4">
          <div className="mb-8 text-center">
            <p className="mb-2 font-body text-sm uppercase tracking-wider text-gold">Confirmed</p>
            <h2 className="font-display text-3xl font-bold text-white md:text-4xl">Speakers Coming Soon</h2>
          </div>
          <div className="rounded-md border border-gold/30 bg-gradient-to-br from-slate-900/95 via-slate-950 to-slate-900/95 p-8 text-center shadow-[0_30px_90px_rgba(234,179,8,0.12)]">
            <p className="leading-8 text-slate-200">
              Speakers will appear here once they are finalized. Stay tuned for updates as we assemble a team of
              experts to organize an unforgettable conference experience.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="section-dark py-16">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <p className="mb-2 font-body text-sm uppercase tracking-wider text-gold">Confirmed</p>
            <h2 className="font-display text-3xl font-bold text-hero-foreground md:text-4xl">Speakers</h2>
          </div>

          {isLoading && repeatedSpeakers.length === 0 ? (
            <p role="status" className="py-8 text-center text-muted-foreground">Loading speakers…</p>
          ) : null}
          {listError ? (
            <div className="mx-auto max-w-lg rounded-md border border-destructive/40 p-6 text-center" role="alert">
              <p className="text-sm text-destructive">Could not load speakers: {listError}</p>
              <Button className="mt-4" variant="outline" onClick={() => void fetchSpeakers()}>Try again</Button>
            </div>
          ) : null}

          {repeatedSpeakers.length > 0 ? (
            <div className="media-marquee overflow-hidden rounded-md border border-border/40 bg-background/5 p-3">
              <div className="media-marquee-track">
                {[repeatedSpeakers, repeatedSpeakers].map((track, trackIndex) => (
                  <div
                    key={trackIndex}
                    className="flex shrink-0 items-stretch gap-6"
                    aria-hidden={trackIndex === 1}
                  >
                    {track.map(({ speaker, instance }, index) => (
                      <motion.button
                        key={`${speaker.id}-${trackIndex}-${instance}`}
                        type="button"
                        tabIndex={trackIndex === 1 ? -1 : 0}
                        aria-label={`View profile for ${speaker.name}`}
                        onClick={() => openProfile(speaker.id)}
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: index * 0.05 }}
                        className="group w-[250px] shrink-0 rounded-md border border-border bg-card p-5 text-center transition-colors hover:border-gold/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                      >
                        <SpeakerPortrait
                          speaker={speaker}
                          alt=""
                          className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-gold/40 bg-gradient-to-br from-gold/30 to-teal/30 transition-colors group-hover:border-gold"
                        />
                        <span className="mb-1 block font-display text-base font-semibold text-card-foreground">
                          {speaker.name}
                        </span>
                        <span className="block font-body text-sm text-muted-foreground">
                          {speaker.organization || speaker.title || "Conference Speaker"}
                        </span>
                        {speaker.topic ? (
                          <span className="mt-3 line-clamp-2 block text-xs text-muted-foreground">{speaker.topic}</span>
                        ) : null}
                      </motion.button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <Dialog open={selectedSpeakerId !== null} onOpenChange={closeProfile}>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
          <DialogHeader className="pr-8">
            <DialogTitle className="font-display text-2xl">
              {profile?.speaker.name || "Speaker profile"}
            </DialogTitle>
            <DialogDescription>
              {profile
                ? [profile.speaker.title, profile.speaker.organization].filter(Boolean).join(" · ") ||
                  profile.speaker.session_type ||
                  "Conference Speaker"
                : "Speaker profile details are loading or unavailable."}
            </DialogDescription>
          </DialogHeader>
          {profile ? (
            <ProfileDetails profile={profile} />
          ) : isProfileLoading ? (
            <p role="status" className="py-12 text-center text-muted-foreground">Loading speaker profile…</p>
          ) : (
            <div role="alert" className="py-8 text-center">
              <p className="text-destructive">{profileError || "This speaker profile is unavailable."}</p>
              {selectedSpeakerId ? (
                <Button className="mt-4" variant="outline" onClick={() => void fetchProfile()}>Try again</Button>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

const ProfileDetails = ({ profile }: { profile: PublicSpeakerProfile }) => {
  const { speaker, sessions } = profile;
  const externalLinks = [
    ["Website", speaker.website_url],
    ["LinkedIn", speaker.linkedin_url],
    ["X / Twitter", speaker.twitter_url],
  ]
    .map(([label, value]) => ({ label: label as string, href: safeExternalUrl(value as string | null) }))
    .filter((link): link is { label: string; href: string } => Boolean(link.href));

  return (
    <div className="grid gap-6 sm:grid-cols-[12rem_1fr]">
      <div className="space-y-4">
        <SpeakerPortrait
          speaker={speaker}
          alt={`Portrait of ${speaker.name}`}
          className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-gold/20 to-teal/20 [&>span]:text-6xl"
        />
        {externalLinks.length > 0 ? (
          <nav aria-label={`${speaker.name} links`} className="flex flex-wrap gap-2 sm:flex-col">
            {externalLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border px-3 py-2 text-sm font-medium text-teal underline-offset-4 hover:underline"
              >
                {link.label}
              </a>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="min-w-0 space-y-5">
        {speaker.topic ? (
          <section>
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gold">Topic</h3>
            <p className="leading-7 text-card-foreground">{speaker.topic}</p>
          </section>
        ) : null}
        {speaker.session_type ? (
          <section>
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gold">Session type</h3>
            <p className="capitalize text-card-foreground">{speaker.session_type}</p>
          </section>
        ) : null}
        {speaker.bio ? (
          <section>
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gold">Biography</h3>
            <p className="whitespace-pre-wrap leading-7 text-muted-foreground">{speaker.bio}</p>
          </section>
        ) : null}
        {sessions.length > 0 ? (
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gold">
              Sessions
            </h3>
            <div className="space-y-3">
              {sessions.map((session) => <SessionCard key={session.id} session={session} />)}
            </div>
          </section>
        ) : null}
        {!speaker.topic && !speaker.session_type && !speaker.bio && sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No additional profile information is available yet.</p>
        ) : null}
      </div>
    </div>
  );
};

export default SpeakersSection;
