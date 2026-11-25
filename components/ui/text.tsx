import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Role-based type scale (docs/design-system.md §4). `variant` is the visual
// role only; the element comes from `as`, so an h2 can look like a title and
// a `display` line can still be a plain <p>.
const textVariants = cva("", {
  variants: {
    variant: {
      display: "text-3xl/9 font-semibold tracking-tight",
      heading: "text-2xl/8 font-semibold tracking-tight",
      title: "text-lg/7 font-semibold tracking-tight",
      subtitle: "text-base/6 font-medium",
      body: "text-base/6",
      "body-sm": "text-sm/5",
      label: "text-sm/5 font-medium",
      caption: "text-xs/4",
    },
    color: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      brand: "text-primary",
      danger: "text-destructive",
      inherit: "",
    },
    mono: { true: "font-mono" },
    tabular: { true: "tabular-nums" },
    truncate: { true: "truncate" },
  },
  defaultVariants: { variant: "body", color: "default" },
})

type TextProps = Omit<React.HTMLAttributes<HTMLElement>, "color"> &
  VariantProps<typeof textVariants> & {
    as?: "p" | "span" | "div" | "h1" | "h2" | "h3" | "h4" | "label" | "dt" | "dd" | "small" | "strong"
  }

function Text({ as: Comp = "p", className, variant, color, mono, tabular, truncate, ...props }: TextProps) {
  return <Comp data-slot="text" className={cn(textVariants({ variant, color, mono, tabular, truncate }), className)} {...props} />
}

export { Text, textVariants }
