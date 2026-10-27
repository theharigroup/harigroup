# Hari Group website — updated GitHub Pages edition

Upload the **contents** of this folder to the root of your GitHub Pages repository.

## Pages
`index.html`, `pi.html`, `research.html`, `publications.html`, `team.html`,
`facilities.html`, `usertools.html`, `inventory.html`, `invoice.html`,
`logidft.html`, `contact.html`.

The reaction simulator page, script and navigation links were removed.

## Publications: add another publication
Open `publications.html`, find the hidden table `id="publication-data"`,
and duplicate its `<tr>...</tr>` data row. Fill in the nine columns in order:
year, subject, citation, DOI, title, authors, publication date, abstract, image path.
Do **not** edit the card HTML. Its visual layout is in `css/publications.css`,
and rendering/search/filter behavior is in `js/publications.js`.

The sample publication references `news/singhaacscatal.png`. That image was
not included in the uploaded files; add it to `news/` to display it.
Check the sample citation, title, author list, and DOI against your records
before publishing, and replace the short placeholder abstract with the real one.

## Inventory
The Chemical Inventory card on `usertools.html` opens `inventory.html`.
Configure `config.js` with your project's **public/publishable** Supabase values
and ensure your database RLS policies are configured. Never put a service-role
key or other secrets in a public GitHub repository.

## Deployment
GitHub repository → Settings → Pages → Deploy from a branch → main → /(root).

## Notes
Shared footer matches the uploaded `team.html` footer on all pages.
The existing Invoice and LogiDFT application code has been retained.
JavaScript syntax checks passed, but live browser/database tests are still required.
