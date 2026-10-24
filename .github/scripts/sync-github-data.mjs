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

// Follow pagination so the site keeps working past 100 repositories.
async function getAll(url) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await getJson(`${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function main() {
  const user = await getJson(`https://api.github.com/users/${GH_USER}`);
  const repos = await getAll(`https://api.github.com/users/${GH_USER}/repos?sort=pushed`);

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

  // pushed_at moves whenever ANY actor pushes, including bots (scheduled data
  // refreshes, the sync commits of this very repo). The site uses "how recently
  // was this worked on" to place each repo on its orbit, so ask for the latest
  // commit authored by the owner instead. Falls back to pushed_at on the site
  // when this is null (empty repo, commits under an unlinked e-mail address).
  const lastCommit = new Map(
    await Promise.all(
      nonForkRepos.map(async (r) => {
        try {
          const list = await getJson(
            `https://api.github.com/repos/${GH_USER}/${r.name}/commits?author=${GH_USER}&per_page=1`
          );
          const c = list[0] && list[0].commit;
          return [r.name, (c && ((c.committer && c.committer.date) || (c.author && c.author.date))) || null];
        } catch {
          return [r.name, null];
        }
      })
    )
  );

  const trimmedRepos = repos.map((r) => ({
    name: r.name,
    description: r.description,
    language: r.language,
    stargazers_count: r.stargazers_count,
    pushed_at: r.pushed_at,
    last_commit_at: lastCommit.get(r.name) || null,
    created_at: r.created_at,
    topics: Array.isArray(r.topics) ? r.topics : [],
    license: r.license ? { spdx_id: r.license.spdx_id, name: r.license.name } : null,
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
