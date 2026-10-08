/**
 * National statistics used to sample synthetic people. The hand-entered table below is
 * overlaid with World Bank WDI values (src/lib/sim/data/wdi.json, refreshed by
 * `bun scripts/fetch-data.ts`) wherever those exist; see /methodology for every source.
 */
import wdi from "./data/wdi.json"

export const REGIONS = {
  EAS: "East Asia",
  SAS: "South Asia",
  SEO: "Southeast Asia & Oceania",
  ECA: "Europe & Central Asia",
  MENA: "Middle East & N. Africa",
  SSA: "Sub-Saharan Africa",
  NAM: "North America",
  LAC: "Latin America & Caribbean",
} as const

export type RegionCode = keyof typeof REGIONS

export const RELIGIONS = [
  "Christianity",
  "Islam",
  "Hinduism",
  "Buddhism",
  "Unaffiliated",
  "Folk religion",
  "Judaism",
  "Other",
] as const
export type Religion = (typeof RELIGIONS)[number]

export const EDUCATION_LEVELS = ["No schooling", "Primary", "Secondary", "Tertiary"] as const

export type NamePool =
  | "anglo" | "hispanic" | "lusophone" | "french" | "german" | "dutch" | "nordic" | "italian"
  | "slavicEast" | "slavicWest" | "balkan" | "romanian" | "baltic" | "greek" | "caucasus"
  | "arabic" | "persian" | "turkic" | "hindi" | "urdu" | "bengali" | "sinhala"
  | "chinese" | "japanese" | "korean" | "vietnamese" | "thai" | "khmer" | "burmese"
  | "malayIndo" | "filipino" | "mongolian" | "melanesian" | "hebrew"
  | "westAfrica" | "sahel" | "centralAfrica" | "eastAfrica" | "horn" | "southernAfrica" | "malagasy"

export interface City {
  name: string
  lat: number
  lon: number
  weight: number
}

export interface Country {
  /** Name as it appears in the world-atlas shapes */
  name: string
  /** Human-friendly display name */
  label: string
  iso2: string
  region: RegionCode
  /** millions */
  population: number
  /** typical (median) annual earnings of a full-time worker, USD */
  medianIncome: number
  /** Gini index, 0–100 */
  gini: number
  /** % share per entry of RELIGIONS */
  religion: number[]
  /** % living in urban areas */
  urban: number
  medianAge: number
  /** % of adults by EDUCATION_LEVELS */
  education: number[]
  /** % of employment in agriculture / industry (rest is services) */
  agriculture: number
  industry: number
  /** % of residents born abroad */
  migrants: number
  /** % using the internet */
  internet: number
  lifeExpectancy: number
  fertility: number
  /** % of each sex in 5-year age bands 0–4 … 75–79, 80+ (UN WPP via World Bank) */
  ageBands: { male: number[]; female: number[] }
  /** % of the population that is female */
  femaleShare: number
  /** labour force participation, % of people 15+ */
  participation: { male: number; female: number }
  /** % of the labour force without work */
  unemployment: number
  /** % of children out of school at primary / lower-secondary age */
  outOfSchool: { primary: number; lowerSecondary: number }
  /** crude rates per 1,000 people per year */
  births: number
  deaths: number
  languages: { name: string; share: number }[]
  cities: City[]
  namePool: NamePool
}

const LABELS: Record<string, string> = {
  "United States of America": "United States",
  "Dem. Rep. Congo": "DR Congo",
  "Dominican Rep.": "Dominican Republic",
  "Central African Rep.": "Central African Republic",
  "S. Sudan": "South Sudan",
  "Bosnia and Herz.": "Bosnia & Herzegovina",
  "Macedonia": "North Macedonia",
  "Eq. Guinea": "Equatorial Guinea",
  "Côte d'Ivoire": "Côte d’Ivoire",
}

function c(
  name: string, iso2: string, region: RegionCode, population: number, medianIncome: number, gini: number,
  religion: number[], urban: number, medianAge: number, education: number[], agriculture: number, industry: number,
  migrants: number, internet: number, lifeExpectancy: number, fertility: number, languages: string, cities: string,
  namePool: NamePool,
): Country {
  return {
    name, label: LABELS[name] ?? name, iso2, region, population, medianIncome, gini, religion, urban, medianAge, education,
    agriculture, industry, migrants, internet, lifeExpectancy, fertility, namePool,
    ageBands: { male: [], female: [] }, femaleShare: 50, participation: { male: 75, female: 50 }, unemployment: 5,
    outOfSchool: { primary: 5, lowerSecondary: 10 }, births: 0, deaths: 0,
    languages: languages.split(",").map((l) => {
      const [n, s] = l.split(":")
      return { name: n, share: Number(s) }
    }),
    cities: cities.split(",").map((s, i) => {
      const [n, lat, lon] = s.split(":")
      return { name: n, lat: Number(lat), lon: Number(lon), weight: 1 / Math.pow(i + 1, 0.85) }
    }),
  }
}

