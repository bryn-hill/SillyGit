// Anthropic API calls for code review, commit messages, commit splitting and
// merge conflict resolution, one module per feature.
export { AiError } from './client'
export { type FileContext, reviewCommit, reviewFile } from './review'
export { generateCommitMessage } from './commitMessage'
export { type SplitGroupResult, proposeCommitSplit } from './split'
export { type ConflictPromptInput, buildConflictPrompt, parseConflictResponse, resolveConflicts } from './conflicts'
