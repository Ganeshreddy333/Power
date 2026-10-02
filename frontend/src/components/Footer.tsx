"use client";

import Link from "next/link";
import Image from "next/image";
import { Copyright, Mail, Phone, MapPin } from "lucide-react";
import { useSiteData } from "@/hooks/useSiteData";

const Footer = () => {
  const { values } = useSiteData();

  return (
    <footer className="section-dark border-t border-white/10">
      <div className="container mx-auto px-4 py-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-12">
          <div>
            <h3 className="mb-5 font-display text-xl font-black uppercase tracking-wide text-hero-foreground">
              {values.hero_eyebrow}
            </h3>
            <p className="max-w-md text-sm leading-7 text-section-dark-foreground/75 font-body">
              {values.footer_description}
            </p>
            <p className="mt-5 border-l-2 border-gold pl-3 text-xs font-bold uppercase tracking-[0.16em] text-gold">
              {values.organizer_name}
            </p>
          </div>
          <div>
            <h4 className="mb-5 font-display text-sm font-black uppercase tracking-[0.16em] text-hero-foreground">Quick Links</h4>
            <div className="space-y-3">
              {[
                { label: "About Conference", path: "/about" },
                { label: "Abstract Submission", path: "/abstract-submission" },
                { label: "Registration", path: "/registration" },
                { label: "Contact", path: "/information#contact-us" },
              ].map((link) => (
                <Link
                  key={link.path}
                  href={link.path}
                  className="block text-sm text-section-dark-foreground/70 transition-colors hover:text-gold font-body"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h4 className="mb-5 font-display text-sm font-black uppercase tracking-[0.16em] text-hero-foreground">Contact Info</h4>
            <div className="space-y-4 text-sm text-section-dark-foreground/70 font-body">
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-gold" />
                <span>{values.contact_email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={16} className="text-gold" />
                <span>{values.contact_phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-gold" />
                <span>{values.conference_venue}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-center text-xs text-section-dark-foreground/50 font-body sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <span className="inline-flex items-center gap-1.5">
            <Copyright size={13} aria-hidden="true" />
            <span>{values.hero_eyebrow}. All rights reserved.</span>
          </span>
          <Image
            src="/nvs-international-services-logo.jpe"
            alt="NVS International Services"
            width={180}
            height={87}
            className="h-auto w-[150px] object-contain sm:w-[180px]"
          />
        </div>
      </div>
    </footer>
  );
};

export default Footer;
