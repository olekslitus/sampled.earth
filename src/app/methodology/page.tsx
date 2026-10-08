import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"

import { COUNTRIES } from "@/lib/sim/countries"
import wdi from "@/lib/sim/data/wdi.json"
import { politicsOf } from "@/lib/sim/politics"

export const metadata: Metadata = {
  title: "Methodology & Sources",
  description: "How Sampled Earth generates its synthetic people, where every number comes from, and what it gets wrong.",
  // child openGraph replaces the layout's, so the site name is repeated
  openGraph: { siteName: "Sampled Earth", url: "/methodology" },
}

/** What each World Bank series drives in the simulation */
const USED_FOR: Record<string, string> = {
  "SP.POP.TOTL": "How many synthetic people each country gets",
  "SP.POP.TOTL.FE.ZS": "Sex of each person",
  "SP.URB.TOTL.IN.ZS": "City or countryside",
  "SP.DYN.LE00.IN": "Shown on each person; length of the oldest age tail",
  "SP.DYN.TFRT.IN": "Number of children",
  "SP.DYN.CBRT.IN": "Births animation",
  "SP.DYN.CDRT.IN": "Deaths animation",
  "IT.NET.USER.ZS": "Online or offline (values older than 2018 are not used)",
  "SL.AGR.EMPL.ZS": "Share of jobs in farming, fishing and herding",
  "SL.IND.EMPL.ZS": "Share of jobs in factories, construction and mining",
  "SM.POP.TOTL.ZS": "Who is an immigrant",
  "SL.TLF.CACT.MA.ZS": "Who works or looks for work (men)",
  "SL.TLF.CACT.FE.ZS": "Who works or looks for work (women)",
  "SL.UEM.TOTL.ZS": "Who is looking for work",
  "SE.PRM.UNER.ZS": "Which 6–11-year-olds are in school (values before 2010 are not used)",
  "SE.SEC.UNER.LO.ZS": "Which 12–17-year-olds are in school (values before 2010 are not used)",
}

type Series = Record<string, [number, number]>

function indicatorRows() {
  const data = wdi.data as unknown as Record<string, Series>
  const indicators = wdi.indicators as Record<string, string>
  const rows = Object.keys(USED_FOR).map((code) => {
    const years = Object.values(data[code] ?? {}).map((v) => v[1])
    const counts = new Map<number, number>()
    for (const y of years) counts.set(y, (counts.get(y) ?? 0) + 1)
    const typical = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return { code, label: indicators[code], usedFor: USED_FOR[code], coverage: years.length, typical }
  })
  const ageCodes = Object.keys(indicators).filter((k) => /^SP\.POP\.\d{2}(\d{2}|UP)\.(MA|FE)\.5Y$/.test(k))
  const ageYears = ageCodes.flatMap((k) => Object.values(data[k] ?? {}).map((v) => v[1]))
  rows.splice(2, 0, {
    code: "SP.POP.0004.MA.5Y … SP.POP.80UP.FE.5Y",
    label: `Population by 5-year age group and sex (${ageCodes.length} series)`,
    usedFor: "Age of each person",
    coverage: Object.keys(data[ageCodes[0]] ?? {}).length,
    typical: Math.max(...ageYears),
  })
  return rows
}

function electionList() {
  return COUNTRIES.map((c) => ({ country: c.label, p: politicsOf(c) }))
    .filter(({ p }) => p.election && !p.oneParty && p.parties.length && !p.parties.some((x) => x.generic))
    .sort((a, b) => a.country.localeCompare(b.country))
}

const TOTAL = COUNTRIES.length
const WORLD_M = COUNTRIES.reduce((s, c) => s + c.population, 0)

