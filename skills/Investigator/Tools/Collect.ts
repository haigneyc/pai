/**
 * Collect.ts - Deterministic Repository Signal Collection
 *
 * Collects repository metadata WITHOUT using any LLM:
 * - Git metadata (branch, dirty state)
 * - File tree structure
 * - Entrypoint file contents (package.json, README, etc.)
 * - Grep-based pattern matches
 */

import { existsSync, statSync, readdirSync, readFileSync } from 'fs';
import { join, basename, relative } from 'path';
import type {
  RepoSignals,
  RepoMeta,
  FileTreeInfo,
  EntrypointFile,
  GrepPointer,
  GrepMatch,
  CollectOptions
} from './Schema';

const TOOL_VERSION = '1.0.0';
const GIT_PATH = '/usr/bin/git';
const GREP_PATH = '/usr/bin/grep';

// Directories to exclude from tree and grep
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'out',
  '.cache',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  'target',
  'vendor',
  'coverage',
  '.nyc_output',
  '.turbo',
  '.vercel'
]);

// Entrypoint files to read with their purposes
const ENTRYPOINT_FILES: Array<{ path: string; purpose: string; patterns?: string[] }> = [
  // Package managers / dependencies
  { path: 'package.json', purpose: 'Node.js dependencies and scripts' },
  { path: 'pyproject.toml', purpose: 'Python project configuration' },
  { path: 'requirements.txt', purpose: 'Python dependencies' },
  { path: 'Cargo.toml', purpose: 'Rust dependencies' },
  { path: 'go.mod', purpose: 'Go module dependencies' },
  { path: 'Gemfile', purpose: 'Ruby dependencies' },
  { path: 'pom.xml', purpose: 'Maven Java dependencies' },
  { path: 'build.gradle', purpose: 'Gradle build configuration' },

  // Documentation
  { path: 'README.md', purpose: 'Project documentation' },
  { path: 'README.rst', purpose: 'Project documentation' },
  { path: 'ARCHITECTURE.md', purpose: 'Architecture documentation' },
  { path: 'docs/ARCHITECTURE.md', purpose: 'Architecture documentation' },
  { path: 'CLAUDE.md', purpose: 'Claude-specific instructions' },
  { path: 'CONTRIBUTING.md', purpose: 'Contribution guidelines' },

  // Build / run
  { path: 'Makefile', purpose: 'Build commands' },
  { path: 'justfile', purpose: 'Just command runner' },
  { path: 'Taskfile.yml', purpose: 'Task command runner' },
  { path: 'docker-compose.yml', purpose: 'Docker services' },
  { path: 'docker-compose.yaml', purpose: 'Docker services' },
  { path: 'Dockerfile', purpose: 'Container build' },
  { path: 'Procfile', purpose: 'Process definitions' },

  // CI/CD
  { path: '.github/workflows/ci.yml', purpose: 'GitHub CI configuration' },
  { path: '.github/workflows/ci.yaml', purpose: 'GitHub CI configuration' },
  { path: '.github/workflows/main.yml', purpose: 'GitHub CI configuration' },
  { path: '.github/workflows/test.yml', purpose: 'GitHub test workflow' },
  { path: '.gitlab-ci.yml', purpose: 'GitLab CI configuration' },
  { path: '.circleci/config.yml', purpose: 'CircleCI configuration' },

  // Config
  { path: '.env.example', purpose: 'Environment variables template' },
  { path: 'tsconfig.json', purpose: 'TypeScript configuration' },
  { path: 'bun.toml', purpose: 'Bun configuration' },
  { path: 'vite.config.ts', purpose: 'Vite build configuration' },
  { path: 'next.config.js', purpose: 'Next.js configuration' },
  { path: 'nuxt.config.ts', purpose: 'Nuxt configuration' },

  // App entrypoints (checked with patterns)
  { path: 'src/index.ts', purpose: 'Main TypeScript entrypoint' },
  { path: 'src/main.ts', purpose: 'Main TypeScript entrypoint' },
  { path: 'src/app.ts', purpose: 'Application entrypoint' },
  { path: 'index.ts', purpose: 'Root TypeScript entrypoint' },
  { path: 'main.ts', purpose: 'Root TypeScript entrypoint' },
  { path: 'app.py', purpose: 'Python application entrypoint' },
  { path: 'main.py', purpose: 'Python main entrypoint' },
  { path: 'main.go', purpose: 'Go main entrypoint' },
  { path: 'cmd/main.go', purpose: 'Go command entrypoint' },
  { path: 'src/main.rs', purpose: 'Rust main entrypoint' },
];

