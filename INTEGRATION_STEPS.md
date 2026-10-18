# Hari Group website integration

The uploaded index.html and css/style.css are included with a new Inventory link in desktop and mobile navigation. inventory.html matches the website header, footer, fonts, Tailwind classes, and navy/yellow styling.

## Upload to your existing GitHub Pages repository
- Replace root `index.html` with this version (back up the original first).
- Add root `inventory.html`, `inventory.js`, `config.js`.
- Keep `css/style.css` and all your existing `js/`, `members/`, and other assets.
- The provided CSS file is from your upload. The ZIP does not include the other website pages or JS assets, so do not delete them from GitHub.
- Add the Inventory link to other page navigation bars too if you want it visible on every page.

## Secure API connection
1. Create Supabase Auth users for members and disable open signup. Use ES256 or RS256 signing and confirm backend support.
2. Deploy `backend/` privately as a FastAPI service. Set environment secrets using `backend/.env.example`. Never commit ChemInventory API tokens.
3. Set `FRONTEND_ORIGIN` to the origin of your actual Pages URL, e.g. `https://theharigroup.github.io` or your custom domain, without trailing path.
4. Fill `config.js` with backend URL, Supabase project URL and publishable key (public values only).
5. Check `/health`, log in, test known chemicals and confirm actual API response mapping against ChemInventory.

## Before production
This starter has not been connected to your ChemInventory account, so API response field names and search parameters must be validated with your actual account. A single server token gives all approved members the token's data visibility. Container size is not real-time remaining quantity. Orders/watchlists are read-only. Consider auditing, rate limiting, pagination, and per-user access controls before broad deployment.
