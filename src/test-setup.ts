import '@testing-library/jest-dom';
import i18n from '@/i18n';

// Force French language for tests so translation-based assertions work predictably
i18n.changeLanguage('fr');
