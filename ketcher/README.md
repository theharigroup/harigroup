# Ketcher structure editor (used by the Chemical Inventory "Draw" button)

The inventory page opens the **Ketcher standalone application** (EPAM, Apache-2.0) in a popup so members
can draw a molecule and search by structure. The page expects it at `ketcher/index.html` on the same site
(same origin is required so the page can read the drawn SMILES).

## One-time install

1. Open https://github.com/epam/ketcher/releases and pick the latest release.
2. Download the **standalone** asset from the *Assets* list (a `.zip` of the ready-to-run app).
3. Unzip it so that this folder contains `index.html` next to its `static/` files:

       ketcher/index.html
       ketcher/static/...

4. Commit and push. Until this is done, the popup shows a notice and a plain SMILES box instead.

Ketcher is released under the Apache License 2.0; keep its LICENSE/NOTICE files with the copy.
