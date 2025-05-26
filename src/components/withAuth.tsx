'use client';

import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState, ComponentType, ReactNode } from 'react';

// Define the expected structure of the JSON response from the API
interface AuthResponse {
  authorized: boolean;
  reason?: string; // e.g., "INVALID_SESSION_COOKIE", "LICENSE_EXPIRED", "PATH_NOT_ALLOWED"
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
    const pathname = usePathname(); // Get current path

    const [isLoading, setIsLoading] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false); // Tracks if user is authorized for the component

    useEffect(() => {
      // Define paths that should not trigger the auth check with this HOC
      // These are typically public pages or pages that handle auth states themselves (like login, error pages)
      const publicPaths = ['/', '/acceso-no-autorizado', '/licencia-vencida', '/privacidad', '/about'];
      // Add any other paths that do not require this HOC's protection (e.g. /feedback)

      if (publicPaths.includes(pathname)) {
        setIsAuthorized(true); // Assume authorized or not relevant for these paths
        setIsLoading(false);
        // Warn if HOC is applied to redirect targets or other special public pages, but not to the main page '/'.
        if (pathname !== '/') { 
             console.warn(`withAuth HOC applied to public or special path ${pathname}. This might be unnecessary or cause redirect loops if ${pathname} is a redirect target.`);
        }
        return;
      }

      const checkAuthorization = async () => {
        setIsLoading(true);
        try {
          const response = await fetch(`/api/auth-check?path=${encodeURIComponent(pathname)}`);
          
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
    }, [pathname, router]); // Re-run if path changes

    if (isLoading) {
      return <LoadingComponent />;
    }

    return isAuthorized ? <WrappedComponent {...props} /> : null;
  };

  const wrappedComponentName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  ComponentWithAuth.displayName = `withAuth(${wrappedComponentName})`;

  return ComponentWithAuth;
}
