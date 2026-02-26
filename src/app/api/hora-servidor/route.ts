import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        // Enviamos el timestamp puro (ms) para evitar problemas de formato
        timestampServidor: Date.now(),
    });
}