//          name                        iso   reg     pop    income gini  christ  musl  hindu budd  unaff folk  jew  other   urb  age   none prim sec  tert  agri ind  migr inet life  tfr
export const COUNTRIES: Country[] = [
  c("China", "CN", "EAS", 1410, 11000, 37, [2.5, 1.8, 0, 18, 52, 22, 0, 3.7], 66, 39.5, [3, 25, 55, 17], 22, 29, 0.1, 78, 78, 1.0,
    "Mandarin:70,Cantonese:6,Wu:6,Min:5,Other:13",
    "Shanghai:31.23:121.47,Beijing:39.90:116.40,Guangzhou:23.13:113.26,Shenzhen:22.54:114.06,Chengdu:30.66:104.07,Chongqing:29.56:106.55,Wuhan:30.59:114.30,Xi'an:34.34:108.94,Tianjin:39.13:117.20,Harbin:45.80:126.53,Kunming:25.04:102.71,Zhengzhou:34.75:113.62,Urumqi:43.83:87.62,Lanzhou:36.06:103.83",
    "chinese"),
  c("India", "IN", "SAS", 1450, 2800, 35, [2.3, 14.5, 79.5, 0.7, 0.2, 0.5, 0, 2.3], 37, 28.8, [22, 25, 40, 13], 43, 25, 0.4, 55, 72, 2.0,
    "Hindi:44,Bengali:8,Marathi:7,Telugu:7,Tamil:6,Gujarati:5,Urdu:4,Kannada:4,Other:15",
    "Delhi:28.61:77.21,Mumbai:19.08:72.88,Kolkata:22.57:88.36,Bangalore:12.97:77.59,Chennai:13.08:80.27,Hyderabad:17.39:78.49,Ahmedabad:23.02:72.57,Lucknow:26.85:80.95,Patna:25.59:85.14,Jaipur:26.91:75.79,Pune:18.52:73.86,Bhopal:23.26:77.41,Guwahati:26.14:91.74,Kochi:9.93:76.27",
    "hindi"),
  c("United States of America", "US", "NAM", 340, 62000, 41, [63, 1.1, 0.9, 1.1, 29, 0.3, 1.8, 2.8], 83, 38.9, [1, 4, 52, 43], 1.5, 19, 15, 92, 79, 1.6,
    "English:78,Spanish:13,Chinese:1,Other:8",
    "New York:40.71:-74.01,Los Angeles:34.05:-118.24,Chicago:41.88:-87.63,Houston:29.76:-95.37,Phoenix:33.45:-112.07,Philadelphia:39.95:-75.17,Dallas:32.78:-96.80,Atlanta:33.75:-84.39,Miami:25.76:-80.19,Seattle:47.61:-122.33,Denver:39.74:-104.99,San Francisco:37.77:-122.42,Minneapolis:44.98:-93.27,St. Louis:38.63:-90.20,Nashville:36.16:-86.78,Boston:42.36:-71.06",
    "anglo"),
  c("Indonesia", "ID", "SEO", 283, 4200, 38, [10, 87, 1.7, 0.7, 0, 0, 0, 0.6], 58, 30, [5, 30, 52, 13], 28, 22, 0.1, 69, 71, 2.1,
    "Indonesian:40,Javanese:30,Sundanese:15,Other:15",
    "Jakarta:-6.21:106.85,Surabaya:-7.25:112.75,Bandung:-6.92:107.62,Medan:3.59:98.67,Makassar:-5.15:119.43,Semarang:-6.97:110.42,Palembang:-2.98:104.76,Denpasar:-8.65:115.22,Balikpapan:-1.27:116.83",
    "malayIndo"),
  c("Pakistan", "PK", "SAS", 251, 1700, 30, [1.6, 96.5, 1.9, 0, 0, 0, 0, 0], 38, 20.6, [40, 20, 30, 10], 37, 25, 1.4, 45, 67, 3.4,
    "Punjabi:38,Pashto:18,Sindhi:14,Saraiki:12,Urdu:8,Other:10",
    "Karachi:24.86:67.01,Lahore:31.55:74.34,Faisalabad:31.42:73.08,Rawalpindi:33.60:73.04,Peshawar:34.01:71.58,Multan:30.16:71.52,Quetta:30.18:66.98,Hyderabad:25.40:68.37",
    "urdu"),
  c("Nigeria", "NG", "SSA", 230, 1400, 35, [46, 50, 0, 0, 0.5, 3, 0, 0.5], 54, 18, [30, 20, 40, 10], 35, 12, 0.6, 45, 54, 4.5,
    "Hausa:30,Yoruba:21,Igbo:18,English:10,Other:21",
    "Lagos:6.52:3.38,Kano:12.00:8.52,Ibadan:7.38:3.95,Abuja:9.08:7.40,Port Harcourt:4.82:7.03,Kaduna:10.52:7.44,Benin City:6.34:5.63,Maiduguri:11.85:13.16,Enugu:6.44:7.50",
    "westAfrica"),
  c("Brazil", "BR", "LAC", 212, 8000, 52, [85, 0, 0, 0.1, 13, 1, 0, 0.9], 88, 34, [6, 32, 42, 20], 9, 20, 0.6, 84, 76, 1.6,
    "Portuguese:98,Other:2",
    "São Paulo:-23.55:-46.63,Rio de Janeiro:-22.91:-43.17,Brasília:-15.79:-47.88,Salvador:-12.97:-38.50,Fortaleza:-3.73:-38.53,Belo Horizonte:-19.92:-43.94,Manaus:-3.12:-60.02,Recife:-8.05:-34.88,Porto Alegre:-30.03:-51.23,Curitiba:-25.43:-49.27,Belém:-1.46:-48.49",
    "lusophone"),
  c("Bangladesh", "BD", "SAS", 174, 2300, 32, [0.3, 90.5, 8.5, 0.6, 0, 0, 0, 0.1], 40, 26, [25, 30, 36, 9], 37, 21, 1.2, 45, 73, 1.9,
    "Bengali:98,Other:2",
    "Dhaka:23.81:90.41,Chittagong:22.36:91.78,Khulna:22.85:89.54,Rajshahi:24.37:88.60,Sylhet:24.90:91.87,Rangpur:25.74:89.28",
    "bengali"),
  c("Russia", "RU", "ECA", 144, 9500, 36, [71, 13, 0, 0.5, 14, 0.5, 0.1, 0.9], 75, 39.6, [1, 5, 59, 35], 6, 27, 8, 90, 73, 1.4,
    "Russian:85,Tatar:4,Other:11",
    "Moscow:55.76:37.62,Saint Petersburg:59.93:30.36,Novosibirsk:55.03:82.92,Yekaterinburg:56.84:60.60,Kazan:55.79:49.12,Nizhny Novgorod:56.33:44.00,Samara:53.20:50.15,Rostov-on-Don:47.24:39.71,Krasnoyarsk:56.01:92.85,Vladivostok:43.12:131.89,Omsk:54.99:73.37,Irkutsk:52.29:104.28",
    "slavicEast"),
  c("Ethiopia", "ET", "SSA", 132, 900, 35, [62, 34, 0, 0, 0, 3, 0, 1], 23, 19.5, [45, 30, 18, 7], 63, 10, 1, 20, 66, 4.0,
    "Oromo:34,Amharic:29,Somali:6,Tigrinya:6,Other:25",
    "Addis Ababa:9.03:38.74,Dire Dawa:9.59:41.86,Mekelle:13.50:39.47,Gondar:12.60:37.47,Hawassa:7.06:38.48,Bahir Dar:11.59:37.39,Jimma:7.67:36.83",
    "horn"),
  c("Mexico", "MX", "LAC", 131, 7500, 43, [91, 0, 0, 0, 8, 0, 0, 1], 81, 30, [5, 30, 45, 20], 12, 25, 1, 80, 75, 1.8,
    "Spanish:93,Nahuatl:2,Other:5",
    "Mexico City:19.43:-99.13,Guadalajara:20.66:-103.35,Monterrey:25.69:-100.32,Puebla:19.04:-98.21,Tijuana:32.51:-117.04,Mérida:20.97:-89.62,León:21.12:-101.68,Chihuahua:28.63:-106.07,Oaxaca:17.07:-96.72",
    "hispanic"),
  c("Japan", "JP", "EAS", 123, 31000, 33, [2, 0.2, 0, 36, 57, 4, 0, 0.8], 92, 49, [0, 3, 47, 50], 3, 23, 2.4, 85, 84.5, 1.2,
    "Japanese:99,Other:1",
    "Tokyo:35.68:139.69,Osaka:34.69:135.50,Nagoya:35.18:136.91,Sapporo:43.06:141.35,Fukuoka:33.59:130.40,Hiroshima:34.39:132.46,Sendai:38.27:140.87,Kyoto:35.01:135.77",
    "japanese"),
  c("Egypt", "EG", "MENA", 116, 3000, 32, [5.1, 94.9, 0, 0, 0, 0, 0, 0], 43, 24, [25, 20, 40, 15], 20, 27, 0.5, 72, 71, 2.8,
    "Arabic:99,Other:1",
    "Cairo:30.04:31.24,Alexandria:31.20:29.92,Giza:30.01:31.21,Mansoura:31.04:31.38,Asyut:27.18:31.18,Luxor:25.69:32.64,Aswan:24.09:32.90,Port Said:31.27:32.30,Tanta:30.79:31.00",
    "arabic"),
  c("Philippines", "PH", "SEO", 116, 3800, 41, [91, 6, 0, 0.1, 0.1, 1.5, 0, 1.3], 48, 25.7, [3, 20, 52, 25], 23, 18, 0.2, 73, 70, 1.9,
    "Tagalog:40,Cebuano:20,Ilocano:8,Hiligaynon:7,Other:25",
    "Manila:14.60:120.98,Quezon City:14.68:121.04,Cebu:10.32:123.89,Davao:7.19:125.46,Zamboanga:6.92:122.08,Iloilo:10.72:122.56,Cagayan de Oro:8.48:124.65",
    "filipino"),
  c("Dem. Rep. Congo", "CD", "SSA", 109, 600, 42, [95, 1.5, 0, 0, 1.5, 1.5, 0, 0.5], 47, 16.7, [25, 40, 30, 5], 60, 10, 0.9, 27, 61, 6.0,
    "Lingala:30,Swahili:30,Kikongo:15,Tshiluba:15,French:5,Other:5",
    "Kinshasa:-4.44:15.27,Lubumbashi:-11.66:27.48,Mbuji-Mayi:-6.14:23.59,Kisangani:0.52:25.20,Goma:-1.68:29.22,Kananga:-5.90:22.42,Bukavu:-2.51:28.86",
    "centralAfrica"),
  c("Vietnam", "VN", "SEO", 101, 4500, 36, [8, 0.2, 0, 16, 29.6, 45, 0, 1.2], 40, 33, [4, 25, 58, 13], 27, 33, 0.1, 79, 74, 1.9,
    "Vietnamese:86,Other:14",
    "Ho Chi Minh City:10.82:106.63,Hanoi:21.03:105.85,Hai Phong:20.84:106.69,Da Nang:16.05:108.22,Can Tho:10.05:105.75,Hue:16.46:107.59",
    "vietnamese"),
  c("Iran", "IR", "MENA", 91, 4000, 41, [0.2, 99.5, 0, 0, 0.1, 0, 0.1, 0.1], 77, 33, [8, 20, 47, 25], 15, 32, 3, 79, 75, 1.7,
    "Persian:60,Azerbaijani:16,Kurdish:10,Luri:6,Other:8",
    "Tehran:35.69:51.39,Mashhad:36.30:59.61,Isfahan:32.65:51.67,Karaj:35.84:50.94,Shiraz:29.59:52.58,Tabriz:38.08:46.29,Ahvaz:31.32:48.67,Kerman:30.28:57.08",
    "persian"),
  c("Turkey", "TR", "ECA", 86, 10000, 44, [0.4, 98, 0, 0, 1.2, 0, 0, 0.4], 77, 33.5, [4, 40, 33, 23], 16, 27, 7, 86, 76, 1.5,
    "Turkish:82,Kurdish:15,Arabic:2,Other:1",
    "Istanbul:41.01:28.98,Ankara:39.93:32.86,Izmir:38.42:27.14,Bursa:40.19:29.06,Antalya:36.90:30.71,Diyarbakır:37.91:40.24,Gaziantep:37.07:37.38,Konya:37.87:32.48,Trabzon:41.00:39.72",
    "turkic"),
  c("Germany", "DE", "ECA", 84, 45000, 31, [52, 6.5, 0.1, 0.3, 40, 0, 0.2, 0.9], 78, 45, [0, 10, 58, 32], 1.3, 27, 19, 93, 81, 1.4,
    "German:90,Turkish:3,Russian:2,Arabic:1,Other:4",
    "Berlin:52.52:13.40,Hamburg:53.55:9.99,Munich:48.14:11.58,Cologne:50.94:6.96,Frankfurt:50.11:8.68,Stuttgart:48.78:9.18,Leipzig:51.34:12.37,Dresden:51.05:13.74,Hanover:52.38:9.73",
    "german"),
  c("Thailand", "TH", "SEO", 71.6, 7000, 35, [1.2, 5.5, 0, 93, 0.3, 0, 0, 0], 54, 40, [3, 40, 40, 17], 30, 22, 5, 88, 79, 1.2,
    "Thai:60,Isan:22,Northern Thai:9,Other:9",
    "Bangkok:13.76:100.50,Chiang Mai:18.79:98.98,Khon Kaen:16.44:102.84,Nakhon Ratchasima:14.97:102.10,Hat Yai:7.01:100.47,Udon Thani:17.41:102.79",
    "thai"),
  c("United Kingdom", "GB", "ECA", 69, 40000, 33, [50, 6.5, 1.7, 0.4, 39, 0.3, 0.4, 1.7], 85, 40.5, [0, 15, 45, 40], 1, 18, 14.5, 96, 81, 1.5,
    "English:92,Polish:1,Urdu:1,Punjabi:1,Other:5",
    "London:51.51:-0.13,Birmingham:52.49:-1.89,Manchester:53.48:-2.24,Glasgow:55.86:-4.25,Leeds:53.80:-1.55,Liverpool:53.41:-2.98,Bristol:51.45:-2.59,Edinburgh:55.95:-3.19,Belfast:54.60:-5.93,Cardiff:51.48:-3.18",
    "anglo"),
  c("France", "FR", "ECA", 66.5, 39000, 31, [52, 8.5, 0, 0.5, 37, 0, 0.6, 1.4], 82, 42, [0, 15, 45, 40], 2.5, 19, 13, 92, 83, 1.6,
    "French:94,Arabic:2,Other:4",
    "Paris:48.86:2.35,Marseille:43.30:5.37,Lyon:45.76:4.84,Toulouse:43.60:1.44,Nice:43.70:7.27,Nantes:47.22:-1.55,Lille:50.63:3.06,Bordeaux:44.84:-0.58,Strasbourg:48.57:7.75,Rennes:48.11:-1.68",
    "french"),
  c("Italy", "IT", "ECA", 59, 32000, 33, [78, 5, 0.2, 0.3, 15.5, 0, 0.1, 0.9], 72, 48, [1, 18, 59, 22], 4, 26, 11, 86, 83.5, 1.2,
    "Italian:95,Other:5",
    "Rome:41.90:12.50,Milan:45.46:9.19,Naples:40.85:14.27,Turin:45.07:7.69,Palermo:38.12:13.36,Bologna:44.49:11.34,Florence:43.77:11.26,Bari:41.12:16.87,Venice:45.44:12.32",
    "italian"),
  c("Tanzania", "TZ", "SSA", 69, 1000, 40, [63, 34, 0, 0, 1.5, 1, 0, 0.5], 38, 17.7, [20, 55, 20, 5], 65, 7, 0.6, 32, 67, 4.6,
    "Swahili:55,Sukuma:15,Chaga:5,Haya:5,Other:20",
    "Dar es Salaam:-6.79:39.21,Mwanza:-2.52:32.90,Arusha:-3.39:36.68,Dodoma:-6.16:35.75,Mbeya:-8.90:33.46,Zanzibar:-6.16:39.20",
    "eastAfrica"),
  c("South Africa", "ZA", "SSA", 64, 7000, 63, [81, 1.7, 1.1, 0.2, 15, 0.6, 0.1, 0.3], 69, 28, [3, 15, 62, 20], 5, 22, 6, 75, 64, 2.3,
    "Zulu:25,Xhosa:15,Afrikaans:12,English:9,Sepedi:9,Tswana:8,Sotho:8,Other:14",
    "Johannesburg:-26.20:28.05,Cape Town:-33.92:18.42,Durban:-29.86:31.02,Pretoria:-25.75:28.19,Gqeberha:-33.96:25.60,Bloemfontein:-29.12:26.21,Polokwane:-23.90:29.45",
    "southernAfrica"),
  c("Kenya", "KE", "SSA", 56, 2200, 39, [84, 10.5, 0.1, 0, 2.5, 1.5, 0, 1.4], 30, 20, [10, 45, 33, 12], 54, 7, 2, 40, 63, 3.2,
    "Swahili:15,Kikuyu:17,Luhya:14,Kalenjin:13,Luo:11,Other:30",
    "Nairobi:-1.29:36.82,Mombasa:-4.04:39.67,Kisumu:-0.09:34.77,Nakuru:-0.30:36.07,Eldoret:0.51:35.27,Garissa:-0.45:39.65",
    "eastAfrica"),
  c("Myanmar", "MM", "SEO", 54, 1500, 31, [7.8, 4, 0.5, 87.7, 0, 0, 0, 0], 32, 30, [10, 45, 35, 10], 47, 17, 0.1, 44, 67, 2.1,
    "Burmese:69,Shan:9,Karen:7,Rakhine:4,Other:11",
    "Yangon:16.84:96.17,Mandalay:21.96:96.08,Naypyidaw:19.76:96.08,Mawlamyine:16.49:97.63,Bago:17.34:96.48,Myitkyina:25.38:97.40",
    "burmese"),
  c("South Korea", "KR", "EAS", 51.7, 33000, 33, [29, 0.2, 0, 16, 54, 0.5, 0, 0.3], 81, 45, [1, 8, 41, 50], 5, 25, 3.4, 97, 83.5, 0.75,
    "Korean:99,Other:1",
    "Seoul:37.57:126.98,Busan:35.18:129.08,Incheon:37.46:126.71,Daegu:35.87:128.60,Daejeon:36.35:127.38,Gwangju:35.16:126.85",
    "korean"),
  c("Colombia", "CO", "LAC", 53, 5500, 54, [92, 0, 0, 0, 7, 0, 0, 1], 82, 31.5, [5, 30, 42, 23], 15, 20, 5.5, 73, 77, 1.6,
    "Spanish:99,Other:1",
    "Bogotá:4.71:-74.07,Medellín:6.24:-75.58,Cali:3.45:-76.53,Barranquilla:10.97:-74.80,Cartagena:10.39:-75.48,Bucaramanga:7.12:-73.12",
    "hispanic"),
  c("Sudan", "SD", "MENA", 50, 900, 34, [5, 91, 0, 0, 0, 3, 0, 1], 36, 19, [35, 30, 25, 10], 40, 15, 3, 29, 65, 4.3,
    "Arabic:70,Beja:6,Fur:5,Nuba:5,Other:14",
    "Khartoum:15.50:32.56,Omdurman:15.64:32.48,Port Sudan:19.62:37.22,Nyala:12.05:24.88,Kassala:15.45:36.40,El Obeid:13.18:30.22",
    "arabic"),
  c("Spain", "ES", "ECA", 48.5, 30000, 33, [72, 4, 0.1, 0.1, 23, 0, 0, 0.8], 81, 45, [1, 30, 28, 41], 4, 20, 15, 95, 83.5, 1.2,
    "Spanish:75,Catalan:15,Galician:5,Basque:2,Other:3",
    "Madrid:40.42:-3.70,Barcelona:41.39:2.17,Valencia:39.47:-0.38,Seville:37.39:-5.98,Zaragoza:41.65:-0.89,Málaga:36.72:-4.42,Bilbao:43.26:-2.93",
    "hispanic"),
  c("Argentina", "AR", "LAC", 46, 7500, 42, [82, 1, 0, 0, 15, 0, 0.5, 1.5], 92, 32, [2, 30, 45, 23], 8, 20, 5, 89, 77, 1.4,
    "Spanish:98,Other:2",
    "Buenos Aires:-34.60:-58.38,Córdoba:-31.42:-64.18,Rosario:-32.95:-60.65,Mendoza:-32.89:-68.83,Tucumán:-26.81:-65.22,Mar del Plata:-38.00:-57.56,Salta:-24.78:-65.41,Neuquén:-38.95:-68.06",
    "hispanic"),
  c("Algeria", "DZ", "MENA", 47, 3800, 28, [0.2, 99, 0, 0, 0.8, 0, 0, 0], 75, 28.5, [20, 25, 40, 15], 10, 30, 0.6, 72, 77, 2.7,
    "Arabic:75,Berber:25",
    "Algiers:36.75:3.06,Oran:35.70:-0.63,Constantine:36.36:6.61,Annaba:36.90:7.77,Blida:36.47:2.83,Sétif:36.19:5.41,Batna:35.56:6.17",
    "arabic"),
  c("Iraq", "IQ", "MENA", 46, 4500, 30, [0.8, 99, 0, 0, 0.1, 0, 0, 0.1], 71, 21, [20, 35, 30, 15], 18, 22, 1, 78, 71, 3.3,
    "Arabic:78,Kurdish:18,Other:4",
    "Baghdad:33.31:44.36,Basra:30.51:47.78,Mosul:36.34:43.13,Erbil:36.19:44.01,Najaf:32.03:44.35,Kirkuk:35.47:44.39,Karbala:32.62:44.02",
    "arabic"),
  c("Uganda", "UG", "SSA", 50, 900, 43, [85, 12, 0, 0, 0.5, 1, 0, 1.5], 26, 16.5, [15, 55, 23, 7], 65, 8, 3.5, 27, 63, 4.4,
    "Luganda:17,Runyankole:10,Lusoga:8,Other:65",
    "Kampala:0.35:32.58,Gulu:2.78:32.30,Mbarara:-0.61:30.65,Jinja:0.42:33.20,Mbale:1.08:34.18",
    "eastAfrica"),
  c("Ukraine", "UA", "ECA", 37, 4200, 26, [84, 1, 0, 0, 14, 0, 0.2, 0.8], 70, 41.5, [0, 5, 50, 45], 14, 24, 5, 82, 70, 1.0,
    "Ukrainian:68,Russian:30,Other:2",
    "Kyiv:50.45:30.52,Kharkiv:49.99:36.23,Odesa:46.48:30.72,Dnipro:48.46:35.05,Lviv:49.84:24.03,Zaporizhzhia:47.84:35.14,Vinnytsia:49.23:28.47",
    "slavicEast"),
  c("Canada", "CA", "NAM", 41, 45000, 32, [56, 4.9, 1.5, 1.2, 34, 0.2, 1, 1.2], 82, 41, [1, 8, 30, 61], 1.5, 19, 22, 94, 82, 1.3,
    "English:56,French:20,Punjabi:2,Chinese:3,Other:19",
    "Toronto:43.65:-79.38,Montreal:45.50:-73.57,Vancouver:49.28:-123.12,Calgary:51.05:-114.07,Edmonton:53.55:-113.49,Ottawa:45.42:-75.70,Winnipeg:49.90:-97.14,Quebec City:46.81:-71.21,Halifax:44.65:-63.58",
    "anglo"),
  c("Morocco", "MA", "MENA", 38, 3500, 39, [0.1, 99.5, 0, 0, 0.3, 0, 0.1, 0], 65, 29.5, [30, 25, 30, 15], 30, 22, 0.3, 90, 75, 2.2,
    "Arabic:65,Berber:34,Other:1",
    "Casablanca:33.57:-7.59,Rabat:34.02:-6.84,Fez:34.03:-5.00,Marrakesh:31.63:-8.01,Tangier:35.76:-5.83,Agadir:30.43:-9.60,Oujda:34.68:-1.91",
    "arabic"),
  c("Saudi Arabia", "SA", "MENA", 34, 22000, 46, [4.4, 93, 1.1, 0.3, 0.7, 0, 0, 0.5], 85, 30, [5, 15, 45, 35], 3, 25, 39, 99, 78, 2.3,
    "Arabic:80,Urdu:4,Hindi:3,Tagalog:2,Bengali:2,Other:9",
    "Riyadh:24.71:46.68,Jeddah:21.49:39.19,Mecca:21.39:39.86,Medina:24.47:39.61,Dammam:26.43:50.10,Abha:18.22:42.50",
    "arabic"),
  c("Uzbekistan", "UZ", "ECA", 36.5, 3000, 31, [2.3, 96.5, 0, 0, 1.2, 0, 0, 0], 50, 28, [0, 5, 77, 18], 26, 25, 3, 77, 72, 3.3,
    "Uzbek:85,Russian:5,Tajik:5,Kazakh:3,Other:2",
    "Tashkent:41.30:69.24,Samarkand:39.65:66.96,Namangan:41.00:71.67,Andijan:40.78:72.34,Bukhara:39.77:64.42,Nukus:42.46:59.60",
    "turkic"),
  c("Peru", "PE", "LAC", 34, 5500, 40, [94, 0, 0, 0.2, 5, 0, 0, 0.8], 79, 30.5, [5, 25, 45, 25], 27, 16, 3.5, 75, 77, 1.9,
    "Spanish:83,Quechua:13,Aymara:2,Other:2",
    "Lima:-12.05:-77.04,Arequipa:-16.41:-71.54,Trujillo:-8.11:-79.03,Chiclayo:-6.77:-79.84,Cusco:-13.53:-71.97,Iquitos:-3.75:-73.25,Piura:-5.19:-80.63",
    "hispanic"),
  c("Angola", "AO", "SSA", 37, 1500, 51, [90, 0.2, 0, 0, 5, 4.5, 0, 0.3], 68, 16, [30, 40, 25, 5], 50, 8, 2, 39, 62, 5.0,
    "Portuguese:70,Umbundu:20,Kimbundu:6,Other:4",
    "Luanda:-8.84:13.23,Huambo:-12.78:15.74,Lobito:-12.36:13.54,Benguela:-12.58:13.41,Lubango:-14.92:13.49,Malanje:-9.54:16.34",
    "lusophone"),
  c("Malaysia", "MY", "SEO", 35, 12000, 41, [9, 64, 6, 18, 1, 2, 0, 0], 79, 31, [3, 15, 57, 25], 10, 27, 10, 97, 76, 1.6,
    "Malay:50,Chinese:22,Tamil:7,Other:21",
    "Kuala Lumpur:3.14:101.69,George Town:5.41:100.33,Johor Bahru:1.49:103.74,Kota Kinabalu:5.98:116.07,Kuching:1.55:110.34,Ipoh:4.60:101.08",
    "malayIndo"),
  c("Ghana", "GH", "SSA", 34.4, 2200, 43, [71, 20, 0, 0, 1.1, 5, 0, 2.9], 59, 21.5, [20, 25, 45, 10], 38, 15, 1.5, 69, 64, 3.5,
    "Akan:47,Ewe:13,Ga-Adangme:7,Dagbani:7,Other:26",
    "Accra:5.60:-0.19,Kumasi:6.69:-1.62,Tamale:9.40:-0.84,Takoradi:4.90:-1.76,Cape Coast:5.11:-1.25",
    "westAfrica"),
  c("Mozambique", "MZ", "SSA", 35, 600, 54, [59, 19, 0.1, 0, 13, 7, 0, 1.9], 39, 17, [35, 45, 15, 5], 70, 8, 1, 21, 60, 4.5,
    "Makhuwa:26,Portuguese:17,Tsonga:8,Sena:7,Other:42",
    "Maputo:-25.97:32.57,Matola:-25.96:32.46,Beira:-19.84:34.84,Nampula:-15.12:39.27,Quelimane:-17.88:36.89,Tete:-16.16:33.59,Pemba:-12.97:40.52",
    "lusophone"),
  c("Yemen", "YE", "MENA", 40, 800, 37, [0.1, 99.6, 0, 0, 0.2, 0, 0, 0.1], 39, 19, [40, 25, 25, 10], 29, 11, 1.2, 17, 64, 3.7,
    "Arabic:99,Other:1",
    "Sana'a:15.37:44.19,Aden:12.79:45.03,Taiz:13.58:44.02,Hodeidah:14.80:42.95,Mukalla:14.54:49.12,Ibb:13.97:44.18",
    "arabic"),
  c("Afghanistan", "AF", "SAS", 42, 600, 30, [0.1, 99.7, 0, 0, 0.1, 0, 0, 0.1], 27, 17, [55, 20, 18, 7], 45, 18, 0.4, 18, 64, 4.6,
    "Pashto:45,Dari:40,Uzbek:8,Other:7",
    "Kabul:34.56:69.21,Kandahar:31.61:65.71,Herat:34.35:62.20,Mazar-i-Sharif:36.71:67.11,Jalalabad:34.43:70.45,Kunduz:36.73:68.86",
    "persian"),
  c("Nepal", "NP", "SAS", 30, 1400, 33, [1.8, 4.4, 80.6, 9, 0.3, 3.8, 0, 0.1], 22, 25.3, [30, 30, 30, 10], 62, 14, 1.6, 51, 70.5, 2.0,
    "Nepali:45,Maithili:12,Bhojpuri:6,Tharu:6,Other:31",
    "Kathmandu:27.72:85.32,Pokhara:28.21:83.99,Biratnagar:26.45:87.27,Birgunj:27.01:84.88,Nepalgunj:28.05:81.62",
    "hindi"),
  c("Venezuela", "VE", "LAC", 28.4, 3000, 45, [89, 0.3, 0, 0, 10, 0, 0, 0.7], 88, 30, [5, 30, 45, 20], 9, 20, 5, 72, 72, 2.2,
    "Spanish:98,Other:2",
    "Caracas:10.48:-66.90,Maracaibo:10.65:-71.64,Valencia:10.16:-68.00,Barquisimeto:10.07:-69.32,Maracay:10.25:-67.60,Ciudad Guayana:8.35:-62.64",
    "hispanic"),
  c("Australia", "AU", "SEO", 27, 52000, 34, [47, 3.2, 2.7, 2.4, 43, 0.5, 0.4, 0.8], 86, 38.5, [1, 10, 39, 50], 2.5, 19, 30, 96, 83.5, 1.5,
    "English:72,Mandarin:3,Arabic:1.5,Vietnamese:1.5,Other:22",
    "Sydney:-33.87:151.21,Melbourne:-37.81:144.96,Brisbane:-27.47:153.03,Perth:-31.95:115.86,Adelaide:-34.93:138.60,Canberra:-35.28:149.13,Darwin:-12.46:130.84,Hobart:-42.88:147.33",
    "anglo"),
  c("North Korea", "KP", "EAS", 26, 1200, 35, [2, 0, 0, 1.5, 71, 12, 0, 13.5], 63, 35.6, [0, 10, 75, 15], 37, 30, 0.2, 0.1, 73, 1.8,
    "Korean:100",
    "Pyongyang:39.04:125.76,Hamhung:39.92:127.54,Chongjin:41.80:129.78,Nampo:38.74:125.41,Sinuiju:40.10:124.40",
    "korean"),
  c("Taiwan", "TW", "EAS", 23.4, 25000, 34, [5.5, 0.1, 0, 21, 13, 44, 0, 16.4], 80, 44.5, [1, 8, 46, 45], 5, 36, 3, 92, 81, 0.9,
    "Mandarin:66,Taiwanese Hokkien:31,Hakka:2,Other:1",
    "Taipei:25.03:121.57,Kaohsiung:22.63:120.30,Taichung:24.15:120.67,Tainan:22.99:120.21",
    "chinese"),
  c("Syria", "SY", "MENA", 24, 900, 37, [4, 93, 0, 0, 1, 0, 0, 2], 57, 22.5, [15, 35, 35, 15], 20, 20, 4, 36, 72, 2.7,
    "Arabic:88,Kurdish:9,Other:3",
    "Damascus:33.51:36.29,Aleppo:36.20:37.13,Homs:34.73:36.71,Latakia:35.52:35.79,Hama:35.13:36.75,Deir ez-Zor:35.34:40.14",
    "arabic"),
  c("Côte d'Ivoire", "CI", "SSA", 31.9, 2300, 37, [44, 42, 0, 0, 8, 4, 0, 2], 53, 18.9, [40, 25, 28, 7], 46, 10, 9, 45, 59, 4.3,
    "French:34,Dioula:20,Baoulé:18,Bété:8,Other:20",
    "Abidjan:5.36:-4.01,Bouaké:7.69:-5.03,Yamoussoukro:6.83:-5.29,San-Pédro:4.75:-6.64,Korhogo:9.46:-5.63,Daloa:6.88:-6.45",
    "westAfrica"),
  c("Cameroon", "CM", "SSA", 29, 1500, 47, [70, 24, 0, 0, 2.5, 3, 0, 0.5], 59, 18.5, [20, 40, 32, 8], 43, 14, 2, 46, 63, 4.3,
    "French:50,English:15,Fulfulde:10,Ewondo:5,Other:20",
    "Douala:4.05:9.77,Yaoundé:3.85:11.50,Garoua:9.30:13.40,Bamenda:5.96:10.15,Maroua:10.59:14.32,Bafoussam:5.48:10.42",
    "centralAfrica"),
  c("Niger", "NE", "SSA", 27, 550, 37, [0.3, 98.4, 0, 0, 0.1, 1, 0, 0.2], 17, 15, [65, 20, 12, 3], 72, 8, 1.3, 22, 62, 6.6,
    "Hausa:53,Zarma:21,Tuareg:11,Fulfulde:7,Other:8",
    "Niamey:13.51:2.11,Zinder:13.80:8.99,Maradi:13.50:7.10,Agadez:16.97:7.99,Tahoua:14.89:5.27,Dosso:13.05:3.19",
    "sahel"),
  c("Sri Lanka", "LK", "SAS", 22, 3500, 39, [7.3, 9.8, 13.6, 69.3, 0, 0, 0, 0], 19, 34, [3, 20, 62, 15], 26, 26, 0.2, 56, 77, 2.0,
    "Sinhala:74,Tamil:24,Other:2",
    "Colombo:6.93:79.85,Kandy:7.29:80.63,Galle:6.05:80.22,Jaffna:9.66:80.01,Trincomalee:8.59:81.21,Anuradhapura:8.31:80.40",
    "sinhala"),
  c("Chile", "CL", "LAC", 19.8, 11000, 43, [72, 0.1, 0, 0.1, 27, 0, 0.1, 0.7], 88, 36, [2, 20, 48, 30], 6, 22, 8, 94, 81, 1.2,
    "Spanish:97,Mapudungun:1,Other:2",
    "Santiago:-33.45:-70.67,Valparaíso:-33.05:-71.62,Concepción:-36.83:-73.05,Antofagasta:-23.65:-70.40,Temuco:-38.74:-72.60,Puerto Montt:-41.47:-72.94",
    "hispanic"),
  c("Netherlands", "NL", "ECA", 18, 45000, 28, [36, 5.5, 0.6, 0.2, 56, 0, 0.2, 1.5], 93, 42, [1, 15, 40, 44], 2, 15, 14, 97, 82, 1.5,
    "Dutch:92,Turkish:1,Arabic:1,Other:6",
    "Amsterdam:52.37:4.90,Rotterdam:51.92:4.48,The Hague:52.08:4.30,Utrecht:52.09:5.12,Eindhoven:51.44:5.47,Groningen:53.22:6.57",
    "dutch"),
  c("Poland", "PL", "ECA", 37.5, 18000, 29, [91, 0.1, 0, 0, 8.5, 0, 0, 0.4], 60, 42, [0, 10, 58, 32], 8, 31, 2.5, 88, 78, 1.2,
    "Polish:97,Ukrainian:2,Other:1",
    "Warsaw:52.23:21.01,Kraków:50.06:19.94,Łódź:51.76:19.46,Wrocław:51.11:17.04,Poznań:52.41:16.93,Gdańsk:54.35:18.65,Katowice:50.26:19.02,Lublin:51.25:22.57",
    "slavicWest"),
  c("Romania", "RO", "ECA", 19, 13000, 32, [98, 0.3, 0, 0, 1.5, 0, 0, 0.2], 54, 43, [1, 20, 59, 20], 13, 28, 1, 89, 76, 1.7,
    "Romanian:91,Hungarian:6,Romani:1,Other:2",
    "Bucharest:44.43:26.10,Cluj-Napoca:46.77:23.59,Timișoara:45.75:21.23,Iași:47.16:27.59,Constanța:44.18:28.63,Brașov:45.66:25.61",
    "romanian"),
  c("Kazakhstan", "KZ", "ECA", 20, 7000, 29, [24, 72, 0, 0.2, 3.5, 0, 0, 0.3], 58, 31, [0, 5, 55, 40], 13, 21, 18, 92, 74, 3.0,
    "Kazakh:70,Russian:25,Uzbek:3,Other:2",
    "Almaty:43.24:76.89,Astana:51.17:71.45,Shymkent:42.32:69.60,Karaganda:49.81:73.09,Aktobe:50.28:57.17,Oskemen:49.95:82.61",
    "turkic"),
  c("Guatemala", "GT", "LAC", 18.4, 4500, 48, [95, 0, 0, 0, 4, 0.5, 0, 0.5], 53, 23, [15, 40, 35, 10], 30, 19, 0.5, 56, 72, 2.3,
    "Spanish:69,K'iche':11,Q'eqchi':8,Kaqchikel:5,Mam:5,Other:2",
    "Guatemala City:14.63:-90.51,Quetzaltenango:14.84:-91.52,Escuintla:14.30:-90.79,Cobán:15.47:-90.37",
    "hispanic"),
  c("Ecuador", "EC", "LAC", 18, 5000, 45, [94, 0, 0, 0, 5.5, 0, 0, 0.5], 65, 29, [5, 30, 40, 25], 30, 18, 3, 73, 78, 1.9,
    "Spanish:93,Kichwa:5,Other:2",
    "Guayaquil:-2.17:-79.92,Quito:-0.18:-78.47,Cuenca:-2.90:-79.00,Santo Domingo:-0.25:-79.17,Machala:-3.26:-79.96",
    "hispanic"),
  c("Cambodia", "KH", "SEO", 17.6, 1900, 31, [0.4, 2, 0, 97, 0.2, 0.4, 0, 0], 26, 26.4, [15, 50, 28, 7], 35, 27, 0.5, 60, 70, 2.3,
    "Khmer:95,Other:5",
    "Phnom Penh:11.56:104.92,Siem Reap:13.36:103.86,Battambang:13.10:103.20,Sihanoukville:10.63:103.50",
    "khmer"),
  c("Zambia", "ZM", "SSA", 21, 1100, 57, [97, 0.5, 0.1, 0, 0.5, 0.3, 0, 1.6], 46, 17.5, [10, 45, 37, 8], 58, 10, 1, 31, 62, 4.2,
    "Bemba:33,Nyanja:15,Tonga:12,Lozi:6,Other:34",
    "Lusaka:-15.39:28.32,Kitwe:-12.80:28.21,Ndola:-12.97:28.64,Livingstone:-17.85:25.86,Kabwe:-14.45:28.45",
    "eastAfrica"),
  c("Somalia", "SO", "SSA", 19, 500, 37, [0, 99.8, 0, 0, 0.1, 0, 0, 0.1], 48, 16.5, [60, 25, 12, 3], 60, 8, 0.4, 27, 56, 6.1,
    "Somali:92,Arabic:3,Other:5",
    "Mogadishu:2.05:45.32,Kismayo:-0.36:42.55,Baidoa:3.12:43.65,Bosaso:11.28:49.18,Galkayo:6.77:47.43",
    "horn"),
  c("Senegal", "SN", "SSA", 18.5, 1800, 38, [3.6, 96, 0, 0, 0, 0.3, 0, 0.1], 49, 19, [45, 25, 22, 8], 32, 15, 1.5, 60, 68, 4.3,
    "Wolof:40,Pulaar:25,Serer:15,Mandinka:5,Other:15",
    "Dakar:14.72:-17.47,Touba:14.85:-15.88,Thiès:14.79:-16.93,Saint-Louis:16.03:-16.49,Ziguinchor:12.58:-16.27,Kaolack:14.15:-16.07",
    "sahel"),
  c("Mali", "ML", "SSA", 24, 900, 36, [2.3, 93, 0, 0, 2, 2.5, 0, 0.2], 46, 15.5, [65, 18, 13, 4], 62, 9, 2, 34, 60, 5.8,
    "Bambara:51,Fula:9,Dogon:6,Soninke:6,Other:28",
    "Bamako:12.64:-8.00,Sikasso:11.32:-5.67,Mopti:14.49:-4.19,Kayes:14.45:-11.44,Ségou:13.43:-6.26,Timbuktu:16.77:-3.01,Gao:16.27:-0.04",
    "sahel"),
  c("Burkina Faso", "BF", "SSA", 23.5, 850, 47, [22, 61, 0, 0, 0.4, 15, 0, 1.6], 33, 17.5, [60, 20, 16, 4], 70, 7, 3, 22, 61, 4.6,
    "Mossi:53,Fula:9,Gourmanché:6,Dyula:5,Other:27",
    "Ouagadougou:12.37:-1.52,Bobo-Dioulasso:11.18:-4.30,Koudougou:12.25:-2.36,Ouahigouya:13.58:-2.42,Fada N'gourma:12.06:0.36",
    "sahel"),
  c("Malawi", "MW", "SSA", 21.5, 600, 39, [82, 13, 0, 0, 1, 3, 0, 1], 18, 17, [15, 60, 20, 5], 62, 7, 1, 25, 64, 3.8,
    "Chichewa:57,Chiyao:10,Chitumbuka:9,Other:24",
    "Lilongwe:-13.96:33.79,Blantyre:-15.79:35.01,Mzuzu:-11.46:34.02,Zomba:-15.39:35.32",
    "eastAfrica"),
  c("Madagascar", "MG", "SSA", 31, 550, 43, [85, 3, 0, 0, 7, 4.5, 0, 0.5], 40, 19, [30, 45, 20, 5], 75, 7, 0.1, 20, 65, 3.7,
    "Malagasy:98,French:2",
    "Antananarivo:-18.88:47.51,Toamasina:-18.15:49.40,Antsirabe:-19.87:47.03,Mahajanga:-15.72:46.32,Fianarantsoa:-21.45:47.09,Toliara:-23.35:43.67",
    "malagasy"),
  c("Chad", "TD", "SSA", 20, 700, 38, [41, 55, 0, 0, 2.5, 1.4, 0, 0.1], 24, 16, [65, 20, 12, 3], 70, 8, 5, 13, 55, 6.1,
    "Chadian Arabic:40,Sara:25,Other:35",
    "N'Djamena:12.13:15.06,Moundou:8.57:16.08,Abéché:13.83:20.83,Sarh:9.15:18.39",
    "sahel"),
  c("Cuba", "CU", "LAC", 10.9, 3000, 40, [59, 0, 0, 0, 23, 17, 0, 1], 77, 42, [0, 15, 60, 25], 17, 17, 0, 74, 78, 1.4,
    "Spanish:100",
    "Havana:23.11:-82.37,Santiago de Cuba:20.02:-75.82,Camagüey:21.38:-77.92,Holguín:20.89:-76.26,Santa Clara:22.41:-79.96",
    "hispanic"),
  c("Dominican Rep.", "DO", "LAC", 11.4, 6500, 38, [88, 0, 0, 0, 11, 0, 0, 1], 84, 28, [8, 35, 37, 20], 9, 20, 5, 85, 74, 2.2,
    "Spanish:98,Haitian Creole:2",
    "Santo Domingo:18.49:-69.93,Santiago:19.45:-70.69,La Romana:18.43:-68.97,San Pedro de Macorís:18.46:-69.31",
    "hispanic"),
  c("Haiti", "HT", "LAC", 11.9, 1100, 41, [87, 0, 0, 0, 10.5, 2, 0, 0.5], 60, 24, [35, 35, 25, 5], 45, 10, 0.2, 39, 64, 2.7,
    "Haitian Creole:95,French:5",
    "Port-au-Prince:18.54:-72.34,Cap-Haïtien:19.76:-72.20,Gonaïves:19.45:-72.69,Les Cayes:18.19:-73.75",
    "french"),
  c("Belgium", "BE", "ECA", 11.8, 43000, 26, [60, 7, 0, 0.2, 30, 0, 0.3, 2.5], 98, 42, [1, 15, 40, 44], 1, 20, 18, 94, 82, 1.5,
    "Dutch:58,French:40,German:1,Other:1",
    "Brussels:50.85:4.35,Antwerp:51.22:4.40,Ghent:51.05:3.72,Liège:50.63:5.57,Charleroi:50.41:4.44,Bruges:51.21:3.22",
    "dutch"),
  c("Sweden", "SE", "ECA", 10.6, 38000, 29, [57, 8, 0.3, 0.4, 33, 0, 0.1, 1.2], 89, 41, [1, 10, 45, 44], 1.6, 18, 20, 96, 83, 1.5,
    "Swedish:85,Arabic:3,Finnish:2,Other:10",
    "Stockholm:59.33:18.07,Gothenburg:57.71:11.97,Malmö:55.60:13.00,Uppsala:59.86:17.64,Umeå:63.83:20.26,Luleå:65.58:22.15",
    "nordic"),
  c("Greece", "GR", "ECA", 10.3, 18000, 32, [90, 5.3, 0.1, 0.1, 4, 0, 0, 0.5], 81, 46, [3, 20, 45, 32], 11, 15, 12, 85, 81, 1.3,
    "Greek:98,Other:2",
    "Athens:37.98:23.73,Thessaloniki:40.64:22.94,Patras:38.25:21.73,Heraklion:35.34:25.14,Larissa:39.64:22.42",
    "greek"),
  c("Portugal", "PT", "ECA", 10.4, 21000, 33, [88, 0.5, 0.1, 0, 10, 0, 0, 1.4], 67, 46.8, [3, 40, 27, 30], 5, 25, 12, 85, 82, 1.4,
    "Portuguese:98,Other:2",
    "Lisbon:38.72:-9.14,Porto:41.16:-8.63,Braga:41.55:-8.42,Coimbra:40.21:-8.43,Faro:37.02:-7.93",
    "lusophone"),
  c("Hungary", "HU", "ECA", 9.6, 15000, 29, [80, 0.1, 0, 0.1, 19, 0, 0.1, 0.7], 73, 44, [1, 15, 57, 27], 4.5, 31, 6, 90, 76.5, 1.5,
    "Hungarian:99,Other:1",
    "Budapest:47.50:19.04,Debrecen:47.53:21.63,Szeged:46.25:20.15,Miskolc:48.10:20.78,Pécs:46.07:18.23",
    "balkan"),
  c("Czechia", "CZ", "ECA", 10.9, 20000, 25, [23, 0.1, 0, 0, 76, 0, 0, 0.9], 74, 43, [0, 8, 66, 26], 2.5, 37, 5, 90, 79, 1.5,
    "Czech:95,Slovak:2,Other:3",
    "Prague:50.08:14.44,Brno:49.20:16.61,Ostrava:49.82:18.26,Plzeň:49.74:13.37",
    "slavicWest"),
  c("Israel", "IL", "MENA", 10, 40000, 38, [2, 18, 0, 0, 3, 0, 75, 2], 93, 30, [2, 10, 38, 50], 1, 17, 22, 90, 83, 2.9,
    "Hebrew:78,Arabic:20,Russian:2",
    "Tel Aviv:32.09:34.78,Jerusalem:31.77:35.21,Haifa:32.79:34.99,Beersheba:31.25:34.79",
    "hebrew"),
  c("Switzerland", "CH", "ECA", 9, 88000, 33, [64, 5.5, 0.5, 0.5, 28, 0, 0.2, 1.3], 74, 43, [1, 10, 44, 45], 2.5, 20, 30, 96, 84, 1.4,
    "German:62,French:23,Italian:8,Other:7",
    "Zurich:47.38:8.54,Geneva:46.20:6.14,Basel:47.56:7.59,Bern:46.95:7.45,Lausanne:46.52:6.63",
    "german"),
  c("Austria", "AT", "ECA", 9.1, 42000, 30, [70, 8, 0.2, 0.3, 21, 0, 0.1, 0.4], 59, 44, [1, 15, 52, 32], 3.5, 25, 20, 93, 82, 1.4,
    "German:90,Turkish:2,Serbian:2,Other:6",
    "Vienna:48.21:16.37,Graz:47.07:15.44,Linz:48.31:14.29,Salzburg:47.81:13.04,Innsbruck:47.27:11.39",
    "german"),
  c("Norway", "NO", "ECA", 5.6, 55000, 27, [70, 4, 0.5, 0.5, 24, 0, 0, 1], 84, 40, [0, 15, 40, 45], 2, 19, 16, 99, 83.5, 1.4,
    "Norwegian:92,Other:8",
    "Oslo:59.91:10.75,Bergen:60.39:5.32,Trondheim:63.43:10.39,Stavanger:58.97:5.73,Tromsø:69.65:18.96",
    "nordic"),
  c("Finland", "FI", "ECA", 5.6, 38000, 27, [70, 3, 0, 0, 26, 0, 0, 1], 86, 43, [0, 10, 45, 45], 4, 21, 8, 93, 82, 1.3,
    "Finnish:85,Swedish:5,Russian:2,Other:8",
    "Helsinki:60.17:24.94,Tampere:61.50:23.76,Turku:60.45:22.27,Oulu:65.01:25.47,Rovaniemi:66.50:25.73",
    "nordic"),
  c("Denmark", "DK", "ECA", 6, 50000, 28, [74, 5.5, 0.4, 0.2, 19, 0, 0.1, 0.8], 88, 42, [1, 15, 45, 39], 2, 18, 13, 98, 81.5, 1.5,
    "Danish:90,Other:10",
    "Copenhagen:55.68:12.57,Aarhus:56.16:10.20,Odense:55.40:10.39,Aalborg:57.05:9.92",
    "nordic"),
  c("Ireland", "IE", "ECA", 5.3, 45000, 30, [85, 1.5, 0.4, 0.2, 12, 0, 0, 0.9], 64, 39, [1, 10, 35, 54], 4, 19, 20, 95, 82.5, 1.6,
    "English:92,Irish:2,Polish:2,Other:4",
    "Dublin:53.35:-6.26,Cork:51.90:-8.47,Galway:53.27:-9.05,Limerick:52.66:-8.63",
    "anglo"),
  c("New Zealand", "NZ", "SEO", 5.2, 42000, 32, [42, 1.3, 2.7, 1.5, 49, 0.5, 0.2, 2.8], 87, 38, [1, 15, 40, 44], 5.5, 19, 29, 95, 82, 1.6,
    "English:90,Māori:3,Samoan:2,Other:5",
    "Auckland:-36.85:174.76,Wellington:-41.29:174.78,Christchurch:-43.53:172.64,Hamilton:-37.79:175.28,Dunedin:-45.87:170.50",
    "anglo"),
  c("Bolivia", "BO", "LAC", 12.4, 3500, 41, [90, 0, 0, 0, 7, 2, 0, 1], 71, 26, [8, 30, 40, 22], 28, 20, 1.5, 66, 68, 2.6,
    "Spanish:70,Quechua:18,Aymara:10,Other:2",
    "La Paz:-16.50:-68.15,Santa Cruz:-17.78:-63.18,Cochabamba:-17.39:-66.16,Sucre:-19.04:-65.26,Oruro:-17.97:-67.11",
    "hispanic"),
  c("Paraguay", "PY", "LAC", 6.9, 5000, 45, [96, 0, 0, 0, 3, 0, 0, 1], 63, 27, [5, 35, 40, 20], 18, 19, 2.5, 77, 74, 2.4,
    "Guarani:46,Spanish:34,Other:20",
    "Asunción:-25.26:-57.58,Ciudad del Este:-25.51:-54.61,Encarnación:-27.33:-55.87,Concepción:-23.41:-57.43",
    "hispanic"),
  c("Uruguay", "UY", "LAC", 3.4, 12000, 40, [57, 0, 0, 0, 41, 0, 0.3, 1.7], 96, 36, [2, 35, 40, 23], 8, 18, 3, 90, 78, 1.3,
    "Spanish:98,Other:2",
    "Montevideo:-34.90:-56.16,Salto:-31.38:-57.96,Paysandú:-32.32:-58.08",
    "hispanic"),
  c("Honduras", "HN", "LAC", 10.8, 3500, 48, [88, 0, 0, 0, 11, 0, 0, 1], 60, 24, [10, 45, 32, 13], 25, 20, 0.4, 58, 71, 2.3,
    "Spanish:97,Other:3",
    "Tegucigalpa:14.07:-87.19,San Pedro Sula:15.50:-88.03,La Ceiba:15.76:-86.78,Choluteca:13.30:-87.19",
    "hispanic"),
  c("Nicaragua", "NI", "LAC", 7, 2800, 46, [86, 0, 0, 0, 13, 0, 0, 1], 59, 27, [12, 40, 35, 13], 30, 17, 0.6, 57, 74, 2.3,
    "Spanish:96,Other:4",
    "Managua:12.11:-86.24,León:12.43:-86.88,Granada:11.93:-85.96,Matagalpa:12.93:-85.92",
    "hispanic"),
  c("El Salvador", "SV", "LAC", 6.3, 5000, 39, [88, 0, 0, 0, 11, 0, 0, 1], 75, 28, [10, 40, 35, 15], 16, 21, 0.6, 63, 72, 1.8,
    "Spanish:99,Other:1",
    "San Salvador:13.69:-89.22,Santa Ana:13.99:-89.56,San Miguel:13.48:-88.18",
    "hispanic"),
  c("Costa Rica", "CR", "LAC", 5.2, 12000, 47, [91, 0, 0, 0, 8, 0, 0, 1], 82, 34, [2, 35, 35, 28], 11, 18, 10, 85, 80, 1.3,
    "Spanish:98,Other:2",
    "San José:9.93:-84.08,Limón:9.99:-83.03,Liberia:10.63:-85.44",
    "hispanic"),
  c("Panama", "PA", "LAC", 4.5, 13000, 49, [93, 0.7, 0.3, 0.2, 5, 0, 0.1, 0.7], 69, 30, [3, 30, 40, 27], 14, 18, 7, 73, 77, 2.3,
    "Spanish:90,Other:10",
    "Panama City:8.98:-79.52,Colón:9.36:-79.90,David:8.43:-82.43",
    "hispanic"),
  c("Jamaica", "JM", "LAC", 2.8, 6000, 40, [77, 0, 0, 0, 21, 0, 0, 2], 57, 31, [2, 20, 60, 18], 15, 15, 0.8, 82, 72, 1.4,
    "English:100",
    "Kingston:18.02:-76.80,Montego Bay:18.47:-77.92,Spanish Town:17.99:-76.96",
    "anglo"),
  c("Puerto Rico", "PR", "LAC", 3.2, 22000, 54, [90, 0, 0, 0, 9, 0, 0, 1], 94, 45, [2, 15, 45, 38], 1, 15, 3, 85, 80, 0.9,
    "Spanish:94,English:6",
    "San Juan:18.47:-66.11,Ponce:18.01:-66.61,Mayagüez:18.20:-67.14",
    "hispanic"),
  c("Trinidad and Tobago", "TT", "LAC", 1.5, 14000, 40, [65, 6, 18, 0, 2, 0, 0, 9], 53, 37, [1, 25, 54, 20], 3, 30, 4, 79, 74, 1.6,
    "English:100",
    "Port of Spain:10.66:-61.51,San Fernando:10.28:-61.46,Chaguanas:10.52:-61.41",
    "anglo"),
  c("Guyana", "GY", "LAC", 0.8, 8000, 45, [64, 7, 25, 0, 2, 0, 0, 2], 27, 27, [3, 35, 50, 12], 15, 25, 2, 80, 70, 2.4,
    "English:90,Other:10",
    "Georgetown:6.80:-58.16,Linden:6.00:-58.31",
    "anglo"),
  c("Suriname", "SR", "LAC", 0.6, 5500, 40, [51, 15, 20, 0.6, 5, 8, 0.2, 0.2], 66, 30, [5, 35, 45, 15], 8, 25, 8, 73, 72, 2.3,
    "Dutch:60,Sranan Tongo:30,Other:10",
    "Paramaribo:5.85:-55.20,Lelydorp:5.70:-55.23",
    "dutch"),
  c("Tunisia", "TN", "MENA", 12.3, 3800, 33, [0.2, 99.5, 0, 0, 0.2, 0, 0, 0.1], 70, 33, [18, 30, 35, 17], 14, 32, 0.5, 79, 77, 1.8,
    "Arabic:98,Other:2",
    "Tunis:36.81:10.18,Sfax:34.74:10.76,Sousse:35.83:10.64,Kairouan:35.68:10.10,Gabès:33.88:10.10",
    "arabic"),
  c("Libya", "LY", "MENA", 7.4, 7000, 35, [2.7, 96.6, 0, 0, 0.2, 0, 0, 0.5], 81, 29, [10, 30, 40, 20], 15, 25, 12, 88, 72, 2.4,
    "Arabic:90,Berber:10",
    "Tripoli:32.89:13.19,Benghazi:32.12:20.07,Misrata:32.38:15.09,Sabha:27.04:14.43",
    "arabic"),
  c("Jordan", "JO", "MENA", 11.5, 5500, 34, [2.2, 97.2, 0, 0, 0.1, 0, 0, 0.5], 92, 24, [5, 20, 45, 30], 3, 25, 33, 90, 78, 2.7,
    "Arabic:98,Other:2",
    "Amman:31.95:35.93,Zarqa:32.07:36.09,Irbid:32.56:35.85,Aqaba:29.53:35.01",
    "arabic"),
  c("United Arab Emirates", "AE", "MENA", 10, 45000, 30, [12.6, 76, 6.6, 2, 1, 0, 0, 1.8], 87, 33, [5, 15, 40, 40], 2, 30, 88, 99, 79, 1.4,
    "Arabic:20,Hindi:15,Urdu:12,Malayalam:10,Bengali:8,Tagalog:8,English:7,Other:20",
    "Dubai:25.20:55.27,Abu Dhabi:24.45:54.38,Sharjah:25.35:55.42,Al Ain:24.21:55.74",
    "arabic"),
  c("Lebanon", "LB", "MENA", 5.5, 4000, 32, [32, 67, 0, 0, 0.5, 0, 0, 0.5], 89, 31, [5, 25, 40, 30], 5, 20, 25, 87, 77, 2.0,
    "Arabic:95,Armenian:2,Other:3",
    "Beirut:33.89:35.50,Tripoli:34.43:35.84,Sidon:33.56:35.37,Zahlé:33.85:35.90",
    "arabic"),
  c("Kuwait", "KW", "MENA", 4.9, 30000, 34, [14, 74, 8, 3, 0.5, 0, 0, 0.5], 100, 36, [5, 20, 45, 30], 2, 25, 72, 99, 80, 2.1,
    "Arabic:60,Hindi:10,Urdu:8,Other:22",
    "Kuwait City:29.38:47.99,Al Jahra:29.34:47.66",
    "arabic"),
  c("Oman", "OM", "MENA", 5.3, 18000, 35, [6.5, 86, 5.5, 0.8, 0.5, 0, 0, 0.7], 88, 30, [8, 20, 45, 27], 4, 30, 45, 96, 78, 2.6,
    "Arabic:60,Hindi:10,Urdu:10,Other:20",
    "Muscat:23.59:58.41,Salalah:17.02:54.09,Sohar:24.35:56.71,Nizwa:22.93:57.53",
    "arabic"),
  c("Qatar", "QA", "MENA", 3, 50000, 35, [14, 68, 14, 3, 0.5, 0, 0, 0.5], 99, 33, [5, 15, 45, 35], 1, 50, 77, 99, 80, 1.8,
    "Arabic:30,Hindi:20,Urdu:15,Other:35",
    "Doha:25.29:51.53,Al Rayyan:25.29:51.42",
    "arabic"),
  c("Palestine", "PS", "MENA", 5.5, 3500, 34, [2.4, 97.5, 0, 0, 0.1, 0, 0, 0], 77, 21, [5, 25, 45, 25], 6, 30, 5, 88, 74, 3.4,
    "Arabic:98,Other:2",
    "Gaza:31.50:34.47,Hebron:31.53:35.10,Nablus:32.22:35.26,Ramallah:31.90:35.20",
    "arabic"),
  c("Cyprus", "CY", "ECA", 1.3, 26000, 31, [73, 25, 0, 0.2, 1.5, 0, 0, 0.3], 67, 38, [2, 15, 40, 43], 3, 17, 20, 91, 81, 1.4,
    "Greek:80,Turkish:18,Other:2",
    "Nicosia:35.17:33.36,Limassol:34.68:33.04,Larnaca:34.92:33.62",
    "greek"),
  c("Rwanda", "RW", "SSA", 14.1, 900, 44, [93, 2, 0, 0, 2.5, 0.5, 0, 2], 18, 20, [15, 55, 23, 7], 55, 10, 4, 34, 67, 3.8,
    "Kinyarwanda:99,Other:1",
    "Kigali:-1.95:30.06,Butare:-2.60:29.74,Gisenyi:-1.70:29.26,Musanze:-1.50:29.63",
    "eastAfrica"),
  c("Burundi", "BI", "SSA", 14, 300, 39, [91, 2.8, 0, 0, 5, 1, 0, 0.2], 15, 17, [30, 50, 16, 4], 85, 5, 2, 11, 62, 4.9,
    "Kirundi:98,Other:2",
    "Gitega:-3.43:29.92,Bujumbura:-3.38:29.36,Ngozi:-2.91:29.83",
    "eastAfrica"),
  c("S. Sudan", "SS", "SSA", 11.9, 400, 44, [61, 6, 0, 0, 0.5, 32, 0, 0.5], 21, 18, [55, 30, 12, 3], 60, 5, 7, 7, 56, 4.4,
    "Dinka:35,Nuer:15,Arabic:15,Other:35",
    "Juba:4.86:31.57,Wau:7.70:28.00,Malakal:9.53:31.66,Yei:4.09:30.68",
    "eastAfrica"),
  c("Zimbabwe", "ZW", "SSA", 16.9, 1300, 50, [87, 0.9, 0, 0, 7.9, 3.8, 0, 0.4], 32, 18.5, [5, 35, 52, 8], 60, 8, 1.4, 38, 62, 3.5,
    "Shona:70,Ndebele:20,Other:10",
    "Harare:-17.83:31.05,Bulawayo:-20.15:28.58,Chitungwiza:-18.01:31.08,Mutare:-18.97:32.67,Gweru:-19.45:29.82",
    "southernAfrica"),
  c("Guinea", "GN", "SSA", 14.5, 1000, 34, [10.9, 85, 0, 0, 1.8, 2.3, 0, 0], 38, 18, [60, 20, 15, 5], 60, 8, 1, 34, 60, 4.3,
    "Fula:38,Maninka:25,Susu:20,Other:17",
    "Conakry:9.64:-13.58,Nzérékoré:7.76:-8.82,Kankan:10.39:-9.31,Kindia:10.06:-12.86",
    "sahel"),
  c("Benin", "BJ", "SSA", 14.5, 1300, 38, [53, 24, 0, 0, 5, 18, 0, 0], 49, 18, [50, 25, 20, 5], 38, 18, 2.5, 34, 60, 4.9,
    "Fon:39,Adja:15,Yoruba:12,Other:34",
    "Cotonou:6.37:2.39,Porto-Novo:6.50:2.60,Parakou:9.34:2.62,Djougou:9.71:1.67",
    "westAfrica"),
  c("Togo", "TG", "SSA", 9.5, 1000, 42, [44, 14, 0, 0, 6, 36, 0, 0], 44, 19, [35, 35, 25, 5], 33, 18, 3, 37, 62, 4.2,
    "Ewe:22,Kabiyé:14,Other:64",
    "Lomé:6.13:1.22,Sokodé:8.98:1.13,Kara:9.55:1.19,Atakpamé:7.53:1.13",
    "westAfrica"),
  c("Sierra Leone", "SL", "SSA", 8.6, 700, 36, [21, 78, 0, 0, 0, 1, 0, 0], 44, 19, [55, 20, 20, 5], 45, 8, 1, 30, 61, 3.8,
    "Temne:35,Mende:31,Krio:10,Other:24",
    "Freetown:8.48:-13.23,Bo:7.96:-11.74,Kenema:7.88:-11.19,Makeni:8.88:-12.04",
    "westAfrica"),
  c("Liberia", "LR", "SSA", 5.6, 700, 35, [86, 12, 0, 0, 1, 1, 0, 0], 53, 19, [35, 35, 25, 5], 42, 8, 1.5, 33, 64, 4.0,
    "Kpelle:20,English:20,Bassa:13,Other:47",
    "Monrovia:6.29:-10.76,Gbarnga:7.00:-9.47,Buchanan:5.88:-10.05",
    "westAfrica"),
  c("Mauritania", "MR", "SSA", 5, 2000, 33, [0.2, 99.6, 0, 0, 0.1, 0, 0, 0.1], 57, 20, [50, 25, 20, 5], 30, 15, 4, 59, 65, 4.3,
    "Arabic:80,Pulaar:10,Other:10",
    "Nouakchott:18.08:-15.98,Nouadhibou:20.94:-17.03,Kiffa:16.62:-11.40",
    "arabic"),
  c("Eritrea", "ER", "SSA", 3.7, 600, 38, [62.9, 36.6, 0, 0, 0.1, 0.4, 0, 0], 42, 20, [45, 30, 20, 5], 60, 10, 0.4, 20, 67, 3.7,
    "Tigrinya:55,Tigre:30,Other:15",
    "Asmara:15.32:38.93,Keren:15.78:38.45,Massawa:15.61:39.45",
    "horn"),
  c("Djibouti", "DJ", "SSA", 1.1, 3000, 42, [2, 97, 0, 0, 0.5, 0, 0, 0.5], 78, 25, [40, 25, 28, 7], 25, 15, 11, 65, 63, 2.7,
    "Somali:60,Afar:35,Other:5",
    "Djibouti:11.59:43.15,Ali Sabieh:11.16:42.71",
    "horn"),
  c("Congo", "CG", "SSA", 6.3, 1500, 49, [86, 1.2, 0, 0, 9, 2.8, 0, 1], 69, 19, [10, 35, 45, 10], 35, 20, 7, 36, 65, 4.1,
    "Kituba:40,Lingala:35,French:15,Other:10",
    "Brazzaville:-4.26:15.24,Pointe-Noire:-4.77:11.86,Dolisie:-4.20:12.67",
    "centralAfrica"),
  c("Central African Rep.", "CF", "SSA", 5.5, 500, 56, [89, 9, 0, 0, 1, 1, 0, 0], 43, 15, [55, 30, 12, 3], 70, 5, 1.5, 11, 54, 5.9,
    "Sango:90,French:5,Other:5",
    "Bangui:4.39:18.56,Bimbo:4.26:18.42,Berbérati:4.26:15.79,Bambari:5.76:20.67",
    "centralAfrica"),
  c("Gabon", "GA", "SSA", 2.5, 7000, 38, [76, 11, 0, 0, 6, 5, 0, 2], 91, 21, [10, 30, 45, 15], 30, 20, 18, 72, 67, 3.4,
    "French:40,Fang:32,Other:28",
    "Libreville:0.42:9.47,Port-Gentil:-0.72:8.78,Franceville:-1.63:13.58",
    "centralAfrica"),
  c("Eq. Guinea", "GQ", "SSA", 1.9, 6000, 50, [89, 4, 0, 0, 5, 2, 0, 0], 74, 21, [15, 35, 40, 10], 40, 20, 15, 54, 61, 4.2,
    "Fang:80,Spanish:10,Other:10",
    "Malabo:3.75:8.78,Bata:1.86:9.77",
    "centralAfrica"),
  c("Namibia", "NA", "SSA", 3, 4500, 59, [97, 0.3, 0, 0, 2, 0.6, 0, 0.1], 55, 22, [8, 30, 50, 12], 22, 15, 4, 62, 64, 3.2,
    "Oshiwambo:49,Nama:11,Afrikaans:10,Other:30",
    "Windhoek:-22.56:17.08,Walvis Bay:-22.96:14.51,Oshakati:-17.79:15.70,Rundu:-17.92:19.77",
    "southernAfrica"),
  c("Botswana", "BW", "SSA", 2.6, 6000, 53, [72, 0.4, 0.3, 0, 20.6, 6, 0, 0.7], 72, 24, [8, 25, 52, 15], 20, 15, 4, 77, 66, 2.7,
    "Setswana:77,Kalanga:8,Other:15",
    "Gaborone:-24.65:25.91,Francistown:-21.17:27.51,Maun:-19.98:23.42",
    "southernAfrica"),
  c("Lesotho", "LS", "SSA", 2.3, 1300, 45, [97, 0, 0, 0, 2.6, 0, 0, 0.4], 30, 24, [5, 50, 38, 7], 40, 20, 0.3, 48, 57, 3.0,
    "Sesotho:98,Other:2",
    "Maseru:-29.31:27.48,Teyateyaneng:-29.15:27.75",
    "southernAfrica"),
  c("eSwatini", "SZ", "SSA", 1.2, 3000, 55, [88, 0, 0, 0, 11, 0, 0, 1], 25, 22, [8, 35, 45, 12], 25, 20, 2.5, 59, 57, 2.8,
    "siSwati:95,English:5",
    "Mbabane:-26.31:31.14,Manzini:-26.49:31.38",
    "southernAfrica"),
  c("Papua New Guinea", "PG", "SEO", 10.5, 2000, 42, [99, 0, 0, 0, 0.5, 0.5, 0, 0], 14, 22, [30, 40, 25, 5], 60, 7, 0.3, 32, 66, 3.2,
    "Tok Pisin:40,English:5,Other:55",
    "Port Moresby:-9.44:147.18,Lae:-6.73:147.00,Mount Hagen:-5.86:144.23,Madang:-5.22:145.79",
    "melanesian"),
  c("Fiji", "FJ", "SEO", 0.9, 6000, 31, [64, 6.3, 28, 0, 0.3, 0, 0, 1.4], 58, 29, [2, 30, 50, 18], 30, 15, 1.5, 85, 68, 2.4,
    "Fijian:55,Fiji Hindi:38,Other:7",
    "Suva:-18.14:178.44,Lautoka:-17.62:177.45",
    "melanesian"),
  c("Timor-Leste", "TL", "SEO", 1.4, 1500, 29, [99.5, 0.3, 0, 0, 0.1, 0.1, 0, 0], 32, 20, [30, 30, 32, 8], 45, 10, 0.6, 39, 69, 3.9,
    "Tetum:40,Other:60",
    "Dili:-8.56:125.57,Baucau:-8.47:126.45",
    "lusophone"),
  c("Laos", "LA", "SEO", 7.8, 2000, 39, [1.5, 0, 0, 66, 0.5, 31, 0, 1], 38, 24, [15, 40, 35, 10], 57, 12, 0.7, 62, 69, 2.4,
    "Lao:60,Khmu:11,Hmong:9,Other:20",
    "Vientiane:17.98:102.63,Luang Prabang:19.89:102.13,Pakse:15.12:105.80,Savannakhet:16.55:104.75",
    "thai"),
  c("Mongolia", "MN", "EAS", 3.5, 4500, 33, [2.3, 3.2, 0, 55, 35, 4.5, 0, 0], 69, 29, [3, 15, 52, 30], 25, 20, 0.6, 83, 72, 2.7,
    "Mongolian:95,Kazakh:4,Other:1",
    "Ulaanbaatar:47.89:106.91,Erdenet:49.03:104.08,Darkhan:49.49:105.92,Choibalsan:48.07:114.53",
    "mongolian"),
  c("Tajikistan", "TJ", "ECA", 10.6, 1300, 34, [1.6, 97, 0, 0, 1.4, 0, 0, 0], 28, 22.5, [2, 15, 70, 13], 45, 15, 2.5, 40, 71, 3.2,
    "Tajik:84,Uzbek:13,Other:3",
    "Dushanbe:38.56:68.79,Khujand:40.28:69.62,Bokhtar:37.84:68.78,Kulob:37.91:69.78",
    "persian"),
  c("Kyrgyzstan", "KG", "ECA", 7.2, 1800, 29, [11, 88, 0, 0, 1, 0, 0, 0], 37, 27, [1, 10, 65, 24], 18, 22, 3, 78, 72, 2.8,
    "Kyrgyz:73,Uzbek:15,Russian:9,Other:3",
    "Bishkek:42.87:74.59,Osh:40.51:72.80,Jalal-Abad:40.93:73.00,Karakol:42.49:78.39",
    "turkic"),
  c("Turkmenistan", "TM", "ECA", 7.5, 4000, 41, [6.4, 93, 0, 0, 0.6, 0, 0, 0], 53, 28, [1, 10, 70, 19], 20, 30, 3, 25, 70, 2.6,
    "Turkmen:85,Uzbek:6,Russian:6,Other:3",
    "Ashgabat:37.96:58.33,Türkmenabat:39.07:63.58,Daşoguz:41.84:59.97,Mary:37.60:61.83",
    "turkic"),
  c("Azerbaijan", "AZ", "ECA", 10.2, 4500, 27, [3, 96.9, 0, 0, 0.1, 0, 0, 0], 57, 32, [1, 10, 65, 24], 36, 14, 2.5, 88, 74, 1.6,
    "Azerbaijani:92,Lezgian:2,Russian:2,Other:4",
    "Baku:40.41:49.87,Ganja:40.68:46.36,Sumqayit:40.59:49.67,Lankaran:38.75:48.85",
    "turkic"),
  c("Georgia", "GE", "ECA", 3.7, 5500, 34, [88.5, 10.7, 0, 0, 0.7, 0, 0, 0.1], 61, 38, [1, 8, 55, 36], 38, 13, 2, 81, 74, 1.8,
    "Georgian:88,Azerbaijani:6,Armenian:4,Other:2",
    "Tbilisi:41.72:44.79,Batumi:41.64:41.63,Kutaisi:42.27:42.70,Rustavi:41.55:45.00",
    "caucasus"),
  c("Armenia", "AM", "ECA", 3, 5000, 28, [98.5, 0, 0, 0, 1.3, 0, 0, 0.2], 63, 36, [0, 5, 60, 35], 22, 17, 6, 79, 75, 1.6,
    "Armenian:98,Other:2",
    "Yerevan:40.18:44.51,Gyumri:40.79:43.85,Vanadzor:40.81:44.49",
    "caucasus"),
  c("Belarus", "BY", "ECA", 9.1, 6500, 24, [71, 0.2, 0, 0, 28.6, 0, 0.1, 0.1], 80, 41, [0, 5, 55, 40], 9, 30, 11, 89, 74, 1.4,
    "Russian:68,Belarusian:30,Other:2",
    "Minsk:53.90:27.56,Gomel:52.44:30.98,Mogilev:53.90:30.33,Vitebsk:55.18:30.20,Grodno:53.68:23.83,Brest:52.10:23.69",
    "slavicEast"),
  c("Moldova", "MD", "ECA", 2.4, 4500, 26, [97.4, 0.6, 0, 0, 1.5, 0, 0.1, 0.4], 43, 38, [1, 10, 65, 24], 22, 18, 4, 79, 69, 1.7,
    "Romanian:80,Russian:10,Other:10",
    "Chișinău:47.01:28.86,Bălți:47.76:27.93,Cahul:45.91:28.19",
    "romanian"),
  c("Bulgaria", "BG", "ECA", 6.4, 11000, 40, [83, 11, 0, 0, 5, 0, 0, 1], 76, 45, [2, 15, 55, 28], 6, 29, 3, 80, 75, 1.6,
    "Bulgarian:85,Turkish:9,Romani:4,Other:2",
    "Sofia:42.70:23.32,Plovdiv:42.14:24.75,Varna:43.21:27.92,Burgas:42.50:27.47,Ruse:43.84:25.95",
    "balkan"),
  c("Serbia", "RS", "ECA", 6.6, 9000, 33, [92, 3, 0, 0, 4, 0, 0, 1], 57, 43, [2, 15, 58, 25], 14, 27, 9, 85, 75, 1.6,
    "Serbian:88,Hungarian:3,Other:9",
    "Belgrade:44.79:20.45,Novi Sad:45.27:19.83,Niš:43.32:21.90,Kragujevac:44.01:20.91",
    "balkan"),
  c("Croatia", "HR", "ECA", 3.8, 15000, 29, [93, 1.5, 0, 0, 5, 0, 0, 0.5], 58, 44, [1, 15, 58, 26], 7, 27, 13, 83, 78, 1.5,
    "Croatian:96,Other:4",
    "Zagreb:45.81:15.98,Split:43.51:16.44,Rijeka:45.33:14.44,Osijek:45.55:18.69",
    "balkan"),
  c("Bosnia and Herz.", "BA", "ECA", 3.2, 7000, 33, [52, 45, 0, 0, 2.5, 0, 0, 0.5], 50, 43, [3, 25, 55, 17], 12, 31, 1, 79, 76, 1.3,
    "Bosnian:53,Serbian:31,Croatian:15,Other:1",
    "Sarajevo:43.86:18.41,Banja Luka:44.77:17.19,Tuzla:44.54:18.67,Mostar:43.34:17.81",
    "balkan"),
  c("Albania", "AL", "ECA", 2.8, 6000, 30, [18, 80, 0, 0, 1.5, 0, 0, 0.5], 64, 38, [2, 30, 48, 20], 34, 19, 1.7, 83, 77, 1.4,
    "Albanian:98,Other:2",
    "Tirana:41.33:19.82,Durrës:41.32:19.45,Vlorë:40.47:19.49,Shkodër:42.07:19.51",
    "balkan"),
  c("Macedonia", "MK", "ECA", 1.8, 7000, 33, [60, 39, 0, 0, 0.5, 0, 0, 0.5], 59, 39, [3, 20, 55, 22], 12, 30, 6, 83, 76, 1.4,
    "Macedonian:66,Albanian:25,Other:9",
    "Skopje:42.00:21.43,Bitola:41.03:21.33,Kumanovo:42.13:21.71",
    "balkan"),
  c("Slovakia", "SK", "ECA", 5.4, 17000, 24, [85, 0.2, 0, 0, 14, 0, 0, 0.8], 54, 42, [0, 8, 65, 27], 3, 36, 3.5, 89, 77, 1.6,
    "Slovak:82,Hungarian:9,Other:9",
    "Bratislava:48.15:17.11,Košice:48.72:21.26,Žilina:49.22:18.74,Nitra:48.31:18.09",
    "slavicWest"),
  c("Slovenia", "SI", "ECA", 2.1, 24000, 24, [78, 3.6, 0, 0, 18, 0, 0, 0.4], 56, 45, [0, 10, 55, 35], 4, 32, 14, 89, 81, 1.6,
    "Slovene:91,Other:9",
    "Ljubljana:46.06:14.51,Maribor:46.56:15.65,Celje:46.24:15.27",
    "balkan"),
  c("Lithuania", "LT", "ECA", 2.9, 17000, 36, [89, 0.1, 0, 0, 10, 0, 0, 0.9], 68, 44, [0, 5, 50, 45], 5, 25, 7, 88, 76, 1.2,
    "Lithuanian:85,Russian:7,Polish:6,Other:2",
    "Vilnius:54.69:25.28,Kaunas:54.90:23.90,Klaipėda:55.70:21.14,Šiauliai:55.93:23.31",
    "baltic"),
  c("Latvia", "LV", "ECA", 1.9, 15000, 34, [66, 0.1, 0, 0, 33, 0, 0, 0.9], 69, 44, [0, 5, 55, 40], 6, 23, 12, 91, 75, 1.4,
    "Latvian:62,Russian:36,Other:2",
    "Riga:56.95:24.11,Daugavpils:55.87:26.54,Liepāja:56.51:21.01",
    "baltic"),
  c("Estonia", "EE", "ECA", 1.4, 19000, 31, [40, 0.2, 0, 0, 59, 0, 0, 0.8], 69, 42, [0, 5, 50, 45], 3, 28, 15, 92, 79, 1.4,
    "Estonian:68,Russian:30,Other:2",
    "Tallinn:59.44:24.75,Tartu:58.38:26.72,Narva:59.38:28.19",
    "baltic"),
  c("Iceland", "IS", "ECA", 0.4, 55000, 26, [75, 0.2, 0, 0.4, 23, 0, 0, 1.4], 94, 37, [0, 20, 40, 40], 4, 18, 20, 99, 83, 1.6,
    "Icelandic:93,Other:7",
    "Reykjavík:64.15:-21.94,Akureyri:65.68:-18.09",
    "nordic"),
]

