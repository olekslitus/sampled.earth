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

The Satellite style uses NASA Blue Marble (one image per month) and Black Marble city lights, stored in `public/earth/`. Zoomed in, sharper tiles load from Vercel Blob (NASA, down to 0.6 km a pixel) and then from EOxCloudless Sentinel-2 (10 m). To rebuild them:

```bash
bun scripts/fetch-imagery.ts                          # whole-globe images in public/earth/
bun --env-file=.env.local scripts/build-tiles.ts      # zoom tiles to Blob (needs BLOB_READ_WRITE_TOKEN)
```

Live weather (clouds from five geostationary satellites, rain and snow from NASA IMERG) is rebuilt every 15 minutes by a Vercel cron that calls `/api/weather` (see `vercel.json`; needs `CRON_SECRET` and `BLOB_READ_WRITE_TOKEN`). To run it by hand:

```bash
bun --env-file=.env.local scripts/update-weather.ts
```

Zooming out leaves Earth for the Moon, the planets, the stars, the Milky Way, the Local Group, the cosmic web and the edge of the observable universe. The star, galaxy and sky catalogues and the planet textures are in `public/space/`; spacecraft paths (JPL Horizons) and exoplanets (NASA Exoplanet Archive) are refreshed daily in Blob by a cron that calls `/api/space`. To rebuild or refresh them:

```bash
bun scripts/fetch-space.ts                            # catalogues and textures in public/space/
bun --env-file=.env.local scripts/update-space.ts     # live spacecraft and exoplanets to Blob
```

The countries, regions & cities map uses extra World Bank indicators, the Global Data Lab Subnational HDI (about 1,800 regions; free for non-commercial use) and the GHSL Urban Centre Database (11,400 cities, CC BY 4.0), stored in `public/places/`. The Subnational HDI CSV needs a free Global Data Lab login, so download "Subnational HDI Data v10.2.csv" from https://globaldatalab.org/shdi/download_files/ first; everything else is downloaded by the script:

```bash
bun scripts/fetch-places.ts ~/Downloads/"Subnational HDI Data v10.2.csv"
bun scripts/build-centres.ts   # the urban centres people live in (src/lib/sim/data/centres.json)
```

Natural disasters load live in the browser from USGS, GDACS and NASA EONET. Every source and assumption is listed on the [methodology page](https://sampled.earth/methodology) (`src/app/methodology/page.tsx`).

## Stack

- Next.js 16 (App Router)
- React 19
- Tailwind CSS v4
- shadcn/ui (Base UI)
- three.js via @react-three/fiber
- Bun
- TypeScript 7
- Oxlint (`bun run lint`)
