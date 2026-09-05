export interface PullRequestFile {
  path: string;
  content: string;
}

export interface CreatePullRequestOptions {
  repoOwner: string;
  repoName: string;
  title: string;
  body: string;
  branchName: string;
  /** A single file to write. Kept for callers that only change one. */
  filePath?: string;
  fileContent?: string;
  /** Several files in one pull request, which is how a multi-file fix arrives. */
  files?: PullRequestFile[];
}

export class GitHubService {
  private token: string | undefined;

  constructor() {
    this.token = process.env.GITHUB_TOKEN;
  }

  private getHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };
  }

  public hasToken(): boolean {
    return !!this.token;
  }

  public async createPullRequest(options: CreatePullRequestOptions): Promise<{ prUrl: string; prNumber: number }> {
    if (!this.token) {
      throw new Error('GITHUB_TOKEN not found in environment variables. Please check your .env.local file.');
    }

    const { repoOwner, repoName, title, body, branchName } = options;
    const baseUrl = `https://api.github.com/repos/${repoOwner}/${repoName}`;

    const files: PullRequestFile[] =
      options.files ??
      (options.filePath !== undefined && options.fileContent !== undefined
        ? [{ path: options.filePath, content: options.fileContent }]
        : []);

    if (files.length === 0) {
      throw new Error('No file contents were given, so there is nothing to open a pull request for.');
    }

    // 1. Get default branch SHA
    const repoRes = await fetch(baseUrl, { headers: this.getHeaders() });
    if (!repoRes.ok) throw new Error(`Failed to fetch repo data: ${repoRes.statusText}`);
    const repoData = await repoRes.json();
    const defaultBranch = repoData.default_branch;

    const refRes = await fetch(`${baseUrl}/git/ref/heads/${defaultBranch}`, { headers: this.getHeaders() });
    if (!refRes.ok) throw new Error(`Failed to fetch ref data: ${refRes.statusText}`);
    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    // 2. Create new branch
    const branchRes = await fetch(`${baseUrl}/git/refs`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    });
    if (!branchRes.ok && branchRes.status !== 422) {
      throw new Error(`Failed to create branch: ${branchRes.statusText}`);
    }

    // 3. Write each file in sequence. The contents API takes one path per call,
    //    and each write needs the current SHA when the file already exists.
    //    Sequential rather than parallel because every commit moves the branch
    //    head, and concurrent writes race for the same parent.
    for (const file of files) {
      let fileSha: string | undefined;
      const fileGetRes = await fetch(`${baseUrl}/contents/${file.path}?ref=${branchName}`, {
        headers: this.getHeaders(),
      });
      if (fileGetRes.ok) {
        const fileData = await fileGetRes.json();
        fileSha = fileData.sha;
      }

      const filePutRes = await fetch(`${baseUrl}/contents/${file.path}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          message: `sentinel: patch ${file.path}`,
          content: Buffer.from(file.content).toString('base64'),
          branch: branchName,
          sha: fileSha,
        }),
      });
      if (!filePutRes.ok) {
        throw new Error(`Failed to write ${file.path} to branch: ${filePutRes.statusText}`);
      }
    }

    // 4. Open Pull Request
    const prRes = await fetch(`${baseUrl}/pulls`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        title,
        body,
        head: branchName,
        base: defaultBranch,
      }),
    });

    if (!prRes.ok) {
      const prError = await prRes.json();
      throw new Error(`Failed to create Pull Request: ${prError.message || prRes.statusText}`);
    }

    const prData = await prRes.json();
    return {
      prUrl: prData.html_url,
      prNumber: prData.number,
    };
  }
}