// Grep patterns for quick discovery
const GREP_PATTERNS: Array<{ pattern: string; category: GrepPointer['category']; description: string }> = [
  // Bootstrap / server startup
  { pattern: 'createServer|app\\.listen|express\\(\\)|fastify\\(\\)|Hono\\(\\)', category: 'bootstrap', description: 'Server bootstrap patterns' },
  { pattern: 'FastAPI\\(\\)|Flask\\(__name__|Django', category: 'bootstrap', description: 'Python web frameworks' },
  { pattern: 'http\\.ListenAndServe|gin\\.Default\\(\\)', category: 'bootstrap', description: 'Go HTTP servers' },

  // Routing
  { pattern: 'router\\.|Route|@Get|@Post|@Put|@Delete|app\\.get\\(|app\\.post\\(', category: 'routing', description: 'HTTP route definitions' },
  { pattern: '@router|@api_view|path\\(|urlpatterns', category: 'routing', description: 'Python routing patterns' },

  // Database
  { pattern: 'createConnection|mongoose\\.connect|prisma|sequelize|typeorm', category: 'database', description: 'Database connections' },
  { pattern: 'SQLALCHEMY|create_engine|psycopg|asyncpg', category: 'database', description: 'Python database' },
  { pattern: 'sql\\.Open|gorm\\.Open|pgx\\.Connect', category: 'database', description: 'Go database' },

  // Testing
  { pattern: 'describe\\(|it\\(|test\\(|expect\\(', category: 'testing', description: 'JavaScript test patterns' },
  { pattern: 'def test_|pytest|unittest', category: 'testing', description: 'Python test patterns' },
  { pattern: 'func Test|testing\\.T', category: 'testing', description: 'Go test patterns' },

  // Configuration
  { pattern: 'process\\.env\\.|getenv|os\\.environ', category: 'config', description: 'Environment variable access' },
  { pattern: 'config\\.|settings\\.|Config\\(', category: 'config', description: 'Configuration patterns' },
];

// ============================================================================
// Main Collection Function
// ============================================================================

export async function collectRepoSignals(
  repoRoot: string,
  options: Partial<CollectOptions> = {}
): Promise<RepoSignals> {
  const opts: CollectOptions = {
    maxFiles: options.maxFiles ?? 50,
    maxFileSize: options.maxFileSize ?? 32 * 1024,
    treeDepth: options.treeDepth ?? 5,
    focus: options.focus ?? []
  };

  const [meta, fileTree, entrypoints, grepPointers] = await Promise.all([
    collectMeta(repoRoot),
    buildFileTree(repoRoot, opts.treeDepth),
    readEntrypoints(repoRoot, opts.maxFileSize),
    runGrepPointers(repoRoot, opts.maxFiles)
  ]);

  return {
    meta,
    fileTree,
    entrypoints,
    grepPointers
  };
}

// ============================================================================
// Metadata Collection
// ============================================================================

