import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { Auditor, githubReader, type Context } from '../src/audit.js';

const roots: string[] = [];
async function caller(workflow: string): Promise<Context> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runtime-audit-'));
  roots.push(root);
  await mkdir(path.join(root, '.github/workflows'), { recursive: true });
  await writeFile(path.join(root, '.github/workflows/ci.yml'), workflow);
  return { owner: 'acme', repo: 'consumer', ref: 'test-sha', root };
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

test('reports the exact nested action behind a composite dependency', async () => {
  const context = await caller('jobs:\n  ci:\n    steps:\n      - uses: acme/wrapper@v2\n');
  const files: Record<string, string> = {
    'acme/wrapper@v2:action.yml': 'runs:\n  using: composite\n  steps:\n    - uses: acme/legacy@aabbcc\n',
    'acme/legacy@aabbcc:action.yml': 'runs:\n  using: node20\n  main: dist/index.js\n',
  };
  const audit = new Auditor(context, new Set(['node20']), async (ref, file) => files[`${ref.owner}/${ref.repo}@${ref.ref}:${file}`] ?? null);
  const result = await audit.scan();
  assert.deepEqual(result.errors, []);
  assert.equal(result.checkedActions, 2);
  assert.deepEqual(result.findings, [{
    workflow: '.github/workflows/ci.yml',
    chain: ['.github/workflows/ci.yml', 'acme/wrapper@v2', 'acme/legacy@aabbcc'],
    action: 'acme/legacy@aabbcc', runtime: 'node20',
  }]);
});

test('follows a called reusable workflow and reads action.yaml', async () => {
  const context = await caller('jobs:\n  scan:\n    uses: acme/workflows/.github/workflows/build.yml@v1\n');
  const files: Record<string, string> = {
    'acme/workflows@v1:.github/workflows/build.yml': 'jobs:\n  build:\n    steps:\n      - uses: acme/old@v3\n',
    'acme/old@v3:action.yaml': 'runs:\n  using: node16\n  main: index.js\n',
  };
  const result = await new Auditor(context, new Set(['node16']), async (ref, file) => files[`${ref.owner}/${ref.repo}@${ref.ref}:${file}`] ?? null).scan();
  assert.deepEqual(result.errors, []);
  assert.equal(result.findings[0].action, 'acme/old@v3');
  assert.deepEqual(result.findings[0].chain, ['.github/workflows/ci.yml', 'acme/workflows/.github/workflows/build.yml@v1', 'acme/old@v3']);
});

test('fails visibly when referenced metadata cannot be read', async () => {
  const context = await caller('jobs:\n  ci:\n    steps:\n      - uses: acme/private@v1\n');
  const result = await new Auditor(context, new Set(['node20']), async () => null).scan();
  assert.equal(result.findings.length, 0);
  assert.match(result.errors[0], /action.yml or action.yaml not found \(or not accessible\)/);
});

test('resolves a root-level local action from the checked-out repository', async () => {
  const context = await caller('jobs:\n  ci:\n    steps:\n      - uses: ./\n');
  await writeFile(path.join(context.root!, 'action.yml'), 'runs:\n  using: node24\n  main: dist/index.js\n');
  const result = await new Auditor(context, new Set(['node20']), async () => { throw new Error('unexpected network access'); }).scan();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.findings, []);
  assert.equal(result.checkedActions, 1);
});

test('resolves ./ against the checkout and $/ against the composite action repository', async () => {
  const context = await caller('jobs:\n  ci:\n    steps:\n      - uses: acme/wrapper@v1\n');
  await mkdir(path.join(context.root!, 'local'), { recursive: true });
  await writeFile(path.join(context.root!, 'local/action.yml'), 'runs:\n  using: node16\n  main: index.js\n');
  const files: Record<string, string> = {
    'acme/wrapper@v1:action.yml': 'runs:\n  using: composite\n  steps:\n    - uses: ./local\n    - uses: $/internal\n',
    'acme/wrapper@v1:internal/action.yml': 'runs:\n  using: node20\n  main: index.js\n',
  };
  const result = await new Auditor(context, new Set(['node16', 'node20']), async (ref, file) => files[`${ref.owner}/${ref.repo}@${ref.ref}:${file}`] ?? null).scan();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.findings.map((finding) => finding.runtime), ['node16', 'node20']);
});

test('rejects dynamic refs and stops recursive composite cycles', async () => {
  const dynamic = await caller('jobs:\n  ci:\n    steps:\n      - uses: "acme/tool@${{ inputs.ref }}"\n');
  const dynamicResult = await new Auditor(dynamic, new Set(['node20']), async () => null).scan();
  assert.match(dynamicResult.errors[0], /cannot resolve action reference/);

  const cyclic = await caller('jobs:\n  ci:\n    steps:\n      - uses: acme/loop@v1\n');
  const result = await new Auditor(cyclic, new Set(['node20']), async () => 'runs:\n  using: composite\n  steps:\n    - uses: acme/loop@v1\n').scan();
  assert.match(result.errors[0], /recursive action or workflow reference/);
});

test('fetches the pinned metadata path', async () => {
  const requests: URL[] = [];
  const text = await githubReader(
    { owner: 'acme', repo: 'action', ref: 'a'.repeat(40) }, 'nested/action.yml', 'test-token',
    async (input, init) => {
      requests.push(input as URL);
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-token');
      return new Response('runs:\n  using: node24\n', { status: 200 });
    },
  );
  assert.equal(text, 'runs:\n  using: node24\n');
  assert.equal(requests[0].hostname, 'api.github.com');
  assert.equal(requests[0].searchParams.get('ref'), 'a'.repeat(40));
  assert.equal(requests[0].pathname, '/repos/acme/action/contents/nested/action.yml');
});
