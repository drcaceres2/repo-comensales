"use client"

import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, Props>(
  ({ className, onCheckedChange, children, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked)
      if (props.onChange) props.onChange(e as any)
    }

    const checked = props.checked as boolean | undefined

    return (
      <div className={cn("inline-flex items-center", className)}>
        <input
          ref={ref}
          type="checkbox"
          {...props}
          onChange={handleChange}
          className="sr-only peer"
        />
        <span
          aria-hidden
          className={cn(
            "h-4 w-4 inline-flex items-center justify-center rounded-sm border border-primary ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            checked ? "bg-primary text-primary-foreground" : "bg-transparent",
          )}
        >
          {checked && <Check className="h-4 w-4" />}
        </span>
      </div>
    )
  }
)

Checkbox.displayName = "Checkbox"

export { Checkbox }
