'use client';

import Link from 'next/link';
import React, { useState, useEffect, ReactNode } from 'react';
import {
  Sidebar,
  SidebarTrigger,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from './ui/sidebar';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';
import {
  Menu,
  Users,
  Building,
  Settings,
  ListChecks,
  CalendarDays,
  UsersRound,
  Bell,
  FileText,
  Home,
  PlusCircle,
  MessageSquare,
  Loader2,
  ShieldCheck,
  UserCog,
  LucideIcon,
  Info,
  Clock,
  ConciergeBell,
  Briefcase, // For Licenciamiento
  UserSquare, // For Directores group
  Drama, // For Actividades group (Theater masks)
  Handshake, // For Invitados group
  ClipboardEdit, // For Administrar Residencia group
  BookCopy, // For Contabilidad group (Ledger/accounting book)
  UserCircle2, // For Mi Perfil
  UserPlus, // For Crear invitados sin acceso
} from 'lucide-react';

import {
  SheetTitle,
  SheetDescription,
  SheetHeader as UiSheetHeader,
} from '@/components/ui/sheet';

import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from "firebase/firestore";
import { UserProfile, UserRole } from '@/../../shared/models/types';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string | ((residenciaIdRelativePath: string) => string); // Modified for clarity with rLink
  roles?: UserRole[] | 'authenticated' | 'unauthenticated'; // Allow special role strings
  requiresResidenciaIdForHref?: boolean;
  isAccordion?: boolean;
  children?: NavItem[];
  isFeedbackLink?: boolean;
  checkVisibility?: (profile: UserProfile | null) => boolean;
  pathTemplate?: string; // For rLink items, to avoid long switch in renderNavItem
}

const ALL_AUTHENTICATED_ROLES: UserRole[] = ['master', 'admin', 'director', 'residente', 'invitado', 'asistente', 'contador'];

