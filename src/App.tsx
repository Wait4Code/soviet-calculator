import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Changelog } from './components/Changelog';
import { ProductionCalculator } from './components/ProductionCalculator';
import { Settings } from './components/Settings';
import { Tooltip } from './components/Tooltip';
import { supportedLngs, type SupportedLocale } from './i18n';

const languageFlags: Record<SupportedLocale, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
};

type Tab = 'industry' | 'settings';

function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('industry');

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-soviet-red shadow-lg">
        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <h1 className="text-5xl font-bold tracking-tight">{t('app.title')}</h1>
              <p className="text-lg text-gray-200 mt-1.5">{t('app.subtitle')}</p>
            </div>
            <div className="shrink-0">
              <Changelog inHeader />
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('industry')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'industry'
                    ? 'bg-gray-900 text-soviet-gold border-b-2 border-soviet-gold'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('nav.industry')}
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === 'settings'
                    ? 'bg-gray-900 text-soviet-gold border-b-2 border-soviet-gold'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('nav.settings')}
              </button>
            </div>
            <div className="flex items-center gap-1 py-1">
              {supportedLngs.map((lng) => (
                <Tooltip key={lng} content={t(`language.${lng}`)}>
                <button
                  type="button"
                  onClick={() => i18n.changeLanguage(lng)}
                  className={`p-1.5 text-xl rounded transition-colors ${
                    i18n.language === lng || i18n.language.startsWith(lng)
                      ? 'bg-soviet-gold text-gray-900'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {languageFlags[lng]}
                </button>
              </Tooltip>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - tous les onglets restent montés pour mémoriser leur état */}
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className={activeTab === 'industry' ? '' : 'hidden'}>
          <ProductionCalculator />
        </div>
        <div className={activeTab === 'settings' ? '' : 'hidden'}>
          <Settings />
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto bg-gray-800 border-t border-gray-700">
        <div className="container mx-auto px-4 py-6 text-gray-400 text-sm">
          <h2 className="text-base font-semibold text-gray-300 mb-3 text-center">{t('footer.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 max-w-3xl mx-auto">
            <p className="text-center md:text-left">
              <a
                href="https://www.youtube.com/@bballjo/featured"
                target="_blank"
                rel="noopener noreferrer"
                className="text-soviet-gold hover:underline"
              >
                Bballjo
              </a>
              {t('footer.thanksBballjoAfter')}
            </p>
            <p className="text-center md:text-left">
              <a
                href="https://github.com/KirkMcDonald"
                target="_blank"
                rel="noopener noreferrer"
                className="text-soviet-gold hover:underline"
              >
                Kirk McDonald
              </a>
              {t('footer.thanksKirkAfter')}
            </p>
            <p className="text-center md:text-left">
              <a
                href="https://steamcommunity.com/sharedfiles/filedetails/?id=3360799886"
                target="_blank"
                rel="noopener noreferrer"
                className="text-soviet-gold hover:underline"
              >
                Pav
              </a>
              {t('footer.thanksPavAfter')}
            </p>
            <p className="text-center md:text-left">
              <a
                href="https://steamcommunity.com/sharedfiles/filedetails/?id=3146397536"
                target="_blank"
                rel="noopener noreferrer"
                className="text-soviet-gold hover:underline"
              >
                Silent_Shadow
              </a>
              {t('footer.thanksSilentShadowAfter')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
