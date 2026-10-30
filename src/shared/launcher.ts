// The `sillygit` command: which folders a launch asks for, and the small
// script the "Install sillygit command" action writes.

/** A folder someone asked SillyGit to open from the command line or the Dock. */
export interface LaunchRequest {
  path: string
  /** Set when the folder can't be opened, saying why. */
  error?: string
}

/** What installing the command did, for a notice. */
export interface CommandInstallResult {
  /** Where the command now lives, e.g. /usr/local/bin/sillygit. */
  installedAt: string
  /** Anything else the user needs to do, such as open a new terminal. */
  note?: string
}

/** The program and leading arguments that start this SillyGit. */
export interface LaunchCommand {
  program: string
  args: string[]
}

const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

/**
 * The `sillygit` shell script for macOS and Linux. It starts SillyGit in the
 * background so the terminal is free straight away; a running SillyGit takes
 * the paths over from the new process.
 */
export function posixScript(command: LaunchCommand): string {
  const run = [command.program, ...command.args].map(shellQuote).join(' ')
  return `#!/bin/sh
# Opens SillyGit, or a repository in it: sillygit [folder]
# Written by SillyGit's "Install sillygit command". Run that again if SillyGit moves.
nohup ${run} "$@" >/dev/null 2>&1 &
`
}

/** The `sillygit.cmd` script for Windows. */
export function windowsScript(command: LaunchCommand): string {
  const run = [command.program, ...command.args].map((s) => `"${s}"`).join(' ')
  return `@echo off\r
rem Opens SillyGit, or a repository in it: sillygit [folder]\r
rem Written by SillyGit's "Install sillygit command". Run that again if SillyGit moves.\r
start "" ${run} %*\r
`
}
