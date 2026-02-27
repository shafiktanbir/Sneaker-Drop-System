#!/usr/bin/env node
/**
 * Run Prisma migrations with .env loaded from project root.
 * Usage: node scripts/migrate.js [dev|deploy]
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const cmd = process.argv[2] || 'deploy';
const valid = ['dev', 'deploy', 'resolve'];
if (!valid.includes(cmd)) {
  console.error('Usage: node scripts/migrate.js [dev|deploy|resolve] [-- prisma-args...]');
  process.exit(1);
}

const extraArgs = process.argv.slice(3).join(' ');
execSync(`npx prisma migrate ${cmd} ${extraArgs}`.trim(), { stdio: 'inherit', env: process.env });
