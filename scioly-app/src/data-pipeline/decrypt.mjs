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

const input = fs.readFileSync(join(ROOT, 'questions.json.enc'));

const algorithm = 'aes-256-cbc';
const salt = input.subarray(0, 16);
const iv = input.subarray(16, 32);
const encrypted = input.subarray(32);

const key = crypto.scryptSync(password, salt, 32);
const decipher = crypto.createDecipheriv(algorithm, key, iv);

const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

fs.writeFileSync(join(ROOT, 'questions.json.decrypted'), decrypted);
console.log('Successfully decrypted questions.json.enc to questions.json.decrypted');
