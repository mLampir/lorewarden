// Fails if tracked files contain local paths, email addresses or private network addresses.
// Keeps accidental personal data out of this public repository.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const patterns = [
  { name: 'local path', regex: /(?:\/home\/[a-z_][\w-]*|\/Users\/[\w-]+|[a-z]:\\Users\\)/gi },
  { name: 'email address', regex: /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi },
  {
    name: 'private IP address',
    regex:
      /(?<![\d.])(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}(?![\d.]*\d)/g,
  },
];

// Addresses that are meant to be public.
const allowed = [
  /@users\.noreply\.github\.com$/i,
  /^noreply@anthropic\.com$/i,
  /^git@github\.com$/,
];

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && file !== 'pnpm-lock.yaml' && file !== 'LICENSE');

const findings = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const { name, regex } of patterns) {
      // Every match on the line counts, not only the first one.
      for (const [match] of line.matchAll(regex)) {
        if (!allowed.some((allow) => allow.test(match))) {
          findings.push(`${file}:${index + 1}: ${name}: ${match}`);
        }
      }
    }
  });
}

if (findings.length > 0) {
  console.error(`Possible personal data found:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`No personal data patterns found in ${files.length} files.`);
