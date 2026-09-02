import fs from 'fs/promises';
import path from 'path';

/**
 * Where the audit reads files from.
 *
 * The analyzer only needs to ask for a path and get text back, so it does not
 * care whether the project sits on this disk, in a GitHub repository or in an
 * uploaded archive. Auditing only process.cwd() would mean every user of a
 * hosted deployment gets an audit of the server instead of their own code.
 */
export interface ProjectSource {
  /** Human readable description of where the files came from. */
  origin: string;
  /** Returns the file contents, or null when the file does not exist. */
  read(relativePath: string): Promise<string | null>;
}

export function createFileSystemSource(root: string = process.cwd()): ProjectSource {
  return {
    origin: root,
    async read(relativePath) {
      try {
        return await fs.readFile(path.join(root, relativePath), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

/** Useful for tests and for archives that are already in memory. */
export function createInMemorySource(
  files: Record<string, string>,
  origin = 'memory',
): ProjectSource {
  return {
    origin,
    async read(relativePath) {
      return Object.prototype.hasOwnProperty.call(files, relativePath)
        ? files[relativePath]
        : null;
    },
  };
}

export interface RepositoryVisibility {
  exists: boolean;
  isPublic: boolean;
  defaultBranch?: string;
}

/**
 * Asks GitHub whether a repository is public.
 *
 * The audit endpoint is open to anyone, so it must never lend the server's
 * token to read a repository the caller could not read themselves. The metadata
 * call is authenticated for rate-limit headroom — 5000 requests an hour instead
 * of 60 — and the answer is trusted only when GitHub says the repository is
 * public on both fields it reports.
 */
export async function inspectRepositoryVisibility(
  owner: string,
  repo: string,
  token?: string,
): Promise<RepositoryVisibility> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: 'no-store',
    },
  );

  if (response.status === 404) return { exists: false, isPublic: false };

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    private?: boolean;
    visibility?: string;
    default_branch?: string;
  };

  return {
    exists: true,
    isPublic: data.private === false && data.visibility === 'public',
    defaultBranch: data.default_branch,
  };
}

export interface GitHubSourceOptions {
  owner: string;
  repo: string;
  /** Branch, tag or commit. Defaults to the repository default branch. */
  ref?: string;
  /** Raises the rate limit and grants access to private repositories. */
  token?: string;
}

/**
 * Reads files through the GitHub contents API.
 *
 * Unauthenticated requests are limited to 60 per hour per IP, which is enough
 * for the handful of files an audit reads but not for repeated scans; pass a
 * token for anything beyond a demo.
 */
export function createGitHubSource(options: GitHubSourceOptions): ProjectSource {
  const { owner, repo, ref, token } = options;
  const refSuffix = ref ? `?ref=${encodeURIComponent(ref)}` : '';

  return {
    origin: `github.com/${owner}/${repo}${ref ? `@${ref}` : ''}`,
    async read(relativePath) {
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo,
      )}/contents/${relativePath}${refSuffix}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.raw',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: 'no-store',
      });

      if (response.status === 404) return null;

      if (!response.ok) {
        throw new Error(
          `GitHub returned ${response.status} ${response.statusText} for ${relativePath}`,
        );
      }

      return response.text();
    },
  };
}
