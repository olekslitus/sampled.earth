/**
 * Political affiliation. Each adult gets a party they support (or none), a left–right
 * self-placement and whether they voted. Party shares come from each country's most
 * recent national election that we have data for (named per country); demographic
 * tilts (age, education, city vs countryside, religiosity, income, migration) follow
 * well-documented patterns from comparative election studies and are calibrated so the
 * country's totals still match the official result. Countries without a party list use a
 * generic regional mix of party families. Regime categories approximate the EIU
 * Democracy Index 2024.
 */

import type { Country, RegionCode } from "./countries"
import { clamp, normal, pickIndexWeighted, type Rng } from "./rng"

export const PARTY_FAMILIES = [
  "Socialist / left",
  "Social democratic",
  "Green",
  "Liberal / centrist",
  "Conservative",
  "Nationalist right",
  "Ruling party (one-party state)",
  "No party",
] as const
export const NO_PARTY = 7
export const UNDER_18 = 8

/** Left–right self-placement buckets on a 0 (left) – 10 (right) scale */
export const LEANINGS = ["Left", "Centre-left", "Centre", "Centre-right", "Right"] as const
export function leaningBucket(l: number) {
  return l < 2.5 ? 0 : l < 4.5 ? 1 : l <= 5.5 ? 2 : l < 7.5 ? 3 : 4
}

export type Regime = "Full democracy" | "Flawed democracy" | "Hybrid regime" | "Authoritarian"

export interface Party {
  name: string
  /** index into PARTY_FAMILIES */
  family: number
  /** 0 = far left … 10 = far right */
  pos: number
  /** % of the vote (or of adults, for one-party membership); lists may omit small parties */
  share: number
  /** a stand-in party family rather than a named party */
  generic?: boolean
}

export interface CountryPolitics {
  regime: Regime
  /** % of adults who voted at the last national election */
  turnout: number
  /** e.g. "2025 federal election" */
  election?: string
  parties: Party[]
  /** one-party state: `parties[0]` is the ruling party and its share is membership */
  oneParty?: boolean
  /** no national elections or no legal parties */
  noElections?: string
  /** official numbers from elections widely judged not free or fair */
  official?: boolean
}

export interface Politics {
  party: Party | null
  /** 0 = left … 10 = right */
  leaning: number
  voter: boolean
  /** card-carrying member of the ruling party (one-party states) */
  member: boolean
}

// ---------------------------------------------------------------------------
// Data

const FAM: Record<string, number> = { L: 0, S: 1, G: 2, B: 3, C: 4, N: 5, R: 6 }

/** "Name:family:position:share|…" */
function parties(s: string): Party[] {
  return s.split("|").map((x) => {
    const [name, f, pos, share] = x.split(":")
    return { name, family: FAM[f], pos: Number(pos), share: Number(share) }
  })
}

