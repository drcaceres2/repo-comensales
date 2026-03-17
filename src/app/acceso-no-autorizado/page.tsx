import AccesoNoAutorizadoClient from "./client";

interface AccesoNoAutorizadoPageProps {
  searchParams?: {
    mensaje?: string;
  };
}

export default async function AccesoNoAutorizadoPage({ searchParams }: AccesoNoAutorizadoPageProps) {
  // `searchParams` can be a Promise in the current Next.js runtime.
  const resolvedParams = await (searchParams as unknown as Promise<AccesoNoAutorizadoPageProps['searchParams']> | AccesoNoAutorizadoPageProps['searchParams']);
  const customMessage = resolvedParams?.mensaje;

  return <AccesoNoAutorizadoClient mensaje={customMessage} />;
}