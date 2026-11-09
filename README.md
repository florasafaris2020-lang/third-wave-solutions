# Third Wave Solutions — website

Static site for Third Wave Solutions (S. Lakhani): businesses for sale in Kenya, independent
buyer-side vetting, seller submissions that are reviewed before publication, and buyer enquiry
forms. No server, no build step — plain HTML/CSS/JS published free on GitHub Pages.

- **Repository:** https://github.com/florasafaris2020-lang/third-wave-solutions
- **Live site:** https://florasafaris2020-lang.github.io/third-wave-solutions/
- **Owner dashboard:** https://florasafaris2020-lang.github.io/third-wave-solutions/admin.html
- **Form submissions inbox:** https://formsubmit.app/dashboard/forms/dj2hrduj7x

Contact details used throughout: **0101 490 036** · **s.lakhani1@aim.com** · S. Lakhani.

## How the workflow fits together

| Step | Where | What happens |
| --- | --- | --- |
| 1. Seller submits | `sell.html` → FormSubmit | The seller's business upload form posts to the form endpoint. Text plus uploaded documents arrive in the form dashboard and by email. Nothing is public. |
| 2. You review | your email inbox | Read the submission, open the uploaded files, call the seller, check KRA, licences and liabilities. |
| 3. You approve & publish | `admin.html` | Sign in with a GitHub token, paste the submission, set the four vetting checks, publish. The listing is committed to `public/data/listings.json`. |
| 4. Site updates | GitHub Pages | The workflow rebuilds in about a minute. The listing appears on `listings.html` and gets its own page at `listing.html?slug=…`. |
| 5. Buyer enquires | `listing.html` / `listings.html` / `index.html` | Enquiries and vetting quote requests are stored and emailed through the same form endpoint. |

## Pages

| File | Purpose |
| --- | --- |
| `public/index.html` | Home: hero, featured listings, vetting summary, fee band, seller CTA, buyer enquiry form |
| `public/listings.html` | Businesses for sale; the grid renders from `data/listings.json` (hand-written cards stay as a no-JS fallback) |
| `public/listing.html` | Detail template for any approved listing: `listing.html?slug=the-slug` |
| `public/sell.html` | Sellers' business upload form (figures, KRA, licences, liabilities, document and photo uploads) |
| `public/vetting.html` | Vetting scope, process, fees, FAQ, quote request form |
| `public/business-salon.html` · `business-cafe.html` · `business-minimart.html` | Sample profiles |
| `public/admin.html` | Private owner dashboard: review queue, listing editor, approve & publish |
| `public/data/listings.json` | The only source of published listings |
| `public/404.html` | Not-found page |

`admin.html` is excluded in `robots.txt` and carries `noindex`. It is still a public URL, so the
protection is the GitHub token — anyone who opens it without a valid token sees only the sign-in
card and cannot read or change anything.

## Publishing from the dashboard

1. Open `admin.html`.
2. Create a **fine-grained GitHub token**: GitHub → Settings → Developer settings →
   Fine-grained tokens → Generate new token.
   - Repository access: **Only select repositories → florasafaris2020-lang/third-wave-solutions**
   - Permissions → Repository permissions → **Contents: Read and write** (nothing else)
   - Set an expiry you are comfortable with; revoke it any time from the same page.
3. Paste the token and sign in. It is kept in `sessionStorage` (or `localStorage` if you tick
   "Remember on this device") — it is never written into the repository and is only sent to
   `api.github.com`.
4. Paste a submission into the review queue. This works **before** you sign in — the queue lives in
   the page while you sort out the token — and any format the form dashboard gives you is accepted
   (see **Getting a submission into the dashboard** below).
5. Choose **Review & approve**, edit the public wording (never name the seller or the exact
   address), set the four vetting checks, then **Approve & publish**. Publishing is the only step
   that needs the token.
   - Publishing is blocked while any check is Pending or negative. That is deliberate: the
     promise on the site is that a published listing has been checked.
   - **Save draft** keeps a listing in this browser only, so you can come back to it.
6. GitHub Pages rebuilds in about a minute. Live listings then appear on `listings.html` with the
   badge **Approved listing**.

Private approval notes (seller name, phone, documents received, fee agreed) are stored in the
`privateNotes` field of `data/listings.json` — that file is public, so treat it as visible. Do not
put bank details, ID numbers or anything a seller would object to seeing online in that field.

## Forms — delivery to formsubmit.app

Every form on the site (buyer enquiry, listing enquiry, vetting quote and the seller's business
upload) posts to one FormSubmit form:

- **Form dashboard:** <https://formsubmit.app/dashboard/forms/dj2hrduj7x> (its **Install** tab
  repeats the snippet)
