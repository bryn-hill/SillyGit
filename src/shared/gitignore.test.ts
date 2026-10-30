import { describe, expect, it } from "vitest";
import { addIgnorePattern, escapeIgnorePath, ignoreOptions } from "./gitignore";

describe("ignoreOptions", () => {
  it("anchors the file and folder to the repo root", () => {
    expect(ignoreOptions("build/out/app.js")).toEqual([
      { pattern: "/build/out/app.js", label: "This file" },
      { pattern: "*.js", label: "All *.js files" },
      { pattern: "/build/out/", label: "Folder build/out/" },
    ]);
  });

  it("has no extension option for dotfiles or extensionless files, and no folder at the root", () => {
    expect(ignoreOptions(".env").map((o) => o.pattern)).toEqual(["/.env"]);
    expect(ignoreOptions("Makefile").map((o) => o.pattern)).toEqual([
      "/Makefile",
    ]);
  });
});

describe("escapeIgnorePath", () => {
  it("escapes glob characters, a leading # or !, and trailing spaces", () => {
    expect(escapeIgnorePath("a[1]*?.txt")).toBe("a\\[1]\\*\\?.txt");
    expect(escapeIgnorePath("#notes")).toBe("\\#notes");
    expect(escapeIgnorePath("!keep")).toBe("\\!keep");
    expect(escapeIgnorePath("name  ")).toBe("name\\ \\ ");
    expect(escapeIgnorePath("back\\slash")).toBe("back\\\\slash");
  });
});

describe("addIgnorePattern", () => {
  it("appends on a new line", () => {
    expect(addIgnorePattern("", "*.log")).toBe("*.log\n");
    expect(addIgnorePattern("node_modules\n", "*.log")).toBe(
      "node_modules\n*.log\n",
    );
    expect(addIgnorePattern("node_modules", "*.log")).toBe(
      "node_modules\n*.log\n",
    );
  });

  it("returns null when the pattern is already there", () => {
    expect(addIgnorePattern("node_modules\r\n  *.log  \n", "*.log")).toBeNull();
  });
});
