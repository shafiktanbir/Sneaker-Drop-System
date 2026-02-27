#!/usr/bin/env node
/**
 * Test database connectivity. Run: node scripts/test-connection.js
 * Helps diagnose connection issues.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

const isNeon = url.includes('neon.tech');
const isPooler = url.includes('-pooler');

console.log('Testing connection...');
console.log('  Neon:', isNeon);
console.log('  Using pooler URL:', isPooler);

try {
  const { prisma } = await import('../src/lib/prisma.js');
  await prisma.$connect();
  console.log('OK: Connected successfully');
  await prisma.$disconnect();
} catch (err) {
  console.error('FAIL:', err.message);
  if (err.message?.includes('ETIMEDOUT') || err.code === 'ETIMEDOUT') {
    console.error('\nETIMEDOUT usually means:');
    console.error('  1. Firewall/network blocks outbound port 5432');
    console.error('  2. Try a different network (e.g. mobile hotspot)');
    console.error('  3. Verify DATABASE_URL and DIRECT_URL in .env');
  }
  process.exit(1);
}
