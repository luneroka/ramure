import type { Lang } from '../i18n';

/** The BCP 47 locale for dates and numbers. */
export const localeOf = (lang: Lang): string => (lang === 'fr' ? 'fr-FR' : 'en-GB');
