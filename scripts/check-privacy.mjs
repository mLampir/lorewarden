// Fails if tracked files contain local paths or email addresses.
// Keeps accidental personal data out of this public repository.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const patterns = [
  { name: 'local path', regex: /(?:\/home\/[a-z_][\w-]*|\/Users\/[\w-]+|[A-Z]:\\Users\\)/ },
  { name: 'email address', regex: /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/i },
];

// Addresses that are meant to be public.
const allowed = [/@users\.noreply\.github\.com/, /noreply@anthropic\.com/, /^git@github\.com/];

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && file !== 'pnpm-lock.yaml' && file !== 'LICENSE');

const findings = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const { name, regex } of patterns) {
      const match = line.match(regex);
      if (match && !allowed.some((allow) => allow.test(match[0]))) {
        findings.push(`${file}:${index + 1}: ${name}: ${match[0]}`);
      }
    }
  });
}

if (findings.length > 0) {
  console.error(`Possible personal data found:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`No personal data patterns found in ${files.length} files.`);