// ---------------------------------------------------------------------------
// World Bank overlay

type Series = Record<string, [value: number, year: number]>
const WDI = wdi.data as unknown as Record<string, Series>
export const AGE_BAND_CODES = [
  "0004", "0509", "1014", "1519", "2024", "2529", "3034", "3539", "4044", "4549", "5054", "5559", "6064", "6569", "7074", "7579", "80UP",
] as const

/** Latest World Bank value for a country, optionally only if measured in or after `since` */
export function wdiValue(code: string, iso2: string, since = 0): number | undefined {
  const v = WDI[code]?.[iso2]
  return v && v[1] >= since ? v[0] : undefined
}

/** Countries the World Bank doesn't cover, with values from their national statistics offices */
const NATIONAL: Record<string, { borrowAges: string; male: number; female: number; unemployment: number; births: number; deaths: number }> = {
  // Taiwan: DGBAS / Ministry of the Interior 2024; age structure borrowed from South Korea (similar median age)
  TW: { borrowAges: "KR", male: 66.9, female: 51.8, unemployment: 3.4, births: 5.8, deaths: 8.6 },
}

const round = (v: number, digits = 0) => Math.round(v * 10 ** digits) / 10 ** digits

function medianOfBands(male: number[], female: number[], femaleShare: number) {
  const mix = male.map((m, i) => m * (1 - femaleShare / 100) + female[i] * (femaleShare / 100))
  const total = mix.reduce((a, b) => a + b, 0)
  let acc = 0
  for (let i = 0; i < mix.length; i++) {
    if (acc + mix[i] >= total / 2) return round(i * 5 + (5 * (total / 2 - acc)) / mix[i], 1)
    acc += mix[i]
  }
  return 40
}

