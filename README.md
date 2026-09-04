# Hybrid Office Planner

A client-side React + TypeScript monthly office attendance planner. It models each eligible working day as `OFFICE` or `HOME_OFFICE`, applies structured rules, and uses a backtracking branch-and-bound solver to find the minimum feasible Office attendance.

## Run locally

```bash
npm install
npm run dev
```

Run the test suite with `npm test` and create a production build with `npm run build`.

## Deploy to Render

This is a client-only Vite app, so deploy it as a Render Static Site. The included `render.yaml` already contains the build command, `dist` publish directory, and SPA fallback rewrite.

1. Push this project to GitHub or GitLab.
2. In Render, choose **New → Blueprint** and select the repository, or choose **New → Static Site** and use `npm ci && npm run build` as the build command and `dist` as the publish directory.
3. If creating the site manually, add a rewrite rule from `/*` to `/index.html`.
4. Deploy. Render will give the site an `onrender.com` URL and can redeploy it when you push updates.

## Structure

- `src/solver` — date eligibility, rule descriptions, typed rule model, and solver. This code is independent from React.
- `src/lib/storage.ts` — Zod-validated localStorage persistence for scenarios and preferences.
- `src/App.tsx` — scenario controls, rule editor, attendance calendar, summaries, and reason details.

On the calendar, click an eligible day to cycle through Office, Home Office, Vacation, approved Home Office, and clear. The Office and Home Office marks are fixed solver inputs; approved Home Office remains an eligible working day for attendance reporting, but is exempt from Home Office rule limits and conflicts. Holidays and vacation remain excluded days. The Monday/Friday rule prevents a Home Office Friday followed by a Home Office Monday, avoiding a four-day weekend. The rule editor also supports a monthly cap such as “no more than 2 Home Office Mondays”.
