import { describe, expect, it } from 'vitest'
import { detectRunCommands, dotnetProjects, matchesPattern, parseCopyPatterns, type FolderInfo } from './runDetect'

const commands = (info: Partial<FolderInfo>, platform = 'darwin'): string[] =>
  detectRunCommands({ files: [], contents: {}, ...info }, platform).map((s) => s.command)

describe('detectRunCommands', () => {
  it('runs an Android app with the Gradle wrapper', () => {
    const info = {
      files: ['gradlew', 'build.gradle.kts', 'app', 'settings.gradle.kts'],
      contents: { 'build.gradle.kts': '', 'app/build.gradle.kts': 'plugins { alias(libs.plugins.android.application) }' }
    }
    expect(commands(info)).toEqual(['./gradlew installDebug'])
    expect(commands(info, 'win32')).toEqual(['gradlew installDebug'])
  })

  it('runs Spring Boot with Gradle or Maven', () => {
    expect(commands({ files: ['gradlew'], contents: { 'build.gradle': "id 'org.springframework.boot' version '3.3.0'" } })).toEqual([
      './gradlew bootRun'
    ])
    expect(commands({ files: ['pom.xml', 'mvnw'], contents: { 'pom.xml': '<artifactId>spring-boot-starter-web</artifactId>' } })).toEqual([
      './mvnw spring-boot:run'
    ])
    expect(commands({ files: ['pom.xml'], contents: { 'pom.xml': '<project/>' } })).toEqual(['mvn compile exec:java'])
  })

  it('runs a lone .NET project as is', () => {
    expect(commands({ files: ['Api.csproj'], contents: { 'Api.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web">' } })).toEqual([
      'dotnet run'
    ])
  })

  it('offers each runnable project in a solution, skipping libraries and tests', () => {
    const sln = [
      'Project("{FAE04EC0}") = "Api", "src\\Api\\Api.csproj", "{1}"',
      'Project("{FAE04EC0}") = "Core", "src\\Core\\Core.csproj", "{2}"',
      'Project("{FAE04EC0}") = "Tool", "tools\\Tool\\Tool.csproj", "{3}"'
    ].join('\n')
    const info = {
      files: ['Shop.sln', 'src', 'tools'],
      contents: {
        'Shop.sln': sln,
        'src/Api/Api.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web">',
        'src/Core/Core.csproj': '<Project Sdk="Microsoft.NET.Sdk">',
        'tools/Tool/Tool.csproj': '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType>'
      }
    }
    expect(dotnetProjects(info.files, info.contents)).toEqual(['src/Api/Api.csproj', 'src/Core/Core.csproj', 'tools/Tool/Tool.csproj'])
    expect(detectRunCommands(info, 'darwin')).toEqual([
      { command: 'dotnet run --project src/Api/Api.csproj', label: '.NET (Api)' },
      { command: 'dotnet run --project tools/Tool/Tool.csproj', label: '.NET (Tool)' }
    ])
  })

  it('knows the other common ecosystems', () => {
    expect(commands({ files: ['Cargo.toml'] })).toEqual(['cargo run'])
    expect(commands({ files: ['go.mod'] })).toEqual(['go run .'])
    expect(commands({ files: ['pubspec.yaml'] })).toEqual(['flutter run'])
    expect(commands({ files: ['manage.py', 'uv.lock'] })).toEqual(['uv run python manage.py runserver'])
    expect(commands({ files: ['pyproject.toml', 'poetry.lock'], contents: { 'pyproject.toml': '[project.scripts]\nserve = "app:main"\n' } })).toEqual(['poetry run serve'])
    expect(commands({ files: ['main.py'] })).toEqual(['python3 main.py'])
    expect(commands({ files: ['Gemfile', 'config.ru'] })).toEqual(['bin/rails server'])
    expect(commands({ files: ['Makefile'], contents: { Makefile: 'build:\n\tgo build\nrun:\n\tgo run .\n' } })).toEqual(['make run'])
  })

  it('lists a package.json script first when a folder has several kinds of project', () => {
    expect(commands({ files: ['package.json', 'Cargo.toml'], contents: { 'package.json': '{"scripts":{"dev":"tauri dev"}}' } })).toEqual([
      'npm run dev',
      'cargo run'
    ])
  })

  it('suggests nothing for a folder it does not recognise', () => {
    expect(commands({ files: ['README.md', 'Program.cs'] })).toEqual([])
  })
})

describe('copy patterns', () => {
  it('matches * within a file name', () => {
    expect(matchesPattern('.env.local', '.env*')).toBe(true)
    expect(matchesPattern('appsettings.Development.json', 'appsettings.*.json')).toBe(true)
    expect(matchesPattern('appsettings.json', 'appsettings.*.json')).toBe(false)
    expect(matchesPattern('local.properties', 'local.properties')).toBe(true)
    expect(matchesPattern('localXproperties', 'local.properties')).toBe(false)
  })

  it('cleans up what the user typed and refuses paths outside the repo', () => {
    expect(parseCopyPatterns(' app/google-services.json, ./secrets.json\n..\\up.txt, /etc/hosts, ,app/google-services.json')).toEqual([
      'app/google-services.json',
      'secrets.json'
    ])
  })
})
