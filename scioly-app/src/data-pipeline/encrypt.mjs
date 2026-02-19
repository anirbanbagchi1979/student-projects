import fs from 'fs';
import crypto from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const password = fs.readFileSync(join(__dirname, 'encryption_password.txt'), 'utf8').trim();
if (!password) {
  console.error("No password found in encryption_password.txt");
  process.exit(1);
}

const algorithm = 'aes-256-cbc';
const salt = crypto.randomBytes(16);
const key = crypto.scryptSync(password, salt, 32);
const iv = crypto.randomBytes(16);

const cipher = crypto.createCipheriv(algorithm, key, iv);
const input = fs.readFileSync(join(ROOT, 'questions.json'));
const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);

const out = Buffer.concat([salt, iv, encrypted]);

fs.writeFileSync(join(ROOT, 'questions.json.enc'), out);
console.log('Successfully encrypted questions.json to questions.json.enc');
