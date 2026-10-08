import { updateSpace } from "@/lib/space/build"

/** About fifty Horizons requests, one at a time, plus the exoplanet archive */
export const maxDuration = 300

/** Refreshes probe positions and the exoplanet list. Called daily by the Vercel cron in vercel.json. */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  return Response.json(await updateSpace())
}
