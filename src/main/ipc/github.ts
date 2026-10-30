import { ipcMain } from 'electron'
import * as issueWork from '../issueWork'
import * as launchpad from '../launchpad'
import * as prReview from '../prReview'
import type { SubmitReviewInput } from '../../shared/prReview'
import { wrap } from './wrap'

/** Launchpad, starting work on its issues, and in-app pull request review. */
export function registerGithubHandlers(): void {
  ipcMain.handle('launchpad:get-data', (_e, repoPaths: string[]) =>
    wrap(() => launchpad.getLaunchpadData(repoPaths))
  )

  ipcMain.handle('launchpad:merge-pr', (_e, repoPath: string, number: number) =>
    wrap(() => launchpad.mergePullRequest(repoPath, number))
  )

  ipcMain.handle('issues:work-options', (_e, repoPath: string, branch: string) =>
    wrap(() => issueWork.issueWorkOptions(repoPath, branch))
  )

  ipcMain.handle('issues:start-work', (_e, repoPath: string, number: number, branch: string, stack: boolean) =>
    wrap(() => issueWork.startIssueWork(repoPath, number, branch, stack))
  )

  ipcMain.handle('pr:get-detail', (_e, repoPath: string, number: number) =>
    wrap(() => prReview.getPullRequestDetail(repoPath, number))
  )

  ipcMain.handle('pr:submit-review', (_e, repoPath: string, number: number, input: SubmitReviewInput) =>
    wrap(() => prReview.submitReview(repoPath, number, input))
  )

  ipcMain.handle('pr:add-comment', (_e, repoPath: string, number: number, body: string) =>
    wrap(() => prReview.addComment(repoPath, number, body))
  )

  ipcMain.handle('pr:reply-to-thread', (_e, repoPath: string, threadId: string, body: string) =>
    wrap(() => prReview.replyToThread(repoPath, threadId, body))
  )

  ipcMain.handle('pr:set-thread-resolved', (_e, repoPath: string, threadId: string, resolved: boolean) =>
    wrap(() => prReview.setThreadResolved(repoPath, threadId, resolved))
  )
}
