'use client';

import { useState, useEffect, useCallback } from 'react';

// Define a type for the expected structure of your JSON translation files
// It allows for nested objects, where the final value is a string.
export interface NestedTranslationTexts {
  [key: string]: string | NestedTranslationTexts;
}

// Store loaded translations in a cache to avoid re-fetching the same profile
const translationsCache: Record<string, NestedTranslationTexts> = {};

interface UseTranslationsReturn {
  /**
   * Translation function.
   * @param key The dot-separated key of the string to translate (e.g., "loginPage.title").
   * @param fallback Optional fallback string if the key is not found.
   * @returns The translated string, fallback, or the key itself.
   */
  t: (key: string, fallback?: string) => string;
  /** Indicates if the translation file is currently being loaded. */
  isLoading: boolean;
  /** Contains an error message if loading failed, otherwise null. */
  error: string | null;
  /** The currently active (or attempted) translation profile name. */
  currentProfile: string | null;
}

/**
 * Custom hook to load and use translations from JSON files with nested structures.
 * @param profileName The name of the translation profile (e.g., "english-us") to load.
 *                    This corresponds to a filename like "english-us.json" in "@/app/textos/".
 * @returns An object with the translation function `t`, loading state, error state, and current profile.
 */
export function useTranslations(profileName?: string): UseTranslationsReturn {
  const [texts, setTexts] = useState<NestedTranslationTexts | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeProfileName, setActiveProfileName] = useState<string | null>(profileName || null);

  useEffect(() => {
    setActiveProfileName(profileName || null);
  }, [profileName]);

  useEffect(() => {
    if (!activeProfileName) {
      setTexts(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const loadTranslations = async () => {
      if (translationsCache[activeProfileName]) {
        setTexts(translationsCache[activeProfileName]);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const module = await import(`@/app/textos/${activeProfileName}.json`);
        const loadedTexts = module.default || module;

        if (typeof loadedTexts !== 'object' || loadedTexts === null) {
          throw new Error('Invalid translation file format. Expected a JSON object.');
        }

        translationsCache[activeProfileName] = loadedTexts as NestedTranslationTexts;
        setTexts(loadedTexts as NestedTranslationTexts);
      } catch (e: any) {
        console.error(`Failed to load translations for profile '${activeProfileName}':`, e);
        setError(`Failed to load texts for '${activeProfileName}'. Error: ${e.message}`);
        setTexts(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadTranslations();
  }, [activeProfileName]);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      if (isLoading) {
        return fallback || key; 
      }
      if (!texts) {
        return fallback || key; 
      }

      // Navigate through the nested object using the dot-separated key
      const keys = key.split('.');
      let current: string | NestedTranslationTexts | undefined = texts;

      for (const k of keys) {
        if (typeof current !== 'object' || current === null || !current.hasOwnProperty(k)) {
          current = undefined;
          break;
        }
        current = current[k] as string | NestedTranslationTexts; 
      }

      if (typeof current === 'string') {
        return current;
      }
      
      return fallback || key; // Key not found or resolved to an object, return fallback or key
    },
    [texts, isLoading]
  );

  return { t, isLoading, error, currentProfile: activeProfileName };
}
