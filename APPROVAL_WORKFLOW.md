# Business approval and publication setup

The approval flow uses the Worker in `worker.js`, D1 for proposals, a private R2 bucket for optional uploads, Resend for review emails, and a fine-grained GitHub token to commit approved public listing data to `public/data/businesses.json`. GitHub Pages deploys the commit from `main` through the existing Pages workflow.

## Required Cloudflare setup

1. Create a D1 database named `third-wave-businesses`, then run `wrangler d1 migrations apply third-wave-businesses --remote` after replacing `database_id` in `wrangler.toml`.
2. Create private R2 bucket `third-wave-business-uploads` (no public access).
3. Deploy the Worker with static assets from `public/`; configure the site domain to route through this Worker. GitHub Pages by itself cannot run these API endpoints. Set the Worker hostname as the website origin or configure a same-origin custom domain.
4. Configure secret values on the Worker (never commit these): `APP_SECRET` (random 32+ byte secret), `ADMIN_PASSWORD`, `GITHUB_TOKEN` (fine-grained token limited to this repository with Contents read/write), `RESEND_API_KEY`.
5. Configure Worker variables: `GITHUB_REPO=florasafaris2020-lang/third-wave-solutions`, `GITHUB_BRANCH=main`, `ADMIN_USER`, `REVIEW_EMAIL`, `EMAIL_FROM` (verified Resend sender). D1 and R2 bindings must match `wrangler.toml`.
6. Run migrations, deploy Worker, then test a seller proposal, review email, rejection, approval, and Pages deployment with a non-sensitive test listing.

The authenticated fallback is `/admin` (HTTP Basic Auth). The email review URL is signed and expires after seven days. Opening the link is read-only; approval/rejection requires a POST form action. Uploaded files are private, linked only from the review page, size-limited to 4 MB total, and never included in the public JSON. The public listing fields are edited in the review form; private seller notes are not published.

## Important deployment limitation

This workflow must be deployed to the Worker origin with D1/R2 and secrets configured before it works. The GitHub Pages workflow does not deploy `worker.js`; it only publishes `public/`. Approval writes the JSON to `main`, which triggers the existing Pages Actions deployment. Do not expose `/admin` without setting a strong `ADMIN_PASSWORD` and only use HTTPS.
