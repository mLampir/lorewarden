// Builds data/srd-5.2.1-rules.json from the Rules Glossary of the SRD 5.2.1, as converted to
// Markdown by the dnd-5e-srd-markdown project.
//
// Usage: node scripts/import-rules-glossary.mjs [git ref of downfallx/dnd-5e-srd-markdown, default "master"]
//
// The glossary is SRD 5.2.1 content by Wizards of the Coast LLC under CC BY 4.0.
import { writeFileSync } from 'node:fs';

const ref = process.argv[2] ?? 'master';
const url = `https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/${ref}/rules-glossary.md`;
const output = new URL('../data/srd-5.2.1-rules.json', import.meta.url);

const response = await fetch(url);
if (!response.ok) throw new Error(`rules-glossary.md: HTTP ${response.status}`);
const markdown = await response.text();

/** Turns an HTML table into one line per row, cells separated by " · ". */
function tableToText(html) {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map((cell) => cell[1].replace(/<[^>]+>/g, '').trim())
      .filter((cell) => cell !== '')
      .join(' · '),
  );
  return rows.filter((row) => row !== '').join('\n');
}

/** Plain text that reads well in a small popup: no Markdown marks, tables as lines. */
function plain(text) {
  return text
    .replace(/<table>[\s\S]*?<\/table>/g, tableToText)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[\s(“"])_(.+?)_(?=[\s.,;:)”"]|$)/gm, '$1$2')
    .replace(/^\s*[-*] /gm, '• ')
    .replace(/^#+ /gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const body = markdown.slice(markdown.indexOf('## Rules Definitions'));
const entries = body
  .split(/^#### /m)
  .slice(1)
  .map((chunk) => {
    const newline = chunk.indexOf('\n');
    const heading = chunk.slice(0, newline).trim();
    const match = /^(.*?)(?: \[(.+)\])?$/.exec(heading);
    const name = match[1].trim();
    const tag = match[2]?.trim();
    return {
      id: `srd-rule-${slug(name)}`,
      name,
      ...(tag ? { tag } : {}),
      text: plain(chunk.slice(newline + 1)),
    };
  });

writeFileSync(output, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Wrote ${entries.length} rules to ${output.pathname}`);
