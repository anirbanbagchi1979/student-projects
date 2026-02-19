import fs from 'fs';
import crypto from 'crypto';

const password = fs.readFileSync('encryption_password.txt', 'utf8').trim();
if (!password) {
    console.error("No password found in encryption_password.txt");
    process.exit(1);
}

const input = fs.readFileSync('questions.json.enc');

const algorithm = 'aes-256-cbc';
const salt = input.subarray(0, 16);
const iv = input.subarray(16, 32);
const encrypted = input.subarray(32);

const key = crypto.scryptSync(password, salt, 32);
const decipher = crypto.createDecipheriv(algorithm, key, iv);

const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

fs.writeFileSync('questions.json.decrypted', decrypted);
console.log('Successfully decrypted questions.json.enc to questions.json.decrypted');