export default function MethodologyPage() {
  const rows = indicatorRows()
  const elections = electionList()
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to the globe
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Methodology & Sources</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
          Every dot on the globe is a synthetic person: not a real individual, but someone drawn at random so that, together,
          they match published statistics for {TOTAL} countries covering {(WORLD_M / 1000).toFixed(2)} billion people.
        </p>

        <Section title="What this is, and isn’t">
          <p>
            The globe shows a random sample (by default 50,000 people), so each dot stands in for roughly{" "}
            {Math.round((WORLD_M * 1000) / 50_000)} thousand real people. When you zoom in, extra people are generated for that area, so the
            sample there gets denser.
          </p>
          <p>
            Each person’s traits are drawn one after another, each depending on the ones before (age depends on sex; schooling
            on age; work on age, sex and schooling; and so on). National totals therefore come out close to the real figures,
            but the combinations inside a country are model assumptions, not survey data. Treat a single person as a plausible
            illustration and the aggregates as approximations. This is not a forecast and not a census.
          </p>
        </Section>

        <Section title="How one person is generated">
          <ol className="list-decimal space-y-3 pl-5 marker:text-muted-foreground">
            <Step title="Country">Chosen in proportion to population (World Bank, 2025).</Step>
            <Step title="Sex and age">
              Sex follows each country’s female share. Age is drawn from the UN World Population Prospects 5-year age groups for
              that sex, uniformly within each group. Inside the open “80 and over” group, the chance of each extra year of life
              falls off exponentially, more slowly where life expectancy is higher.
            </Step>
            <Step title="Background">
              The share of immigrants matches the UN international migrant stock. Immigrants come from a neighbouring country or a
              major emigration country. That is a simplification, as real migration corridors are not modelled. Names come from
              common first and family names for the person’s origin.
            </Step>
            <Step title="Religion and language">
              Religion follows the origin country’s religious composition, using rounded Pew Research Center estimates. Whether
              someone practises is an assumption, ranging from about 20% in rich countries to about 75% in poor ones. Mother
              tongue follows hand-compiled shares of each country’s main languages; immigrants usually also speak the local
              language.
            </Step>
            <Step title="Home">
              People are urban or rural according to the national urban share. Urban residents live in, or in towns around, the
              country’s largest cities, which are weighted by size. Rural homes are scattered around those cities but stay inside
              the national border (Natural Earth boundaries).
              <p className="mt-2">Workplaces, schools and other places a person visits are also kept on land.</p>
              <p className="mt-2">
                On the zoomed-out globe, distances travelled from home are exaggerated (6× by default, adjustable in Settings) so
                that daily movement is visible. The exaggeration fades as you zoom in, and it is scaled back for anyone it would
                carry out of their country.
              </p>
            </Step>
            <Step title="School">
              Children aged 6–11 and 12–14 attend school at the rates implied by UNESCO’s out-of-school rates. The World Bank does
              not publish an upper-secondary rate, so the rate for 15–17-year-olds is estimated as twice the lower-secondary rate
              plus up to 12 points in poorer countries. Under-6s are “not yet school age”.
            </Step>
            <Step title="Education (adults)">
              The highest completed level is drawn from hand-entered national shares, rounded and based on UNESCO and Barro–Lee
              attainment data. People under 35 are more likely to have finished secondary or tertiary education, and people over
              55 less likely. The education map shows under-15s separately.
            </Step>
            <Step title="Work">
              <p>Labour force participation for each country and sex is solved so that participation among everyone aged 15 and over matches the ILO estimate.</p>
              <p className="mt-2">Students, gradual retirement after about age 58–65 (depending on pensions) and working teenagers are taken into account.</p>
              <p className="mt-2">Where older people work more than the default model allows, as in Japan, retirement is delayed.</p>
              <p className="mt-2">Across all {TOTAL} countries and both sexes, the simulated participation is within about 1–3 points of the target.</p>
              <p className="mt-2">Unemployment follows the ILO rate and is higher for under-25s. Farm and industry jobs follow ILO employment shares. Specific occupations are weighted by education and how rich the country is.</p>
              <p className="mt-2">Out-of-school teenagers either help at home or do jobs that ILO child-labour surveys find common for that age, such as family farm work, street vending or domestic work.</p>
            </Step>
            <Step title="Income">
              <p>Earnings are drawn from a log-normal distribution around each country’s typical full-time earnings.</p>
              <p className="mt-2">The spread comes from the country’s income Gini index. Each person’s figure is then scaled by an occupation multiplier and reduced for young workers.</p>
              <p className="mt-2">Retirees, the unemployed and students sometimes receive smaller incomes, with probabilities that grow with national wealth as a proxy for pensions and benefits.</p>
              <p className="mt-2">Amounts are nominal US dollars and are <em>not</em> adjusted for local prices.</p>
              <p className="mt-2">The “earns more than X%” figure ranks the person among everyone in the sample who has an income.</p>
            </Step>
            <Step title="Family">
              Marriage, divorce and widowhood probabilities depend on age, sex and national wealth (assumptions). The number of
              children is drawn around the country’s fertility rate. Household size adds parents, extended family and
              non-relatives, more of them in poorer countries. People are not linked into actual households.
            </Step>
            <Step title="Internet">Online share per country (ITU via World Bank), lower for young children and over-70s.</Step>
            <Step title="Politics">
              <p>Adults get a left–right leaning, a party they support (or none) and whether they voted.</p>
              <p className="mt-2">Party shares come from each country’s most recent national election in our data (listed below). Each person’s chance of backing a party is tilted by age, sex, education, city or countryside, religiosity, minority faith, income and migration, following patterns documented in comparative election studies.</p>
              <p className="mt-2">The tilts are then calibrated with iterative proportional fitting, so the national totals still match the official result.</p>
              <p className="mt-2">Countries without a party list use a regional mix of party families. One-party states show party membership instead. Regime types approximate the EIU Democracy Index 2024.</p>
            </Step>
            <Step title="Daily routine">
              Wake and bed times, working hours, commutes, meals, prayer, chores and leisure are hand-tuned from typical
              time-use patterns. They follow each person’s local solar time and vary by occupation, age, religion and country.
            </Step>
          </ol>
        </Section>

        <Section title="World Bank data">
          <p>
            Fetched from the World Bank World Development Indicators API on {wdi.fetched}, using the most recent value available
            for each country. The age structure comes from the UN World Population Prospects. Labour series are ILO modelled
            estimates. School series come from the UNESCO Institute for Statistics. To refresh, run{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-sm">bun scripts/fetch-data.ts</code>.
          </p>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Indicator</th>
                  <th className="py-2 pr-3 font-medium">Used for</th>
                  <th className="py-2 pr-3 text-right font-medium">Countries</th>
                  <th className="py-2 text-right font-medium">Year</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">
                      {r.label}
                      <div className="font-mono text-[11px] text-muted-foreground">{r.code}</div>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.usedFor}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.coverage}/{TOTAL}
                    </td>
                    <td className="py-2 text-right tabular-nums">{r.typical ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            “Year” is the most common year among countries; some countries’ latest values are older. Where a value is
            missing, the app falls back to the hand-entered estimate. The World Bank does not cover Taiwan, so its figures come
            from DGBAS and the Ministry of the Interior, with South Korea’s age structure borrowed (similar median age).
          </p>
        </Section>

        <Section title="Other sources">
          <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
            <li>
              <b>Typical earnings</b>: hand-entered approximations based on national statistics offices and ILOSTAT. For
              example, the US uses the Bureau of Labor Statistics median for full-time workers (2025) and Switzerland uses the
              Federal Statistical Office median.
            </li>
            <li>
              <b>Income inequality</b>: income Gini estimates. Many World Bank Gini figures measure consumption, which understates
              earnings inequality, so they aren’t used directly.
            </li>
            <li>
              <b>Religion</b>: Pew Research Center, global religious composition estimates (rounded).
            </li>
            <li>
              <b>Elections</b>: official results of the most recent national election in our data. Results from elections widely
              judged not free or fair are labelled as official numbers. Regime types follow the EIU Democracy Index 2024.
            </li>
            <li>
              <b>Unrest</b>: a static, hand-compiled snapshot from 2025 reporting by ACLED, Crisis Group and UN OCHA. It is
              not a live feed.
            </li>
            <li>
              <b>Natural disasters</b>: live from the public APIs of USGS (earthquakes M4.5+, past 30 days), GDACS (UN / EU Joint
              Research Centre alerts) and NASA EONET, refreshed every 10 minutes. “People nearby” estimates come from this
              model’s own population map, not a census grid.
            </li>
            <li>
              <b>Animals</b>: rough global populations and ranges from FAO livestock statistics (2022) and IUCN / WWF wildlife
              estimates. Wild ranges are hand-drawn.
            </li>
            <li>
              <b>Countries, regions & cities map</b>: each statistic names its source, and where several cover the same thing you
              choose which colours the map. Countries: the World Bank figures above plus GDP and income per person, density,
              inequality, poverty, electricity, water, child mortality, higher education and CO₂ (WDI, CC BY 4.0). Regions:{" "}
              <a className="underline underline-offset-2" href="https://globaldatalab.org/shdi/">
                Global Data Lab Subnational Human Development Database
              </a>{" "}
              (Smits &amp; Permanyer 2019): HDI, life expectancy, schooling, income and population for about 1,800 regions, with the GDL
              region outlines (v6.4, simplified), free for non-commercial use. Cities: the{" "}
              <a className="underline underline-offset-2" href="https://human-settlement.emergency.copernicus.eu/ghs_ucdb_2024.php">
                GHSL Urban Centre Database R2024A
              </a>{" "}
              (European Commission, JRC; © European Union, CC BY 4.0): 11,422 urban centres mapped from satellite data, with population
              (GHS-POP), area, building height, greenness, climate (ERA5), heat stress, hospital access (healthsites.io), mobile speed
              (Ookla), age shares (WorldPop), GDP per person (Kummu et al. gridded GDP, divided by GHS-POP 2020) and HDI, life
              expectancy and schooling taken from Global Data Lab regions. Colours split the places into six groups of about equal size
              (quantiles), so they show rank rather than distance between values. “Matching your filter” counts this sample’s people,
              so small countries are left blank until at least 20 of their people are sampled.
            </li>
            <li>
              <b>Borders</b>: Natural Earth via the <code className="rounded bg-muted px-1 py-0.5 text-sm">world-atlas</code>{" "}
              package (1:50m, and 1:10m when zoomed in).
            </li>
            <li>
              <b>Satellite imagery</b>: NASA{" "}
              <a className="underline underline-offset-2" href="https://visibleearth.nasa.gov/collection/1484/blue-marble">
                Blue Marble: Next Generation
              </a>{" "}
              (cloud-free monthly mosaics of 2004, shown for the month on the clock) and{" "}
              <a className="underline underline-offset-2" href="https://earthobservatory.nasa.gov/features/NightLights">
                Black Marble
              </a>{" "}
              2016 city lights, via NASA Visible Earth and{" "}
              <a className="underline underline-offset-2" href="https://earthdata.nasa.gov/gibs">GIBS</a>. Public domain. Both are cut
              into zoom tiles down to 0.6 km a pixel.
            </li>
            <li>
              <b>Close-up imagery</b>:{" "}
              <a className="underline underline-offset-2" href="https://cloudless.eox.at">
                EOxCloudless
              </a>{" "}
              by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024), a cloud-free Sentinel-2 mosaic at 10 m, used under
              its non-commercial licence (CC BY-NC-SA 4.0).
            </li>
            <li>
              <b>Live weather</b>: clouds from the infrared channel of five geostationary satellites, refreshed every 15 minutes: GOES-East,
              GOES-West and Himawari via NASA GIBS, and Meteosat 0° and Indian Ocean via{" "}
              <a className="underline underline-offset-2" href="https://view.eumetsat.int">EUMETView</a> (© EUMETSAT). Cold cloud tops are
              shown as cloud, so cold ground in winter can pass for thin cloud, and the poles, which these satellites see edge-on, fade out.
              Rain and snow are NASA{" "}
              <a className="underline underline-offset-2" href="https://gpm.nasa.gov/data/imerg">
                GPM IMERG
              </a>{" "}
              half-hourly precipitation, which arrives a few hours after the fact. Weather is always the latest observation, not the
              simulated time.
            </li>
            <li>
              <b>Space</b>: the Sun, Moon and planets from{" "}
              <a className="underline underline-offset-2" href="https://github.com/cosinekitty/astronomy">
                Astronomy Engine
              </a>{" "}
              (MIT licence), with textures by{" "}
              <a className="underline underline-offset-2" href="https://www.solarsystemscope.com/textures/">
                Solar System Scope
              </a>{" "}
              (CC BY 4.0). Spacecraft, interstellar visitors and asteroid 2024 YR4 from{" "}
              <a className="underline underline-offset-2" href="https://ssd.jpl.nasa.gov/horizons/">
                NASA JPL Horizons
              </a>{" "}
              and every confirmed exoplanet from the{" "}
              <a className="underline underline-offset-2" href="https://exoplanetarchive.ipac.caltech.edu">
                NASA Exoplanet Archive
              </a>
              , both refreshed daily. Stars from the{" "}
              <a className="underline underline-offset-2" href="https://github.com/astronexus/HYG-Database">
                HYG database
              </a>{" "}
              v4.1 (CC BY-SA 4.0); the Milky Way’s glow from NASA SVS{" "}
              <a className="underline underline-offset-2" href="https://svs.gsfc.nasa.gov/4851">
                Deep Star Maps 2020
              </a>
              . Nearby galaxies from the Updated Nearby Galaxy Catalog (Karachentsev et al. 2013) and the cosmic web from the 2MASS Redshift
              Survey (Huchra et al. 2012), both via CDS VizieR, with distances from redshift for the latter. The microwave background is
              NASA’s WMAP nine-year map. The Milky Way, Andromeda and Triangulum themselves are models built from their known arms, bars and
              orientations, not photographs: no one has seen our galaxy from outside. Planets and spacecraft are shown at their real
              positions; a marker’s size is not its real size.
            </li>
            <li>
              <b>Icons and flags</b>: <a className="underline underline-offset-2" href="https://lucide.dev">Lucide</a> (ISC
              licence) and <a className="underline underline-offset-2" href="https://gitlab.com/catamphetamine/country-flag-icons">country-flag-icons</a>{" "}
              (MIT licence).
            </li>
          </ul>
        </Section>

        <Section title={`Elections used (${elections.length} countries)`}>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {elections.map(({ country, p }) => (
              <li key={country} className="flex justify-between gap-3 border-b border-border/50 py-1">
                <span>{country}</span>
                <span className="text-right text-muted-foreground">{p.election}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Elections held after this list was compiled are not reflected. Grouping parties into families (for example
            “nationalist right”) is a judgement call.
          </p>
        </Section>

        <Section title="Checks">
          <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
            <li>Shares of people aged 0–14, 65+ and 80+ match the UN age structure for each country (India: 1.1% aged 80+; Japan: about 11%).</li>
            <li>Simulated labour force participation by sex matches the ILO rate: the median gap across countries is about 1 percentage point.</li>
            <li>Simulated vote shares land within about 1–2 points of each official result (for example, US 2024: Republicans about 51% simulated vs 49.8% official; India 2024: BJP 37% vs 36.6%).</li>
          </ul>
        </Section>

        <Section title="Known limitations">
          <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
            <li>Traits within a country are linked only through the rules above. Real correlations, such as religion with income or region with ethnicity, are mostly not modelled.</li>
            <li>Earnings, education shares, religion shares, languages and Gini values are hand-entered and rounded, and may be several years old.</li>
            <li>Everyone in a country shares the same national rates. There are no regional differences within a country beyond city versus countryside.</li>
            <li>People don’t form real families or households with each other, and they don’t age, move or change jobs over time.</li>
            <li>A sample of 50,000 is noisy for small countries: a country of 1 million people gets about 6 dots.</li>
          </ul>
        </Section>

        <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link href="/" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to the globe
          </Link>
        </p>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 space-y-3 leading-relaxed">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li>
      <p className="font-medium">{title}</p>
      <div className="mt-0.5 text-muted-foreground">{children}</div>
    </li>
  )
}
