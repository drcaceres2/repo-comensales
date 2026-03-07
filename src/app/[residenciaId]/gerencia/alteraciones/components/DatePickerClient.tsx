'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';

import { cn } from '@/lib/utils'; // Assuming shadcn/ui setup
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

type DatePickerClientProps = {
  initialFecha: string;
};

/**
 * A client-side component that renders a date picker and updates the
 * URL's 'fecha' search parameter upon selection. This drives the
 * server-side page to re-render with the new date.
 */
export default function DatePickerClient({ initialFecha }: DatePickerClientProps) {
  // The date state is derived from the initialFecha prop, which comes from the URL.
  // We add 'T00:00:00' to ensure the date is parsed in the local timezone correctly.
  const [date, setDate] = React.useState<Date | undefined>(new Date(initialFecha + 'T00:00:00'));
  const router = useRouter();
  const pathname = usePathname();

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) {
      const newPath = `${pathname}?fecha=${format(selectedDate, 'yyyy-MM-dd')}`;
      router.push(newPath);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-[280px] justify-start text-left font-normal',
            !date && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'PPP') : <span>Seleccione una fecha</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleDateSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
