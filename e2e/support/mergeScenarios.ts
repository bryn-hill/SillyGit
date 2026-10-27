import type { FixtureRepo } from './fixtureRepo'

// Hard merge situations, built on a FixtureRepo. Shared by the Playwright
// suite and the vitest tests of src/main/conflicts.ts. Every builder leaves
// `main` checked out with a clean working tree, and names the branch (or
// commit) to merge, rebase or cherry-pick in its doc comment.

/** `count` numbered lines ("line 1" ...), each ending in `eol`. */
export function numbered(count: number, eol = '\n', label = 'line'): string {
  return Array.from({ length: count }, (_, i) => `${label} ${i + 1}${eol}`).join('')
}

function commitAll(repo: FixtureRepo, message: string): void {
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', message)
}

/** Commits `files` on a new branch `name` cut from main, then returns to main. */
function branchWith(repo: FixtureRepo, name: string, files: Record<string, string | Buffer>, message: string): void {
  repo.git('checkout', '-q', '-b', name, 'main')
  for (const [path, content] of Object.entries(files)) repo.writeFile(path, content)
  commitAll(repo, message)
  repo.git('checkout', '-q', 'main')
}

/**
 * Three branches `alpha`, `beta` and `gamma` that each add their own file:
 * an octopus merge of all three applies cleanly.
 */
export function octopusClean(repo: FixtureRepo): void {
  for (const name of ['alpha', 'beta', 'gamma']) branchWith(repo, name, { [`${name}.txt`]: `${name}\n` }, `Add ${name}`)
  repo.commitFile('main.txt', 'main\n', 'Add main.txt')
}

/**
 * Like octopusClean, but `beta` and `gamma` also change the same line of
 * hello.txt, so an octopus merge of the three stops.
 */
export function octopusConflict(repo: FixtureRepo): void {
  branchWith(repo, 'alpha', { 'alpha.txt': 'alpha\n' }, 'Add alpha')
  branchWith(repo, 'beta', { 'beta.txt': 'beta\n', 'hello.txt': 'hello\nbeta\n' }, 'Beta edits hello')
  branchWith(repo, 'gamma', { 'gamma.txt': 'gamma\n', 'hello.txt': 'hello\ngamma\n' }, 'Gamma edits hello')
}

/** Adds an octopus merge of alpha, beta and gamma (and a merge of a merge) to main's history. */
export function octopusHistory(repo: FixtureRepo): void {
  octopusClean(repo)
  repo.git('merge', '-q', '--no-ff', '-m', 'Octopus merge', 'alpha', 'beta', 'gamma')
  branchWith(repo, 'delta', { 'delta.txt': 'delta\n' }, 'Add delta')
  repo.commitFile('after.txt', 'after\n', 'After octopus')
  repo.git('merge', '-q', '--no-ff', '-m', 'Merge delta', 'delta')
}

/**
 * A criss-cross: `main` and `feature` each merge the other, so they have two
 * merge bases, and those bases disagree about line 2 of story.txt. Both tips
 * then change line 2 again, so merging `feature` into main conflicts against
 * a virtual base that itself holds conflict markers.
 */
export function crissCross(repo: FixtureRepo): void {
  repo.commitFile('story.txt', numbered(6), 'Add story')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.commitFile('story.txt', numbered(6).replace('line 2\n', 'line 2 (feature A)\n'), 'Feature A')
  repo.git('checkout', '-q', 'main')
  repo.commitFile('story.txt', numbered(6).replace('line 2\n', 'line 2 (main A)\n'), 'Main A')
  const mainA = repo.git('rev-parse', 'HEAD').trim()
  // Each side merges the other's first commit, resolving line 2 its own way.
  repo.git('merge', '-q', '-s', 'ours', '-m', 'Main takes feature A', 'feature')
  repo.git('checkout', '-q', 'feature')
  repo.git('merge', '-q', '-s', 'ours', '-m', 'Feature takes main A', mainA)
  repo.commitFile('story.txt', numbered(6).replace('line 2\n', 'line 2 (feature B)\n'), 'Feature B')
  repo.git('checkout', '-q', 'main')
  repo.commitFile('story.txt', numbered(6).replace('line 2\n', 'line 2 (main B)\n'), 'Main B')
}

