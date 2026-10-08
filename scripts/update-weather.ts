/**
 * Builds and uploads one set of live weather layers, as the cron does (src/lib/weather/build.ts).
 *
 *   bun --env-file=.env.local scripts/update-weather.ts
 */
import { updateWeather } from "../src/lib/weather/build"

const t0 = Date.now()
console.log(JSON.stringify(await updateWeather(), null, 2))
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
