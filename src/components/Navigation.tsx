'use client';

import Link from 'next/link';
import React, { useState, useEffect, ReactNode } from 'react';
import {
  Sidebar, SidebarTrigger, SidebarContent,
  SidebarMenu, SidebarMenuItem,
  SidebarFooter, SidebarHeader,
  useSidebar,  // Ensure SidebarHeader is imported from ./ui/sidebar
} from './ui/sidebar';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion'; 

import {
  Menu, Users,
  Building, Settings,
  ListChecks, CalendarDays,
  UsersRound, Bell, FileText,
  Home, PlusCircle, MessageSquare,
  Loader2, ShieldCheck, UserCog,
  LucideIcon, Info, Clock,
  ConciergeBell, Briefcase, UserSquare, 
  Drama, Handshake, ClipboardEdit, 
  BookCopy, UserCircle2, UserPlus,
} from 'lucide-react';

import {
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

import { useAuth } from '@/hooks/useAuth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from "firebase/firestore";
import { UserProfile, UserRole } from '../../shared/models/types';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string | ((residenciaIdRelativePath: string) => string);
  roles?: UserRole[] | 'authenticated' | 'unauthenticated';
  requiresResidenciaIdForHref?: boolean;
  isAccordion?: boolean;
  children?: NavItem[];
  isFeedbackLink?: boolean;
  checkVisibility?: (profile: UserProfile | null) => boolean;
  pathTemplate?: string;
}

const ALL_AUTHENTICATED_ROLES: UserRole[] = ['master', 'admin', 'director', 'residente', 'invitado', 'asistente', 'contador'];

const getNavConfig = (profile: UserProfile | null): NavItem[] => {
  const userRoles = profile?.roles || [];
  const residenciaId = profile?.residenciaId;

  const rLink = (path: string) => {
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
      id: 'elegirComidasGlobal',
      label: 'Elegir comidas (Global)',
      icon: ListChecks,
      href: (residenciaId && profile?.roles.includes('residente')) ? `/${residenciaId}/elegir-comidas` : '#',
      checkVisibility: (p) => !!p?.residenciaId && p.roles.includes('residente'),
      roles: ['residente'],
      requiresResidenciaIdForHref: true,
      pathTemplate: '/elegir-comidas',
    },
    {
      id: 'privacidad',
      label: 'Política de privacidad',
      icon: ShieldCheck, 
      href: '/privacidad',
      roles: 'unauthenticated',
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
      requiresResidenciaIdForHref: true,
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
          icon: Settings,
          href: rLink,
          pathTemplate: '/admin/atenciones',
          roles: ['director', 'asistente'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'adminDietas',
          label: 'Dietas',
          icon: ListChecks,
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
          id: 'invitadoBienvenida',
          label: 'Solicitar comidas (asistente)',
          icon: ConciergeBell,
          href: rLink,
          pathTemplate: '/bienvenida-invitados',
          roles: ['invitado'],
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
          icon: UserPlus,
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
      roles: ['admin', 'master'],
      children: [
        {
          id: 'adminGlobalUsers',
          label: 'Crear usuarios (Global)',
          icon: Users,
          href: '/admin/users',
          roles: ['admin', 'master'],
        },
        {
          id: 'adminCrearUsuarioPorCorreo',
          label: 'Enviar enlace creación usuario',
          icon: UserCog,
          href: rLink,
          pathTemplate: '/admin/crear-usuario-por-correo',
          roles: ['admin'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'adminResidenciaDashboard',
          label: 'Comedores y Horarios Admin',
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
        {
          id: 'adminHorariosComidaArchivo',
          label: 'Horarios carga masiva',
          icon: FileText,
          href: rLink,
          pathTemplate: '/admin/cargaHorarios',
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
      isFeedbackLink: true,
    },
  ];
};

const isItemVisible = (item: NavItem, profile: UserProfile | null): boolean => {
  if (item.checkVisibility) {
    return item.checkVisibility(profile);
  }
  const userRoles = profile?.roles || [];
  const residenciaId = profile?.residenciaId;
  const isAuthenticated = !!profile;

  if (item.requiresResidenciaIdForHref && !residenciaId && item.href !== '#') return false;

  if (item.roles) {
    if (item.roles === 'unauthenticated') {
      // Visible to everyone
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
  const { user: authUser, loading: authLoading } = useAuth();
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
      hrefPath = item.href;
      if (item.requiresResidenciaIdForHref && item.href.includes('[residenciaId]')) {
        if (userProfile?.residenciaId) {
          hrefPath = item.href.replace('[residenciaId]', userProfile.residenciaId);
        } else {
          hrefPath = '#';
        }
      }
    } else if (typeof item.href === 'function') {
      if (userProfile?.residenciaId && item.pathTemplate) {
        hrefPath = item.href(item.pathTemplate);
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
      <SidebarTrigger asChild>
        <button className="fixed top-4 left-4 z-50 p-2 bg-gray-800 text-white rounded-md" disabled title="Cargando menú">
          <Loader2 size={24} className="animate-spin" />
        </button>
      </SidebarTrigger>
    );
  } else if (authUser) {
    triggerContent = (
      <SidebarTrigger asChild>
        <button className="fixed top-4 left-4 z-50 p-2 bg-gray-800 text-white rounded-md" title="Abrir menú">
          <Menu size={24} />
        </button>
      </SidebarTrigger>
    );
  } else {
    const unauthNavConfig = getNavConfig(null);
    const unauthVisibleItems = unauthNavConfig.filter(item => isItemVisible(item, null) && !item.isFeedbackLink);
    if (unauthVisibleItems.length > 0) {
        triggerContent = (
            <SidebarTrigger asChild>
                <button className="fixed top-4 left-4 z-50 p-2 bg-gray-800 text-white rounded-md" title="Abrir menú">
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
      {triggerContent && (authUser || currentNavConfig.some(item => !item.isAccordion && item.roles === 'unauthenticated') || currentNavConfig.some(item => item.isAccordion && item.children?.some(child => child.roles === 'unauthenticated'))) && (
        <SidebarContent className="w-72 bg-white dark:bg-gray-900 shadow-lg text-gray-900 dark:text-gray-100 p-0">
          {/* Use custom SidebarHeader and plain divs for title/description */}
          <SidebarHeader className="p-4 border-b dark:border-gray-700 text-left">
            {isMobile ? (
              <>
                <SheetTitle className="sr-only">{authUser ? 'Menú Principal' : 'Navegación'}</SheetTitle>
                <SheetDescription className="sr-only">
                  {userProfile?.email ? `Menú de navegación para ${userProfile.email}` : 'Menú de navegación para visitantes'}
                </SheetDescription>
              </>
            ) : null}
            <div className="text-lg font-semibold">
              {authUser ? 'Menú Principal' : 'Navegación'}
            </div>
            {!isMobile && userProfile?.email && (
              <div className="sr-only">
                 {`Menú de navegación para ${userProfile.email}`}
              </div>
            )}
            {!isMobile && !authUser && (
                <div className="sr-only">
                    Menú de navegación para visitantes
                </div>
            )}
          </SidebarHeader>
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
        <SidebarContent className="w-72 bg-white dark:bg-gray-900 shadow-lg text-gray-900 dark:text-gray-100 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin" />
        </SidebarContent>
      )}
    </Sidebar>
  );
}
