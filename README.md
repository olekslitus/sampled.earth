# Sampled Earth

A living globe of synthetic people, sampled so that together they match published statistics for 158 countries. Click anyone to see who they are: age, background, religion, work, income, family, politics and what they're doing right now in their local time. The globe can be coloured by any of these traits and filtered. Optional layers show births and deaths, animals, unrest and live natural disasters.

**Live:** [sampled.earth](https://sampled.earth) · **How it works:** [sampled.earth/methodology](https://sampled.earth/methodology)

## Running locally

```bash
bun install
bun run dev
```

Then open http://localhost:3000.

## Data

Country statistics come from the World Bank World Development Indicators. Among them are the UN World Population Prospects age structure, ILO labour estimates and UNESCO schooling rates. They are stored in `src/lib/sim/data/wdi.json`, so the app makes no data requests at runtime. To refresh them:

```bash
bun scripts/fetch-data.ts
```

Natural disasters load live in the browser from USGS, GDACS and NASA EONET. Every source and assumption is listed on the [methodology page](https://sampled.earth/methodology) (`src/app/methodology/page.tsx`).

## Stack

- Next.js 16 (App Router)
- React 19
- Tailwind CSS v4
- shadcn/ui (Base UI)
- three.js via @react-three/fiber
- Bun
