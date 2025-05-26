// functions/src/authConfig.ts (example)
export interface PathRule {
    pathPattern: RegExp; // Use RegExp for flexible path matching
    allowedRoles: string[];
    requiresResidenciaInPath: boolean;
    isMasterOnly?: boolean;
    customMessage?: string; // Custom message for unauthorized access to this path
  }
  
  export const PATH_RULES: PathRule[] = [
    { pathPattern: /^\/restringido-master(\/.*)?$/, allowedRoles: ['master'], requiresResidenciaInPath: false, isMasterOnly: true, customMessage: "Acceso exclusivo para administradores Master." },
    { pathPattern: /^\/admin(\/.*)?$/, allowedRoles: ['admin', 'master'], requiresResidenciaInPath: false, customMessage: "Necesitas permisos de administrador." },
    { pathPattern: /^\/([^/]+)\/solicitar-comensales(\/.*)?$/, allowedRoles: ['director', 'admin', 'master'], requiresResidenciaInPath: true },
    { pathPattern: /^\/([^/]+)\/elegir-comidas(\/.*)?$/, allowedRoles: ['residente', 'admin', 'master'], requiresResidenciaInPath: true },
    // ... Add rules for all your protected routes
  ];
  