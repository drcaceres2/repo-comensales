import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || !body.text) {
      return NextResponse.json({ error: 'Missing feedback text' }, { status: 400 });
    }

    const docRef = await db.collection('feedback').add({
      ...body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: body.status || 'nuevo',
    });

    return NextResponse.json({ id: docRef.id });
  } catch (err) {
    console.error('Error creating feedback (API):', err);
    return NextResponse.json({ error: (err as Error).message || 'Unknown error' }, { status: 500 });
  }
}
