const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const localConfigPath = path.join(projectRoot, 'config', 'deploy.local.json');

function normalizeBaseHref(value) {
  const raw = String(value || '').trim();
  if (!raw) return '/';
  let normalized = raw;
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  if (!normalized.endsWith('/')) normalized = normalized + '/';
  return normalized;
}

function readBaseHref() {
  const envValue = process.env.LIFEHUB_BASE_HREF;
  if (envValue) return normalizeBaseHref(envValue);
  if (!fs.existsSync(localConfigPath)) return '/';

  try {
    const parsed = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
    return normalizeBaseHref(parsed.baseHref);
  } catch (error) {
    console.error('Config deploy non valida:', localConfigPath);
    console.error(error.message || error);
    process.exit(1);
  }
}

const baseHref = readBaseHref();
const rawCliArgs = process.argv.slice(2);
const cliArgs = [];

for (let i = 0; i < rawCliArgs.length; i += 1) {
  const arg = rawCliArgs[i];
  if (arg === '--prod' || arg === '--prod=true') {
    continue;
  }
  cliArgs.push(arg);
}

const hasConfigurationFlag = cliArgs.some((arg) =>
  arg === '--configuration' ||
  arg.startsWith('--configuration=') ||
  arg === '-c' ||
  arg.startsWith('-c=')
);
const hasBaseHrefFlag = cliArgs.some((arg) => arg === '--base-href' || arg.startsWith('--base-href='));

const args = ['ng', 'build'];
if (!hasConfigurationFlag) args.push('--configuration', 'production');
if (!hasBaseHrefFlag) args.push('--base-href', baseHref);
args.push(...cliArgs);

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npxCmd, args, { 
  cwd: projectRoot, 
  stdio: 'inherit',
  shell: process.platform === 'win32' 
});

process.exit(typeof result.status === 'number' ? result.status : 1);
