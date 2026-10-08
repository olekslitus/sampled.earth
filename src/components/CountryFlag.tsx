import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * A country's flag (3:2 SVG from public/flags, copied by scripts/copy-flags.ts). Decorative:
 * the country is always named next to it.
 */
export function CountryFlag({ iso2, height = 12, className }: { iso2: string; height?: number; className?: string }) {
  return (
    <Image
      src={`/flags/${iso2}.svg`}
      alt=""
      width={Math.round(height * 1.5)}
      height={height}
      unoptimized
      className={cn("inline-block shrink-0 rounded-[2px] object-cover align-[-0.125em] shadow-[0_0_0_1px_rgb(0_0_0/0.12)]", className)}
    />
  )
}