const getNavConfig = (profile: UserProfile | null): NavItem[] => {
  const userRoles = profile?.roles || [];
  const residenciaId = profile?.residenciaId;

  const hasRole = (role: UserRole) => userRoles.includes(role);
  const rLink = (path: string) => { // path is the part *after* residenciaId
    if (!residenciaId) return '#';
    return `/${residenciaId}${path}`;
  };

  return [
    // --- Items without group (Top Level) ---
    {
      id: 'miPerfil',
      label: 'Mi Perfil',
      icon: UserCircle2,
      href: '/mi-perfil',
      roles: ALL_AUTHENTICATED_ROLES,
    },
    {
      id: 'elegirComidasGlobal', // Differentiating from the one inside a residencia context
      label: 'Elegir comidas (Global)', // Clarified label for this context
      icon: ListChecks,
      href: (residenciaId && profile?.roles.includes('residente')) ? `/${residenciaId}/elegir-comidas` : '#', // Dynamic href based on role and residenciaId
      checkVisibility: (p) => !!p?.residenciaId && p.roles.includes('residente'),
      roles: ['residente'],
      requiresResidenciaIdForHref: true,
      pathTemplate: '/elegir-comidas', // For potential direct use if not handled by dynamic href
    },
    {
      id: 'privacidad',
      label: 'Política de privacidad',
      icon: ShieldCheck, 
      href: '/privacidad',
      roles: 'unauthenticated', // Special role for non-authenticated users
    },
    {
      id: 'aboutPage',
      label: 'Acerca de nosotros',
      icon: Info,
      href: '/about',
      roles: 'unauthenticated',
    },

    // --- Group: Licenciamiento ---
    {
      id: 'licenciamientoGroup',
      label: 'Licenciamiento',
      icon: Briefcase,
      isAccordion: true,
      roles: ['master'],
      children: [
        {
          id: 'crearCliente',
          label: 'Cliente',
          icon: Users,
          href: '/restringido-master/crear-cliente',
          roles: ['master'],
        },
        {
          id: 'crearContrato',
          label: 'Contratos',
          icon: FileText,
          href: '/restringido-master/crear-contrato-residencia',
          roles: ['master'],
        },
        {
          id: 'crearPedido',
          label: 'Pedidos',
          icon: PlusCircle,
          href: '/restringido-master/crear-pedido',
          roles: ['master'],
        },
        {
          id: 'crearResidenciaMaster',
          label: 'Crear residencia',
          icon: Building,
          href: '/restringido-master/crear-residencia',
          roles: ['master'],
        },
        {
          id: 'facturasMaster',
          label: 'Facturas',
          icon: FileText,
          href: '/restringido-master/facturas',
          roles: ['master'],
        },
        {
          id: 'licenciasMaster',
          label: 'Licenciamiento',
          icon: Briefcase,
          href: '/restringido-master/licencias',
          roles: ['master'],
        },
      ],
    },

    // --- Group: Directores ---
    {
      id: 'directoresGroup',
      label: 'Directores',
      icon: UserSquare,
      isAccordion: true,
      roles: ['director', 'asistente'],
      requiresResidenciaIdForHref: true, // Group requires residenciaId if all children do
      children: [
        {
          id: 'solicitarComensales',
          label: 'Solicitar comensales',
          icon: ConciergeBell,
          href: rLink,
          pathTemplate: '/solicitar-comensales',
          roles: ['director', 'asistente'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'recordatoriosDirectores',
          label: 'Recordatorios',
          icon: Bell,
          href: rLink,
          pathTemplate: '/recordatorios',
          roles: ['director', 'asistente'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'adminAtenciones',
          label: 'Atenciones',
          icon: Settings, // Or a more specific icon if available
          href: rLink,
          pathTemplate: '/admin/atenciones',
          roles: ['director', 'asistente'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'adminDietas',
          label: 'Dietas',
          icon: ListChecks, // Or a food related icon
          href: rLink,
          pathTemplate: '/admin/dietas',
          roles: ['director', 'asistente'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'adminGruposUsuarios',
          label: 'Restringir residentes',
          icon: UsersRound,
          href: rLink,
          pathTemplate: '/admin/grupos-usuarios',
          roles: ['director', 'asistente'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'configDelegacionAsistente',
          label: 'Delegar',
          icon: UserCog,
          href: rLink,
          pathTemplate: '/configurar-delegacion-asistente',
          roles: ['director', 'asistente'],
          requiresResidenciaIdForHref: true,
        },
      ],
    },

    // --- Group: Actividades ---
    {
      id: 'actividadesGroup',
      label: 'Actividades',
      icon: Drama,
      isAccordion: true,
      roles: ['director', 'asistente', 'residente', 'invitado'],
      requiresResidenciaIdForHref: true,
      children: [
        {
          id: 'inscripcionActividades',
          label: 'Inscripción Actividades',
          icon: CalendarDays,
          href: rLink,
          pathTemplate: '/inscripcion-actividades',
          roles: ['director', 'asistente', 'residente', 'invitado'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'adminCrearActividades',
          label: 'Crear Actividades',
          icon: PlusCircle,
          href: rLink,
          pathTemplate: '/admin/actividades',
          roles: ['director', 'asistente'],
          requiresResidenciaIdForHref: true,
        },
      ],
    },

    // --- Group: Invitados ---
    {
      id: 'invitadosGroup',
      label: 'Invitados',
      icon: Handshake,
      isAccordion: true,
      roles: ['director', 'asistente', 'invitado'],
      requiresResidenciaIdForHref: true,
      children: [
        {
          id: 'invitadoBienvenida', // Changed from bienvenida-invitados to be more specific
          label: 'Solicitar comidas (asistente)', // This might be for an assistant managing an invitado's choices
          icon: ConciergeBell,
          href: rLink,
          pathTemplate: '/bienvenida-invitados',
          roles: ['invitado'], // Role specified as 'invitado' only
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'invitadoElecciones',
          label: 'Solicitar comidas (detallado)',
          icon: ListChecks,
          href: rLink,
          pathTemplate: '/elecciones-invitados',
          roles: ['director', 'asistente', 'invitado'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'adminInvitadosNoAuth',
          label: 'Crear invitados sin acceso',
          icon: UserPlus, // Need to import UserPlus from lucide-react
          href: rLink,
          pathTemplate: '/admin/invitados-no-autenticados',
          roles: ['director', 'asistente'],
          requiresResidenciaIdForHref: true,
        },
      ],
    },

    // --- Group: Administrar Residencia ---
    {
      id: 'adminResidenciaGroup',
      label: 'Administrar Residencia',
      icon: ClipboardEdit,
      isAccordion: true,
      roles: ['admin'],
      // This group can have mixed children regarding residenciaId requirement
      children: [
        {
          id: 'adminGlobalUsers', // Differentiated from a residencia-specific user creation
          label: 'Crear usuarios (Global)',
          icon: Users,
          href: '/admin/users',
          roles: ['admin'],
        },
        {
          id: 'adminCrearUsuarioPorCorreo',
          label: 'Enviar enlace creación usuario',
          icon: UserCog, // Or MailPlus
          href: rLink,
          pathTemplate: '/admin/crear-usuario-por-correo',
          roles: ['admin'],
          requiresResidenciaIdForHref: true,
        },
        // The item "/[residenciaId]/admin, 'Comedores y horarios ao/ax'" is tricky.
        // A link to just '/admin' within a residenciaId context usually implies a dashboard or overview.
        // Let's assume it's an admin dashboard for the residencia.
        {
          id: 'adminResidenciaDashboard',
          label: 'Dashboard Admin Residencia', // More descriptive label
          icon: Settings,
          href: rLink,
          pathTemplate: '/admin',
          roles: ['admin'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'adminHorariosComida',
          label: 'Horarios de comida',
          icon: Clock,
          href: rLink,
          pathTemplate: '/admin/horarios',
          roles: ['admin'],
          requiresResidenciaIdForHref: true,
        },
      ],
    },

    // --- Group: Contabilidad ---
    {
      id: 'contabilidadGroup',
      label: 'Contabilidad',
      icon: BookCopy,
      isAccordion: true,
      roles: ['contador'],
      requiresResidenciaIdForHref: true,
      children: [
        {
          id: 'configContabilidad',
          label: 'Configurar contabilidad',
          icon: Settings,
          href: rLink,
          pathTemplate: '/contabilidad/config-contabilidad',
          roles: ['contador'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'detallarCostoClasificacion',
          label: 'Detallar costo y clasificación',
          icon: ListChecks,
          href: rLink,
          pathTemplate: '/contabilidad/detallar-costo-y-clasificacion',
          roles: ['contador'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'reporteCostos',
          label: 'Reporte de costos',
          icon: FileText,
          href: rLink,
          pathTemplate: '/contabilidad/reporte-costos',
          roles: ['contador'],
          requiresResidenciaIdForHref: true,
        },
      ],
    },

    // --- Item without group (Bottom) ---
    {
      id: 'feedback',
      label: 'Comentarios sobre la app',
      icon: MessageSquare,
      href: '/feedback',
      roles: ALL_AUTHENTICATED_ROLES,
      isFeedbackLink: true, // Keeps existing behavior for placement
    },
  ];
};

const isItemVisible = (item: NavItem, profile: UserProfile | null): boolean => {
  if (item.checkVisibility) {
    return item.checkVisibility(profile);
  }
  const userRoles = profile?.roles || [];
  const residenciaId = profile?.residenciaId;
  const isAuthenticated = !!profile; // User is authenticated if profile exists

  if (item.requiresResidenciaIdForHref && !residenciaId && item.href !== '#') return false;

  if (item.roles) {
    if (item.roles === 'unauthenticated') {
      // No specific role required, and authentication status does not prevent visibility.
      // This item is visible to everyone, authenticated or not.
    } else if (item.roles === 'authenticated') {
      if (!isAuthenticated) return false;
    } else if (Array.isArray(item.roles)) {
      if (!isAuthenticated || !item.roles.some(role => userRoles.includes(role))) return false;
    }
  }

  if (item.isAccordion && item.children) {
    return item.children.some(child => isItemVisible(child, profile));
  }
  return true;
};

export function Navigation() {
  const [authUser, authLoading] = useAuthState(auth);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(true);
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (authLoading) {
      setProfileLoading(true);
      return;
    }
    if (authUser) {
      setProfileLoading(true);
      const userDocRef = doc(db, "users", authUser.uid);
      getDoc(userDocRef)
        .then((docSnap) => {
          setUserProfile(docSnap.exists() ? (docSnap.data() as UserProfile) : null);
        })
        .catch((error) => {
          console.error("Error fetching user profile:", error);
          setUserProfile(null);
        })
        .finally(() => setProfileLoading(false));
    } else {
      setUserProfile(null);
      setProfileLoading(false);
    }
  }, [authUser, authLoading]);

  const navConfig = getNavConfig(userProfile);
  const feedbackLink = navConfig.find(item => item.isFeedbackLink);
  const menuItems = navConfig.filter(item => !item.isFeedbackLink);

  const renderNavItem = (item: NavItem): ReactNode => {
    if (!isItemVisible(item, userProfile)) return null;

    let hrefPath = '#';

    if (typeof item.href === 'string') {
      // For static string hrefs, or fully constructed dynamic ones (like for elegirComidasGlobal)
      hrefPath = item.href;
      if (item.requiresResidenciaIdForHref && item.href.includes('[residenciaId]')) {
        // This was the old way, less common now with rLink and pathTemplate
        if (userProfile?.residenciaId) {
          hrefPath = item.href.replace('[residenciaId]', userProfile.residenciaId);
        } else {
          hrefPath = '#';
        }
      }
    } else if (typeof item.href === 'function') { // rLink
      if (userProfile?.residenciaId && item.pathTemplate) {
        hrefPath = item.href(item.pathTemplate); // item.href is rLink
      } else if (!userProfile?.residenciaId && item.requiresResidenciaIdForHref) {
        hrefPath = '#';
      }
    }

    if (item.isAccordion) {
      const visibleChildren = item.children?.filter(child => isItemVisible(child, userProfile)) || [];
      if (visibleChildren.length === 0) return null;

      return (
        <AccordionItem value={item.id} key={item.id}>
          <AccordionTrigger className="w-full flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md">
            <div className="flex items-center space-x-2">
              <item.icon size={18} />
              <span>{item.label}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pl-4 space-y-1 pt-1">
            {visibleChildren.map(renderNavItem)}
          </AccordionContent>
        </AccordionItem>
      );
    }

    return (
      <SidebarMenuItem key={item.id}>
        <Link
          href={hrefPath}
          className="flex items-center space-x-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-sm"
          onClick={() => {
            if (isMobile) {
              setOpenMobile(false);
            }
          }}
        >
          <item.icon size={item.isFeedbackLink ? 18 : 16} />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuItem>
    );
  };

  let triggerContent: ReactNode = null;
  if (authLoading || (!authUser && profileLoading)) {
    triggerContent = (
      <button className="fixed top-4 left-4 z-50 p-2 bg-gray-800 text-white rounded-md" disabled>
        <Loader2 size={24} className="animate-spin" />
      </button>
    );
  } else if (authUser) {
    triggerContent = (
      <SidebarTrigger asChild>
        <button className="fixed top-4 left-4 z-50 p-2 bg-gray-800 text-white rounded-md">
          <Menu size={24} />
        </button>
      </SidebarTrigger>
    );
  } else {
    // Show trigger for unauthenticated users IF there are unauthenticated links
    const unauthNavConfig = getNavConfig(null);
    const unauthVisibleItems = unauthNavConfig.filter(item => isItemVisible(item, null) && !item.isFeedbackLink);
    if (unauthVisibleItems.length > 0) {
        triggerContent = (
            <SidebarTrigger asChild>
                <button className="fixed top-4 left-4 z-50 p-2 bg-gray-800 text-white rounded-md">
                    <Menu size={24} />
                </button>
            </SidebarTrigger>
        );
    }
  }


  const currentNavConfig = authUser ? menuItems : menuItems.filter(item => isItemVisible(item, null));
  const currentFeedbackLink = authUser ? feedbackLink : (feedbackLink && isItemVisible(feedbackLink, null) ? feedbackLink : undefined);

  return (
    <Sidebar>
      {triggerContent}
      {/* Render SidebarContent if trigger is present, and either user is authenticated or there are unauth items */}
      {triggerContent && (authUser || currentNavConfig.some(item => !item.isAccordion && item.roles === 'unauthenticated') || currentNavConfig.some(item => item.isAccordion && item.children?.some(child => child.roles === 'unauthenticated'))) && (
        <SidebarContent className="w-72 bg-white dark:bg-gray-900 shadow-lg text-gray-900 dark:text-gray-100">
          <UiSheetHeader className="p-4 border-b dark:border-gray-700 text-left">
            <SheetTitle className="text-lg font-semibold">
              {authUser ? 'Menú Principal' : 'Navegación'}
            </SheetTitle>
            {userProfile?.email && (
              <SheetDescription className="sr-only">
                 {`Menú de navegación para ${userProfile.email}`}
              </SheetDescription>
            )}
            {!authUser && (
                <SheetDescription className="sr-only">
                    Menú de navegación para visitantes
                </SheetDescription>
            )}
          </UiSheetHeader>
          <SidebarMenu className="flex-grow p-4 space-y-2">
            <Accordion type="multiple" className="w-full">
              {currentNavConfig.map(item => renderNavItem(item))}
            </Accordion>
          </SidebarMenu>
          {currentFeedbackLink && (
            <SidebarFooter className="p-4 border-t dark:border-gray-700">
              {renderNavItem(currentFeedbackLink)}
            </SidebarFooter>
          )}
        </SidebarContent>
      )}
      {(authLoading || (!authUser && profileLoading)) && authUser && ( 
        <SidebarContent className="w-72 bg-white dark:bg-gray-900 shadow-lg text-gray-900 dark:text-gray-100">
           <div className="flex items-center justify-center h-full">
            <Loader2 size={32} className="animate-spin" />
          </div>
        </SidebarContent>
      )}
    </Sidebar>
  );
}
