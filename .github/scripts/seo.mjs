// Adds the head metadata that search engines and link previews need, but that
// nobody wants to hand-copy into every page: a canonical URL, Open Graph and
// Twitter tags, and an Organization/WebSite/WebPage schema.org block.
//
// The page list lives here so a new page is covered by adding one line. Og
// titles and descriptions are read from each page's own <title> and
// <meta name="description">, so there is only ever one copy of that text.
//
// The transform is idempotent: the generated block is wrapped in markers and
// replaced on every run, so re-deploying never stacks duplicate tags.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.env.SITE_ROOT || "public";
const ORIGIN =
  process.env.SITE_ORIGIN ||
  "https://florasafaris2020-lang.github.io/third-wave-solutions";

const BUSINESS = {
  name: "Third Wave Solutions",
  alternateName: "Third Wave Solutions Kenya",
  description:
    "Business brokerage and independent buyer-side vetting in Kenya: businesses for sale, cash-flow verification, KRA compliance, licences and lease checks.",
  telephone: "+254101490036",
  email: "s.lakhani1@aim.com",
  locality: "Nairobi",
  region: "Nairobi County",
  country: "KE"
};

// path is the canonical path; image is the social preview picture for the page.
const PAGES = {
  "index.html": { path: "/", image: "assets/img/handshake.jpg" },
  "listings.html": { path: "/listings.html", image: "assets/img/supermarket.jpg" },
  "vetting.html": { path: "/vetting.html", image: "assets/img/vetting.jpg" },
  "sell.html": { path: "/sell.html", image: "assets/img/office.jpg" },
  "business-cafe.html": { path: "/business-cafe.html", image: "assets/img/cafe.jpg" },
  "business-salon.html": { path: "/business-salon.html", image: "assets/img/salon.jpg" },
  "business-minimart.html": {
    path: "/business-minimart.html",
    image: "assets/img/supermarket.jpg"
  }
};

const START = "<!-- seo:start -->";
const END = "<!-- seo:end -->";
const BLOCK = new RegExp(`${START}[\\s\\S]*?${END}\\n?`, "g");
// Older pages carried a couple of og: tags by hand; drop them so the generated
// block is the only source of those values.
const LEGACY_OG = /^[ \t]*<meta property="og:[^"]+"[^>]*>[ \t]*\r?\n/gm;

const absolute = (path) => `${ORIGIN}${path}`;

function head(html, config) {
  const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1].trim() || BUSINESS.name;
  const description =
    /<meta name="description" content="([^"]*)"/.exec(html)?.[1]?.trim() ||
    BUSINESS.description;
  const url = absolute(config.path);
  const image = absolute(`/${config.image}`);

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "LocalBusiness"],
        "@id": `${ORIGIN}/#organisation`,
        name: BUSINESS.name,
        alternateName: BUSINESS.alternateName,
        url: absolute("/"),
        description: BUSINESS.description,
        telephone: BUSINESS.telephone,
        email: BUSINESS.email,
        image,
        logo: absolute("/assets/favicon.svg"),
        address: {
          "@type": "PostalAddress",
          addressLocality: BUSINESS.locality,
          addressRegion: BUSINESS.region,
          addressCountry: BUSINESS.country
        },
        areaServed: { "@type": "Country", name: "Kenya" },
        priceRange: "Quoted per business",
        contactPoint: {
          "@type": "ContactPoint",
          telephone: BUSINESS.telephone,
          email: BUSINESS.email,
          contactType: "sales",
          areaServed: BUSINESS.country,
          availableLanguage: ["en", "sw"]
        }
      },
      {
        "@type": "WebSite",
        "@id": `${ORIGIN}/#website`,
        url: absolute("/"),
        name: BUSINESS.name,
        inLanguage: "en-KE",
        publisher: { "@id": `${ORIGIN}/#organisation` }
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        isPartOf: { "@id": `${ORIGIN}/#website` },
        about: { "@id": `${ORIGIN}/#organisation` },
        inLanguage: "en-KE"
      }
    ]
  };

  return [
    START,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${BUSINESS.name}">`,
    `<meta property="og:locale" content="en_KE">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:alt" content="${BUSINESS.name} — ${BUSINESS.description}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<script type="application/ld+json">${JSON.stringify(schema)}</script>`,
    END
  ].join("\n");
}

const pages = (await readdir(ROOT)).filter((name) => name.endsWith(".html"));
let changed = 0;
let skipped = 0;

for (const page of pages) {
  const config = PAGES[page];
  if (!config) {
    // Anything not listed is either private (admin) or a noindex template
    // (listing, 404), and should stay out of search results.
    skipped += 1;
    continue;
  }

  const path = join(ROOT, page);
  const before = await readFile(path, "utf8");
  // Strip the previous block and any hand-written og: tags first, so the
  // generated block is the only copy and cannot match itself on a re-run.
  const cleaned = before.replace(BLOCK, "").replace(LEGACY_OG, "");
  const block = head(cleaned, config);
  const after = cleaned.replace(/[ \t]*<\/head>/, `${block}\n</head>`);

  if (after !== before) {
    await writeFile(path, after);
    changed += 1;
  }
}

console.log(
  `seo head tags in ${changed} of ${pages.length} pages (${skipped} left out of search)`
);
