# Third Wave Solutions — website

Static site for Third Wave Solutions (S. Lakhani): businesses for sale in Kenya, independent
buyer-side vetting, seller submissions that are reviewed before publication, and buyer enquiry
forms. No server, no build step — plain HTML/CSS/JS published free on GitHub Pages.

- **Repository:** https://github.com/florasafaris2020-lang/third-wave-solutions
- **Live site:** https://florasafaris2020-lang.github.io/third-wave-solutions/
- **Owner dashboard:** https://florasafaris2020-lang.github.io/third-wave-solutions/admin.html
- **Form submissions inbox:** sleek12@gmail.com (delivered by FormSubmit)

Contact details used throughout: **0101 490 036** · **s.lakhani1@aim.com** · S. Lakhani.

## How the workflow fits together

| Step | Where | What happens |
| --- | --- | --- |
| 1. Seller submits | `sell.html` → FormSubmit | The seller's business upload form posts to FormSubmit. Text plus uploaded documents arrive by email, and text stays in the archive for 30 days. Nothing is public. |
| 2. You review | your email inbox | Read the submission, open the uploaded files, call the seller, check KRA, licences and liabilities. |
| 3. You approve & publish | `admin.html` | Sign in with a GitHub token, paste the submission, set the four vetting checks, publish. The listing is committed to `public/data/listings.json`. |
| 4. Site updates | GitHub Pages | The workflow rebuilds in about a minute. The listing appears on `listings.html` and gets its own page at `listing.html?slug=…`. |
| 5. Buyer enquires | `listing.html` / `listings.html` / `index.html` | Enquiries and vetting quote requests are emailed to sleek12@gmail.com through the same endpoint. |

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
| `public/thanks.html` | Confirmation page the seller upload form returns to |
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
4. Put a submission into the review queue. The dashboard accepts the FormSubmit notification text
   or plain `Field: value` lines pasted by hand.
5. Choose **Review & approve**, edit the public wording (never name the seller or the exact
   address), set the four vetting checks, then **Approve & publish**.
   - Publishing is blocked while any check is Pending or negative. That is deliberate: the
     promise on the site is that a published listing has been checked.
   - **Save draft** keeps a listing in this browser only, so you can come back to it.
6. GitHub Pages rebuilds in about a minute. Live listings then appear on `listings.html` with the
   badge **Approved listing**.

Private approval notes (seller name, phone, documents received, fee agreed) are stored in the
`privateNotes` field of `data/listings.json` — that file is public, so treat it as visible. Do not
put bank details, ID numbers or anything a seller would object to seeing online in that field.

## Forms — delivery to sleek12@gmail.com

Every form on the site (buyer enquiry, listing enquiry, vetting quote and the seller's business
upload) posts to FormSubmit's address endpoint for **sleek12@gmail.com**. No dashboard, no form id
and no monthly cap — an address endpoint accepts unlimited submissions, but it must be **activated
once** before anything is delivered.

### One thing to do before it works

The first submission sends an **"Activate Form"** email to sleek12@gmail.com. Until that link is
clicked, the service answers `{"success":"false","message":"This form needs Activation…"}` and
delivers nothing. Check the inbox (and Spam), click **Activate Form**, then submit again. On
activation FormSubmit also emails a random alias string; put that alias in `FORM_ADDRESS` instead of
the raw address if you would rather not print the mailbox in the page source.

### How the site posts

| Form | Endpoint | Why |
| --- | --- | --- |
| Buyer enquiry, listing enquiry, vetting quote | `https://formsubmit.co/ajax/sleek12@gmail.com` | Text only. Posted with `fetch`, so the visitor stays on the page and sees the inline thank-you. |
| Seller business upload (`sell.html`) | `https://formsubmit.co/sleek12@gmail.com` | Has file inputs. Attachments survive only a native multipart post, so the browser posts directly and FormSubmit redirects to `thanks.html`. |

Both are set in `public/assets/site.js` (`FORM_ADDRESS`, `AJAX_ENDPOINT`, `PAGE_ENDPOINT`). The
`action` attributes in the HTML still carry the old FormSubmit app endpoint; `site.js` rewrites them
on load and picks the endpoint per form by whether it contains a file input. A visitor with
JavaScript disabled would post to that dead endpoint, so treat `site.js` as required.

### Settings that matter

- `_subject` — separate subjects for seller submissions and buyer enquiries.
- `_captcha=false` — the forms carry no reCAPTCHA widget, so the captcha must stay disabled.
- `_honey` — honeypot. Keep this exact name; `_gotcha` belongs to the other FormSubmit service and
  is ignored here.
- `_next` — added by `site.js` to the seller form and pointed at `thanks.html`.
- `_template=table` — keeps the notification email readable.
- Files: 10 MB in total per submission; `site.js` refuses over 4 MB and asks the visitor to email.

### Checking it from a terminal

```bash
# Success once activated: {"success":"true",...}. Before activation: "This form needs Activation".
curl -sS -X POST "https://formsubmit.co/ajax/sleek12@gmail.com" \
  -H "Accept: application/json" \
  -H "Referer: https://florasafaris2020-lang.github.io/third-wave-solutions/index.html" \
  --data-urlencode "_subject=Setup test" -d "Name=Setup test"
```

The `Referer` header matters: with none, FormSubmit assumes the page was opened as a local file and
refuses with "Make sure you open this page through a web server".

Submissions stay in the archive for 30 days (`https://formsubmit.co/api-documentation`, five API
calls a day). Uploaded files are **not** in the archive — they exist only on the notification email,
so download a seller's KRA certificate and financials as soon as it arrives.

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
- The public contact address shown on the site is still `s.lakhani1@aim.com`, while submissions are
  delivered to `sleek12@gmail.com`. Change the address across the pages if buyers should write to the
  same mailbox that receives form submissions.
- Photography is from Unsplash, free to use under the Unsplash licence.
