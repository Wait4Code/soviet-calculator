/**
 * Fetch GitHub releases and write src/data/changelog.json at build time.
 * Usage: node scripts/fetch-changelog.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const API_URL = 'https://api.github.com/repos/Wait4Code/soviet-calculator/releases';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'src', 'data', 'changelog.json');

const maxReleases = 20;

async function main() {
  let releases;
  try {
    const res = await fetch(API_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
    releases = await res.json();
  } catch (err) {
    console.error('fetch-changelog: failed to fetch releases:', err.message);
    process.exit(1);
  }

  const list = (Array.isArray(releases) ? releases : [])
    .filter((r) => !r.draft)
    .slice(0, maxReleases)
    .map((r) => ({
      tag_name: r.tag_name,
      name: r.name || r.tag_name,
      body: r.body || '',
      published_at: r.published_at || r.created_at,
      html_url: r.html_url,
      prerelease: !!r.prerelease,
    }));

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(list, null, 2), 'utf8');
  console.log(`fetch-changelog: wrote ${list.length} releases to src/data/changelog.json`);
}

main();
