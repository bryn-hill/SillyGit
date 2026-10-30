import { suggestRunCommand } from './run'

/**
 * What the run command guesses look at in one folder: its file names, and the
 * contents of the build files among them (keyed by path relative to the folder,
 * with `/` separators). A missing key means the file isn't there or wasn't read.
 */
export interface FolderInfo {
  files: string[]
  contents: Record<string, string>
}

/** A guess at how to run a project, with what kind of project it looks like. */
export interface RunSuggestion {
  command: string
  label: string
}

/** The build files whose contents `detectRunCommands` reads, besides the .NET projects `dotnetProjects` names. */
export const BUILD_FILES = [
  'package.json',
  'build.gradle',
  'build.gradle.kts',
  'app/build.gradle',
  'app/build.gradle.kts',
  'pom.xml',
  'pyproject.toml',
  'Makefile'
]

/**
 * The .NET project files a folder points at: those its solutions list, or
 * else the project files sitting in it. Paths are relative, with `/`.
 */
export function dotnetProjects(files: string[], contents: Record<string, string>): string[] {
  const fromSolutions = files
    .filter((name) => name.endsWith('.sln'))
    .flatMap((sln) =>
      [...(contents[sln] ?? '').matchAll(/^Project\("[^"]*"\)\s*=\s*"[^"]*",\s*"([^"]+\.(?:cs|fs|vb)proj)"/gm)].map(
        (m) => m[1].replace(/\\/g, '/')
      )
    )
  if (fromSolutions.length) return [...new Set(fromSolutions)]
  return files.filter((name) => /\.(cs|fs|vb)proj$/.test(name))
}

/** Whether a .NET project builds something you can run: a web app, or an executable. */
function runnableDotnet(project: string): boolean {
  return /Sdk="Microsoft\.NET\.Sdk\.(Web|Worker|Razor|BlazorWebAssembly)"/.test(project) || /<OutputType>\s*(Win)?Exe\s*</i.test(project)
}

function gradleSuggestion(info: FolderInfo, platform: string): RunSuggestion | null {
  const { files, contents } = info
  const hasWrapper = files.includes('gradlew') || files.includes('gradlew.bat')
  const buildFiles = ['build.gradle', 'build.gradle.kts', 'app/build.gradle', 'app/build.gradle.kts']
  if (!hasWrapper && !buildFiles.some((name) => name in contents)) return null
  const gradle = !hasWrapper ? 'gradle' : platform === 'win32' ? 'gradlew' : './gradlew'
  const build = buildFiles.map((name) => contents[name] ?? '').join('\n')
  if (/com\.android\.application|android\.application/.test(build)) {
    return { command: `${gradle} installDebug`, label: 'Android app (Gradle)' }
  }
  if (/org\.springframework\.boot|spring\.boot/.test(build)) {
    return { command: `${gradle} bootRun`, label: 'Spring Boot (Gradle)' }
  }
  if (/io\.quarkus|quarkus/.test(build)) return { command: `${gradle} quarkusDev`, label: 'Quarkus (Gradle)' }
  return { command: `${gradle} run`, label: 'Gradle' }
}

function mavenSuggestion(info: FolderInfo, platform: string): RunSuggestion | null {
  const pom = info.contents['pom.xml']
  if (pom == null) return null
  const hasWrapper = info.files.includes('mvnw') || info.files.includes('mvnw.cmd')
  const mvn = !hasWrapper ? 'mvn' : platform === 'win32' ? 'mvnw' : './mvnw'
  if (pom.includes('spring-boot')) return { command: `${mvn} spring-boot:run`, label: 'Spring Boot (Maven)' }
  if (pom.includes('quarkus')) return { command: `${mvn} quarkus:dev`, label: 'Quarkus (Maven)' }
  return { command: `${mvn} compile exec:java`, label: 'Maven' }
}

function dotnetSuggestions(info: FolderInfo): RunSuggestion[] {
  const projects = dotnetProjects(info.files, info.contents)
  const runnable = projects.filter((path) => runnableDotnet(info.contents[path] ?? ''))
  // A lone project in the folder runs as is; otherwise say which one.
  if (projects.length === 1 && runnable.length === 1 && !projects[0].includes('/')) {
    return [{ command: 'dotnet run', label: '.NET' }]
  }
  return runnable.map((path) => ({
    command: `dotnet run --project ${/^[\w./-]+$/.test(path) ? path : `"${path}"`}`,
    label: `.NET (${path.split('/').pop()!.replace(/\.\w+proj$/, '')})`
  }))
}

function pythonSuggestion(info: FolderInfo): RunSuggestion | null {
  const { files, contents } = info
  const prefix = files.includes('uv.lock')
    ? 'uv run '
    : files.includes('poetry.lock')
      ? 'poetry run '
      : files.includes('Pipfile')
        ? 'pipenv run '
        : ''
  const python = prefix ? `${prefix}python` : 'python3'
  if (files.includes('manage.py')) return { command: `${python} manage.py runserver`, label: 'Django' }
  const scripts = /^\[project\.scripts\]\s*\n\s*([\w.-]+)\s*=/m.exec(contents['pyproject.toml'] ?? '')
  if (scripts) return { command: `${prefix}${scripts[1]}`, label: 'Python' }
  for (const name of ['main.py', 'app.py']) {
    if (files.includes(name)) return { command: `${python} ${name}`, label: 'Python' }
  }
  return null
}

/**
 * Guesses at how to run the project in a folder, most likely first: a
 * package.json script, Gradle (Android, Spring Boot), Maven, .NET, Cargo, Go,
 * Flutter, Python, Rails, or a Makefile's run target. `platform` picks the
 * Gradle and Maven wrapper spelling (no `./` on Windows).
 */
export function detectRunCommands(info: FolderInfo, platform: string): RunSuggestion[] {
  const { files, contents } = info
  const found: RunSuggestion[] = []
  const add = (suggestion: RunSuggestion | null): void => {
    if (suggestion && !found.some((s) => s.command === suggestion.command)) found.push(suggestion)
  }
  const npm = suggestRunCommand(contents['package.json'] ?? null, files)
  if (npm) add({ command: npm, label: 'Node' })
  add(gradleSuggestion(info, platform))
  add(mavenSuggestion(info, platform))
  dotnetSuggestions(info).forEach(add)
  if (files.includes('Cargo.toml')) add({ command: 'cargo run', label: 'Rust' })
  if (files.includes('go.mod')) add({ command: 'go run .', label: 'Go' })
  if (files.includes('pubspec.yaml')) add({ command: 'flutter run', label: 'Flutter' })
  add(pythonSuggestion(info))
  if (files.includes('Gemfile') && files.includes('config.ru')) add({ command: 'bin/rails server', label: 'Rails' })
  if (/^run:/m.test(contents['Makefile'] ?? '')) add({ command: 'make run', label: 'Make' })
  return found
}

/**
 * Untracked files a project usually needs to start but never commits, copied
 * into an isolated run's checkout: env files, Android's SDK path and signing
 * properties, and .NET's local settings.
 */
export const DEFAULT_RUN_COPY_PATTERNS = ['.env*', 'local.properties', 'keystore.properties', 'appsettings.*.json']

/** Whether a file name matches a pattern where `*` is any run of characters. */
export function matchesPattern(name: string, pattern: string): boolean {
  const regex = new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
  return regex.test(name)
}

/** Splits the comma or newline separated paths a user typed into a clean list. */
export function parseCopyPatterns(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((s) => s.trim().replace(/\\/g, '/').replace(/^\.\//, ''))
        .filter((s) => s && !s.startsWith('/') && !s.split('/').includes('..'))
    )
  ]
}
