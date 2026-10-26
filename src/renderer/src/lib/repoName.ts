/** The folder name of a repo path, for labels. */
export const repoDisplayName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path
