import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://renewableenergy2027.com").replace(/\/$/, "");

const routes = [
  "",
  "/about",
  "/abstract-submission",
  "/important-dates",
  "/information",
  "/registration",
  "/sessions",
  "/speakers",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.8,
  }));
}

export const revalidate = 86400;
