import React from 'react';
import { db, storage } from '../lib/firebase';

interface PdfSummaryItem {
  tiempoComidaId: string;
  nombreTiempoComida: string;
  totalComensalesTiempoComida: number;
  alternativas: Array<{
    alternativaId: string;
    nombreAlternativa: string;
    totalComensalesAlternativa: number;
    desglosePorDieta?: Record<string, number>;
  }>;
}

interface PdfComensalItem {
  usuarioComensalId: string;
  nombreUsuarioComensal: string;
  dietaId: string;
  origen: string;
  snapshotEleccion?: {
    tiempoComidaId?: string;
    nombreAlternativa?: string;
  };
}

interface GeneratePdfInput {
  residenciaId: string;
  solicitudId: string;
}

interface GeneratePdfResult {
  buffer: Buffer;
  storagePath: string;
  signedUrl: string;
  consolidadorEmail: string;
}

type ReactPdfRendererModule = {
  Document: React.ElementType;
  Image: React.ElementType;
  Page: React.ElementType;
  StyleSheet: {
    create: (styles: any) => any;
  };
  Text: React.ElementType;
  View: React.ElementType;
  renderToBuffer: (doc: React.ReactElement) => Promise<Buffer>;
};

async function loadReactPdfRenderer(): Promise<ReactPdfRendererModule> {
  // Keep native dynamic import at runtime to load ESM from CommonJS output.
  const dynamicImport = new Function('modulePath', 'return import(modulePath);') as (
    modulePath: string,
  ) => Promise<ReactPdfRendererModule>;
  return dynamicImport('@react-pdf/renderer');
}

function asIsoDateTime(value: unknown): string {
  try {
    if (!value) return 'N/A';
    if (typeof value === 'string') return value;
    const maybe = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
    if (typeof maybe.seconds === 'number') return new Date(maybe.seconds * 1000).toISOString();
    return String(value);
  } catch {
    return 'N/A';
  }
}

function buildPdfDocument(params: {
  residenciaNombre: string;
  solicitudId: string;
  fechaOperativa: string;
  fechaHoraCorte: string;
  consolidadoAt: string;
  logoUrl?: string;
  resumen: PdfSummaryItem[];
  comensales: PdfComensalItem[];
  renderer: Pick<ReactPdfRendererModule, 'Document' | 'Image' | 'Page' | 'Text' | 'View'>;
  styles: any;
}) {
  const {
    residenciaNombre,
    solicitudId,
    fechaOperativa,
    fechaHoraCorte,
    consolidadoAt,
    logoUrl,
    resumen,
    comensales,
    renderer,
    styles,
  } = params;

  const { Document, Image, Page, Text, View } = renderer;

  const header = React.createElement(
    View,
    { style: [styles.rowBetween] },
    React.createElement(
      View,
      null,
      React.createElement(Text, { style: styles.title }, 'Solicitud Consolidada'),
      React.createElement(Text, { style: styles.subtitle }, `Residencia: ${residenciaNombre}`),
      React.createElement(Text, { style: styles.line }, `Solicitud ID: ${solicitudId}`),
      React.createElement(Text, { style: styles.line }, `Fecha operativa: ${fechaOperativa}`),
      React.createElement(Text, { style: styles.line }, `Corte de referencia: ${fechaHoraCorte}`),
      React.createElement(Text, { style: styles.line }, `Consolidada en: ${consolidadoAt}`),
    ),
    logoUrl ? React.createElement(Image, { style: styles.logo, src: logoUrl }) : React.createElement(View, null),
  );

  const resumenSection = React.createElement(
    View,
    null,
    React.createElement(Text, { style: styles.sectionTitle }, 'Resumen por tiempos de comida'),
    ...resumen.map((item) =>
      React.createElement(
        View,
        { key: `${item.tiempoComidaId}`, style: styles.card },
        React.createElement(
          View,
          { style: styles.rowBetween },
          React.createElement(Text, null, `${item.nombreTiempoComida} (${item.tiempoComidaId})`),
          React.createElement(Text, null, `Total: ${item.totalComensalesTiempoComida}`),
        ),
        ...item.alternativas.map((alt) =>
          React.createElement(
            Text,
            { key: `${item.tiempoComidaId}-${alt.alternativaId}`, style: styles.line },
            `- ${alt.nombreAlternativa}: ${alt.totalComensalesAlternativa}`,
          ),
        ),
      ),
    ),
  );

  const comensalesSection = React.createElement(
    View,
    null,
    React.createElement(Text, { style: styles.sectionTitle }, 'Desglose de comensales'),
    React.createElement(
      View,
      { style: styles.tableHeader },
      React.createElement(Text, { style: styles.col40 }, 'Nombre'),
      React.createElement(Text, { style: styles.col30 }, 'Alternativa'),
      React.createElement(Text, { style: styles.col15 }, 'Dieta'),
      React.createElement(Text, { style: styles.col15Right }, 'Origen'),
    ),
    ...comensales.map((c, idx) =>
      React.createElement(
        View,
        { key: `${c.usuarioComensalId}-${idx}`, style: styles.tableRow },
        React.createElement(Text, { style: styles.col40 }, c.nombreUsuarioComensal || c.usuarioComensalId),
        React.createElement(Text, { style: styles.col30 }, c.snapshotEleccion?.nombreAlternativa || 'N/A'),
        React.createElement(Text, { style: styles.col15 }, c.dietaId || 'N/A'),
        React.createElement(Text, { style: styles.col15Right }, c.origen || 'N/A'),
      ),
    ),
  );

  const footer = React.createElement(
    Text,
    { style: styles.footNote },
    'Documento generado automáticamente por Comensales. Este reporte corresponde a un cierre transaccional inmutable.',
  );

  return React.createElement(
    Document,
    null,
    React.createElement(Page, { size: 'A4', style: styles.page }, header, resumenSection, comensalesSection, footer),
  );
}

