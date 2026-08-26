import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..');
export const RULES_FILE = path.join(ROOT_DIR, 'rules.json');
export const STATE_FILE = path.join(ROOT_DIR, 'state.json');

export const env = {
  ICS_URL: process.env.ICS_URL || '',
  LEAD_SECONDS: parseInt(process.env.LEAD_SECONDS || '60', 10),
  AUTO_JOIN: (process.env.AUTO_JOIN || 'true').toLowerCase() !== 'false',
  PORT: parseInt(process.env.PORT || '5959', 10),
};