/** [election, turnout %, parties] — vote shares in % */
const ELECTIONS: Record<string, [string, number, string]> = {
  "United States of America": ["2024 presidential election", 64,
    "Republican Party:C:7.5:49.8|Democratic Party:B:3.5:48.3|Independent / third party:B:5.5:1.9"],
  Canada: ["2025 federal election", 68.5,
    "Liberal Party:B:4.2:43.8|Conservative Party:C:7.2:41.3|New Democratic Party:S:2.5:6.3|Bloc Québécois:S:3.8:6.3|Green Party:G:2.5:1.2"],
  "United Kingdom": ["2024 general election", 60,
    "Labour:S:3.8:33.7|Conservatives:C:7:23.7|Reform UK:N:8.6:14.3|Liberal Democrats:B:4.5:12.2|Green Party:G:2.3:6.7|SNP:S:3.5:2.5"],
  Germany: ["2025 federal election", 82.5,
    "CDU/CSU:C:6.5:28.5|AfD:N:9:20.8|SPD:S:3.8:16.4|Greens:G:3:11.6|Die Linke:L:1.5:8.8|BSW:L:3:5|FDP:B:6.3:4.3"],
  France: ["2024 legislative election, 1st round", 66.7,
    "Rassemblement National & allies:N:8.7:33.2|New Popular Front:L:2:28|Ensemble (Macron):B:5.5:20|Les Républicains:C:7.2:6.6"],
  Italy: ["2022 general election", 63.9,
    "Brothers of Italy:N:8:26|Democratic Party:S:3.5:19.1|Five Star Movement:B:4:15.4|Lega:N:8.6:8.8|Forza Italia:C:6.8:8.1|Azione–Italia Viva:B:5.5:7.8|Greens and Left Alliance:G:1.8:3.6"],
  Spain: ["2023 general election", 66.6,
    "Partido Popular:C:7:33.1|PSOE:S:3.5:31.7|Vox:N:9:12.4|Sumar:L:2:12.3|ERC:L:3:1.9|Junts:B:6:1.6|EH Bildu:L:2:1.4|PNV:C:5.5:1.1"],
  Portugal: ["2025 legislative election", 64,
    "Democratic Alliance (AD):C:6.5:31.8|Socialist Party:S:3.5:22.8|Chega:N:8.8:22.6|Liberal Initiative:B:7:5.4|Livre:G:2.5:4.2|CDU (Communists):L:0.8:3|Left Bloc:L:1.5:2"],
  Netherlands: ["2025 general election", 78,
    "D66:B:4:16.9|PVV:N:9:16.7|VVD:B:7:14.2|GroenLinks–PvdA:S:2.5:12.8|CDA:C:6:11.8|JA21:N:8:6|Forum for Democracy:N:9.5:4.5"],
  Belgium: ["2024 federal election", 88,
    "N-VA:N:7.5:16.7|Vlaams Belang:N:9:13.8|MR:B:7:10.3|PVDA–PTB:L:1:9.9|Vooruit:S:3.5:8.1|PS:S:2.5:8|CD&V:C:6:8|Les Engagés:C:5.5:6.8|Open VLD:B:6.5:5.5|Groen:G:2.5:4.7|Ecolo:G:2.5:2.9"],
  Switzerland: ["2023 federal election", 46.6,
    "SVP:N:8.5:27.9|Social Democrats:S:2.5:18.3|FDP.The Liberals:B:7:14.3|The Centre:C:5.5:14.1|Greens:G:2:9.8|Green Liberals:B:5:7.6"],
  Austria: ["2024 legislative election", 77.7,
    "FPÖ:N:8.8:28.8|ÖVP:C:7:26.3|SPÖ:S:3.5:21.1|NEOS:B:6:9.1|Greens:G:2.5:8.2"],
  Sweden: ["2022 general election", 84.2,
    "Social Democrats:S:3.5:30.3|Sweden Democrats:N:8.5:20.5|Moderates:C:7:19.1|Left Party:L:1.5:6.8|Centre Party:B:5.5:6.7|Christian Democrats:C:7.5:5.3|Green Party:G:2.8:5.1|Liberals:B:6:4.6"],
  Norway: ["2025 parliamentary election", 79,
    "Labour:S:3.5:28|Progress Party:N:8:23.8|Conservatives:C:7:14.6|Socialist Left:L:1.5:5.6|Centre Party:C:5:5.6|Red Party:L:0.5:5.3|Greens:G:2.5:4.7|Christian Democrats:C:6.5:4.2|Liberals:B:6:3.7"],
  Denmark: ["2022 general election", 84.2,
    "Social Democrats:S:3.8:27.5|Venstre:B:7:13.3|Moderates:B:5.5:9.3|Green Left (SF):L:2:8.3|Denmark Democrats:N:8.5:8.1|Liberal Alliance:B:8:7.9|Conservatives:C:7:5.5|Red–Green Alliance:L:0.5:5.1|Social Liberals:B:4.5:3.8|The Alternative:G:2.5:3.3|Danish People's Party:N:8.5:2.6"],
  Finland: ["2023 parliamentary election", 71.9,
    "National Coalition:C:7:20.8|Finns Party:N:8.5:20.1|Social Democrats:S:3.5:19.9|Centre Party:C:5.5:11.3|Left Alliance:L:1.5:7.1|Greens:G:2.5:7|Swedish People's Party:B:6:4.3|Christian Democrats:C:7:4.2"],
  Ireland: ["2024 general election", 59.7,
    "Fianna Fáil:C:6:21.9|Fine Gael:C:6.5:20.8|Sinn Féin:L:2.5:19|Social Democrats:S:3:4.8|Labour:S:3.5:4.7|Aontú:N:7.5:3.9|Green Party:G:3:3|People Before Profit:L:0.5:2.8"],
  Poland: ["2023 parliamentary election", 74.4,
    "Law and Justice (PiS):N:8:35.4|Civic Coalition (KO):B:5:30.7|Third Way:C:6:14.4|The Left:S:2.5:8.6|Confederation:N:9:7.2"],
  Czechia: ["2025 parliamentary election", 68.9,
    "ANO:N:7:34.5|SPOLU:C:7:23.4|Mayors and Independents:B:5.5:11.2|Pirates:B:4:9|SPD:N:9:7.8|Motorists:N:8.5:6.8"],
  Hungary: ["2022 parliamentary election", 69.6,
    "Fidesz–KDNP:N:8:54.1|United for Hungary:B:4:34.4|Our Homeland:N:9.5:5.9|Two-tailed Dog Party:B:4:3.3"],
  Romania: ["2024 parliamentary election", 52.5,
    "PSD:S:4.5:22|AUR:N:9:18|PNL:C:6.5:13.2|USR:B:5:12.4|S.O.S. Romania:N:9.5:7.4|POT:N:9:6.5|UDMR:C:6:6.3"],
  Greece: ["2023 legislative election (June)", 53.7,
    "New Democracy:C:7:40.6|SYRIZA:L:2.5:17.8|PASOK:S:4:11.8|Communist Party (KKE):L:0.5:7.7|Spartans:N:9.5:4.6|Greek Solution:N:9:4.4|Niki:C:8.5:3.7|Course of Freedom:L:2:3.2"],
  Ukraine: ["2019 parliamentary election (none held under martial law since)", 49.8,
    "Servant of the People:B:5:43.2|Batkivshchyna:C:5.5:8.2|European Solidarity:C:6.5:8.1|Holos:B:5:5.8"],
  Russia: ["2021 State Duma election", 51.7,
    "United Russia:R:7:49.8|Communist Party (KPRF):L:2:18.9|LDPR:N:8.5:7.5|A Just Russia:S:3.5:7.5|New People:B:6:5.3"],
  Turkey: ["2023 parliamentary election", 87,
    "AKP:C:7.5:35.6|CHP:S:4:25.4|MHP:N:9:10.1|İYİ Party:N:7.5:9.7|DEM / Green Left (pro-Kurdish):L:2:8.8"],
  Israel: ["2022 Knesset election", 70.6,
    "Likud:C:7.5:23.4|Yesh Atid:B:4.5:17.8|Religious Zionism:N:9.5:10.8|National Unity:C:5.5:9.1|Shas:C:8:8.2|United Torah Judaism:C:8:5.9|Yisrael Beiteinu:N:7:4.5|Ra'am:C:6:4.1|Hadash–Ta'al:L:1.5:3.8|Labor:S:3:3.7|Meretz:L:2:3.2|Balad:L:2.5:2.9"],
  Iran: ["2024 presidential election, run-off", 49.8,
    "Reformist camp (Pezeshkian):B:4:54.8|Principlist camp (Jalili):C:8.5:45.2"],
  India: ["2024 general election", 65.8,
    "BJP:N:7.8:36.6|Regional & other parties:B:5:23|Indian National Congress:S:4:21.2|Samajwadi Party:S:3.5:4.6|Trinamool Congress:S:4:4.4|YSR Congress:B:5:2.1|BSP:S:3:2.1|TDP:B:5.5:2|DMK:S:3.5:1.8|CPI(M):L:1:1.8"],
  "Sri Lanka": ["2024 parliamentary election", 69,
    "National People's Power:L:2.5:61.6|Samagi Jana Balawegaya:B:5:17.7|New Democratic Front:C:6.5:4.5|SLPP:N:7.5:3.1"],
  Japan: ["2024 general election (party-list vote)", 53.8,
    "Liberal Democratic Party:C:7:26.7|Constitutional Democratic Party:S:3.8:21.2|Democratic Party for the People:B:5.5:11.3|Komeito:C:6:10.9|Ishin (Japan Innovation):B:6.5:9.4|Reiwa Shinsengumi:L:2:7|Communist Party:L:1:6.2|Sanseito:N:8.5:3.4"],
  "South Korea": ["2025 presidential election", 79.4,
    "Democratic Party:B:3.8:49.4|People Power Party:C:7.2:41.2|Reform Party:C:6.5:8.3"],
  Taiwan: ["2024 presidential election", 71.9,
    "Democratic Progressive Party:S:4:40.1|Kuomintang:C:6.5:33.5|Taiwan People's Party:B:5:26.5"],
  Indonesia: ["2024 legislative election", 81.8,
    "PDI-P:S:4:16.7|Golkar:C:6:15.3|Gerindra:N:7.5:13.2|PKB:C:5.5:10.6|NasDem:B:5:9.7|PKS:C:8:8.4|Demokrat:C:6:7.4|PAN:C:6:7.2"],
  Malaysia: ["2022 general election", 74,
    "Pakatan Harapan:S:4:37.5|Perikatan Nasional:C:8:30.1|Barisan Nasional:C:6.5:22.4|Sarawak & Sabah parties:C:6:10"],
  Philippines: ["2022 presidential election", 83,
    "UniTeam (Marcos):C:7:58.8|Robredo campaign:B:4:27.9|PROMDI (Pacquiao):C:6.5:6.8|Aksyon Demokratiko:B:5:1.9"],
  Australia: ["2025 federal election (first preferences)", 90,
    "Labor:S:3.8:34.6|Liberal–National Coalition:C:7:31.8|Greens:G:2:12.2|Independents & minor parties:B:5:15|One Nation:N:9:6.4"],
  "New Zealand": ["2023 general election", 78.2,
    "National:C:7:38.1|Labour:S:3.5:26.9|Green Party:G:2:11.6|ACT:B:8:8.6|NZ First:N:7.5:6.1|Te Pāti Māori:L:2.5:3.1"],
  Brazil: ["2022 presidential election, 1st round", 79,
    "Workers' Party (Lula):S:3:48.4|Liberal Party (Bolsonaro):N:8.5:43.2|MDB (Tebet):B:5.5:4.2|PDT (Ciro Gomes):S:3.5:3"],
  Mexico: ["2024 presidential election", 61,
    "Morena & allies (Sheinbaum):L:3:59.8|PAN–PRI–PRD (Gálvez):C:6.5:27.5|Movimiento Ciudadano:S:4.2:10.3"],
  Argentina: ["2023 presidential election, 1st round", 77.7,
    "Unión por la Patria (Massa):S:3.5:36.7|La Libertad Avanza (Milei):B:9:30|Juntos por el Cambio (Bullrich):C:7:23.8|Hacemos (Schiaretti):B:5.5:6.8|Left Front (Bregman):L:0.5:2.7"],
  Chile: ["2025 presidential election, 1st round", 85,
    "Unidad por Chile (Jara):L:2:26.8|Republicans (Kast):N:8.5:23.9|Party of the People (Parisi):B:5.5:19.7|National Libertarians (Kaiser):N:9:13.9|Chile Vamos (Matthei):C:7:12.5"],
  Colombia: ["2022 presidential election, 1st round", 54.9,
    "Pacto Histórico (Petro):L:2.5:40.3|LIGA (Hernández):C:6.5:28.2|Equipo por Colombia (Gutiérrez):C:7.5:23.9|Centro Esperanza (Fajardo):B:5:4.2"],
  Ecuador: ["2025 presidential election, 1st round", 83,
    "ADN (Noboa):C:7:44.2|Citizen Revolution (González):L:3:44|Pachakutik (Iza):L:2:5.3"],
  Bolivia: ["2025 general election, 1st round", 87,
    "PDC (Rodrigo Paz):C:5.5:32.1|Libre (Quiroga):C:7.5:26.7|Unidad (Doria Medina):B:6:19.7|Alianza Popular (Rodríguez):L:2.5:8.5"],
  Nigeria: ["2023 presidential election", 27,
    "APC (Tinubu):C:6:36.6|PDP (Atiku):B:5.5:29.1|Labour Party (Obi):S:4:25.4|NNPP (Kwankwaso):S:4.5:6.4"],
  "South Africa": ["2024 general election", 58.6,
    "ANC:S:3.5:40.2|Democratic Alliance:B:6.5:21.8|uMkhonto weSizwe (MK):L:3:14.6|Economic Freedom Fighters:L:1:9.5|IFP:C:6.5:3.9|Patriotic Alliance:C:6.5:2.1|Freedom Front Plus:N:8.5:1.4"],
  Kenya: ["2022 presidential election", 64.8,
    "Kenya Kwanza (Ruto):C:6:50.5|Azimio la Umoja (Odinga):S:4:48.8"],
  Ghana: ["2024 presidential election", 60.9,
    "NDC (Mahama):S:4:56.6|NPP (Bawumia):C:6.5:41.6"],
}

