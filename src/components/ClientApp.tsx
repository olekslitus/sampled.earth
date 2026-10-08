"use client"

import dynamic from "next/dynamic"

const SampledEarth = dynamic(() => import("./SampledEarth"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
      Sampling humanity…
    </div>
  ),
})

export default function ClientApp() {
  return <SampledEarth />
}
