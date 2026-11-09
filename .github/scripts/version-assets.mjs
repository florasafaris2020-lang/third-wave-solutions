// Stamps a content-hash query onto the CSS and JS references in the deployed
// HTML. The workflow runs this on the build runner, so the repository keeps
// plain paths while the published site gets a fresh URL whenever a file
// actually changes — GitHub Pages otherwise serves assets from a ten-minute
// cache, which hides fixes from anyone who has loaded the page recently.
//
// Only files whose bytes changed get a new hash, so untouched assets stay
// cached across deploys.

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.env.SITE_ROOT || "public";

const ASSETS = [
  "assets/styles.css",
  "assets/site.js",
  "assets/listings.js",
  "assets/admin.js",
  "assets/admin-parse.js",
  "assets/admin-image.js"
];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const versions = new Map();
for (const asset of ASSETS) {
  const bytes = await readFile(join(ROOT, asset));
  const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
  versions.set(asset, hash);
  console.log(`${asset} -> ${hash}`);
}

// Only href/src attribute values are rewritten, so prose and CSS comments that
// mention a filename are left alone. An existing ?v=… is replaced rather than
// doubled up.
const pattern = new RegExp(
  `(href|src)="(${ASSETS.map(escapeRegExp).join("|")})(\\?v=[\\w.-]+)?"`,
  "g"
);

const pages = (await readdir(ROOT)).filter((name) => name.endsWith(".html"));
let changed = 0;

for (const page of pages) {
  const path = join(ROOT, page);
  const before = await readFile(path, "utf8");
  const after = before.replace(pattern, (_match, attribute, asset) => {
    return `${attribute}="${asset}?v=${versions.get(asset)}"`;
  });
  if (after !== before) {
    await writeFile(path, after);
    changed += 1;
  }
}

console.log(`versioned asset URLs in ${changed} of ${pages.length} pages`);