- **Endpoint:** `https://formsubmit.app/f/dj2hrduj7x`

All forms are sent with `fetch` + `FormData` from `public/assets/site.js` and answered with JSON, so
the visitor stays on the page and is told whether the submission was actually stored. `FormData`
carries file inputs too, which is how the seller's documents reach the dashboard and the notification
email. Docs: <https://formsubmit.app/docs>

### What the code sets

| Field | Why |
| --- | --- |
| `_subject` | Separate subjects for seller submissions, enquiries and quote requests (hidden inputs in the pages). |
| `_gotcha` | Honeypot. The pages ship a `_honey` input; `site.js` renames it to `_gotcha` and blanks it. |
| `_ts` | Render timestamp, for the time-to-submit spam check. |
| `_replyto` | Set from the visitor's email field, so a reply goes straight back to them. |

The `action` attributes in the HTML still carry the previous, dead form id; `site.js` rewrites them
on load, so treat JavaScript as required — with it disabled the form falls back to that dead id.
Changing the form means changing `FORM_ENDPOINT` in `public/assets/site.js`.

### Plan limits to keep in mind

Free plan: **1 form, 50 submissions a month, 100 MB of file storage, 10 MB per file**, and a request
body of about **4.5 MB**. `site.js` refuses attachments over 4 MB and asks the visitor to email
instead. Over the monthly quota nothing is lost: submissions are stored but locked (no notification
email, no file downloads) until the 1st of the next month. FormSubmit emails at 80% and 100% of the
quota, so act on those warnings — 50 a month is easy to reach once enquiries pick up.

Uploaded files are linked with **signed links that expire after 7 days**. Download a seller's KRA
certificate and financials from the dashboard when the submission arrives.

### Checking it from a terminal

```bash
curl -sS -X POST "https://formsubmit.app/f/dj2hrduj7x" \
  -H "Accept: application/json" -d "Name=Setup test"
# {"ok":true,"id":"…","message":"Thanks! Your submission has been received."}
# {"ok":false,"error":{"code":"form_not_found"…}} means the id is wrong
```

No domain allowlist is configured on the form yet. Turning one on (dashboard → Protection) is worth
doing, but add `florasafaris2020-lang.github.io` and `localhost` at the same time or the live forms
will be refused.

### Getting a submission into the dashboard

`admin.html` → **Paste submission data** accepts what the form dashboard gives you: a field name and
its value on separate lines, `Field: value` lines, a table copied with tabs, or JSON (the `data`,
`fields` and `values` wrappers are unwrapped). `public/assets/admin-parse.js`, loaded before
`admin.js`, recognises the format, drops FormSubmit's control fields and the submission id and
timestamps, then hands `admin.js` plain JSON; a paste it cannot recognise gets an explanation instead
of an empty queue item. The submission id and received time are noted in the private approval notes.
The queue is held in memory only — approve or dismiss a submission before closing the page.

There is no public API for reading submissions, so copying from the dashboard is the handoff. The
dashboard's own **Export** (CSV or JSON) works too: paste the row, or the JSON, straight in.

## Editing and redeploying on GitHub

Every push to `main` publishes `public/` through `.github/workflows/pages.yml` (Settings → Pages →
Source: GitHub Actions). Only `public/` is uploaded, so `worker.js` and `deploy.json` are ignored by
Pages.

```bash
git add -A && git commit -m "Update site copy" && git push origin HEAD:main
```

The build takes about a minute; progress is under the repository's **Actions** tab.

## Local preview

```bash
python3 -m http.server 3000 --bind 0.0.0.0 --directory public
```

Then open `http://localhost:3000/`. `admin.html` works locally too — GitHub Pages and the GitHub API
allow `localhost` origins; publishing from a local preview writes to the same `main` branch.

## Optional: Freebuff Sites deployment

`deploy.json` + `worker.js` still describe a Cloudflare Worker that serves `public/` and returns
`404.html`. That deployment is currently unpublished; GitHub Pages is the live site. Only relevant
if you want to re-publish there, with site id `8c0d9073-2610-4f31-a107-7f1f47336f19`.

## Notes

- The six seeded listings are clearly marked **Sample profile** with illustrative figures. Replace
  or remove them from `data/listings.json` (or from the dashboard) once real approved listings exist.
- Vetting fees are described as "quoted per business". Update `public/vetting.html` and the fee band
  on `public/index.html` if you publish fixed prices.
- The public contact address shown on the site is still `s.lakhani1@aim.com`, while form
  submissions are stored and emailed by FormSubmit. Change the address across the pages if buyers
  should write to the mailbox that receives the notifications.
- Photography is from Unsplash, free to use under the Unsplash licence.
