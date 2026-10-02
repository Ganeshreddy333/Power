"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X, Zap } from "lucide-react";
import { useWebsiteContent } from "@/hooks/useWebsiteContent";
import { useSiteData } from "@/hooks/useSiteData";

const navLinks = [
  { label: "Home", path: "/" },
  { label: "About Conference", path: "/about" },
  { label: "Speakers", path: "/speakers" },
];

const informationItems = [
  ["speaker-guidelines", "Speaker Guidelines"],
  ["publications-indexing", "Publications & Indexing"],
  ["awards-excellence", "Awards & Excellence"],
  ["registration-pricing", "Registration Pricing"],
  ["registration-includes", "Registration Includes"],
  ["cancellation-refund-policy", "Cancellation & Refund Policy"],
  ["terms-conditions", "Terms & Conditions"],
  ["frequently-asked-questions", "Frequently Asked Questions"],
  ["contact-us", "Contact Us"],
];

const abstractItems = [
  ["submit-abstract", "Submit Abstract"],
  ["scientific-sessions", "Scientific Sessions"],
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<"information" | "abstract" | null>(null);
  const [mobileMenu, setMobileMenu] = useState<"information" | "abstract" | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const { getSection } = useWebsiteContent();
  const { values } = useSiteData();
  const brand = getSection("site_brand", { title: values.hero_eyebrow });

  const scrollHomeToTop = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/") return;

    // Next.js does not navigate when the current URL is already "/".
    // Handle that case explicitly so Home always returns the visitor to the top.
    event.preventDefault();
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const closeDropdown = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener("mousedown", closeDropdown);
    return () => document.removeEventListener("mousedown", closeDropdown);
  }, []);

  const menuLinkClass = (active: boolean) =>
    `rounded-md px-3 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors ${
      active ? "text-gold" : "text-hero-foreground/80 hover:text-gold"
    }`;

  const handleSubpageClick = (event: React.MouseEvent<HTMLAnchorElement>, path: string, id: string) => {
    setOpenMenu(null);

    if (pathname === path) {
      event.preventDefault();
      window.location.hash = id;
    }
  };

  const dropdown = (items: string[][], prefix: string) => (
    <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-md bg-white p-2 shadow-xl shadow-black/20">
      {items.map(([id, label]) => (
        <Link
          key={id}
          href={`/${prefix}#${id}`}
          onClick={(event) => handleSubpageClick(event, `/${prefix}`, id)}
          className="block rounded-sm px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-teal/10 hover:text-teal"
        >
          {label}
        </Link>
      ))}
    </div>
  );

  return (
    <nav ref={navRef} className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-hero-bg/95 shadow-lg shadow-black/10 backdrop-blur-md">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between md:h-20">
          <Link href="/" className="flex items-center gap-3">
            <div className="gold-gradient flex h-11 w-11 items-center justify-center rounded-md text-hero-bg shadow-md shadow-gold/25">
              <Zap size={24} fill="currentColor" />
            </div>
            <span className="hidden font-display text-base font-black uppercase leading-tight text-hero-foreground sm:block">
              {brand.title}
              <span className="block text-xs font-extrabold tracking-[0.18em] text-gold">{brand.content}</span>
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                href={link.path}
                onClick={link.path === "/" ? scrollHomeToTop : undefined}
                className={`rounded-md px-3 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors ${
                  pathname === link.path
                    ? "text-gold"
                    : "text-hero-foreground/80 hover:text-gold"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="relative" onMouseEnter={() => setOpenMenu("information")}>
              <button
                type="button"
                aria-expanded={openMenu === "information"}
                onClick={() => setOpenMenu(openMenu === "information" ? null : "information")}
                className={menuLinkClass(pathname === "/information")}
              >
                Information <ChevronDown size={13} className={`ml-1 inline transition-transform ${openMenu === "information" ? "rotate-180" : ""}`} />
              </button>
              {openMenu === "information" ? dropdown(informationItems, "information") : null}
            </div>
            <div className="relative" onMouseEnter={() => setOpenMenu("abstract")}>
              <button
                type="button"
                aria-expanded={openMenu === "abstract"}
                onClick={() => setOpenMenu(openMenu === "abstract" ? null : "abstract")}
                className={menuLinkClass(pathname === "/abstract-submission")}
              >
                Abstract Submission <ChevronDown size={13} className={`ml-1 inline transition-transform ${openMenu === "abstract" ? "rotate-180" : ""}`} />
              </button>
              {openMenu === "abstract" ? dropdown(abstractItems, "abstract-submission") : null}
            </div>
            <Link
              href="/registration"
              className={`rounded-md px-3 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors ${
                pathname === "/registration"
                  ? "text-gold"
                  : "text-hero-foreground/80 hover:text-gold"
              }`}
            >
              Registration
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-md p-2 text-hero-foreground hover:bg-white/10 lg:hidden"
            aria-label="Toggle navigation"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Nav */}
        {isOpen && (
          <div className="lg:hidden pb-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                href={link.path}
                onClick={(event) => {
                  setIsOpen(false);
                  if (link.path === "/") scrollHomeToTop(event);
                }}
                className={`block rounded-md px-3 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
                  pathname === link.path
                    ? "text-gold bg-white/5"
                    : "text-hero-foreground/80 hover:text-gold hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              aria-expanded={mobileMenu === "information"}
              onClick={() => setMobileMenu(mobileMenu === "information" ? null : "information")}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-bold uppercase tracking-wide transition-colors ${
                pathname === "/information" ? "text-gold bg-white/5" : "text-hero-foreground/80 hover:bg-white/5 hover:text-gold"
              }`}
            >
              Information <ChevronDown size={15} className={`transition-transform ${mobileMenu === "information" ? "rotate-180" : ""}`} />
            </button>
            {mobileMenu === "information" ? (
              <div className="ml-3 border-l border-white/15 pl-2">
                {informationItems.map(([id, label]) => (
                  <Link key={id} href={`/information#${id}`} onClick={(event) => { setIsOpen(false); handleSubpageClick(event, "/information", id); }} className="block rounded-md px-3 py-2 text-sm text-hero-foreground/75 hover:bg-white/5 hover:text-gold">
                    {label}
                  </Link>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              aria-expanded={mobileMenu === "abstract"}
              onClick={() => setMobileMenu(mobileMenu === "abstract" ? null : "abstract")}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-bold uppercase tracking-wide transition-colors ${
                pathname === "/abstract-submission" ? "text-gold bg-white/5" : "text-hero-foreground/80 hover:bg-white/5 hover:text-gold"
              }`}
            >
              Abstract Submission <ChevronDown size={15} className={`transition-transform ${mobileMenu === "abstract" ? "rotate-180" : ""}`} />
            </button>
            {mobileMenu === "abstract" ? (
              <div className="ml-3 border-l border-white/15 pl-2">
                {abstractItems.map(([id, label]) => (
                  <Link key={id} href={`/abstract-submission#${id}`} onClick={(event) => { setIsOpen(false); handleSubpageClick(event, "/abstract-submission", id); }} className="block rounded-md px-3 py-2 text-sm text-hero-foreground/75 hover:bg-white/5 hover:text-gold">
                    {label}
                  </Link>
                ))}
              </div>
            ) : null}
            <Link
              href="/registration"
              onClick={() => setIsOpen(false)}
              className={`block rounded-md px-3 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
                pathname === "/registration"
                  ? "text-gold bg-white/5"
                  : "text-hero-foreground/80 hover:text-gold hover:bg-white/5"
              }`}
            >
              Registration
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
