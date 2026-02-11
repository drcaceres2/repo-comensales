import AccesoNoAutorizadoClient from "./client";

interface AccesoNoAutorizadoPageProps {
  searchParams?: {
    mensaje?: string;
  };
}

export default function AccesoNoAutorizadoPage({ searchParams }: AccesoNoAutorizadoPageProps) {
  // In a Server Component, searchParams can be accessed directly.
  // The 'mensaje' will be passed to the Client Component.
  const customMessage = searchParams?.mensaje;

  return <AccesoNoAutorizadoClient mensaje={customMessage} />;
}