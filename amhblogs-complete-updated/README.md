# AMH Blogs

A multilingual blog. Public site + Admin panel.
HTML/CSS/JS · Netlify Functions · Turso (content) · Gemini (translation) · Pages CMS (look & feel).

## 1. Turso (database)
```
turso db create amh-blogs
turso db show amh-blogs --url        # -> TURSO_DATABASE_URL  (libsql://...)
turso db tokens create amh-blogs     # -> TURSO_AUTH_TOKEN
```
Tables are created automatically the first time the site runs.

## 2. Gemini
Create a key at https://aistudio.google.com/apikey  -> `GEMINI_API_KEY`.
Model defaults to `gemini-3.1-flash-lite` with thinking level `medium`. If Google renames the model, set
`GEMINI_MODEL` (and optionally `GEMINI_THINKING`) in Netlify, no code change needed.

## 3. Netlify
1. Push this folder to a GitHub repo, then Netlify -> Add new site -> Import from Git. (Build settings are read from `netlify.toml`.)
2. Site settings -> Environment variables, add:

| Name | Value |
|---|---|
| `TURSO_DATABASE_URL` | from step 1 |
| `TURSO_AUTH_TOKEN` | from step 1 |
| `GEMINI_API_KEY` | from step 2 |
| `ADMIN_PASSWORD` | your admin password |
| `SESSION_SECRET` | any long random string (40+ characters) |

3. Redeploy. Open `/admin`, sign in, then open **Setup check** — everything should be green.

**Translation timeout:** Netlify runs functions for 10 s by default. Long posts are split and translated in parallel to stay
fast, but if you see "Gemini took too long", raise the function timeout in Netlify (Site settings -> Functions) or translate shorter posts.

## 4. Pages CMS (name, logo, colours, text)
Go to https://app.pagescms.org, sign in with GitHub, pick the repo. `.pages.yml` is already set up: you get a
**Site settings** form (site name, tagline, logo, accent colours, heading font, about text, footer links).
Saving commits `public/data/site.json` and Netlify redeploys. Logo files go in `public/assets/`. The bio and “About” heading are shown in English as entered and are not auto-translated when visitors change the interface language.


## Two links: one for readers, one for admin
**Simple (default):** one site. Readers use the site address, admin adds `/admin` (e.g. `https://amhblogs.netlify.app/admin`).

**Separate sites (two addresses, same GitHub repo):**
1. Create **two** Netlify sites from the same repo.
2. Give **both** the same five environment variables (the admin site needs its own copy of the API).
3. In each site: Site configuration -> Build & deploy -> Build settings, set **Build command**:
   - Public site: `node scripts/make-site.js public`  (hides `/admin` and the admin API)
   - Admin site: `node scripts/make-site.js admin`  (opens straight on the admin login, hidden from search engines)
4. Leave Publish directory as `public`. Deploy both.
5. Result: `amhblogs.netlify.app` for readers, `amh-admin.netlify.app` for you. In Pages CMS you can set "Public site address" so the admin's "View site" button points to the reader site.

Both sites read the same Turso database, so a post saved in admin appears on the public site immediately.

## How content is stored
| What | Where |
|---|---|
| Posts, topics, translations, **images (auto-compressed < 250 KB)**, **audio (<= 5 min, <= 3.5 MB)** | Turso |
| Video, PDF, long audio, big images | Admin -> **Uploader** (opens uploadercloud.netlify.app), then paste the link in the editor |

If an image can't get under 250 KB it is saved at the smallest size possible and the admin shows a notice.
If the Uploader appears blank inside the panel, that site is blocking iframes; use the "Open in a new tab" link under it.

## Admin features
Rich editor (headings, bold/italic/underline/strike, colours, highlight, alignment, RTL, lists, quotes, code, links, tables,
images, YouTube/Vimeo/MP4 video, PDF, **audio record/upload/link**, dividers, source view, full screen), drawing pad,
topics (sidebar) with reordering, media library, drafts, one-click translation into 11 languages, setup check.

Languages: English, Hindi, Spanish, Arabic, French, Bengali, Portuguese, Russian, Urdu, Indonesian, German, Japanese (Arabic/Urdu are right-to-left).

## Local testing (optional)
`npm install`, copy `.env.example` to `.env`, then `npx netlify dev`.
