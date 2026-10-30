import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'settings/run-button',
  title: 'Run your project',
  category: 'settings',
  summary: 'Run a command such as npm run dev, ./gradlew bootRun or dotnet run from the toolbar, on your working copy or any commit in isolation.',
  keywords: ['run', 'start', 'dev server', 'npm run dev', 'isolation', 'worktree', 'test a commit', 'gradle', 'maven', 'java', 'android', 'dotnet', '.net', 'cargo', 'go', 'python', 'local.properties', 'appsettings'],
  related: ['remotes-prs/check-out-pull-request', 'settings/custom-commands', 'rebase-history/bisect'],
  body: `The **Run** button in the toolbar runs your project's command in a terminal tab. The first time, SillyGit suggests one from what's in the repository and lists every other fit it found, at the root and one folder down, so you can pick one with a click; change it any time with **Edit run command…** in the Run menu. Each repository has its own.

SillyGit recognises:

- **Node**: a \`dev\`, \`start\` or \`serve\` script in \`package.json\`, run with npm, pnpm, yarn or bun to match the lockfile.
- **Gradle**: \`./gradlew installDebug\` for an Android app, \`./gradlew bootRun\` for Spring Boot, \`./gradlew run\` otherwise.
- **Maven**: \`spring-boot:run\`, \`quarkus:dev\` or \`compile exec:java\`, with \`./mvnw\` when the project has the wrapper.
- **.NET**: \`dotnet run\`, or \`dotnet run --project …\` for each web app or executable in a solution.
- **Rust, Go, Flutter, Python, Rails and Make**: \`cargo run\`, \`go run .\`, \`flutter run\`, Django's \`runserver\` (through uv, Poetry or Pipenv when used), \`bin/rails server\` and \`make run\`.

The command runs in your login shell, so whatever your shell profile sets up (\`JAVA_HOME\`, SDKMAN, \`ANDROID_HOME\`, the \`dotnet\` tool, nvm) is found just as in your own terminal. On Windows it runs in \`cmd\` with the system PATH.

- With your working copy selected, **Run** runs it in your repository folder.
- With an older commit selected, the caret menu offers:
  - **Run in isolation**: runs that commit in a private copy of the repository, installing dependencies when needed, so your own work isn't touched. You can run your working copy at the same time.
  - **Check out and run**: checks the commit out in your repository and runs it there. It refuses if you have uncommitted changes.

An isolated run copies the untracked files a project needs but never commits into its private copy: \`.env*\`, Android's \`local.properties\` and \`keystore.properties\`, and .NET's \`appsettings.*.json\`, from your run folder and the folder the command changes into. Add others, such as \`app/google-services.json\`, with **Files to copy into isolated runs…** in the Run menu.

Whichever you pick becomes what **Run** does. While it runs, the button becomes **Stop**.

## Example

A teammate's pull request changes the checkout page and you want to try it without stashing your own work. Check out or select its newest commit, choose **Run in isolation**, and the app starts from a private copy. Your own branch and changes stay exactly as they were.`
}

export default article
