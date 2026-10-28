import { ipcMain } from 'electron'
import * as git from '../git'
import * as ai from '../ai'
import * as quickActions from '../quickActions'
import * as diffSplit from '../../shared/diffSplit'
import type { CommitSplitProposal, SplitGroupProposal } from '../../shared/types'
import { wrap } from './wrap'

const MAX_REVIEW_CONTEXT_FILES = 20

// Fetches each changed file's full post-change content, for the AI review
// prompt. Skips deletions (nothing to fetch) and pure additions (the diff
// already contains the whole file, so fetching it again wastes prompt
// budget), and silently drops any file that fails to read (binary content,
// git errors) rather than failing the review over it.
async function fetchReviewFileContexts(
  repoPath: string,
  hash: string,
  files: { path: string; status: string }[]
): Promise<ai.FileContext[]> {
  const candidates = files
    .filter((f) => !f.status.startsWith('D') && !f.status.startsWith('A'))
    .slice(0, MAX_REVIEW_CONTEXT_FILES)

  const results = await Promise.all(
    candidates.map(async (f): Promise<ai.FileContext | null> => {
      try {
        const content = await git.getFileAtRef(repoPath, hash, f.path)
        if (content.includes('\u0000')) return null
        return { path: f.path, content }
      } catch {
        return null
      }
    })
  )

  return results.filter((r): r is ai.FileContext => r !== null)
}
/** Claude reviews of commits and files, commit messages and commit splitting, and the rule-based quick actions. */
export function registerAiHandlers(): void {
  ipcMain.handle('ai:review-commit', (_e, repoPath: string, hash: string) =>
    wrap(async () => {
      const detail = await git.getCommitDetail(repoPath, hash)
      const diff = await git.getCommitFullDiff(repoPath, hash)
      const fileContexts = await fetchReviewFileContexts(repoPath, hash, detail.files)
      return ai.reviewCommit(detail.subject, detail.body, diff, fileContexts)
    })
  )

  ipcMain.handle('ai:review-file', (_e, repoPath: string, hash: string, path: string) =>
    wrap(async () => {
      const diff = await git.getCommitFileDiff(repoPath, hash, path)
      const fileContexts = await fetchReviewFileContexts(repoPath, hash, [{ path, status: 'M' }])
      return ai.reviewFile(path, diff, fileContexts)
    })
  )

  ipcMain.handle('quick:suggest-messages', (_e, repoPath: string) =>
    wrap(() => quickActions.suggestForStaged(repoPath))
  )

  ipcMain.handle('quick:package-version', (_e, repoPath: string) =>
    wrap(() => quickActions.getPackageVersion(repoPath))
  )

  ipcMain.handle('quick:bump-version', (_e, repoPath: string, kind: 'patch' | 'minor' | 'major') =>
    wrap(() => quickActions.bumpPackageVersion(repoPath, kind))
  )

  ipcMain.handle('quick:pull-request-text', (_e, repoPath: string, base: string, head: string, headBranch: string) =>
    wrap(() => quickActions.pullRequestText(repoPath, base, head, headBranch))
  )

  ipcMain.handle('ai:generate-commit-message', (_e, repoPath: string) =>
    wrap(async () => {
      const diff = await git.getStagedDiff(repoPath)
      if (!diff.trim()) {
        throw new Error('No staged changes to generate a message from.')
      }
      return ai.generateCommitMessage(diff)
    })
  )

  ipcMain.handle('ai:propose-split', (_e, repoPath: string, hash: string) =>
    wrap(async (): Promise<CommitSplitProposal> => {
      const headHash = await git.getHeadHash(repoPath)
      if (headHash !== hash) {
        throw new Error('Only the current HEAD commit can be split.')
      }
      if (!(await git.isWorkingTreeClean(repoPath))) {
        throw new Error('Working directory must be clean before splitting a commit.')
      }
      const detail = await git.getCommitDetail(repoPath, hash)
      if (detail.parents.length !== 1) {
        throw new Error('Only a commit with a single parent can be split (not a merge or root commit).')
      }
      const parentHash = detail.parents[0]
      const diffText = await git.getDiffForSplit(repoPath, parentHash, hash)
      const { units } = diffSplit.parseCommitDiff(diffText)
      if (units.length === 0) {
        throw new Error('This commit has no changes to split.')
      }

      const aiGroups = await ai.proposeCommitSplit(detail.subject, detail.body, units)
      diffSplit.validateGroupCoverage(units, aiGroups)

      const unitFile = new Map(units.map((u) => [u.id, u.file]))
      const groups: SplitGroupProposal[] = aiGroups.map((g) => ({
        message: g.message,
        unitIds: g.unitIds,
        files: [...new Set(g.unitIds.map((id) => unitFile.get(id)!))]
      }))

      return { headHash, parentHash, groups }
    })
  )

  ipcMain.handle('ai:apply-split', (_e, repoPath: string, proposal: CommitSplitProposal) =>
    wrap(async () => {
      const { headHash, parentHash, groups } = proposal
      if (groups.length === 0) throw new Error('No groups to apply.')

      const currentHead = await git.getHeadHash(repoPath)
      if (currentHead !== headHash) {
        throw new Error('HEAD has changed since the split was proposed. Please try again.')
      }

      const diffText = await git.getDiffForSplit(repoPath, parentHash, headHash)
      const { fileBlocks, units } = diffSplit.parseCommitDiff(diffText)
      diffSplit.validateGroupCoverage(units, groups)
      const expectedTreeHash = await git.getTreeHash(repoPath, headHash)

      const cumulativeIds = new Set<string>()
      const gitGroups = groups.map((g) => {
        for (const id of g.unitIds) cumulativeIds.add(id)
        return { message: g.message, patch: diffSplit.buildPatchForUnits(fileBlocks, cumulativeIds) }
      })

      await git.applyCommitSplit(repoPath, headHash, parentHash, expectedTreeHash, gitGroups)
    })
  )
}
