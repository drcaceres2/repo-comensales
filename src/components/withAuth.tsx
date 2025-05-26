'use client';

import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState, ComponentType, ReactNode } from 'react';

// Define the expected structure of the JSON response from the API
interface AuthResponse {
  authorized: boolean;
  reason?: string; // e.g., "INVALID_SESSION_COOKIE", "LICENSE_EXPIRED"
  message?: string;
  redirectPath?: string; // Suggested redirect path from the backend
}

// A simple loading component, replace with your actual loading spinner if you have one
const DefaultLoadingComponent = (): ReactNode => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    Loading...
  </div>
);

export default function withAuth<P extends object>(
  WrappedComponent: ComponentType<P>,
  LoadingComponent: ComponentType = DefaultLoadingComponent
) {
  const ComponentWithAuth = (props: P) => {
    const router = useRouter();
    const pathname = usePathname(); // Still needed to check against publicPaths

    const [isLoading, setIsLoading] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
      const publicPaths = ['/', '/acceso-no-autorizado', '/licencia-vencida', '/privacidad', '/about', '/crear-master'];

      if (publicPaths.includes(pathname)) {
        setIsAuthorized(true);
        setIsLoading(false);
        if (pathname !== '/') {
             console.warn(`withAuth HOC applied to public or special path ${pathname}. This might be unnecessary or cause redirect loops if ${pathname} is a redirect target.`);
        }
        return;
      }

      const checkAuthorization = async () => {
        setIsLoading(true);
        try {
          // Fetch call no longer includes the path query parameter
          const response = await fetch('/api/auth-check'); 
          
          if (!response.ok) {
            console.error(`Auth check API call failed with status: ${response.status}`);
            let errorData: AuthResponse | null = null;
            try {
                errorData = await response.json();
            } catch (e) { /* Ignore if response is not JSON */ }
            router.replace(errorData?.redirectPath || '/acceso-no-autorizado');
            return;
          }

          const data: AuthResponse = await response.json();

          if (data.authorized) {
            setIsAuthorized(true);
          } else {
            setIsAuthorized(false);
            const targetRedirectPath = data.redirectPath || '/acceso-no-autorizado';
            router.replace(targetRedirectPath);
          }
        } catch (error) {
          console.error('Error during authorization check:', error);
          setIsAuthorized(false);
          router.replace('/acceso-no-autorizado'); 
        } finally {
          setIsLoading(false);
        }
      };

      checkAuthorization();
    }, [pathname, router]); // pathname is still a dependency for the publicPaths check

    if (isLoading) {
      return <LoadingComponent />;
    }

    return isAuthorized ? <WrappedComponent {...props} /> : null;
  };

  const wrappedComponentName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  ComponentWithAuth.displayName = `withAuth(${wrappedComponentName})`;

  return ComponentWithAuth;
}
