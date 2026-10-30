import { expect, test } from "../fixtures";

test.describe("Ignore files", () => {
  test("ignores an untracked file's folder from its right-click menu", async ({
    sillygit,
    repo,
  }) => {
    repo.writeFile("logs/debug.log", "noise");
    repo.writeFile("notes.txt", "keep me");
    await sillygit.openRepository(repo.path);

    await sillygit.details
      .listedFile("Unstaged", "logs/debug.log")
      .click({ button: "right" });
    await sillygit.page
      .getByRole("menu")
      .getByText("Ignore", { exact: true })
      .hover();
    await sillygit.page.getByRole("menuitem", { name: "Folder logs/" }).click();

    await expect(sillygit.notice).toContainText("Added /logs/ to .gitignore");
    expect(repo.readFile(".gitignore")).toBe("/logs/\n");
    await expect(
      sillygit.details.listedFile("Unstaged", "logs/debug.log"),
    ).toHaveCount(0);
    await expect(
      sillygit.details.listedFile("Unstaged", ".gitignore"),
    ).toBeVisible();
    await expect(
      sillygit.details.listedFile("Unstaged", "notes.txt"),
    ).toBeVisible();
  });

  test("has no Ignore item for a tracked file", async ({ sillygit, repo }) => {
    repo.writeFile("hello.txt", "changed\n");
    await sillygit.openRepository(repo.path);

    await sillygit.details
      .listedFile("Unstaged", "hello.txt")
      .click({ button: "right" });
    await expect(
      sillygit.page.getByRole("menu").getByText("Blame"),
    ).toBeVisible();
    await expect(
      sillygit.page.getByRole("menu").getByText("Ignore", { exact: true }),
    ).toHaveCount(0);
  });
});
