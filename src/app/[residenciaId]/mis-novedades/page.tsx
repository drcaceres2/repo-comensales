import { requireAuth } from '@/lib/serverAuth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/firebaseAdmin';
import { NovedadOperativa } from 'shared/schemas/novedades';
import TableroMisNovedades from './components/TableroMisNovedades';
import { Timestamp } from 'firebase-admin/firestore';

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


export default async function MisNovedadesPage({ params }: { params: { residenciaId: string } }) {
    const { uid } = await requireAuth();
    if (!uid) {
        redirect('/login');
    }

    const novedadesRef = db.collection(`residencias/${params.residenciaId}/novedadesOperativas`);
    const novedadesQuery = novedadesRef
        .where('autorId', '==', uid)
        .orderBy('fechaCreacion', 'desc')
        .limit(50);

    const querySnapshot = await novedadesQuery.get();
    const novedades = querySnapshot.docs.map(serializeNovedad);

    return (
        <main className="p-4 md:p-6">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h1 className="text-2xl font-bold">Mis Novedades</h1>
                    <p className="text-gray-500">Consulta y gestiona las novedades que has reportado.</p>
                </div>
            </div>
            <TableroMisNovedades initialData={novedades} />
        </main>
    );
}
