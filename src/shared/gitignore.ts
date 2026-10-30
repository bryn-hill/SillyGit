// Ignoring untracked files by adding patterns to the repo's root .gitignore.

/** Escapes the characters .gitignore treats specially, so `path` matches only itself. */
export function escapeIgnorePath(path: string): string {
  const escaped = path.replace(/[\\*?[]/g, "\\$&").replace(/^[#!]/, "\\$&");
  // Trailing spaces are dropped unless escaped.
  return escaped.replace(/ +$/, (spaces) => spaces.replace(/ /g, "\\ "));
}

/** What "Ignore" offers for an untracked `path`: this file, every file with its extension, and its folder. */
export function ignoreOptions(
  path: string,
): { pattern: string; label: string }[] {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const ext = /\.([^.]+)$/.exec(name)?.[1];
  const options = [
    { pattern: `/${escapeIgnorePath(path)}`, label: "This file" },
  ];
  if (ext && name !== `.${ext}`)
    options.push({
      pattern: `*.${escapeIgnorePath(ext)}`,
      label: `All *.${ext} files`,
    });
  if (slash > 0) {
    const folder = path.slice(0, slash);
    options.push({
      pattern: `/${escapeIgnorePath(folder)}/`,
      label: `Folder ${folder}/`,
    });
  }
  return options;
}

/** `text` (a .gitignore) with `pattern` added on a line of its own, or null when it already has that line. */
export function addIgnorePattern(text: string, pattern: string): string | null {
  if (text.split(/\r?\n/).some((line) => line.trim() === pattern)) return null;
  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  return `${text}${separator}${pattern}\n`;
}