for (const c of COUNTRIES) {
  const iso = c.iso2
  const nat = NATIONAL[iso]
  const ageIso = nat?.borrowAges ?? iso
  const v = (code: string, since?: number) => wdiValue(code, iso, since)

  c.population = round((v("SP.POP.TOTL") ?? c.population * 1e6) / 1e6, 2)
  c.femaleShare = round(v("SP.POP.TOTL.FE.ZS") ?? 50, 1)
  c.urban = round(v("SP.URB.TOTL.IN.ZS") ?? c.urban)
  c.lifeExpectancy = round(v("SP.DYN.LE00.IN") ?? c.lifeExpectancy, 1)
  c.fertility = round(v("SP.DYN.TFRT.IN") ?? c.fertility, 2)
  c.internet = round(v("IT.NET.USER.ZS", 2018) ?? c.internet)
  const agri = v("SL.AGR.EMPL.ZS")
  const ind = v("SL.IND.EMPL.ZS")
  if (agri !== undefined && ind !== undefined) {
    c.agriculture = round(agri, 1)
    c.industry = round(ind, 1)
  }
  c.migrants = round(v("SM.POP.TOTL.ZS") ?? c.migrants, 1)
  c.participation = {
    male: round(v("SL.TLF.CACT.MA.ZS") ?? nat?.male ?? 72, 1),
    female: round(v("SL.TLF.CACT.FE.ZS") ?? nat?.female ?? 50, 1),
  }
  c.unemployment = round(v("SL.UEM.TOTL.ZS") ?? nat?.unemployment ?? 6, 1)
  // out-of-school rates older than 2010 are unreliable guides to today's teenagers
  const primary = v("SE.PRM.UNER.ZS", 2010)
  const lower = v("SE.SEC.UNER.LO.ZS", 2010)
  c.outOfSchool = {
    primary: round(primary ?? Math.min(60, c.education[0] * 0.5), 1),
    lowerSecondary: round(lower ?? Math.min(80, (primary ?? c.education[0] * 0.5) * 1.6 + 2), 1),
  }
  c.births = round(v("SP.DYN.CBRT.IN") ?? nat?.births ?? 7.2 * c.fertility, 1)
  c.deaths = round(v("SP.DYN.CDRT.IN") ?? nat?.deaths ?? 8, 1)

  const male = AGE_BAND_CODES.map((b) => wdiValue(`SP.POP.${b}.MA.5Y`, ageIso))
  const female = AGE_BAND_CODES.map((b) => wdiValue(`SP.POP.${b}.FE.5Y`, ageIso))
  if (male.every((x) => x !== undefined) && female.every((x) => x !== undefined)) {
    c.ageBands = { male: male as number[], female: female as number[] }
    c.medianAge = medianOfBands(c.ageBands.male, c.ageBands.female, c.femaleShare)
  }
}

export const COUNTRY_BY_NAME = new Map(COUNTRIES.map((c) => [c.name, c]))

/** Popular emigrant origins, used to give immigrants a believable background. */
export const DIASPORA_ORIGINS = [
  "India", "Mexico", "China", "Syria", "Philippines", "Pakistan", "Ukraine", "Bangladesh", "Turkey",
  "Poland", "Morocco", "Nigeria", "Egypt", "Venezuela", "Colombia", "Indonesia", "Vietnam", "Afghanistan",
  "Romania", "Russia", "Brazil", "Nepal", "Sri Lanka", "Haiti", "Somalia", "Iran", "Kazakhstan",
]

/** Crude birth rate (births per 1,000 people per year, World Bank / UN WPP) */
export function birthRate(c: Country) {
  return c.births
}

/** Crude death rate (deaths per 1,000 people per year, World Bank / UN WPP) */
export function deathRate(c: Country) {
  return c.deaths
}