/** One-party states: [ruling party, position, % of adults who are members, turnout] */
const ONE_PARTY: Record<string, [string, number, number, number]> = {
  China: ["Chinese Communist Party", 4, 8.6, 0],
  Vietnam: ["Communist Party of Vietnam", 4, 7.5, 99],
  Laos: ["Lao People's Revolutionary Party", 4, 7, 98],
  "North Korea": ["Workers' Party of Korea", 3, 25, 99],
  Cuba: ["Communist Party of Cuba", 2, 7.5, 76],
}

/** Authoritarian states with a dominant ruling party: [name, position] */
const RULING: Record<string, [string, number]> = {
  Belarus: ["Belaya Rus", 6],
  Azerbaijan: ["New Azerbaijan Party", 6.5],
  Kazakhstan: ["Amanat", 6],
  Uzbekistan: ["Liberal Democratic Party", 6],
  Tajikistan: ["People's Democratic Party", 6],
  Turkmenistan: ["Democratic Party of Turkmenistan", 6],
  Cambodia: ["Cambodian People's Party", 6],
  Myanmar: ["Union Solidarity and Development Party", 7.5],
  Ethiopia: ["Prosperity Party", 5],
  Rwanda: ["Rwandan Patriotic Front", 5],
  Uganda: ["National Resistance Movement", 5.5],
  Tanzania: ["Chama Cha Mapinduzi", 4.5],
  Zimbabwe: ["ZANU–PF", 5],
  Mozambique: ["FRELIMO", 4.5],
  Angola: ["MPLA", 4.5],
  Cameroon: ["CPDM", 6],
  Algeria: ["FLN", 5],
  Egypt: ["Nation's Future Party", 6.5],
  Nicaragua: ["Sandinista Front (FSLN)", 2.5],
  Venezuela: ["PSUV", 2],
  Burundi: ["CNDD–FDD", 5],
  "Eq. Guinea": ["PDGE", 6],
  Congo: ["Congolese Party of Labour", 4.5],
  Togo: ["UNIR", 6],
  Djibouti: ["People's Rally for Progress", 5.5],
  Chad: ["Patriotic Salvation Movement", 6],
  Mauritania: ["El Insaf", 6],
  "Dem. Rep. Congo": ["Sacred Union (Tshisekedi)", 5],
  "Central African Rep.": ["United Hearts Movement", 5.5],
  Gabon: ["Union of Builders (Oligui)", 6],
  Guinea: ["Generation for Modernity (Doumbouya)", 6],
}

