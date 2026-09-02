import { NextResponse } from 'next/server';
import { auditLocalProject, auditProject } from '@/lib/local-project-analyzer';
import { RateLimitedError, createGitHubSource, inspectRepositoryVisibility } from '@/lib/project-source';
import { BADGE_COLORS, badgeStateFor, renderBadge, type BadgeState } from '@/lib/badge';
import { readCache, writeCache } from '@/lib/audit-cache';

export const dynamic = 'force-dynamic';

const SEGMENT = /^[A-Za-z0-9._-]+$/;

function isSafeSegment(value: string): boolean {
  return SEGMENT.test(value) && value !== '.' && value !== '..';
}

/**
 * A badge is an image in someone else's README. It always answers 200 with an
 * SVG, because a broken image tells the reader nothing; the failure is written
 * on the badge instead.
 */
function svg(state: BadgeState, cacheSeconds: number) {
  return new NextResponse(renderBadge(state), {
    headers: {
      'Content-Type': 'image/svg+xml',
      // README proxies cache aggressively; a few minutes keeps the badge fresh
      // without spending the GitHub rate limit on every page view.
      'Cache-Control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
    },
  });
}

export async function GET(request: Request) {
  const repoParam = new URL(request.url).searchParams.get('repo');

  if (!repoParam) {
    const report = await auditLocalProject();
    return svg(badgeStateFor(report), 0);
  }

  const [owner, repo, ...rest] = repoParam.split('/');

  if (!owner || !repo || rest.length > 0 || !isSafeSegment(owner) || !isSafeSegment(repo)) {
    return svg({ label: 'bad repo', color: BADGE_COLORS.unknown }, 300);
  }

  const cacheKey = `badge:${owner}/${repo}`;
  const cached = readCache<BadgeState>(cacheKey);
  if (cached) return svg(cached, 300);

  try {
    const token = process.env.GITHUB_TOKEN;
    const visibility = await inspectRepositoryVisibility(owner, repo, token);

    if (!visibility.exists || !visibility.isPublic) {
      const state = { label: 'not found', color: BADGE_COLORS.unknown };
      writeCache<BadgeState>(cacheKey, state);
      return svg(state, 300);
    }

    const report = await auditProject(createGitHubSource({ owner, repo, token }));
    const state = badgeStateFor(report);
    writeCache<BadgeState>(cacheKey, state);
    return svg(state, 300);
  } catch (error) {
    // Not cached: a rate limit or a network blip should not pin a failure onto
    // a repository for the next five minutes.
    const label = error instanceof RateLimitedError ? 'rate limited' : 'unavailable';
    return svg({ label, color: BADGE_COLORS.unknown }, 60);
  }
}
