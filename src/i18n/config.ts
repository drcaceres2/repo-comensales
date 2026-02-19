import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

i18n
  // Carga los archivos json bajo demanda (lazy loading)
  // Busca en /public/locales/{lenguaje}/{namespace}.json
  .use(Backend)
  // Detecta el idioma del navegador automáticamente
  .use(LanguageDetector)
  // Pasa la instancia a react-i18next
  .use(initReactI18next)
  .init({    
    // MODO DEBUG: Útil en desarrollo para ver qué claves faltan
    debug: process.env.NODE_ENV === 'development',

    // ESTRATEGIA DE CASCADA (CRÍTICO)
    // Definimos explícitamente la jerarquía de fallbacks
    fallbackLng: {
      'es-HN': ['es'], // Si falta en HN, busca en ES
      'es-ES': ['es'], // Si falta en MX, busca en ES
      'default': ['es'] // Para cualquier otro caso, ve a ES
    },

    interpolation: {
      escapeValue: false, // React ya protege contra XSS, no necesitamos esto
    },

    // Configuración del Backend (dónde están tus archivos)
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    
    // Namespaces por defecto (puedes tener 'common', 'auth', 'admin')
    ns: ['common'],
    defaultNS: 'common',
  });

export default i18n;