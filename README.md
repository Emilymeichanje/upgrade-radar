# Upgrade Radar — static site

Two files, no build step:

- `index.html` — the app (calls api.scryfall.com and json.edhrec.com live from the browser)
- `data/snapshot.json` — EDHREC per-commander snapshot (replace to refresh)

## Deploy on GitHub Pages
1. Create a repo, add these files at the root, push.
2. Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. The site appears at https://<user>.github.io/<repo>/ within a minute.

Your lists, shortlists and retirements are stored in the browser (localStorage).
Use Export / Import in the header to move them between devices.
