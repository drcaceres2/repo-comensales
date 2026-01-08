import * as React from "react"

import { cn } from "@/lib/utils"

const Table = (
  { ...props }: React.HTMLAttributes<HTMLTableElement>
) => (
  <div className="relative w-full overflow-auto">
    <table
      className={cn("w-full caption-bottom text-sm", props.className)}
      {...props}
    />
  </div>
)
Table.displayName = "Table"

const TableHeader = (
  { ...props }: React.HTMLAttributes<HTMLTableSectionElement>
) => (
  <thead className={cn("[&_tr]:border-b", props.className)} {...props} />
)
TableHeader.displayName = "TableHeader"

const TableBody = (
  { ...props }: React.HTMLAttributes<HTMLTableSectionElement>
) => (
  <tbody
    className={cn("[&_tr:last-child]:border-0", props.className)}
    {...props}
  />
)
TableBody.displayName = "TableBody"

const TableFooter = (
  { ...props }: React.HTMLAttributes<HTMLTableSectionElement>
) => (
  <tfoot
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      props.className
    )}
    {...props}
  />
)
TableFooter.displayName = "TableFooter"

const TableRow = (
  { ...props }: React.HTMLAttributes<HTMLTableRowElement>
) => (
  <tr
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      props.className
    )}
    {...props}
  />
)
TableRow.displayName = "TableRow"

const TableHead = (
  { ...props }: React.ThHTMLAttributes<HTMLTableCellElement>
) => (
  <th
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      props.className
    )}
    {...props}
  />
)
TableHead.displayName = "TableHead"

const TableCell = (
  { ...props }: React.TdHTMLAttributes<HTMLTableCellElement>
) => (
  <td
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", props.className)}
    {...props}
  />
)
TableCell.displayName = "TableCell"

const TableCaption = (
  { ...props }: React.HTMLAttributes<HTMLTableCaptionElement>
) => (
  <caption
    className={cn("mt-4 text-sm text-muted-foreground", props.className)}
    {...props}
  />
)
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
