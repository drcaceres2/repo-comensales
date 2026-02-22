'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Usuario } from 'shared/schemas/usuarios';

export function I18nLanguageSync() {
  const { i18n } = useTranslation();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      // Usuario no autenticado (p.ej. login), usamos el por defecto ('es')
      if (i18n.language !== 'es') i18n.changeLanguage('es');
      return;
    }

    const fetchProfileAndSetLanguage = async () => {
      try {
        const userDocRef = doc(db, 'usuarios', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const profile = userDocSnap.data() as Usuario;
          const roles = profile.roles || [];

          if (roles.includes('master')) {
            // Usuarios master siempre usan 'es'
            if (i18n.language !== 'es') i18n.changeLanguage('es');
          } else if (profile.residenciaId) {
            // Otros usuarios usan la configuración de su residencia
            const residenciaDocRef = doc(db, 'residencias', profile.residenciaId);
            const residenciaDocSnap = await getDoc(residenciaDocRef);

            if (residenciaDocSnap.exists()) {
              const residenciaData = residenciaDocSnap.data();
              const lang = residenciaData.contextoTraduccion || 'es';
              if (i18n.language !== lang) i18n.changeLanguage(lang);
            } else {
              // Fallback si no se encuentra la residencia
              if (i18n.language !== 'es') i18n.changeLanguage('es');
            }
          }
        }
      } catch (error) {
        console.error('Error synchronizing i18n language:', error);
      }
    };

    fetchProfileAndSetLanguage();
  }, [user, loading, i18n]);

  return null;
}