const NO_ELECTIONS: Record<string, string> = {
  "Saudi Arabia": "Absolute monarchy: no national elections and no legal political parties",
  "United Arab Emirates": "Federation of monarchies: no political parties",
  Qatar: "Monarchy: no political parties",
  Oman: "Absolute monarchy: no political parties",
  Kuwait: "Parliament suspended since 2024; parties are not legal",
  eSwatini: "Absolute monarchy: parties may not contest elections",
  Afghanistan: "Taliban rule: no elections and parties banned",
  Eritrea: "No national election has ever been held",
  Mali: "Military government: elections postponed and parties dissolved",
  "Burkina Faso": "Military government: elections postponed and parties dissolved",
  Niger: "Military government: parties dissolved",
  Sudan: "Civil war: no national elections",
  "S. Sudan": "No national election held since independence",
  Libya: "Divided government: national elections repeatedly postponed",
  Yemen: "Civil war: no national elections since 2012",
  Somalia: "Indirect, clan-based elections",
  Syria: "Transitional government: indirect selection of parliament",
  Haiti: "No national election held since 2016",
  Palestine: "No national election held since 2006",
}

const FULL = new Set([
  "Norway", "New Zealand", "Sweden", "Iceland", "Switzerland", "Finland", "Denmark", "Ireland", "Netherlands", "Uruguay",
  "Australia", "Taiwan", "Canada", "Germany", "Japan", "Costa Rica", "Austria", "Spain", "Greece", "United Kingdom",
  "Czechia", "Estonia", "Portugal", "Chile",
])
const HYBRID = new Set([
  "Turkey", "Pakistan", "Bangladesh", "Nigeria", "Kenya", "Morocco", "Lebanon", "Ukraine", "Georgia", "Armenia",
  "Bolivia", "El Salvador", "Honduras", "Guatemala", "Mexico", "Senegal", "Madagascar", "Malawi", "Liberia",
  "Sierra Leone", "Benin", "Côte d'Ivoire", "Nepal", "Fiji", "Papua New Guinea", "Bosnia and Herz.", "Tunisia",
  "Kyrgyzstan", "Iraq", "Jordan", "Zambia", "Ecuador", "Mongolia",
])
const AUTHORITARIAN = new Set([
  ...Object.keys(ONE_PARTY), ...Object.keys(RULING), ...Object.keys(NO_ELECTIONS), "Russia", "Iran",
])

