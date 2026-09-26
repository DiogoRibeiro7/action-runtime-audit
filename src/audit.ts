import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

export type Context = { owner: string; repo: string; ref: string; root?: string };
export type Finding = { workflow: string; chain: string[]; action: string; runtime: string };
export type Result = { findings: Finding[]; checkedActions: number; errors: string[] };
export type RemoteReader = (context: Context, file: string) => Promise<string | null>;

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
const entries = (value: unknown): [string, unknown][] => Object.entries(object(value));
const steps = (value: unknown): RecordValue[] =>
  Array.isArray(value) ? value.map(object) : [];

function document(source: string, label: string): RecordValue {
  const value: unknown = YAML.parse(source, { uniqueKeys: true });
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${label}: expected a YAML mapping`);
  }
  return object(value);
}

function safePath(value: string): string {
  const clean = path.posix.normalize(value.replace(/^\.\//, ''));
  if (!clean || clean === '.' || clean === '..' || clean.startsWith('../') || clean.startsWith('/')) {
    throw new Error(`unsafe action path: ${value}`);
  }
  return clean;
}

export async function githubReader(
  context: Context,
  file: string,
  token: string,
  request: typeof fetch = fetch,
): Promise<string | null> {
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/contents/${safePath(file).split('/').map(encodeURIComponent).join('/')}`,
  );
  url.searchParams.set('ref', context.ref);
  const response = await request(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'action-runtime-audit',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${context.owner}/${context.repo}@${context.ref}:${file}: GitHub returned ${response.status}`);
  const source = await response.text();
  if (source.length > 1_000_000) throw new Error(`${file}: metadata is larger than 1 MB`);
  return source;
}

export class Auditor {
  private readonly cache = new Map<string, Promise<string | null>>();
  private readonly findings: Finding[] = [];
  private readonly errors: string[] = [];
  private checkedActions = 0;
  private traversed = 0;

  constructor(
    private readonly caller: Context,
    private readonly blocked: ReadonlySet<string>,
    private readonly remote: RemoteReader,
  ) {}

  private async read(context: Context, file: string): Promise<string | null> {
    const clean = safePath(file);
    if (context.root) {
      try {
        return await readFile(path.join(context.root, clean), 'utf8');
      } catch (error) {
        if (object(error).code === 'ENOENT') return null;
        throw error;
      }
    }
    const key = `${context.owner}/${context.repo}@${context.ref}:${clean}`;
    if (!this.cache.has(key)) this.cache.set(key, this.remote(context, clean));
    return this.cache.get(key)!;
  }

  private async metadata(context: Context, directory: string): Promise<RecordValue> {
    for (const name of ['action.yml', 'action.yaml']) {
      const file = directory ? `${directory}/${name}` : name;
      const source = await this.read(context, file);
      if (source !== null) return document(source, `${context.owner}/${context.repo}@${context.ref}:${file}`);
    }
    throw new Error(`${context.owner}/${context.repo}@${context.ref}:${directory || '.'}: action.yml or action.yaml not found (or not accessible)`);
  }

  private target(value: string, source: Context, step = false): { context: Context; file: string; label: string } | null {
    if (value.startsWith('docker://')) return null;
    if (value === './' || value === '$/') return { context: value === './' && step ? this.caller : source, file: '', label: value };
    if (value.startsWith('./')) {
      return { context: step ? this.caller : source, file: safePath(value.slice(2)), label: value };
    }
    if (value.startsWith('$/')) {
      return { context: source, file: safePath(value.slice(2)), label: value };
    }
    const match = /^([\w.-]+)\/([\w.-]+)(\/[^@\s]*)?@([^@\s]+)$/.exec(value);
    if (!match) throw new Error(`cannot resolve action reference ${JSON.stringify(value)}`);
    return {
      context: { owner: match[1], repo: match[2], ref: match[4] },
      file: match[3] ? safePath(match[3].slice(1)) : '',
      label: value,
    };
  }

  private guard(key: string, stack: ReadonlySet<string>): Set<string> {
    if (stack.has(key)) throw new Error(`recursive action or workflow reference: ${key}`);
    if (++this.traversed > 256 || stack.size >= 16) throw new Error('reference traversal limit exceeded');
    return new Set([...stack, key]);
  }

  private async action(value: string, context: Context, workflow: string, chain: string[], stack: ReadonlySet<string>): Promise<void> {
    const target = this.target(value, context, true);
    if (!target) return;
    const key = `${target.context.owner}/${target.context.repo}@${target.context.ref}:${target.file}`;
    const next = this.guard(key, stack);
    const metadata = await this.metadata(target.context, target.file);
    this.checkedActions++;
    const runtime = object(metadata.runs).using;
    if (typeof runtime !== 'string') throw new Error(`${key}: missing runs.using`);
    const trail = [...chain, target.label];
    if (this.blocked.has(runtime.toLowerCase())) {
      this.findings.push({ workflow, chain: trail, action: target.label, runtime });
    }
    if (runtime === 'composite') {
      for (const step of steps(object(metadata.runs).steps)) {
        if (typeof step.uses === 'string') await this.action(step.uses, target.context, workflow, trail, next);
      }
    }
  }

  private async workflow(source: string, context: Context, file: string, chain: string[], stack: ReadonlySet<string>): Promise<void> {
    const key = `${context.owner}/${context.repo}@${context.ref}:${file}`;
    const next = this.guard(key, stack);
    const data = document(source, key);
    for (const [, rawJob] of entries(data.jobs)) {
      const job = object(rawJob);
      for (const step of steps(job.steps)) {
        if (typeof step.uses === 'string') await this.action(step.uses, context, chain[0], chain, next);
      }
      if (typeof job.uses === 'string') {
        const target = this.target(job.uses, context);
        if (!target) throw new Error(`invalid reusable workflow reference: ${job.uses}`);
        if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(target.file)) throw new Error(`unsupported reusable workflow reference: ${job.uses}`);
        const nested = await this.read(target.context, target.file);
        if (nested === null) throw new Error(`reusable workflow not found (or not accessible): ${job.uses}`);
        await this.workflow(nested, target.context, target.file, [...chain, job.uses], next);
      }
    }
  }

  async scan(): Promise<Result> {
    if (!this.caller.root) throw new Error('caller root is required');
    const directory = path.join(this.caller.root, '.github/workflows');
    const files = (await readdir(directory)).filter((file) => /\.ya?ml$/.test(file)).sort();
    if (files.length === 0) throw new Error('no workflow files found');
    for (const file of files) {
      const workflow = `.github/workflows/${file}`;
      try {
        const source = await this.read(this.caller, workflow);
        await this.workflow(source!, this.caller, workflow, [workflow], new Set());
      } catch (error) {
        this.errors.push(`${workflow}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { findings: this.findings, checkedActions: this.checkedActions, errors: this.errors };
  }
}
