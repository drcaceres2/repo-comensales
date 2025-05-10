
'use client';

import Link from 'next/link';
import React, { useState, useEffect, ReactNode } from 'react';
import {
  Sidebar,
  SidebarTrigger,
  SidebarContent,
  // SidebarHeader, // We will use SheetHeader from ui/sheet for the title section
  SidebarMenu,
  SidebarMenuItem,
  SidebarFooter,
} from './ui/sidebar';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';
import { Menu, Users, Building, Settings, ListChecks, CalendarDays, UsersRound, Bell, FileText, Home, PlusCircle, MessageSquare, Loader2, ShieldCheck, UserCog, LucideIcon } from 'lucide-react';

// Import SheetTitle, SheetDescription, and SheetHeader for accessibility
import {
  SheetTitle,
  SheetDescription,
  SheetHeader as UiSheetHeader, // Aliased to avoid name conflict if any
} from '@/components/ui/sheet';

import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from "firebase/firestore";
import { UserProfile, UserRole } from '@/models/firestore';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string | ((residenciaId: string) => string);
  roles?: UserRole[]; 
  requiresResidenciaIdForHref?: boolean; 
  isAccordion?: boolean;
  children?: NavItem[];
  isFeedbackLink?: boolean;
  checkVisibility?: (profile: UserProfile | null) => boolean;
}

const getNavConfig = (profile: UserProfile | null): NavItem[] => {
  const userRoles = profile?.roles || [];
  const residenciaId = profile?.residenciaId;

  const hasRole = (role: UserRole) => userRoles.includes(role);
  const rLink = (path: string) => {
    if (!residenciaId) return '#'; 
    return `/${residenciaId}${path}`;
  };

  return [
    {
      id: 'home',
      label: 'Página principal',
      icon: Home,
      href: '/',
    },
    {
      id: 'createResidencia',
      label: 'Crear residencia',
      icon: PlusCircle,
      href: '/admin/crear-residencia',
      roles: ['master'],
    },
    {
      id: 'administrar',
      label: 'Administrar',
      icon: UserCog,
      isAccordion: true,
      roles: ['admin', 'master'],
      children: [
        {
          id: 'adminUsers',
          label: 'Usuarios',
          icon: Users,
          href: '/admin/users',
          roles: ['admin', 'master'],
        },
        {
          id: 'adminResidencias',
          label: 'Residencias',
          icon: Building,
          href: '/admin/residencia',
          roles: ['admin', 'master'],
        },
      ],
    },
    {
      id: 'miResidencia',
      label: 'Mi Residencia',
      icon: ShieldCheck,
      isAccordion: true,
      roles: ['residente', 'director', 'invitado', 'asistente', 'auditor'],
      requiresResidenciaIdForHref: true, 
      checkVisibility: (p) => !!p?.residenciaId && (hasRole('residente') || hasRole('director') || hasRole('invitado') || hasRole('asistente') || hasRole('auditor')),
      children: [
        {
          id: 'elegirComidas',
          label: 'Elegir comidas',
          icon: ListChecks,
          href: rLink,
          requiresResidenciaIdForHref: true,
          roles: ['residente', 'director', 'asistente'],
        },
        {
          id: 'actividades',
          label: 'Actividades',
          icon: CalendarDays,
          href: rLink,
          requiresResidenciaIdForHref: true,
          roles: ['residente', 'director', 'asistente'],
        },
        {
          id: 'invitados',
          label: 'Invitados',
          icon: UsersRound,
          href: rLink,
          requiresResidenciaIdForHref: true,
          roles: ['residente', 'director', 'invitado', 'asistente'],
        },
        {
          id: 'recordatorios',
          label: 'Recordatorios',
          icon: Bell,
          href: rLink,
          requiresResidenciaIdForHref: true,
          roles: ['residente', 'director', 'asistente'],
        },
        {
          id: 'reporteComensales',
          label: 'Reporte Comensales',
          icon: FileText,
          href: rLink,
          requiresResidenciaIdForHref: true,
          roles: ['director', 'auditor'],
        },
      ],
    },
    {
      id: 'feedback',
      label: 'Pedir a la administración',
      icon: MessageSquare,
      href: '/feedback',
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

  if (item.requiresResidenciaIdForHref && !residenciaId) return false;
  if (item.roles && !item.roles.some(role => userRoles.includes(role))) return false;
  
  if (item.isAccordion && item.children) {
    return item.children.some(child => isItemVisible(child, profile));
  }
  return true;
};

export function Navigation() {
  const [authUser, authLoading] = useAuthState(auth);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(true);

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

    let hrefPath = '';
    if (typeof item.href === 'string') {
      hrefPath = item.href;
    } else if (typeof item.href === 'function') {
      const pathTemplate = item.id === 'elegirComidas' ? '/elegir-comidas' :
                         item.id === 'actividades' ? '/actividades' :
                         item.id === 'invitados' ? '/bienvenida-invitados' :
                         item.id === 'recordatorios' ? '/recordatorios' :
                         item.id === 'reporteComensales' ? '/solicitar-comensales' : '';
      hrefPath = userProfile?.residenciaId ? item.href(pathTemplate) : '#';
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
        <Link href={hrefPath} className="flex items-center space-x-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-sm">
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
  }

  return (
    <Sidebar>
      {triggerContent} 
      {authUser && !authLoading && !profileLoading && (
        <SidebarContent className="w-72 bg-white dark:bg-gray-900 shadow-lg text-gray-900 dark:text-gray-100">
          <UiSheetHeader className="p-4 border-b dark:border-gray-700 text-left">
            <SheetTitle className="text-lg font-semibold">
              Menú Principal
            </SheetTitle>
            {userProfile?.email && (
              <SheetDescription className="sr-only">
                 {`Menú de navegación para ${userProfile.email}`}
              </SheetDescription>
            )}
          </UiSheetHeader>
          <SidebarMenu className="flex-grow p-4 space-y-2">
            <Accordion type="multiple" className="w-full">
              {menuItems.map(item => renderNavItem(item))}
            </Accordion>
          </SidebarMenu>
          {feedbackLink && isItemVisible(feedbackLink, userProfile) && (
            <SidebarFooter className="p-4 border-t dark:border-gray-700">
              {renderNavItem(feedbackLink)}
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
