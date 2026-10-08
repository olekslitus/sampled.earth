/**
 * Refreshes the live space data in Blob once, like the daily cron does.
 *
 *   bun --env-file=.env.local scripts/update-space.ts
 */
import { updateSpace } from "../src/lib/space/build"

const t0 = Date.now()
console.log(JSON.stringify(await updateSpace(), null, 2))
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
