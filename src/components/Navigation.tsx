'use client';

import Link from 'next/link';
import React, { ReactNode } from 'react';
import {
  Sidebar, SidebarTrigger, SidebarContent,
  SidebarMenu, SidebarMenuItem,
  SidebarFooter, SidebarHeader,
  useSidebar,
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

import { useInfoUsuario } from '@/components/layout/AppProviders';
import { RolUsuario, InfoUsuario } from 'shared/models/types';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string | ((residenciaIdRelativePath: string) => string);
  roles?: RolUsuario[] | 'authenticated' | 'unauthenticated';
  requiresResidenciaIdForHref?: boolean;
  isAccordion?: boolean;
  children?: NavItem[];
  isFeedbackLink?: boolean;
  checkVisibility?: (profile: InfoUsuario | null) => boolean;
  pathTemplate?: string;
}

const ALL_AUTHENTICATED_ROLES: RolUsuario[] = ['master', 'admin', 'director', 'residente', 'invitado', 'asistente', 'contador'];

const getNavConfig = (profile: InfoUsuario | null): NavItem[] => {
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
          id: 'crearResidenciaMaster',
          label: 'Crear residencia',
          icon: Building,
          href: '/restringido-master/crear-residencia',
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
          id: 'adminDietas',
          label: 'Dietas',
          icon: ListChecks,
          href: rLink,
          pathTemplate: '/gerencia/dietas',
          roles: ['director', 'asistente'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'adminGruposUsuarios',
          label: 'Restringir residentes',
          icon: UsersRound,
          href: rLink,
          pathTemplate: '/gerencia/grupos-usuarios',
          roles: ['director', 'asistente'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'configDelegacionAsistente',
          label: 'Delegar',
          icon: UserCog,
          href: rLink,
          pathTemplate: '/gerencia/delegar',
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
          pathTemplate: '/gerencia/actividades',
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
          id: 'adminHorariosComida',
          label: 'Horarios de comida',
          icon: Clock,
          href: rLink,
          pathTemplate: '/admin/horarios',
          roles: ['admin'],
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'adminComedores',
          label: 'Comedores',
          icon: Home,
          href: rLink,
          pathTemplate: '/admin/comedores',
          roles: ['admin'],
          requiresResidenciaIdForHref: true,
        },
      ],
    },

    // --- Group: Novedades ---
    {
      id: 'novedadesGroup',
      label: 'Novedades Operativas',
      icon: BookCopy,
      isAccordion: true,
      roles: ALL_AUTHENTICATED_ROLES,
      requiresResidenciaIdForHref: true,
      children: [
        {
          id: 'Mis Novedades',
          label: 'novedades',
          icon: Building,
          href: rLink,
          pathTemplate: '/mis-novedades',
          roles: ALL_AUTHENTICATED_ROLES,
          requiresResidenciaIdForHref: true,
        },
        {
          id: 'Aprobar novedades',
          label: 'Aprobar novedades',
          icon: FileText,
          href: rLink,
          pathTemplate: '/gerencia/novedades',
          roles: ['director', "asistente"],
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
          id: 'centrosDeCosto',
          label: 'Centros de costo',
          icon: Building,
          href: rLink,
          pathTemplate: '/contabilidad/centros-de-costo',
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

const isItemVisible = (item: NavItem, profile: InfoUsuario | null): boolean => {
  if (item.checkVisibility) {
    return item.checkVisibility(profile);
  }
  const userRoles = profile?.roles || [];
  const residenciaId = profile?.residenciaId;
  const isAuthenticated = !!profile?.usuarioId;

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
  const userInfo = useInfoUsuario();
  const { isMobile, setOpenMobile } = useSidebar(); 

  const navConfig = getNavConfig(userInfo);
  const feedbackLink = navConfig.find(item => item.isFeedbackLink);
  const menuItems = navConfig.filter(item => !item.isFeedbackLink);

  const renderNavItem = (item: NavItem): ReactNode => {
    if (!isItemVisible(item, userInfo)) return null;

    let hrefPath = '#';

    if (typeof item.href === 'string') {
      hrefPath = item.href;
      if (item.requiresResidenciaIdForHref && item.href.includes('[residenciaId]')) {
        if (userInfo?.residenciaId) {
          hrefPath = item.href.replace('[residenciaId]', userInfo.residenciaId);
        } else {
          hrefPath = '#';
        }
      }
    } else if (typeof item.href === 'function') {
      if (userInfo?.residenciaId && item.pathTemplate) {
        hrefPath = item.href(item.pathTemplate);
      } else if (!userInfo?.residenciaId && item.requiresResidenciaIdForHref) {
        hrefPath = '#';
      }
    }

    if (item.isAccordion) {
      const visibleChildren = item.children?.filter(child => isItemVisible(child, userInfo)) || [];
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
  if (!userInfo.usuarioId) {
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
  } else {
    triggerContent = (
      <SidebarTrigger asChild>
        <button className="fixed top-4 left-4 z-50 p-2 bg-gray-800 text-white rounded-md" title="Abrir menú">
          <Menu size={24} />
        </button>
      </SidebarTrigger>
    );
  }

  const isAuthenticated = !!userInfo.usuarioId;
  const currentNavConfig = isAuthenticated ? menuItems : menuItems.filter(item => isItemVisible(item, null));
  const currentFeedbackLink = isAuthenticated ? feedbackLink : (feedbackLink && isItemVisible(feedbackLink, null) ? feedbackLink : undefined);

  return (
    <Sidebar>
      {triggerContent}
      {triggerContent && (isAuthenticated || currentNavConfig.some(item => !item.isAccordion && item.roles === 'unauthenticated') || currentNavConfig.some(item => item.isAccordion && item.children?.some(child => child.roles === 'unauthenticated'))) && (
        <SidebarContent className="w-72 bg-white dark:bg-gray-900 shadow-lg text-gray-900 dark:text-gray-100 p-0">
          <SidebarHeader className="p-4 border-b dark:border-gray-700 text-left">
            {isMobile ? (
              <>
                <SheetTitle className="sr-only">{isAuthenticated ? 'Menú Principal' : 'Navegación'}</SheetTitle>
                <SheetDescription className="sr-only">
                  {userInfo?.email ? `Menú de navegación para ${userInfo.email}` : 'Menú de navegación para visitantes'}
                </SheetDescription>
              </>
            ) : null}
            <div className="text-lg font-semibold">
              {isAuthenticated ? 'Menú Principal' : 'Navegación'}
            </div>
            {!isMobile && userInfo?.email && (
              <div className="sr-only">
                 {`Menú de navegación para ${userInfo.email}`}
              </div>
            )}
            {!isMobile && !isAuthenticated && (
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
    </Sidebar>
  );
}