/**
 * `feature` renames greeting.txt to salutation.txt and edits line 3; main
 * edits line 3 differently in place. Merging `feature` conflicts at the new name.
 */
export function renameModify(repo: FixtureRepo): void {
  repo.commitFile('greeting.txt', numbered(10), 'Add greeting')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.git('mv', 'greeting.txt', 'salutation.txt')
  repo.writeFile('salutation.txt', numbered(10).replace('line 3\n', 'line 3 (feature)\n'))
  commitAll(repo, 'Rename greeting and edit it')
  repo.git('checkout', '-q', 'main')
  repo.commitFile('greeting.txt', numbered(10).replace('line 3\n', 'line 3 (main)\n'), 'Edit greeting')
}

/** `feature` renames shared.txt to theirs.txt while main renames it to ours.txt. */
export function renameRename(repo: FixtureRepo): void {
  repo.commitFile('shared.txt', numbered(10), 'Add shared')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.git('mv', 'shared.txt', 'theirs.txt')
  commitAll(repo, 'Rename shared to theirs')
  repo.git('checkout', '-q', 'main')
  repo.git('mv', 'shared.txt', 'ours.txt')
  commitAll(repo, 'Rename shared to ours')
}

/**
 * Like renameRename, but both sides also edit the file: line 3 differently
 * (a conflict), line 7 only on `feature`, line 19 only on main.
 */
export function renameRenameEdited(repo: FixtureRepo): void {
  repo.commitFile('shared.txt', numbered(20), 'Add shared')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.git('mv', 'shared.txt', 'theirs.txt')
  repo.writeFile('theirs.txt', numbered(20).replace('line 3\n', 'line 3 (feature)\n').replace('line 7\n', 'line 7 (feature)\n'))
  commitAll(repo, 'Rename shared to theirs and edit it')
  repo.git('checkout', '-q', 'main')
  repo.git('mv', 'shared.txt', 'ours.txt')
  repo.writeFile('ours.txt', numbered(20).replace('line 3\n', 'line 3 (main)\n').replace('line 19\n', 'line 19 (main)\n'))
  commitAll(repo, 'Rename shared to ours and edit it')
}

/**
 * part.txt: both sides change line 2 but only main changes line
 * 8: taking a whole side must still keep main's line 8.
 */
export function partialConflict(repo: FixtureRepo): void {
  repo.commitFile('part.txt', numbered(10), 'Add part')
  branchWith(repo, 'feature', { 'part.txt': numbered(10).replace('line 2\n', 'line 2 (feature)\n') }, 'Feature edits line 2')
  repo.commitFile('part.txt', numbered(10).replace('line 2\n', 'line 2 (main)\n').replace('line 8\n', 'line 8 (main)\n'), 'Main edits lines 2 and 8')
}

/** Main renames shared.txt to kept.txt while `feature` deletes it. */
export function renameDelete(repo: FixtureRepo): void {
  repo.commitFile('shared.txt', numbered(10), 'Add shared')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.git('rm', '-q', 'shared.txt')
  commitAll(repo, 'Delete shared')
  repo.git('checkout', '-q', 'main')
  repo.git('mv', 'shared.txt', 'kept.txt')
  commitAll(repo, 'Rename shared to kept')
}

/** Main and `feature` both add new.txt with different content (no common ancestor version). */
export function addAdd(repo: FixtureRepo): void {
  branchWith(repo, 'feature', { 'new.txt': 'first\nfrom feature\nlast\n' }, 'Add new on feature')
  repo.commitFile('new.txt', 'first\nfrom main\nlast\n', 'Add new on main')
}