/** Generic family mixes by region: [name, family, position, share] */
const TEMPLATES: Record<RegionCode, [string, string, number, number][]> = {
  ECA: [["Social democrats", "S", 3.5, 24], ["Conservatives", "C", 7, 24], ["Nationalists", "N", 8.8, 17], ["Liberals", "B", 6, 12], ["Greens", "G", 2.5, 7], ["Socialists", "L", 1.5, 8]],
  NAM: [["Liberals", "B", 4, 50], ["Conservatives", "C", 7, 50]],
  LAC: [["Left-wing parties", "L", 2.5, 28], ["Centre-left parties", "S", 4, 15], ["Centrist parties", "B", 5.5, 15], ["Conservatives", "C", 7.5, 30], ["Nationalist right", "N", 9, 12]],
  SSA: [["Social democrats", "S", 4, 35], ["Conservatives", "C", 6.5, 30], ["Liberals", "B", 5.5, 25], ["Socialists", "L", 2, 10]],
  MENA: [["Islamist / conservative parties", "C", 7.5, 35], ["Nationalists", "N", 7, 20], ["Liberals", "B", 5, 25], ["Leftists", "L", 2.5, 20]],
  SAS: [["Conservatives", "C", 6.5, 35], ["Social democrats", "S", 4, 25], ["Liberals", "B", 5.5, 25], ["Nationalists", "N", 8, 10], ["Socialists", "L", 2, 5]],
  SEO: [["Conservatives", "C", 6.5, 35], ["Social democrats", "S", 4, 25], ["Liberals", "B", 5.5, 25], ["Nationalists", "N", 8, 10], ["Socialists", "L", 2, 5]],
  EAS: [["Conservatives", "C", 6.5, 35], ["Social democrats", "S", 4, 25], ["Liberals", "B", 5.5, 25], ["Nationalists", "N", 8, 10], ["Socialists", "L", 2, 5]],
}

