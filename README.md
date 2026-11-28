<div align="center">

<a href="https://harigroup.orgchem.iisc.ac.in/">
  <img src="harigroup_logo.png" alt="Hari Group logo" width="260">
</a>

<h1>Hari Group</h1>

<h3>Organic Chemistry Research Group, Indian Institute of Science (IISc), Bengaluru</h3>

[![Website](https://img.shields.io/badge/website-harigroup.orgchem.iisc.ac.in-263A67)](https://harigroup.orgchem.iisc.ac.in/)
[![Hosted on](https://img.shields.io/badge/hosted%20on-GitHub%20Pages-1f6feb)](https://pages.github.com/)
[![Built with](https://img.shields.io/badge/built%20with-HTML%20%7C%20CSS%20%7C%20JS-e34c26)](#technologies)
[![Developed by](https://img.shields.io/badge/developed%20by-Chemora%20Art-12a58a)](https://www.chemora.art/)
[![Last commit](https://img.shields.io/github/last-commit/theharigroup/harigroup?color=facc15)](https://github.com/theharigroup/harigroup/commits/main)

</div>

Source code of the official website of the **Hari Group** (Principal Investigator: **Dr. Durga Prasad Hari**), Department of Organic Chemistry, IISc Bengaluru. The site presents our research, publications, members, facilities and a set of laboratory web tools. The website and its tools are developed by [**Chemora Art**](https://www.chemora.art/), a software company that builds tools for research laboratories.

## Live Website

**https://harigroup.orgchem.iisc.ac.in/**

## About the Group

The Hari Group develops new synthetic methodologies in organic chemistry: efficient strategies for molecular construction, functionalization and skeletal modification, using reactive intermediates, ring strain, photochemistry and electrochemistry.

### Research Areas

- **Ring-strain-driven reaction discovery:** strain-release functionalization, skeletal editing, ring expansion and saturated three-dimensional scaffolds.
- **Synthesis and applications of new carbenes:** new diazo reagents, carbene transfer and late-stage functionalization.
- **Deconstructive functionalization:** photocatalytic and electrochemical C-C bond cleavage and radical-mediated skeletal modification.

Full publication list: **[Publications](https://harigroup.orgchem.iisc.ac.in/publications.html)**

## Website Pages

| Page | Description |
|---|---|
| `index.html` | Home page, research highlights and latest news |
| `pi.html` | Principal investigator profile |
| `research.html` | Research areas and methodologies |
| `publications.html` | Searchable and filterable publication list |
| `team.html` / `alumni.html` | Current members and alumni |
| `news.html` | All group news (single source for the home page news) |
| `facilities.html` | Research facilities and instruments |
| `usertools.html` | Laboratory and research tools |
| `logidft.html` | **LogiDFT**: DFT log parser and SI generator |
| `invoice.html` | Invoice management (sign-in required) |
| `contact.html` | Contact details and opportunities |

## Tools

All tools on this site are developed by [Chemora Art](https://www.chemora.art/).

- **LogiDFT** parses DFT output logs, extracts thermochemical data, formats Supporting Information and shows 3D structures and reaction energy profiles.
- **Chemora Inventory** is a chemical inventory with structure search and CSV import. It runs as the app at [app.chemora.art](https://app.chemora.art/); its source is in [Tushraa/chemorainventory](https://github.com/Tushraa/chemorainventory).
- **Invoice portal** is the group's invoice management system.

## Developed By

This website was designed and developed by **[Chemora Art](https://www.chemora.art/)**, a software developer company that builds tools and software for research laboratories (chemical inventory, invoice management, analysis tools and laboratory websites).

- Company website: [www.chemora.art](https://www.chemora.art/) ([source](https://github.com/Tushraa/chemora))
- Chemora Inventory: [app.chemora.art](https://app.chemora.art/) ([source](https://github.com/Tushraa/chemorainventory))
- Contact: [booking@chemora.art](mailto:booking@chemora.art)

## Technologies

- HTML5, CSS3 and vanilla JavaScript
- Tailwind CSS, Font Awesome and Lucide icons
- Responsive layout for desktop, tablet and mobile
- GitHub Pages for deployment
- Supabase for the invoice portal

## Project Structure

```
harigroup/
├── *.html                  site pages (index, pi, team, alumni, research, publications, news,
│                           facilities, usertools, logidft, contact) and the two portals
│                           (booking.html, invoice.html, login required)
├── css/                    shared styles, portal styles (booking.css), LogiDFT, publications
├── js/                     shared scripts (navigation, hero, globe, publications, news cards)
│   ├── portal/             booking and invoice portal scripts, inactivity sign-out, Supabase config
│   └── logidft/            LogiDFT parser, profile chart, viewer
├── pwa/                    installable-app files for the portals (manifests, icons, offline page)
├── sw.js                   service worker (must stay in the site root)
├── members/ news/          member photos and news images
├── research/ facilities/   research and instrument images
├── publication_abstract/   graphical abstracts      paper/  downloadable paper
├── downloads/              LogiDFT user guide and demo files
├── footer/                 footer logos
├── supabase/functions/     Edge Functions (portal-invite, portal-notify)
├── _docs/                  setup SQL and notes (not published: underscore folders are skipped by GitHub Pages)
├── CNAME  robots.txt  sitemap.xml
└── google*.html  BingSiteAuth.xml   search-engine ownership files (must stay in the root)
```

Images: keep them web-sized (members about 800 px, others at most 1600 px). Large originals slow the site down.

## Contact

**Hari Group**, Department of Organic Chemistry, Indian Institute of Science, Bengaluru 560012, India

For collaborations, enquiries and prospective membership, see the [Contact page](https://harigroup.orgchem.iisc.ac.in/contact.html).

---

<div align="center">

© 2026 Hari Group, Indian Institute of Science, Bengaluru. All rights reserved.

Website developed by <a href="https://www.chemora.art/">Chemora Art</a>.

</div>
