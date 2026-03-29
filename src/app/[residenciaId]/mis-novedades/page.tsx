import { redirect } from 'next/navigation';
import { db } from '@/lib/firebaseAdmin';
import { type NovedadOperativa } from 'shared/schemas/novedades';
import TableroMisNovedades from './components/TableroMisNovedades';
import { NotebookPen } from 'lucide-react';
import NovedadesHeaderActions from './components/NovedadesHeaderActions';
import { Timestamp } from 'firebase-admin/firestore'
import {obtenerInfoUsuarioServer} from "@/lib/obtenerInfoUsuarioServer";

type NovedadOperativaInterna = Extract<NovedadOperativa, { origen: 'interno' }>;

// Helper to serialize data with Timestamps or legacy ISO strings
function serializeNovedad(doc: FirebaseFirestore.QueryDocumentSnapshot): NovedadOperativaInterna {
    const data = doc.data();
    const serializedData: { [key: string]: any } = { id: doc.id };

    for (const key in data) {
        const value = data[key];
        // Firestore serverTimestamp() resolves to a Timestamp instance
        if (value instanceof Timestamp) {
            serializedData[key] = value.toDate().toISOString();
        } else if (typeof value === 'string' && !isNaN(Date.parse(value))) {
            // legacy string dates, keep them normalized
            serializedData[key] = new Date(value).toISOString();
        } else {
            serializedData[key] = value;
        }
    }

    return serializedData as NovedadOperativaInterna;
}

export default async function MisNovedadesPage() {
    const { usuarioId: uid, residenciaId } = await obtenerInfoUsuarioServer();
    if (!uid || !residenciaId) {
        redirect('/login');
    }

    const novedadesRef = db.collection(`residencias/${residenciaId}/novedadesOperativas`);
    const novedadesQuery = novedadesRef
        .where('autorId', '==', uid)
        .where('origen', '==', 'interno')
        .orderBy('timestampCreacion', 'desc')
        .limit(50);

    const querySnapshot = await novedadesQuery.get();
    const novedades = querySnapshot.docs.map(serializeNovedad);

    return (
        <main className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
                <div className="flex items-center gap-4">
                    <NotebookPen className="h-8 w-8 text-gray-500" />
                    <div>
                        <h1 className="text-2xl font-bold">Mis Novedades</h1>
                        <p className="text-gray-500">Residencia: {residenciaId}</p>
                    </div>
                </div>
                <div className="w-full md:w-auto">
                    <NovedadesHeaderActions residenciaId={residenciaId} />
                </div>
            </div>
            <TableroMisNovedades initialData={novedades} />
        </main>
    );
}