const DEFAULT_TURNOUT: Record<Regime, number> = {
  "Full democracy": 72, "Flawed democracy": 64, "Hybrid regime": 55, Authoritarian: 60,
}

const cache = new Map<string, CountryPolitics>()

export function politicsOf(c: Country): CountryPolitics {
  let p = cache.get(c.name)
  if (p) return p
  const regime: Regime = AUTHORITARIAN.has(c.name) ? "Authoritarian" : HYBRID.has(c.name) ? "Hybrid regime" : FULL.has(c.name) ? "Full democracy" : "Flawed democracy"
  const e = ELECTIONS[c.name]
  const one = ONE_PARTY[c.name]
  const ruling = RULING[c.name]
  if (e) {
    p = { regime, turnout: e[1], election: e[0], parties: parties(e[2]), official: regime === "Authoritarian" }
  } else if (one) {
    p = {
      regime, turnout: one[3], oneParty: true, official: true,
      election: one[3] ? "single-party elections" : undefined,
      noElections: one[3] ? undefined : "One-party state: no direct national elections",
      parties: [{ name: one[0], family: FAM.R, pos: one[1], share: one[2] }],
    }
  } else if (NO_ELECTIONS[c.name]) {
    p = { regime, turnout: 0, noElections: NO_ELECTIONS[c.name], parties: [] }
  } else if (ruling) {
    p = {
      regime, turnout: DEFAULT_TURNOUT.Authoritarian, official: true, election: "latest national election",
      parties: [
        { name: ruling[0], family: FAM.R, pos: ruling[1], share: 70 },
        { name: "Tolerated opposition", family: FAM.B, pos: 4.5, share: 20, generic: true },
        { name: "Other parties", family: FAM.C, pos: 6.5, share: 10, generic: true },
      ],
    }
  } else {
    p = {
      regime, turnout: DEFAULT_TURNOUT[regime],
      parties: TEMPLATES[c.region].map(([name, f, pos, share]) => ({ name, family: FAM[f], pos, share, generic: true })),
    }
  }
  cache.set(c.name, p)
  return p
}

