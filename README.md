# Third Wave Solutions — website

Static site for Third Wave Solutions (S. Lakhani): businesses for sale in Kenya, independent
buyer-side vetting, seller submissions that are reviewed before publication, and buyer enquiry
forms. No server, no build step — plain HTML/CSS/JS published free on GitHub Pages.

- **Repository:** https://github.com/florasafaris2020-lang/third-wave-solutions
- **Live site:** https://florasafaris2020-lang.github.io/third-wave-solutions/
- **Owner dashboard:** https://florasafaris2020-lang.github.io/third-wave-solutions/admin.html
- **Form submissions inbox:** https://formsubmit.app/dashboard

Contact details used throughout: **0101 490 036** · **s.lakhani1@aim.com** · S. Lakhani.

## How the workflow fits together

| Step | Where | What happens |
| --- | --- | --- |
| 1. Seller submits | `sell.html` → FormSubmit | The seller's business upload form posts to FormSubmit. Text plus uploaded documents arrive in the FormSubmit dashboard and by email. Nothing is public. |
| 2. You review | formsubmit.app/dashboard | Read the submission, open the uploaded files, call the seller, check KRA, licences and liabilities. |
| 3. You approve & publish | `admin.html` | Sign in with a GitHub token, paste the submission, set the four vetting checks, publish. The listing is committed to `public/data/listings.json`. |
| 4. Site updates | GitHub Pages | The workflow rebuilds in about a minute. The listing appears on `listings.html` and gets its own page at `listing.html?slug=…`. |
| 5. Buyer enquires | `listing.html` / `listings.html` / `index.html` | Enquiries and vetting quote requests post to the same FormSubmit form. |

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
4. Put a submission into the review queue. The dashboard accepts the FormSubmit JSON or CSV
   export, or plain `Field: value` lines pasted by hand.
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

## Forms — FormSubmit setup (required now)

Every form on the site (buyer enquiry, vetting quote, listing enquiry and the seller's business
upload form) posts to one FormSubmit form. On the free plan that is the cap: **1 form, 50
submissions a month, 100 MB of file storage, 10 MB per file and about 4.5 MB per request**. A second
form needs Starter ($10/month). A hidden `_subject` distinguishes seller submissions from buyer
enquiries in the inbox.

### The endpoint in the code is not a live form

`https://formsubmit.app/f/xvfwex8rvq` answers a POST with `form_not_found`, so submissions sent
through it reach nobody. A form belongs to your login, so it has to be created in your dashboard —
this cannot be done from code.

1. Sign in at <https://formsubmit.app/login>. Use **sleek12@gmail.com** if that is the mailbox that
   should receive submissions; notifications go to the account email by default.
2. **New form** → call it `Third Wave website`. Leave the builder empty: the site posts its own
   fields to the endpoint.
3. Copy the id — it is the last part of `https://formsubmit.app/f/<id>` (also in the dashboard URL,
   `/dashboard/forms/<id>`).
4. Replace the old id everywhere with one command from the repository root:

   ```bash
   grep -rl xvfwex8rvq public | xargs sed -i 's/xvfwex8rvq/<new-id>/g'
   ```

   That updates `formEndpoint` in `public/assets/site.js` and the eight form `action` attributes in
   `index.html`, `listings.html`, `listing.html`, `sell.html`, `vetting.html`, `business-salon.html`,
   `business-cafe.html` and `business-minimart.html`.
5. **Delivery** — if the account was created with a different address, add `sleek12@gmail.com` under
   **Notifications → Recipients** and click the confirmation link it receives. An unconfirmed
   recipient gets nothing.
6. **Domain allowlist** — **Protection → Domain allowlist** → add
   `florasafaris2020-lang.github.io`, plus `localhost` while previewing locally. `example.com` also
   matches `www.example.com`; `*.example.com` matches every subdomain. While the list is non-empty,
   any request with no `Origin`/`Referer` or a non-matching one is refused with `domain_not_allowed`.
7. **Retention** — keep submissions that carry documents for at least 90 days.
8. **Test** — send one buyer enquiry and one seller submission (with a small PDF) from the live
   site. Each should show the inline thank-you, appear in the dashboard, and arrive by email.

Health check from a terminal (`ok:true` means the form exists; `form_not_found` means it does not):

```bash
curl -sS -X POST "https://formsubmit.app/f/<id>" -H "Accept: application/json" \
  -d "_subject=Setup test" -d "Name=Setup test" -d "Email=sleek12@gmail.com"

# once the allowlist is on, this one should be refused — that proves it is working
curl -sS -X POST "https://formsubmit.app/f/<id>" -H "Accept: application/json" -d "Name=probe"
```

Control fields used: `_subject` (notification subject), `_gotcha` (honeypot — `site.js` renames the
older `_honey` inputs to it), `_ts` (render timestamp for the time-to-submit check). `_captcha` and
`_template` are legacy and ignored. Uploads are stored privately and linked with signed links that
expire after 7 days, so download anything you need to keep; `site.js` refuses attachments over 4 MB
and tells the visitor to email instead.

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
- The public contact address shown on the site is still `s.lakhani1@aim.com`. Change it across the
  pages if submissions should come from the same address buyers are told to email.
- Photography is from Unsplash, free to use under the Unsplash licence.
