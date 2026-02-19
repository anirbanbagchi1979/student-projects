import fs from 'fs';
import crypto from 'crypto';

const password = fs.readFileSync('encryption_password.txt', 'utf8').trim();
if (!password) {
  console.error("No password found in encryption_password.txt");
  process.exit(1);
}

const algorithm = 'aes-256-cbc';
const salt = crypto.randomBytes(16);
const key = crypto.scryptSync(password, salt, 32);
const iv = crypto.randomBytes(16);

const cipher = crypto.createCipheriv(algorithm, key, iv);
const input = fs.readFileSync('questions.json');
const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);

// we will prepend salt (16 bytes) and iv (16 bytes) to the encrypted data
const out = Buffer.concat([salt, iv, encrypted]);

fs.writeFileSync('questions.json.enc', out);
console.log('Successfully encrypted questions.json to questions.json.enc');
