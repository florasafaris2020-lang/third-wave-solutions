# Third Wave Solutions — website

Static marketing site for Third Wave Solutions: businesses for sale, buyer-side vetting,
seller submissions and buyer enquiry forms.

- **GitHub repository:** https://github.com/florasafaris2020-lang/third-wave-solutions
- **GitHub Pages site:** https://florasafaris2020-lang.github.io/third-wave-solutions/
- **Freebuff site:** unpublished on 1 Nov 2026 — the deployment and URLs are retained but serve nothing. GitHub Pages above is the live site.

## Pages

| File | Purpose |
| --- | --- |
| `public/index.html` | Home: hero, featured listings, vetting summary, fee band, seller CTA, buyer enquiry form |
| `public/listings.html` | All businesses for sale + listing enquiry form. Approved Worker listings are appended from `public/data/businesses.json` |
| `public/business-salon.html` | Sample profile with image gallery, financials, compliance checklist, enquiry form |
| `public/business-cafe.html` | Sample profile |
| `public/business-minimart.html` | Sample profile |
| `public/vetting.html` | Vetting scope, process, fees, FAQ, quote request form |
| `public/sell.html` | Seller page with the secure submission form (Worker + private R2 uploads) |
| `public/404.html` | Not-found page |

Contact details used throughout: **0101 490 036** · **s.lakhani1@aim.com** · S. Lakhani.

## How the seller approval flow works

1. A seller submits the form on `sell.html`. The browser posts multipart data to the
   Cloudflare Worker (`/api/business-submit`) and stays on the page.
2. The Worker stores the submission as `pending` in D1 (`BUSINESSES`) and puts any
   supporting documents in the private R2 bucket (`BUSINESS_UPLOADS`).
3. The Worker emails `REVIEW_EMAIL` a signed review link (`/review?token=...`).
4. The owner approves or rejects from that link (or from `/admin`, protected by Basic
   Auth).
5. Approving commits the listing to `public/data/businesses.json` on `GITHUB_BRANCH`
   through the GitHub Contents API. That push triggers `.github/workflows/pages.yml`,
   and `listings.html` renders the new entry from the JSON file.

Documents are never public. They are served only through `/review/document` with a valid
signed token, or `/admin/document` behind Basic Auth.

## Cloudflare setup

Run these from the repository root. `wrangler.toml` already contains the account ID, the
D1 and R2 bindings, and the non-secret variables.

On a machine with a browser, authenticate once:

```bash
npx wrangler login
```

In a remote/cloud environment without a browser, add a Cloudflare API token as the project
secret `CLOUDFLARE_API_TOKEN` (Settings → Secrets). The token needs Workers Scripts: Edit,
D1: Edit and R2: Edit. Do not paste the token into chat or commit it.

Then create the resources:

```bash
npx wrangler r2 bucket create third-wave-business-uploads
npx wrangler d1 create third-wave-businesses
```

Copy the `database_id` printed by `d1 create` into `wrangler.toml`, replacing
`REPLACE_WITH_D1_DATABASE_ID`. Keep the R2 bucket private; do not enable public access.

Apply the migration:

```bash
npx wrangler d1 migrations apply third-wave-businesses --remote
```

Add the secrets (Wrangler prompts for each value; never put them in a file):

```bash
npx wrangler secret put APP_SECRET
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put RESEND_API_KEY
```

Set the variables in `wrangler.toml`:

| Variable | Meaning |
| --- | --- |
| `GITHUB_REPO` | `florasafaris2020-lang/third-wave-solutions` |
| `GITHUB_BRANCH` | Branch that triggers Pages, normally `main` |
| `ADMIN_USER` | Username for `/admin` Basic Auth |
| `REVIEW_EMAIL` | Inbox that receives review links |
| `EMAIL_FROM` | Verified Resend sender, e.g. `Third Wave Solutions <listings@yourdomain.co.ke>` |

Deploy:

```bash
npx wrangler deploy
```

Then set the Worker origin in `public/assets/config.js`:

```js
window.TW_CONFIG = {
  apiBase: "https://third-wave-solutions.your-subdomain.workers.dev"
};
```

Commit and push that one-line change so the GitHub Pages site posts to the Worker.

### GitHub token

Create a fine-grained personal access token for
`florasafaris2020-lang/third-wave-solutions` with **Contents: Read and write**. Add it only
as the Worker secret `GITHUB_TOKEN`. The Worker reads and updates
`public/data/businesses.json`; it does not need any other repository permission.

### Resend

`RESEND_API_KEY` sends the review and seller notification emails. `EMAIL_FROM` must be a
verified sender in Resend. `onboarding@resend.dev` works for initial testing but normally
only delivers to the Resend account owner; verify your domain before using a real address.

## Test before real sellers

1. Open `/admin` and confirm the Basic Auth prompt works.
2. Submit a test business through `sell.html` with a small PDF or image.
3. Confirm the row is `pending` in D1 and the object exists in the private R2 bucket.
4. Confirm the review email arrives and the document link opens only through the signed link.
5. Reject one submission and confirm `status` becomes `rejected` and the seller is emailed.
6. Approve one and confirm:
   - `public/data/businesses.json` gains the entry on GitHub;
   - the Pages workflow runs;
   - the listing appears on `listings.html`.
7. Re-open an already reviewed link and confirm it cannot publish again.

## Other public forms

Buyer enquiries, vetting requests and contact forms still post to **FormSubmit**
(`https://formsubmit.app/f/abc123`). FormSubmit always redirects afterwards, so `site.js`
posts those forms into a hidden iframe and keeps the visitor on the page.

FormSubmit must be activated once for the destination inbox:

1. Open the live site and send one test enquiry.
2. Click the activation link FormSubmit emails to the destination address.
3. Send a second test and confirm it arrives (check spam).

The seller form does **not** use FormSubmit when JavaScript is available; it posts to the
Worker. Its `action` remains a FormSubmit fallback for no-JavaScript visitors.

## Local development

Static preview only:

```bash
python3 -m http.server 3000 --bind 0.0.0.0 --directory public
```

Worker preview with local D1/R2:

```bash
npx wrangler d1 migrations apply third-wave-businesses --local
npx wrangler dev
```

For local seller submissions, set `window.TW_CONFIG.apiBase` to `http://localhost:8787`.
The Worker's CORS policy allows `localhost` and `127.0.0.1` origins in addition to the
GitHub Pages origin.

## Editing and redeploying the site

Every push to `main` publishes `public/` through `.github/workflows/pages.yml` using GitHub
Pages (Settings → Pages → Source: GitHub Actions). Website files live only in `public/`;
the workflow uploads that folder.

```bash
git add -A && git commit -m "Update site copy" && git push origin HEAD:main
```

The Pages build takes about a minute; progress is under the repo's **Actions** tab.

## Notes

- The three business profiles are clearly marked **sample profiles** with illustrative
  figures; replace the figures, images and details when you have real listings.
- Vetting fees are described as "quoted per business" — update `public/vetting.html` and the
  fee band on `public/index.html` if you publish fixed prices.
- Photography is from Unsplash and free to use under the Unsplash licence.