export async function generarPdfSolicitudConsolidada(input: GeneratePdfInput): Promise<GeneratePdfResult> {
  const renderer = await loadReactPdfRenderer();
  const styles = renderer.StyleSheet.create({
    page: {
      paddingTop: 28,
      paddingBottom: 28,
      paddingHorizontal: 30,
      fontSize: 10,
      fontFamily: 'Helvetica',
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      fontSize: 16,
      fontWeight: 700,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 10,
      color: '#555',
      marginBottom: 12,
    },
    sectionTitle: {
      marginTop: 10,
      marginBottom: 6,
      fontSize: 12,
      fontWeight: 700,
    },
    logo: {
      width: 68,
      height: 68,
      objectFit: 'contain',
    },
    card: {
      border: '1px solid #d7d7d7',
      borderRadius: 4,
      padding: 8,
      marginBottom: 6,
    },
    line: {
      marginBottom: 3,
    },
    tableHeader: {
      flexDirection: 'row',
      borderBottom: '1px solid #999',
      paddingBottom: 3,
      marginBottom: 4,
      fontSize: 9,
      fontWeight: 700,
    },
    tableRow: {
      flexDirection: 'row',
      borderBottom: '1px solid #eee',
      paddingVertical: 2,
    },
    col40: { width: '40%' },
    col30: { width: '30%' },
    col15: { width: '15%' },
    col15Right: { width: '15%', textAlign: 'right' },
    footNote: {
      marginTop: 12,
      fontSize: 8,
      color: '#666',
    },
  });

  const { residenciaId, solicitudId } = input;

  const solicitudRef = db.collection('residencias').doc(residenciaId).collection('solicitudesConsolidadas').doc(solicitudId);
  const comensalesRef = solicitudRef.collection('comensales');
  const residenciaRef = db.collection('residencias').doc(residenciaId);

  const [solicitudSnap, residenciaSnap, comensalesSnap] = await Promise.all([
    solicitudRef.get(),
    residenciaRef.get(),
    comensalesRef.get(),
  ]);

  if (!solicitudSnap.exists) {
    throw new Error(`Solicitud consolidada no encontrada: ${residenciaId}/${solicitudId}`);
  }
  if (!residenciaSnap.exists) {
    throw new Error(`Residencia no encontrada: ${residenciaId}`);
  }

  const solicitudData = solicitudSnap.data() as any;
  const residenciaData = residenciaSnap.data() as any;
  const consolidadorId = String(solicitudData?.consolidadorId || '');
  if (!consolidadorId) {
    throw new Error('La solicitud no tiene consolidadorId.');
  }

  const consolidadorSnap = await db.collection('usuarios').doc(consolidadorId).get();
  const consolidadorEmail = String(consolidadorSnap.data()?.email || '').trim().toLowerCase();
  if (!consolidadorEmail) {
    throw new Error(`No se encontró email del consolidador ${consolidadorId}.`);
  }

  const logoFallbackUrl = process.env.APP_LOGO_FALLBACK_URL;
  const logoUrl = (typeof residenciaData?.logoUrl === 'string' && residenciaData.logoUrl.trim())
    ? residenciaData.logoUrl.trim()
    : (logoFallbackUrl || undefined);

  const doc = buildPdfDocument({
    residenciaNombre: String(residenciaData?.nombre || residenciaId),
    solicitudId,
    fechaOperativa: String(solicitudData?.fechaOperativa || 'N/A'),
    fechaHoraCorte: String(solicitudData?.fechaHoraReferenciaCorte || 'N/A'),
    consolidadoAt: asIsoDateTime(solicitudData?.timestampCierreOficial),
    logoUrl,
    resumen: Array.isArray(solicitudData?.resumen) ? (solicitudData.resumen as PdfSummaryItem[]) : [],
    comensales: comensalesSnap.docs.map((docSnap) => docSnap.data() as PdfComensalItem),
    renderer,
    styles,
  });

  const buffer = await renderer.renderToBuffer(doc);

  const storagePath = `tenants/${residenciaId}/solicitud-consolidada/${solicitudId}.pdf`;
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);

  await file.save(buffer, {
    contentType: 'application/pdf',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0, no-cache',
    },
  });

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });

  return {
    buffer,
    storagePath,
    signedUrl,
    consolidadorEmail,
  };
}

