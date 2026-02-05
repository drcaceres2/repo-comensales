import ElegirComidasClient from './ElegirComidasClient';

interface PageProps {
  params: Promise<{ residenciaId: string }>;
}

export default async function ElegirComidasPage({ params }: PageProps) {
  const { residenciaId } = await params;
  
  return <ElegirComidasClient residenciaId={residenciaId} />;
}