// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

console.log('MINIMAL MIDDLEWARE FILE LOADED - Version 2'); // Added version to ensure it's the new one

export function middleware(request: NextRequest) {
  console.log('MINIMAL MIDDLEWARE EXECUTING FOR PATH:', request.nextUrl.pathname);
  console.log('EXPECTED RUNTIME: nodejs');
  
  // Attempt to access a Node.js specific global to confirm runtime
  try {
    if (typeof process !== 'undefined' && process.version) {
      console.log('Node.js process.version accessible:', process.version);
    } else {
      console.log('process.version NOT accessible, likely not Node.js runtime.');
    }
  } catch (e) {
    console.error('Error accessing process.version:', e.message);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/test-minimal-middleware/:path*', // Changed matcher to be specific and verifiable
  runtime: 'nodejs',
};