/** Main adds a file `thing` while `feature` adds a directory `thing/` with a file in it. */
export function directoryFile(repo: FixtureRepo): void {
  branchWith(repo, 'feature', { 'thing/inner.txt': 'inner\n' }, 'Add thing directory')
  repo.commitFile('thing', 'a file called thing\n', 'Add thing file')
}

/** A tiny PNG-like binary (contains NUL bytes) changed differently on both sides. */
export function binaryConflict(repo: FixtureRepo): void {
  const png = (tag: number): Buffer =>
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, tag, 0, 0xff, 0x10])
  repo.writeFile('logo.png', png(1))
  commitAll(repo, 'Add logo')
  branchWith(repo, 'feature', { 'logo.png': png(2) }, 'Feature logo')
  repo.writeFile('logo.png', png(3))
  commitAll(repo, 'Main logo')
}

/**
 * crlf.txt starts with LF endings. Main converts the whole file to CRLF;
 * `feature` keeps LF and edits line 2. The conflict covers the whole file.
 */
export function lineEndings(repo: FixtureRepo): void {
  repo.git('config', 'core.autocrlf', 'false')
  repo.commitFile('crlf.txt', numbered(4), 'Add crlf.txt')
  branchWith(repo, 'feature', { 'crlf.txt': numbered(4).replace('line 2\n', 'line 2 (feature)\n') }, 'Feature edits line 2')
  repo.commitFile('crlf.txt', numbered(4, '\r\n'), 'Convert to CRLF')
}

/** A CRLF file both sides edit on the same line: the hunks and the output must keep CRLF. */
export function crlfBothSides(repo: FixtureRepo): void {
  repo.git('config', 'core.autocrlf', 'false')
  repo.commitFile('dos.txt', numbered(5, '\r\n'), 'Add dos.txt')
  branchWith(repo, 'feature', { 'dos.txt': numbered(5, '\r\n').replace('line 3', 'line 3 (feature)') }, 'Feature edits dos')
  repo.commitFile('dos.txt', numbered(5, '\r\n').replace('line 3', 'line 3 (main)'), 'Main edits dos')
}

const CODE = ['function greet(name) {', '  if (name) {', '    return "hi " + name', '  }', '  return "hi"', '}', '']

/**
 * code.js: main re-indents it from two spaces to tabs (whitespace only);
 * `feature` changes the greeting text. Every indented line conflicts.
 */
export function whitespaceOnly(repo: FixtureRepo): void {
  repo.commitFile('code.js', CODE.join('\n'), 'Add code')
  branchWith(repo, 'feature', { 'code.js': CODE.join('\n').replace('"hi " + name', '"hello " + name') }, 'Feature greets')
  repo.commitFile('code.js', CODE.map((l) => l.replace(/^( {2})+/, (s) => '\t'.repeat(s.length / 2))).join('\n'), 'Use tabs')
}

/** tail.txt: main drops the final newline, `feature` edits the last line. */
export function trailingNewline(repo: FixtureRepo): void {
  repo.commitFile('tail.txt', 'one\ntwo\nthree\n', 'Add tail')
  branchWith(repo, 'feature', { 'tail.txt': 'one\ntwo\nTHREE\n' }, 'Shout three')
  repo.commitFile('tail.txt', 'one\ntwo\nthree', 'Drop final newline')
}

/**
 * A Markdown/reStructuredText file whose conflicting lines are themselves
 * runs of `=`, `<`, `|` and `>` (heading underlines, quotes, tables), which
 * look like conflict markers of the default size.
 */
