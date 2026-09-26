# Passport Social Dashboard — Frontend

React (Vite) single-page dashboard for the Passport Social Media Scraper Dashboard. It displays passport-related posts scraped from YouTube, Reddit, and Bluesky, with filtering, search, on-demand translation, clustering, and CSV/PDF export.

See the [root README](../README.md) for the full project overview, backend setup, and API documentation.

## Running locally

```bash
npm install
npm run dev       # starts the Vite dev server
npm run build     # production build, output to dist/
npm run preview   # preview the production build locally
npm run lint      # ESLint
```

## Backend URL configuration

The backend API URL is currently hardcoded as two constants near the top of `src/App.jsx`:

```js
const API_BASE = "https://144-24-140-31.sslip.io/api/posts";
const TRANSLATE_API = "https://144-24-140-31.sslip.io/api/translate";
```

To point the frontend at a different backend (for example, a local instance running on `http://localhost:5000`), edit these two lines and rebuild. There is no environment variable for this.
