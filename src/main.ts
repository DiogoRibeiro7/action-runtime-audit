import { appendFile } from 'node:fs/promises';
import { Auditor, githubReader, type Finding } from './audit.js';

const escapeCommand = (value: string): string => value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const code = (value: string): string => `\`${value.replace(/`/g, '\\`').replace(/\|/g, '\\|')}\``;

function summary(findings: Finding[], checked: number, errors: string[]): string {
  const lines = [`## Action runtime audit`, '', `Inspected ${checked} action references. Found ${findings.length} blocked runtimes and ${errors.length} scan errors.`, ''];
  if (findings.length) {
    lines.push('| Workflow | Reference chain | Runtime |', '| --- | --- | --- |');
    for (const finding of findings) lines.push(`| ${code(finding.workflow)} | ${finding.chain.map(code).join(' → ')} | ${code(finding.runtime)} |`);
    lines.push('');
  }
  if (errors.length) lines.push('### Scan errors', '', ...errors.map((error) => `- ${code(error)}`), '');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const token = process.env['INPUT_GITHUB-TOKEN'];
  const repository = process.env.GITHUB_REPOSITORY;
  const root = process.env.GITHUB_WORKSPACE;
  if (!token || !repository || !root) throw new Error('github-token, GITHUB_REPOSITORY and GITHUB_WORKSPACE are required');
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must be OWNER/REPO');
  const blocked = new Set((process.env['INPUT_BLOCKED-RUNTIMES'] || 'node12,node16,node20').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (!blocked.size) throw new Error('blocked-runtimes must contain at least one runtime');
  const audit = new Auditor({ owner, repo, ref: process.env.GITHUB_SHA || 'HEAD', root }, blocked, (context, file) => githubReader(context, file, token));
  const result = await audit.scan();
  console.log(summary(result.findings, result.checkedActions, result.errors));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary(result.findings, result.checkedActions, result.errors)}\n`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `findings=${JSON.stringify(result.findings)}\nscan-errors=${JSON.stringify(result.errors)}\nchecked-actions=${result.checkedActions}\n`);
  for (const finding of result.findings) console.log(`::error::${escapeCommand(`${finding.action} uses ${finding.runtime} (${finding.workflow})`)}`);
  for (const error of result.errors) console.log(`::error::${escapeCommand(error)}`);
  if (result.findings.length || result.errors.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`::error::${escapeCommand(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
});
