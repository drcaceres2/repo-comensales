import { ReactNode } from 'react';

export default function ElegirHorariosLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-0 py-4 md:px-6 md:py-6">{children}</div>;
}
