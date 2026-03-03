/**
 * i18n : français (défaut), anglais, détection par navigateur.
 * Pour ajouter une langue (ex. de) :
 * 1. Créer src/locales/de.json (copier fr.json ou en.json et traduire)
 * 2. Importer : import de from './locales/de.json';
 * 3. Ajouter dans resources : de: { translation: de }
 * 4. Ajouter dans supportedLngs : ['fr', 'en', 'de']
 * 5. Ajouter la clé language.de dans chaque fichier de locale
 * 6. Ajouter le bouton dans App.tsx (supportedLngs inclut déjà la nouvelle langue)
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import fr from './locales/fr.json';
import en from './locales/en.json';
import buildingNamesFr from './locales/buildingNamesFr.json';
import buildingNamesEn from './locales/buildingNamesEn.json';

export const supportedLngs = ['fr', 'en'] as const;
export type SupportedLocale = (typeof supportedLngs)[number];

const resources = {
  fr: { translation: fr, buildings: buildingNamesFr as Record<string, string> },
  en: { translation: en, buildings: buildingNamesEn as Record<string, string> },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: [...supportedLngs],
    fallbackLng: 'fr',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'soviet-calculator-lang',
    },
  });

export default i18n;
