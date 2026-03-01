import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { ctxTraduccionSoportados } from "shared/models/types";

i18n
  // This backend uses dynamic imports with a relative path to load translations.
  // This gives the bundler (Turbopack/Webpack) a clear context for finding the files.
  .use(resourcesToBackend((language: string, namespace: string) => 
    import(`../locales/${language}/${namespace}.json`)
  ))
  .use(initReactI18next)
  .init({    
    lng: 'es',
    debug: process.env.NODE_ENV === 'development',

    fallbackLng: {
      'es-HN': ['es'],
      'es-ES': ['es'],
      'default': ['es']
    },

    supportedLngs: ctxTraduccionSoportados,
    
    interpolation: {
      escapeValue: false, // React already protects against XSS
    },
    
    ns: ['common', 'comedores', 'dietas', 'glosario'],
    defaultNS: 'common',

    react: {
      useSuspense: false,
    }
  });

export default i18n;
