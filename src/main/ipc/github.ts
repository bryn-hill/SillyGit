import { ipcMain } from 'electron'
import * as launchpad from '../launchpad'
import * as prReview from '../prReview'
import * as prCheckout from '../prCheckout'
import type { PullRequestHead } from '../../shared/prCheckout'
import * as createPr from '../createPullRequest'
import type { CreatePullRequestInput } from '../../shared/createPullRequest'
import type { SubmitReviewInput } from '../../shared/prReview'
import { wrap } from './wrap'

/** Launchpad, and creating and reviewing pull requests in the app. */
export function registerGithubHandlers(): void {
  ipcMain.handle('launchpad:get-data', (_e, repoPaths: string[]) =>
    wrap(() => launchpad.getLaunchpadData(repoPaths))
  )

  ipcMain.handle('launchpad:merge-pr', (_e, repoPath: string, number: number) =>
    wrap(() => launchpad.mergePullRequest(repoPath, number))
  )

  // Checking out a pull request is two calls (the preload's checkoutPullRequest
  // makes both): asking GitHub where its head is, then the local git work.
  ipcMain.handle('pr:head', (_e, repoPath: string, number: number) =>
    wrap(() => prReview.getPullRequestHead(repoPath, number))
  )

  ipcMain.handle('pr:checkout-head', (_e, repoPath: string, head: PullRequestHead) =>
    wrap(() => prCheckout.checkoutPullRequestHead(repoPath, head))
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

  ipcMain.handle('pr:create', (_e, repoPath: string, input: CreatePullRequestInput) =>
    wrap(() => createPr.createPullRequest(repoPath, input))
  )

  ipcMain.handle('pr:suggested-reviewers', (_e, repoPath: string) => wrap(() => createPr.suggestedReviewers(repoPath)))

  ipcMain.handle('git:push-branch', (_e, repoPath: string, branch: string, remote: string) =>
    wrap(() => createPr.pushBranch(repoPath, branch, remote))
  )
}
