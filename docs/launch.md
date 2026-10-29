# Launch runbook

Step by step, from code ready to the shop open. Do the steps in order and
tick them off. Steps marked **(you)** happen in your accounts; nothing in
the code needs to change unless a step says so.

Live site: `https://tlipventures.com` (also `https://tlip-ventures.tlipventures.workers.dev`)
Supabase project: `tlip-ventures` (ref `raxbsxepqyewbxoqcpaj`)

## 1. Supabase (you)

- [ ] **Turn off public sign-ups:** Supabase → Authentication → Sign In / Providers →
      untick “Allow new users to sign up”. Only the owner needs an account.
- [ ] **Create the owner’s login:** Authentication → Users → Add user → Create new user,
      with the owner’s email and a strong password; tick “Auto Confirm User”.
- [ ] **Give it admin access:** put that email into `supabase/seed/make_admin.sql` and run
      the file in the SQL editor. (Don’t commit the email.)
- [ ] **Copy the secret key** for step 3: Project Settings → API Keys → Secret key
      (`sb_secret_…`). Never paste it into `.env` or any file that is committed.

Already done: database tables, security rules (RLS), the 48-hour “Not sent” job (checked
active), categories, the WhatsApp number 024 295 9396, and the security advisor shows no issues.

## 2. Cloudinary for product photos (you, can wait until photos are ready)

- [x] Create a free account at cloudinary.com.
- [x] Put the **cloud name** in the committed `.env` file as
      `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=<cloud name>` (it is public) and commit it. (Done: `jhkoz7yc`.)
- [ ] Keep the **API key** and **API secret** for step 3.

Until then the site works without photos (products show a placeholder) and the
admin photo upload shows a notice.

## 3. Cloudflare (you)

- [ ] **GitHub repository secrets** (github.com/tlip-ventures/tlip-ventures → Settings → Secrets and variables → Actions):
      `CLOUDFLARE_API_TOKEN` (Cloudflare → My Profile → API Tokens → “Edit Cloudflare Workers” template,
      limited to the shop's account; the account ID itself is in `wrangler.jsonc`), and the server secrets `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- [ ] **Worker secrets** are copied from those GitHub secrets on every deploy, so nothing is added
      in Cloudflare by hand. Without `SUPABASE_SERVICE_ROLE_KEY` the shop shows, but **orders can’t
      be placed**; the deploy log warns when one is missing.
- [ ] **Order spam limit:** `wrangler.jsonc` asks Cloudflare for a rate limiter
      (3 orders a minute per visitor). If the first deploy fails with an error about
      `ratelimits`, delete that block from `wrangler.jsonc` and push again; checkout keeps
      the other spam checks.

## 4. Custom domain (optional, you)

- [ ] Cloudflare → Workers & Pages → tlip-ventures → Settings → Domains & Routes → add the domain.
- [ ] Change `NEXT_PUBLIC_SITE_URL` in `.env` to `https://<the domain>` and commit. It is built
      into canonical links, the sitemap and the order links in WhatsApp messages, so the site
      must be deployed again after changing it.

## 5. Deploy

- [ ] Merge the `claude/busy-bell-bkgit3` branch into `main` (pull request on GitHub).
      Every push to `main` deploys: watch GitHub → Actions → “Deploy to Cloudflare”.
- [ ] If it fails, the log shows which step: typecheck/lint/tests (code), or deploy
      (secrets from step 3, or the rate limiter note).

## 6. Check the live site

- [ ] From a computer with this repo:

      npm run smoke -- https://tlipventures.com --whatsapp 0242959396

      It only reads pages, and must end with “All checks passed”.
- [ ] Sign in at `/admin` with the owner account.
- [ ] Work through `docs/testing-checklist.md` on real phones, including one real order
      sent on WhatsApp to 024 295 9396. Cancel the test orders in admin afterwards.

## 7. Real content before announcing the shop (owner)

- [ ] Add the Bathroom and Kids & Baby subcategories (Admin → Categories).
- [ ] Load the real products and photos: one by one in Admin → Products, or many at once
      with `npm run products:import` (see `scripts/README.md`).
- [ ] **Remove the demo products:** run `supabase/seed/demo_products_remove.sql` in the
      Supabase SQL editor. Customers must not be able to order them.
- [ ] Shop address, opening hours and social links in Admin → Settings.
- [ ] Read and correct the How to order, About and Privacy pages.

## 8. After launch

- [ ] Google Search Console: add the site, submit `https://<site>/sitemap.xml`.
- [ ] Share the link: on WhatsApp the preview shows the logo, or a product’s photo for product links.

## If something goes wrong

- **Roll back the site:** Cloudflare → Workers & Pages → tlip-ventures → Deployments →
  choose the previous version → Rollback (or `npx wrangler rollback`). The database is not affected.
- **See errors:** Cloudflare → tlip-ventures → Logs (logging is on), or `npx wrangler tail`.
- **Orders not arriving on WhatsApp:** check the number in Admin → Settings; orders are saved
  even when WhatsApp doesn’t open, and appear in Admin → Orders as “Awaiting WhatsApp”.
- **Backups:** the free Supabase plan has no automatic backups you can restore yourself.
  Export the catalogue now and then (`npm run products:export -- products-backup.csv`),
  or move to the Pro plan for daily backups.
