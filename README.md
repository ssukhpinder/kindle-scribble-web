# Kindle Scribble

Kindle Scribble is a React + Tailwind web app that formats raw manuscript text into chapter structure using Anthropic Claude, then exports a valid EPUB 2.0 file.

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start dev server:
   ```bash
   npm run dev
   ```
3. Open the URL shown by Vite (usually `http://localhost:5173`).

## Deploy/run on GitHub Pages

This repository includes a workflow at `.github/workflows/deploy-pages.yml` that auto-deploys to GitHub Pages.

### One-time GitHub setup

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.

### Deploy steps

1. Push to `main` (or `master`).
2. GitHub Actions runs the workflow:
   - installs dependencies
   - builds with `VITE_BASE_PATH=/<repo-name>/`
   - publishes `dist/` to Pages
3. Open the generated Pages URL shown in the workflow summary.

## Notes

- The app calls Anthropic directly from the browser using `fetch`, so your API key is entered client-side.
- For production security, a backend proxy is recommended instead of exposing API access in the client.