// ---------------------------------------------------------------------------
// Who supports whom

/** Traits the tilts depend on (a subset of Person, to avoid a circular import) */
export interface PoliticalTraits {
  age: number
  gender: "Male" | "Female"
  urban: boolean
  education: number
  devout: boolean
  unaffiliated: boolean
  immigrant: boolean
  /** follows a different religion from most people in the country */
  minority: boolean
  /** income relative to the country's median earnings */
  relIncome: number
}

// multiplicative tilts per family: [left, socdem, green, liberal, conservative, nationalist, ruling]
const T_YOUNG = [1.4, 0.85, 1.7, 1.15, 0.7, 1.05, 0.8]
const T_OLD = [0.8, 1.2, 0.55, 0.9, 1.35, 0.95, 1.2]
const T_URBAN = [1.15, 1, 1.35, 1.15, 0.9, 0.85, 1]
const T_RURAL = [0.85, 1, 0.65, 0.85, 1.15, 1.2, 1]
const T_TERTIARY = [1.1, 0.95, 1.7, 1.35, 0.95, 0.6, 1.3]
const T_LOW_EDU = [1, 1.1, 0.5, 0.75, 1, 1.25, 0.9]
const T_DEVOUT = [0.65, 0.9, 0.6, 0.8, 1.5, 1.15, 1]
const T_SECULAR = [1.3, 1.05, 1.4, 1.15, 0.7, 0.9, 1]
const T_IMMIGRANT = [1.2, 1.25, 1.1, 1.1, 0.85, 0.35, 0.8]
const T_MINORITY = [1.3, 1.35, 1.1, 1.2, 0.85, 0.2, 0.9]
const T_POOR = [1.25, 1.15, 0.8, 0.85, 0.9, 1.1, 0.9]
const T_RICH = [0.75, 0.9, 1.1, 1.35, 1.3, 0.85, 1.4]
const T_FEMALE = [1.05, 1.1, 1.2, 1, 0.95, 0.8, 0.9]
const T_MALE = [0.95, 0.9, 0.8, 1, 1.05, 1.2, 1.1]

function tilt(t: PoliticalTraits, family: number) {
  let f = 1
  if (t.age < 30) f *= T_YOUNG[family]
  else if (t.age >= 65) f *= T_OLD[family]
  f *= (t.urban ? T_URBAN : T_RURAL)[family]
  if (t.education === 3) f *= T_TERTIARY[family]
  else if (t.education <= 1) f *= T_LOW_EDU[family]
  if (t.devout) f *= T_DEVOUT[family]
  else if (t.unaffiliated) f *= T_SECULAR[family]
  if (t.immigrant) f *= T_IMMIGRANT[family]
  // nationalist parties draw overwhelmingly on the majority group
  if (t.minority) f *= T_MINORITY[family]
  if (t.relIncome > 0 && t.relIncome < 0.5) f *= T_POOR[family]
  else if (t.relIncome > 2) f *= T_RICH[family]
  f *= (t.gender === "Female" ? T_FEMALE : T_MALE)[family]
  return f
}