export function markerLookalikes(repo: FixtureRepo): void {
  repo.commitFile('doc.rst', 'Intro\n\nTitle\n-----\n\nBody\n', 'Add doc')
  branchWith(
    repo,
    'feature',
    { 'doc.rst': 'Intro\n\nTitle (feature)\n||||||| not a marker\n\nBody\n' },
    'Feature retitles'
  )
  repo.commitFile('doc.rst', 'Intro\n\nTitle (main)\n=======\n>>>>>>> quoted\n<<<<<<<\n\nBody\n', 'Main retitles')
}

/** Unicode content (accents, CJK, emoji with ZWJ, RTL, combining marks) in a file with a non-ASCII name. */
export const UNICODE_PATH = 'données/日本語 ✨.txt'
export function unicodeConflict(repo: FixtureRepo): void {
  const text = (middle: string): string => `Grüße\n${middle}\n🙂 end\n`
  repo.writeFile(UNICODE_PATH, text('base'))
  commitAll(repo, 'Add unicode file')
  branchWith(repo, 'feature', { [UNICODE_PATH]: text('שלום עולם · 👩‍💻 · é') }, 'Feature unicode')
  repo.writeFile(UNICODE_PATH, text('中文 · Ελληνικά · 🇳🇿'))
  commitAll(repo, 'Main unicode')
}

/** A path with spaces and quotes in it: `quoted "name".txt`. */
export const AWKWARD_PATH = 'dir with spaces/quoted "name".txt'
export function awkwardPathConflict(repo: FixtureRepo): void {
  repo.writeFile(AWKWARD_PATH, 'a\nb\nc\n')
  commitAll(repo, 'Add awkward path')
  branchWith(repo, 'feature', { [AWKWARD_PATH]: 'a\nB (feature)\nc\n' }, 'Feature awkward')
  repo.writeFile(AWKWARD_PATH, 'a\nB (main)\nc\n')
  commitAll(repo, 'Main awkward')
}

/** big.txt: one conflict hunk of `size` lines on each side. */
export function largeHunk(repo: FixtureRepo, size = 5000): void {
  repo.commitFile('big.txt', 'head\n' + numbered(size) + 'tail\n', 'Add big')
  branchWith(repo, 'feature', { 'big.txt': 'head\n' + numbered(size, '\n', 'feature') + 'tail\n' }, 'Feature rewrites big')
  repo.commitFile('big.txt', 'head\n' + numbered(size, '\n', 'main') + 'tail\n', 'Main rewrites big')
}

/**
 * many.txt: both sides change every `stride`-th line of `count`, leaving
 * unchanged lines between them, so git writes many separate hunks.
 * stride 1 would make every hunk adjacent, which git folds into one.
 */
export function manyHunks(repo: FixtureRepo, count = 600, stride = 3): void {
  const edit = (who: string): string =>
    Array.from({ length: count }, (_, i) => (i % stride === 0 ? `line ${i + 1} (${who})\n` : `line ${i + 1}\n`)).join('')
  repo.commitFile('many.txt', numbered(count), 'Add many')
  branchWith(repo, 'feature', { 'many.txt': edit('feature') }, 'Feature edits many')
  repo.commitFile('many.txt', edit('main'), 'Main edits many')
}

/** Neighbouring lines 2 and 3 changed on both sides; with one unchanged line between, 5 too. */
export function adjacentHunks(repo: FixtureRepo): void {
  repo.commitFile('adj.txt', numbered(7), 'Add adj')
  const edit = (who: string): string =>
    numbered(7)
      .replace('line 2\n', `line 2 (${who})\n`)
      .replace('line 3\n', `line 3 (${who})\n`)
      .replace('line 5\n', `line 5 (${who})\n`)
  branchWith(repo, 'feature', { 'adj.txt': edit('feature') }, 'Feature edits adj')
  repo.commitFile('adj.txt', edit('main'), 'Main edits adj')
}

/**
 * `topic` holds three commits on list.txt: the first and third conflict with
 * main, the second applies cleanly. Rebasing topic onto main stops twice.
 * Leaves `topic` checked out, ready to rebase onto main.
 */
