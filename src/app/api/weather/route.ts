import { updateWeather } from "@/lib/weather/build"

/** Fetching five satellite images and IMERG, then encoding, takes well under a minute */
export const maxDuration = 120

/** Refreshes the live weather layers. Called by the Vercel cron in vercel.json. */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const index = await updateWeather()
  return Response.json(index)
}
