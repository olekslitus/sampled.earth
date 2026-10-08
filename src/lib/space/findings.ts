/**
 * Hand-picked recent findings with a place in the sky. Exoplanet hosts are looked up in the
 * live NASA Exoplanet Archive data; tracked visitors use their live Horizons path. Newly
 * published exoplanets are added automatically from the archive (see StarLayers).
 */

export interface Finding {
  id: string
  title: string
  /** what the marker says */
  label: string
  year: number
  about: string
  url: string
  where: { ra: number; dec: number; ly: number } | { host: string } | { track: string }
}

export const FINDINGS: Finding[] = [
  {
    id: "3i-atlas",
    title: "A third visitor from another star",
    label: "3I/ATLAS",
    year: 2025,
    about: "Only the third object ever seen passing through the Solar System from interstellar space. It swung past the Sun in late 2025 and is now leaving for good.",
    url: "https://science.nasa.gov/solar-system/comets/3i-atlas/",
    where: { track: "3I;" },
  },
  {
    id: "2024-yr4",
    title: "The asteroid that briefly worried everyone",
    label: "2024 YR4",
    year: 2024,
    about: "In early 2025 its chance of hitting Earth in 2032 rose to about 3%, the highest ever recorded for an asteroid this size. Further tracking ruled out an Earth impact.",
    url: "https://science.nasa.gov/solar-system/asteroids/2024-yr4/",
    where: { track: "DES=2024 YR4;" },
  },
  {
    id: "barnard",
    title: "Four small planets around Barnard’s Star",
    label: "Barnard’s Star",
    year: 2025,
    about: "The second-closest star system to the Sun turns out to have four rocky planets, each smaller than Earth, all too close to the star for liquid water.",
    url: "https://science.nasa.gov/exoplanet-catalog/barnard-b/",
    where: { host: "Barnard's star" },
  },
  {
    id: "betelgeuse",
    title: "Betelgeuse’s hidden companion",
    label: "Betelgeuse",
    year: 2025,
    about: "A small companion star, named Siwarha, was probably imaged next to the red supergiant for the first time, explaining a puzzling six-year cycle in its brightness.",
    url: "https://www.nasa.gov/science-research/astrophysics/nasa-scientist-finds-predicted-companion-star-to-betelgeuse/",
    where: { ra: 88.79294, dec: 7.40706, ly: 548 },
  },
  {
    id: "gaia-bh3",
    title: "The Milky Way’s heaviest stellar black hole",
    label: "Gaia BH3",
    year: 2024,
    about: "Found by the wobble of its companion star in Gaia data: a black hole 33 times the mass of the Sun, sleeping less than 2,000 light-years away.",
    url: "https://www.esa.int/Science_Exploration/Space_Science/Gaia/Sleeping_giant_surprises_Gaia_scientists",
    where: { ra: 294.828, dec: 14.932, ly: 1926 },
  },
  {
    id: "jades-z14",
    title: "A galaxy from the cosmic dawn",
    label: "JADES-GS-z14-0",
    year: 2024,
    about: "Webb confirmed this galaxy as the most distant then known. Its light left it 13.5 billion years ago, about 290 million years after the Big Bang; expansion has since carried it some 34 billion light-years away.",
    url: "https://www.cfa.harvard.edu/news/cfa-astronomers-help-find-most-distant-galaxy-using-james-webb-space-telescope",
    // comoving distance at z ≈ 14.2 (Planck cosmology)
    where: { ra: 53.08294, dec: -27.85563, ly: 33.8e9 },
  },
  {
    id: "lhs-1140",
    title: "A possible water world",
    label: "LHS 1140 b",
    year: 2024,
    about: "Webb found hints of a nitrogen-rich atmosphere on this super-Earth in its star’s habitable zone; it may be covered in ice with a liquid ocean under the starlit side.",
    url: "https://science.nasa.gov/exoplanet-catalog/lhs-1140-b/",
    where: { host: "LHS 1140" },
  },
  {
    id: "k2-18",
    title: "Methane and carbon dioxide on K2-18 b",
    label: "K2-18 b",
    year: 2023,
    about: "Webb detected carbon-bearing molecules in the air of this planet in the habitable zone, which may have an ocean under a hydrogen atmosphere. Claims of possible signs of life remain disputed.",
    url: "https://science.nasa.gov/exoplanet-catalog/k2-18-b/",
    where: { host: "K2-18" },
  },
  {
    id: "sgr-a",
    title: "The black hole at the heart of our galaxy",
    label: "Sagittarius A*",
    year: 2022,
    about: "The Event Horizon Telescope’s first image of Sagittarius A*, a black hole four million times the mass of the Sun, 27,000 light-years away.",
    url: "https://www.eso.org/public/news/eso2208-eht-mw/",
    where: { ra: 266.41683, dec: -29.00781, ly: 26_670 },
  },
  {
    id: "trappist-1",
    title: "Seven Earth-sized planets",
    label: "TRAPPIST-1",
    year: 2017,
    about: "A small, cool star with seven rocky planets, three of them in the zone where water could be liquid. Webb has been studying them since 2023.",
    url: "https://science.nasa.gov/exoplanets/trappist1/",
    where: { host: "TRAPPIST-1" },
  },
  {
    id: "proxima",
    title: "A planet around the nearest star",
    label: "Proxima Centauri b",
    year: 2016,
    about: "The closest known exoplanet, 4.2 light-years away, in its star’s habitable zone. A second, smaller planet was confirmed in 2025.",
    url: "https://science.nasa.gov/exoplanet-catalog/proxima-centauri-b/",
    where: { host: "Proxima Cen" },
  },
  {
    id: "m87",
    title: "The first picture of a black hole",
    label: "M87*",
    year: 2019,
    about: "The Event Horizon Telescope’s image of the black hole in the galaxy M87, 6.5 billion times the mass of the Sun, 55 million light-years away.",
    url: "https://www.eso.org/public/news/eso1907/",
    where: { ra: 187.70593, dec: 12.39112, ly: 53.5e6 },
  },
]