function turnoutTilt(t: PoliticalTraits) {
  let f = t.age < 25 ? 0.75 : t.age < 35 ? 0.88 : t.age >= 65 ? 1.12 : 1
  if (t.education === 3) f *= 1.12
  else if (t.education === 0) f *= 0.85
  if (t.immigrant) f *= 0.45 // many are not citizens
  return f
}

interface Calibration {
  /** per-party weights so that the tilted choices add back up to the official shares */
  weights: number[]
  /** turnout normaliser */
  turnoutScale: number
  /** mean position of the electorate */
  centre: number
}

const calibrations = new Map<string, Calibration>()

/**
 * Fit party weights on a sample of the country's adults (iterative proportional fitting),
 * so demographic tilts reshuffle who votes for whom without changing national totals.
 */
function calibrate(c: Country, cp: CountryPolitics, sample: () => PoliticalTraits[]): Calibration {
  let cal = calibrations.get(c.name)
  if (cal) return cal
  const ps = cp.parties
  const total = ps.reduce((s, p) => s + p.share, 0) || 1
  const centre = ps.reduce((s, p) => s + p.pos * p.share, 0) / total || 5
  if (cp.oneParty || !ps.length) {
    cal = { weights: ps.map(() => 1), turnoutScale: 1, centre }
    calibrations.set(c.name, cal)
    return cal
  }
  const people = sample()
  const T = people.map((t) => ps.map((p) => tilt(t, p.family)))
  const vote = people.map((t) => turnoutTilt(t))
  const meanVote = vote.reduce((a, b) => a + b, 0) / Math.max(1, vote.length)
  const target = ps.map((p) => p.share / total)
  const weights = ps.map(() => 1)
  for (let iter = 0; iter < 30; iter++) {
    const got = ps.map(() => 0)
    let sum = 0
    for (let i = 0; i < people.length; i++) {
      let z = 0
      for (let k = 0; k < ps.length; k++) z += weights[k] * T[i][k]
      for (let k = 0; k < ps.length; k++) got[k] += (vote[i] * weights[k] * T[i][k]) / z
      sum += vote[i]
    }
    for (let k = 0; k < ps.length; k++) weights[k] *= target[k] / Math.max(1e-9, got[k] / sum)
  }
  cal = { weights, turnoutScale: meanVote > 0 ? 1 / meanVote : 1, centre }
  calibrations.set(c.name, cal)
  return cal
}

/** Political profile of one adult (null for children). */
export function assignPolitics(c: Country, t: PoliticalTraits, rng: Rng, sample: () => PoliticalTraits[]): Politics | null {
  if (t.age < 18) return null
  const cp = politicsOf(c)
  const cal = calibrate(c, cp, sample)
  const drift = (sd: number) => clamp(cal.centre + (5 - cal.centre) * 0.5 + normal(rng) * sd, 0, 10)

  if (cp.oneParty) {
    const ruling = cp.parties[0]
    const member = rng() * 100 < ruling.share * (t.education === 3 ? 2.2 : t.education <= 1 ? 0.5 : 1) * (t.age < 25 ? 0.6 : 1)
    const voter = rng() * 100 < cp.turnout
    return member
      ? { party: ruling, leaning: clamp(ruling.pos + normal(rng) * 1.1, 0, 10), voter, member: true }
      : { party: null, leaning: drift(1.8), voter, member: false }
  }

  if (cp.noElections) return { party: null, leaning: drift(1.8), voter: false, member: false }

  const voter = rng() * 100 < Math.min(98, cp.turnout * turnoutTilt(t) * cal.turnoutScale)
  // non-voters: about half still lean towards a party
  if (!voter && rng() < 0.55) return { party: null, leaning: drift(1.7), voter: false, member: false }
  const w = cp.parties.map((p, k) => cal.weights[k] * tilt(t, p.family))
  const party = cp.parties[pickIndexWeighted(rng, w)]
  return { party, leaning: clamp(party.pos + normal(rng) * 1.1, 0, 10), voter, member: false }
}

export function familyOf(p: { politics: Politics | null }) {
  if (!p.politics) return UNDER_18
  return p.politics.party ? p.politics.party.family : NO_PARTY
}
