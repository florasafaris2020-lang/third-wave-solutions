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
| `public/listings.html` | All businesses for sale + listing enquiry form |
| `public/business-salon.html` | Sample profile with image gallery, financials, compliance checklist, enquiry form |
| `public/business-cafe.html` | Sample profile |
| `public/business-minimart.html` | Sample profile |
| `public/vetting.html` | Vetting scope, process, fees, FAQ, quote request form |
| `public/sell.html` | Seller page with the Google Form link + short fallback form |
| `public/404.html` | Not-found page |

Contact details used throughout: **0101 490 036** · **s.lakhani1@aim.com** · S. Lakhani.

## Before the forms deliver mail — required

Form submissions post to **FormSubmit** (`https://formsubmit.co/s.lakhani1@aim.com`), which
forwards them to that address. The address is spelled out in the form `action`
attributes on purpose: an earlier obfuscated `/el/` endpoint delivered nowhere that could
be verified, and the plain endpoint makes the destination unambiguous.

FormSubmit only accepts ordinary form posts (the `/ajax/` variant is unreliable) and
always redirects to a fixed address afterwards, ignoring `_next`. So `site.js` posts each
form into a hidden iframe: the visitor stays on the page and the inline "message sent"
note appears in place. Without JavaScript the browser navigates and ends up on the site
home page instead.

1. Open the live site and send one test enquiry.
2. FormSubmit emails `s.lakhani1@aim.com` an **activation link**. Click it once.
3. Send a second test enquiry and confirm it arrives in the inbox (check spam).

Until that activation is done, submissions will not be delivered. If you change the
destination email, replace it in the form `action` attributes (seven forms) and leave the
contact blocks on each page as they are.

## Sellers' Google Form — required

The seller link is
`https://docs.google.com/forms/d/1ERKzIdmuAc4_dRt_z7i8HZEk59ViM8Up2IWtykcweZg/viewform`.

At the time of building, this form required a Google sign-in (it is not shared publicly).
In Google Forms, open the form → **Send** → link icon → **Anyone with the link** (viewer is
not enough, respondents need access) and copy the resulting `/d/e/...` link. Replace the two
`docs.google.com/forms/...` links in `public/index.html` and `public/sell.html` (and the
`public/listings.html` seller link, if used) with it. Until then, the short "Or send us the
basics" form on the seller page captures submissions by email.

## Editing and redeploying on GitHub

Every push to `main` publishes `public/` through `.github/workflows/pages.yml` using GitHub
Pages (Settings → Pages → Source: GitHub Actions). Website files live only in `public/`;
the workflow uploads that folder, so the Worker files are ignored by Pages.

```bash
git add -A && git commit -m "Update site copy" && git push origin HEAD:main
```

The Pages build takes about a minute; progress is under the repo's **Actions** tab.

## Editing and redeploying on Freebuff Sites

All content is plain HTML/CSS/JS in `public/`. Images are in `public/assets/img/`.
`deploy.json` describes the deployment: `worker.js` serves the static assets from
`public/` and returns `404.html` for unknown paths.

Local preview:

```bash
python3 -m http.server 3000 --bind 0.0.0.0 --directory public
```

Deploy with the Sites tools using the existing `deploy.json` manifest and site id
`8c0d9073-2610-4f31-a107-7f1f47336f19` (new `requestId` per change).

## Notes

- The three business profiles are clearly marked **sample profiles** with illustrative
  figures; replace the figures, images and details when you have real listings.
- Vetting fees are described as "quoted per business" — update `public/vetting.html` and the
  fee band on `public/index.html` if you publish fixed prices.
- Photography is from Unsplash and free to use under the Unsplash licence.
