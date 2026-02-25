import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';

i18n
  // Carga los archivos json bajo demanda (lazy loading)
  // Busca en /public/locales/{lenguaje}/{namespace}.json
  .use(Backend)
  // Pasa la instancia a react-i18next
  .use(initReactI18next)
  .init({    
    lng: 'es', // Idioma por defecto (por ejemplo para master)
    // MODO DEBUG: Útil en desarrollo para ver qué claves faltan
    debug: process.env.NODE_ENV === 'development',

    // ESTRATEGIA DE CASCADA
    fallbackLng: {
      'es-HN': ['es'], // Si falta en HN, busca en ES
      'es-ES': ['es'], // Si falta en MX, busca en ES
      'default': ['es'] // Para cualquier otro caso, ve a ES
    },

    // LENGUAJES SOPORTADOS
    supportedLngs: ['es', 'es-HN', 'es-ES'],
    
    interpolation: {
      escapeValue: false, // React ya protege contra XSS, no necesitamos esto
    },

    // Configuración del Backend (dónde están tus archivos)
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    
    ns: ['common', 'comedores', 'dietas', 'glosario'],
    defaultNS: 'common',

    react: {
      useSuspense: false,
    }
  });

// Logs de depuración para desarrollo
/*if (process.env.NODE_ENV === 'development') {
  i18n.on('failedLoading', (lng, ns, msg) => {
    console.error(`🌐 i18n Error: [${lng}] [${ns}] -> ${msg}`);
  });
  i18n.on('initialized', () => {
    console.log('🌐 i18n: Listo. Idiomas cargados:', i18n.languages);
  });
}*/

export default i18n;