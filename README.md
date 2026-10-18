# Hari Group Website — Modular Multi-Page Version

This version separates the original single-page HTML into independent HTML pages and shared CSS/JavaScript files. It is intended for static hosting with GitHub Pages.

## Pages

- `index.html` — Home
- `pi.html` — PI Profile
- `research.html` — Research
- `publications.html` — Publications
- `team.html` — Team & Alumni
- `facilities.html` — Facilities
- `usertools.html` — User Tools
- `simulator.html` — Reaction Pathway Simulator
- `logidft.html` — LogiDFT DFT-log parser
- `invoice.html` — Invoice Manager
- `contact.html` — Contact

## Shared code

- `css/style.css` — shared custom styles
- `js/tailwind-config.js` — Tailwind theme configuration
- `js/navigation.js` — shared navigation/mobile menu/year behavior
- `js/site.js` — home-page particle animation
- `js/site-ui.js` — publication BibTeX modal and contact feedback
- `js/simulator.js` — reaction simulator
- `js/logidft.js` — LogiDFT parser and visualization
- `js/invoice.js` — invoice manager (loaded only on `invoice.html`)

## Publish on GitHub Pages

1. Extract the ZIP and upload its contents to the root of your GitHub repository.
2. Open **Settings → Pages**.
3. Select **Deploy from a branch**, choose `main` and `/(root)`, then save.
4. Open the URL shown by GitHub Pages.

All page links are relative so the site can also work when published under a repository subpath.

## Important notes

- The source relies on Tailwind CDN, Font Awesome, Google Fonts, Lucide, 3Dmol.js, and Supabase CDN as needed; those pages require internet access for those libraries.
- The invoice page includes client-side demo user credentials in the original source. Client-side passwords are not secure for real authentication. Use server-side authentication / Supabase Auth and row-level security before using the invoice tool with sensitive or real financial data.
- Test each tool after deployment, especially LogiDFT file parsing and the invoice workflow. This is a static refactor and has not been tested against a live Supabase deployment.
