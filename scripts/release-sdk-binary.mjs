#!/usr/bin/env node
// The Claude Agent SDK runs a native `claude` binary from a per-platform
// optional package (@anthropic-ai/claude-agent-sdk-<platform>-<arch>), and npm
// only installs the one for the machine it runs on. Before packaging for
// another platform or arch, this swaps node_modules over to that target's
// package and removes the others, so each installer ships exactly one binary.
//
//   node scripts/release-sdk-binary.mjs <platform> <arch>   e.g. win32 x64
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [platform, arch] = process.argv.slice(2)
if (!platform || !arch) {
  console.error('usage: release-sdk-binary.mjs <platform> <arch>')
  process.exit(1)
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const scope = path.join(root, 'node_modules', '@anthropic-ai')
const sdk = JSON.parse(fs.readFileSync(path.join(scope, 'claude-agent-sdk', 'package.json'), 'utf8'))
const name = `claude-agent-sdk-${platform}-${arch}`
const spec = `@anthropic-ai/${name}@${sdk.version}`
if (!sdk.optionalDependencies?.[`@anthropic-ai/${name}`]) {
  console.error(`the Agent SDK has no binary package for ${platform}-${arch}`)
  process.exit(1)
}

for (const entry of fs.readdirSync(scope)) {
  if (entry.startsWith('claude-agent-sdk-') && entry !== name) {
    fs.rmSync(path.join(scope, entry), { recursive: true, force: true })
  }
}

const target = path.join(scope, name)
const current = path.join(target, 'package.json')
if (fs.existsSync(current) && JSON.parse(fs.readFileSync(current, 'utf8')).version === sdk.version) {
  console.log(`${spec} already installed`)
  process.exit(0)
}

// npm install refuses packages for another os/cpu, so fetch the tarball and
// unpack it in place.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-binary-'))
try {
  const tarball = execFileSync('npm', ['pack', spec, '--silent', '--pack-destination', tmp], {
    encoding: 'utf8'
  }).trim().split('\n').pop()
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  execFileSync('tar', ['-xzf', path.join(tmp, tarball), '-C', target, '--strip-components=1'])
  console.log(`installed ${spec}`)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
