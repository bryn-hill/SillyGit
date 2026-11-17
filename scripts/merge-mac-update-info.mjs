#!/usr/bin/env node
// electron-builder writes dist/latest-mac.yml, the file electron-updater
// reads to find a macOS update, for each build. The release builds arm64 and
// x64 one after the other (each needs its own Claude Agent SDK binary), so
// the second build overwrites the first's. This merges them: one file that
// lists both architectures' zips, which electron-updater picks between by
// whether the file name has "arm64" in it.
//
//   node scripts/merge-mac-update-info.mjs <out.yml> <a.yml> <b.yml> [...]
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

/** Merges parsed latest-mac.yml documents into one. They must all be the same version. */
export function mergeUpdateInfo(docs) {
  if (docs.length === 0) throw new Error('nothing to merge')
  const versions = new Set(docs.map((d) => d.version))
  if (versions.size !== 1) throw new Error(`the update files are for different versions: ${[...versions].join(', ')}`)
  const files = []
  for (const doc of docs) {
    for (const file of doc.files ?? []) {
      if (!files.some((f) => f.url === file.url)) files.push(file)
    }
  }
  // Older updaters read only `path`/`sha512`; point those at the Intel zip,
  // which also runs on Apple silicon (under Rosetta).
  const legacy = files.find((f) => f.url.endsWith('.zip') && !f.url.includes('arm64')) ?? files.find((f) => f.url.endsWith('.zip'))
  const releaseDate = docs.map((d) => d.releaseDate).filter(Boolean).sort().at(-1)
  return {
    version: docs[0].version,
    files,
    ...(legacy ? { path: legacy.url, sha512: legacy.sha512 } : {}),
    ...(releaseDate ? { releaseDate } : {})
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, ...inputs] = process.argv.slice(2)
  if (!out || inputs.length === 0) {
    console.error('usage: merge-mac-update-info.mjs <out.yml> <in.yml> [...]')
    process.exit(2)
  }
  const merged = mergeUpdateInfo(inputs.map((path) => yaml.load(readFileSync(path, 'utf8'))))
  writeFileSync(out, yaml.dump(merged, { lineWidth: -1 }))
  console.log(`${out}: ${merged.files.map((f) => f.url).join(', ')}`)
}
