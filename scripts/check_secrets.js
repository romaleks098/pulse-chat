#!/usr/bin/env node

/**
 * Secret scanner to prevent accidental commits of credentials, tokens, or connection strings.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const SECRET_PATTERNS = [
  { name: 'PostgreSQL connection string with credentials', regex: /postgres(ql)?:\/\/[^:\s"']+:[^@\s"']+@[^\s"']+/i },
  { name: 'Database connection string with credentials', regex: /(mongodb(\+srv)?|mysql|redis):\/\/[^:\s"']+:[^@\s"']+@[^\s"']+/i },
  { name: 'Private Key header', regex: /-----BEGIN (RSA|EC|OPENSSH|PGP|PRIVATE) KEY-----/ },
  { name: 'GitHub Personal Access Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,255}/ },
  { name: 'Google API / OAuth Key', regex: /AIza[0-9A-Za-z-_]{35}/ },
  { name: 'Telegram Bot Token', regex: /(bot)?[0-9]{8,10}:[a-zA-Z0-9_-]{35}/ },
  { name: 'Generic High-Entropy API Secret Assignment', regex: /(api_key|api_secret|client_secret|jwt_secret|private_key)\s*[:=]\s*["'][A-Za-z0-9+/=_-]{16,}["']/i },
];

const IGNORED_FILES = [
  '.env.example',
  'package-lock.json',
  'scripts/check_secrets.js',
];

function scanStagedChanges() {
  let diff = '';
  try {
    diff = execSync('git diff --cached --name-only').toString().trim();
  } catch {
    return;
  }

  if (!diff) return;

  const stagedFiles = diff.split('\n').map((f) => f.trim()).filter(Boolean);
  let violations = 0;

  for (const file of stagedFiles) {
    if (IGNORED_FILES.some((ign) => file.endsWith(ign))) continue;
    if (!fs.existsSync(file)) continue;

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(line)) {
          // Alert without printing the secret value!
          console.error(`\x1b[31m[SECURITY ALERT] Potential secret detected!\x1b[0m`);
          console.error(`  File: ${file}:${i + 1}`);
          console.error(`  Rule: ${pattern.name}`);
          violations++;
        }
      }
    }
  }

  if (violations > 0) {
    console.error(`\x1b[31m\n[FAILED] Commit blocked. Found ${violations} potential secret(s).\x1b[0m`);
    console.error(`Please move secrets to environment variables or .env (which is in .gitignore).`);
    process.exit(1);
  }
}

scanStagedChanges();
console.log('✅ [Security] Secret scan passed: no secrets found in staged files.');