export function rebaseStack(repo: FixtureRepo): void {
  repo.commitFile('list.txt', numbered(9), 'Add list')
  repo.git('checkout', '-q', '-b', 'topic')
  repo.commitFile('list.txt', numbered(9).replace('line 2\n', 'line 2 (topic 1)\n'), 'Topic 1')
  repo.commitFile('other.txt', 'clean\n', 'Topic 2')
  repo.commitFile('list.txt', numbered(9).replace('line 2\n', 'line 2 (topic 1)\n').replace('line 8\n', 'line 8 (topic 3)\n'), 'Topic 3')
  repo.git('checkout', '-q', 'main')
  repo.commitFile('list.txt', numbered(9).replace('line 2\n', 'line 2 (main)\n').replace('line 8\n', 'line 8 (main)\n'), 'Main edits list')
  repo.git('checkout', '-q', 'topic')
}

/**
 * `feature` has a commit "Pick me" that edits line 2 of pick.txt, which main
 * also changed. Cherry-picking it onto main conflicts. Returns its hash.
 */
export function cherryPickConflict(repo: FixtureRepo): string {
  repo.commitFile('pick.txt', numbered(4), 'Add pick')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.commitFile('pick.txt', numbered(4).replace('line 2\n', 'line 2 (picked)\n'), 'Pick me')
  const hash = repo.git('rev-parse', 'HEAD').trim()
  repo.git('checkout', '-q', 'main')
  repo.commitFile('pick.txt', numbered(4).replace('line 2\n', 'line 2 (main)\n'), 'Main edits pick')
  return hash
}

/**
 * main changes line 2 of rev.txt twice; reverting the first change conflicts
 * with the second. Returns the hash to revert.
 */
export function revertConflict(repo: FixtureRepo): string {
  repo.commitFile('rev.txt', numbered(4), 'Add rev')
  repo.commitFile('rev.txt', numbered(4).replace('line 2\n', 'line 2 v2\n'), 'Line 2 v2')
  const hash = repo.git('rev-parse', 'HEAD').trim()
  repo.commitFile('rev.txt', numbered(4).replace('line 2\n', 'line 2 v3\n'), 'Line 2 v3')
  return hash
}

/** Every kind of conflict above at once, on one `feature` branch: one merge, many conflicted files. */
export function kitchenSink(repo: FixtureRepo): void {
  repo.git('config', 'core.autocrlf', 'false')
  repo.writeFile('edit.txt', numbered(5))
  repo.writeFile('doomed.txt', 'doomed\n')
  repo.writeFile('moved.txt', numbered(8))
  repo.writeFile('crlf.txt', numbered(3, '\r\n'))
  commitAll(repo, 'Add kitchen sink files')
  repo.git('checkout', '-q', '-b', 'feature')
  repo.writeFile('edit.txt', numbered(5).replace('line 4\n', 'line 4 (feature)\n'))
  repo.git('rm', '-q', 'doomed.txt')
  repo.git('mv', 'moved.txt', 'moved-feature.txt')
  repo.writeFile('moved-feature.txt', numbered(8).replace('line 1\n', 'line 1 (feature)\n'))
  repo.writeFile('crlf.txt', numbered(3, '\r\n').replace('line 2', 'line 2 (feature)'))
  repo.writeFile('added.txt', 'feature\n')
  commitAll(repo, 'Feature sink')
  repo.git('checkout', '-q', 'main')
  repo.writeFile('edit.txt', numbered(5).replace('line 4\n', 'line 4 (main)\n'))
  repo.writeFile('doomed.txt', 'doomed, but edited\n')
  repo.writeFile('moved.txt', numbered(8).replace('line 1\n', 'line 1 (main)\n'))
  repo.writeFile('crlf.txt', numbered(3, '\r\n').replace('line 2', 'line 2 (main)'))
  repo.writeFile('added.txt', 'main\n')
  commitAll(repo, 'Main sink')
}
