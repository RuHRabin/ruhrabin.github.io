// Runs inside GitHub Actions (Node has built-in fetch since v18).
// Pulls repo + release data ONCE, server-side, using the authenticated
// GITHUB_TOKEN (5,000 requests/hour) and writes a small static JSON file
// that the public site can read with zero GitHub API calls of its own.

import { writeFile, mkdir } from 'node:fs/promises';

const GH_USER = process.env.GH_USER || 'RuHRabin';
const TOKEN = process.env.GH_TOKEN;

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function getJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Request failed: ${url} (${res.status})`);
  }
  return res.json();
}

async function main() {
  const user = await getJson(`https://api.github.com/users/${GH_USER}`);
  const repos = await getJson(
    `https://api.github.com/users/${GH_USER}/repos?per_page=100&sort=pushed`
  );

  const nonForkRepos = repos.filter((r) => !r.fork);

  const releaseLists = await Promise.all(
    nonForkRepos.map(async (r) => {
      try {
        const list = await getJson(
          `https://api.github.com/repos/${GH_USER}/${r.name}/releases`
        );
        return list.map((rel) => ({ ...rel, repoName: r.name }));
      } catch {
        return [];
      }
    })
  );

  const releases = releaseLists
    .flat()
    .filter((r) => !r.draft)
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
    .map((r) => ({
      repoName: r.repoName,
      tag_name: r.tag_name,
      name: r.name,
      published_at: r.published_at,
      html_url: r.html_url,
      assets: (r.assets || []).map((a) => ({
        name: a.name,
        browser_download_url: a.browser_download_url,
      })),
    }));

  const trimmedRepos = repos.map((r) => ({
    name: r.name,
    description: r.description,
    language: r.language,
    stargazers_count: r.stargazers_count,
    pushed_at: r.pushed_at,
    fork: r.fork,
    homepage: r.homepage,
    has_pages: r.has_pages,
    html_url: r.html_url,
  }));

  const output = {
    generated_at: new Date().toISOString(),
    user: { public_repos: user.public_repos },
    repos: trimmedRepos,
    releases,
  };

  await mkdir('data', { recursive: true });
  await writeFile('data/github-sync.json', JSON.stringify(output, null, 2));

  console.log(
    `Wrote data/github-sync.json — ${trimmedRepos.length} repos, ${releases.length} releases.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
