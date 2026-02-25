import { requireAuth } from '@/lib/serverAuth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/firebaseAdmin';
import { type NovedadOperativa } from 'shared/schemas/novedades';
import TableroMisNovedades from './components/TableroMisNovedades';
import { NotebookPen } from 'lucide-react';
import NovedadesHeaderActions from './components/NovedadesHeaderActions';
import { Timestamp } from 'firebase-admin/firestore'

// Helper to serialize data with Timestamps
function serializeNovedad(doc: FirebaseFirestore.QueryDocumentSnapshot): NovedadOperativa {
    const data = doc.data();
    const serializedData: { [key: string]: any } = { id: doc.id };

    for (const key in data) {
        if (data[key] instanceof Timestamp) {
            serializedData[key] = data[key].toDate().toISOString();
        } else {
            serializedData[key] = data[key];
        }
    }

    return serializedData as NovedadOperativa;
}

// The 'params' object in async Server Components is a Promise. We must await it.
export default async function MisNovedadesPage({ params }: { params: Promise<{ residenciaId: string }> }) {
    const { residenciaId } = await params;
    const { uid } = await requireAuth();
    if (!uid) {
        redirect('/login');
    }

    const novedadesRef = db.collection(`residencias/${residenciaId}/novedadesOperativas`);
    const novedadesQuery = novedadesRef
        .where('autorId', '==', uid)
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
