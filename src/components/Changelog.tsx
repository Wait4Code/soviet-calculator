import { useTranslation } from 'react-i18next';
import changelogData from '@/data/changelog.json';

const RELEASES_URL = 'https://github.com/Wait4Code/soviet-calculator/releases';
const MAX_RECENT = 3;

export interface ChangelogRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
}

const allReleases = changelogData as ChangelogRelease[];
const recentReleases = allReleases.slice(0, MAX_RECENT);

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

interface ChangelogProps {
  /** Style adapté au header (fond et bordure sur rouge) */
  inHeader?: boolean;
}

export function Changelog({ inHeader = false }: ChangelogProps) {
  const { t } = useTranslation();

  if (recentReleases.length === 0) return null;

  const asideClass = inHeader
    ? 'rounded-lg border border-white/15 bg-gray-900/85 backdrop-blur-sm px-4 py-3 text-xs text-gray-200 shadow-md font-mono'
    : 'rounded border border-gray-600/80 bg-gray-800/50 px-3 py-2 text-xs text-gray-300 font-mono';

  return (
    <aside
      className={asideClass}
      aria-label={t('changelog.recentChanges')}
    >
      <p className="font-medium text-gray-400 mb-2">
        {t('changelog.recentChanges')} (
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-soviet-gold hover:underline"
        >
          {t('changelog.github')}
        </a>
        ){t('changelog.afterLink')}
      </p>
      <ul className="space-y-1 text-gray-300">
        {recentReleases.map((release) => (
          <li key={release.tag_name} className="leading-tight">
            {formatDate(release.published_at)} – {release.name}
          </li>
        ))}
      </ul>
    </aside>
  );
}