async function collectMeta(repoRoot: string): Promise<RepoMeta> {
  const repoName = basename(repoRoot);
  let gitBranch: string | null = null;
  let gitDirty = false;

  // Try to get git info
  try {
    const branchProc = Bun.spawn([GIT_PATH, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const branchOutput = await new Response(branchProc.stdout).text();
    await branchProc.exited;
    if (branchProc.exitCode === 0) {
      gitBranch = branchOutput.trim();
    }
  } catch {
    // Git not available or not a repo
  }

  try {
    const statusProc = Bun.spawn([GIT_PATH, 'status', '--porcelain'], {
      cwd: repoRoot,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const statusOutput = await new Response(statusProc.stdout).text();
    await statusProc.exited;
    if (statusProc.exitCode === 0) {
      gitDirty = statusOutput.trim().length > 0;
    }
  } catch {
    // Git not available
  }

  return {
    root: repoRoot,
    repoName,
    gitBranch,
    gitDirty,
    collectedAt: new Date().toISOString(),
    toolVersion: TOOL_VERSION
  };
}

// ============================================================================
// File Tree Building
// ============================================================================

interface TreeNode {
  name: string;
  type: 'file' | 'dir';
  children?: TreeNode[];
}

async function buildFileTree(repoRoot: string, maxDepth: number): Promise<FileTreeInfo> {
  let totalFiles = 0;
  let totalDirs = 0;
  let truncated = false;
  const maxNodes = 500;

  function walkDir(dir: string, depth: number): TreeNode[] {
    if (depth > maxDepth) {
      truncated = true;
      return [];
    }

    const nodes: TreeNode[] = [];
    let entries: string[];

    try {
      entries = readdirSync(dir).sort();
    } catch {
      return [];
    }

    for (const entry of entries) {
      if (totalFiles + totalDirs > maxNodes) {
        truncated = true;
        break;
      }

      if (entry.startsWith('.') && entry !== '.github') {
        continue;
      }

      if (EXCLUDE_DIRS.has(entry)) {
        continue;
      }

      const fullPath = join(dir, entry);
      let stat;

      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        totalDirs++;
        const children = walkDir(fullPath, depth + 1);
        nodes.push({ name: entry, type: 'dir', children });
      } else if (stat.isFile()) {
        totalFiles++;
        nodes.push({ name: entry, type: 'file' });
      }
    }

    return nodes;
  }

  const rootNodes = walkDir(repoRoot, 0);

  // Render tree to string
  function renderTree(nodes: TreeNode[], prefix: string = ''): string {
    let result = '';
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const isLast = i === nodes.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');

      result += `${prefix}${connector}${node.name}${node.type === 'dir' ? '/' : ''}\n`;

      if (node.children && node.children.length > 0) {
        result += renderTree(node.children, nextPrefix);
      }
    }
    return result;
  }

  const tree = renderTree(rootNodes);

  return {
    depth: maxDepth,
    totalFiles,
    totalDirs,
    truncated,
    tree
  };
}

// ============================================================================
// Entrypoint File Reading
// ============================================================================

async function readEntrypoints(repoRoot: string, maxSize: number): Promise<EntrypointFile[]> {
  const results: EntrypointFile[] = [];

  for (const entry of ENTRYPOINT_FILES) {
    const fullPath = join(repoRoot, entry.path);

    if (!existsSync(fullPath)) {
      continue;
    }

    try {
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;

      const sizeBytes = stat.size;
      let content: string;
      let truncated = false;

      if (sizeBytes > maxSize) {
        // Read only first maxSize bytes
        const buffer = Buffer.alloc(maxSize);
        const fd = Bun.file(fullPath);
        const slice = fd.slice(0, maxSize);
        content = await slice.text();
        truncated = true;
      } else {
        content = readFileSync(fullPath, 'utf-8');
      }

      results.push({
        path: entry.path,
        purpose: entry.purpose,
        sizeBytes,
        contentPreview: content,
        truncated
      });
    } catch {
      // Skip files we can't read
    }
  }

  return results;
}

// ============================================================================
// Grep Pattern Search
// ============================================================================

async function runGrepPointers(repoRoot: string, maxMatchesPerPattern: number): Promise<GrepPointer[]> {
  const results: GrepPointer[] = [];

  for (const pattern of GREP_PATTERNS) {
    const matches: GrepMatch[] = [];

    try {
      // Use grep with extended regex, recursive, line numbers
      // Exclude common non-source directories
      const proc = Bun.spawn([
        GREP_PATH,
        '-rn',
        '-E',
        pattern.pattern,
        '--include=*.ts',
        '--include=*.js',
        '--include=*.tsx',
        '--include=*.jsx',
        '--include=*.py',
        '--include=*.go',
        '--include=*.rs',
        '--include=*.java',
        '--include=*.rb',
        '--exclude-dir=node_modules',
        '--exclude-dir=.git',
        '--exclude-dir=dist',
        '--exclude-dir=build',
        '--exclude-dir=vendor',
        '--exclude-dir=__pycache__',
        '--exclude-dir=.venv',
        '--exclude-dir=target',
        '.'
      ], {
        cwd: repoRoot,
        stdout: 'pipe',
        stderr: 'pipe'
      });

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      // Parse grep output: ./path/to/file:linenum:content
      const lines = output.trim().split('\n').filter(l => l.length > 0);

      for (const line of lines.slice(0, maxMatchesPerPattern)) {
        const match = line.match(/^\.\/(.+?):(\d+):(.*)$/);
        if (match) {
          matches.push({
            file: match[1],
            line: parseInt(match[2], 10),
            content: match[3].trim().slice(0, 200)  // Limit content length
          });
        }
      }
    } catch {
      // Grep failed or no matches - continue
    }

    results.push({
      pattern: pattern.pattern,
      category: pattern.category,
      matchCount: matches.length,
      matches
    });
  }

  return results;
}
