<div align="center">

<a href="https://harigroup.orgchem.iisc.ac.in/">
  <img src="harigroup_logo.png" alt="Hari Group logo" width="260">
</a>

<h1>Hari Group</h1>

<h3>Organic Chemistry Research Group, Indian Institute of Science (IISc), Bengaluru</h3>

[![Website](https://img.shields.io/badge/website-harigroup.orgchem.iisc.ac.in-263A67)](https://harigroup.orgchem.iisc.ac.in/)
[![Hosted on](https://img.shields.io/badge/hosted%20on-GitHub%20Pages-1f6feb)](https://pages.github.com/)
[![Built with](https://img.shields.io/badge/built%20with-HTML%20%7C%20CSS%20%7C%20JS-e34c26)](#technologies)
[![Last commit](https://img.shields.io/github/last-commit/theharigroup/harigroup?color=facc15)](https://github.com/theharigroup/harigroup/commits/main)

</div>

Source code of the official website of the **Hari Group** (Principal Investigator: **Dr. Durga Prasad Hari**), Department of Organic Chemistry, IISc Bengaluru. The site presents our research, publications, members, facilities and a set of laboratory web tools.

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
| `inventory.html` | **Chemora**: chemical inventory (sign-in required) |
| `invoice.html` | Invoice management (sign-in required) |
| `contact.html` | Contact details and opportunities |

## Tools

- **LogiDFT** parses DFT output logs, extracts thermochemical data, formats Supporting Information and shows 3D structures and reaction energy profiles.
- **Chemora** is a chemical inventory with structure search and CSV import.
- **Invoice portal** is the group's invoice management system.

Chemora and the invoice portal use Supabase and need a private configuration (see below).

## Technologies

- HTML5, CSS3 and vanilla JavaScript
- Tailwind CSS, Font Awesome and Lucide icons
- Responsive layout for desktop, tablet and mobile
- GitHub Pages for deployment
- Supabase for the inventory and invoice apps

## Project Structure

```
harigroup/
├── *.html            site pages
├── css/              shared and LogiDFT styles
├── js/               shared scripts, publications, news cards
│   └── logidft/      LogiDFT parser, profile chart, viewer
├── facilities/       instrument images
├── members/ news/    member photos and news images
├── backend/          supporting backend code
├── docs/             user guides and demo files
├── robots.txt        search engine rules
└── sitemap.xml       sitemap for search engines
```

## Contact

**Hari Group**, Department of Organic Chemistry, Indian Institute of Science, Bengaluru 560012, India

For collaborations, enquiries and prospective membership, see the [Contact page](https://harigroup.orgchem.iisc.ac.in/contact.html).

---

<div align="center">

© 2026 Hari Group, Indian Institute of Science, Bengaluru. All rights reserved.

</div>
