#!/usr/bin/env bash
# Sets up a Mac (Apple silicon) as a development machine and CI runner:
#
#   1. Xcode Command Line Tools, Homebrew, git, git-lfs, gh, jq and Node 22
#   2. clones every non-archived repo of the signed-in GitHub user into
#      ~/Projects (existing clones are fetched, never touched otherwise)
#   3. npm installs each clone that has a package.json and no node_modules
#   4. registers a self-hosted GitHub Actions runner for SillyGit, and for any
#      other cloned repo whose workflows use `self-hosted`, and installs each
#      one as a launchd service
#
# Safe to run again: every step skips what is already done.
#
# Usage: scripts/bootstrap-mac.sh [options]
#   --projects-dir DIR    where to clone (default ~/Projects)
#   --owner LOGIN         whose repos to clone (default: the gh user)
#   --include-archived    clone archived repos too
#   --skip-clone          don't clone or npm install
#   --skip-npm            clone but don't npm install
#   --skip-runner         don't register any runners
#   --runner-repo O/R     register a runner for this repo (repeatable); turns
#                         off the self-hosted detection, so list them all
#   --with-wine           install Rosetta and Wine, so release builds on this
#                         runner can make the Windows installer
#   --runner-labels L     extra labels, comma-separated (default: mini).
#                         self-hosted, macOS and ARM64 are always added by
#                         GitHub, which is what ci.yml asks for.
#
# The runner token comes from `gh`, so the gh account needs admin on each repo.
# Runners live in ~/actions-runner-<repo>, run as LaunchAgents and so only
# while this user is logged in: turn on automatic login and stop the Mac
# sleeping (sudo pmset -a sleep 0) if it's a headless CI box.

set -euo pipefail

PROJECTS_DIR="$HOME/Projects"
OWNER=""
INCLUDE_ARCHIVED=0
SKIP_CLONE=0
SKIP_NPM=0
SKIP_RUNNER=0
RUNNER_REPOS=""
RUNNER_LABELS="mini"
NODE_MAJOR=22
WITH_WINE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --projects-dir) PROJECTS_DIR="$2"; shift ;;
    --owner) OWNER="$2"; shift ;;
    --include-archived) INCLUDE_ARCHIVED=1 ;;
    --skip-clone) SKIP_CLONE=1 ;;
    --skip-npm) SKIP_NPM=1 ;;
    --skip-runner) SKIP_RUNNER=1 ;;
    --with-wine) WITH_WINE=1 ;;
    --runner-repo) RUNNER_REPOS="$RUNNER_REPOS $2"; shift ;;
    --runner-labels) RUNNER_LABELS="$2"; shift ;;
    -h|--help) sed -n '2,/^$/s/^# \{0,1\}//p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31mxx  %s\033[0m\n' "$*" >&2; exit 1; }

FAILURES=""
fail_later() { warn "$1"; FAILURES="$FAILURES
  - $1"; }

[ "$(uname -s)" = Darwin ] || die "This script is for macOS."
[ "$(uname -m)" = arm64 ] || warn "Not Apple silicon: CI asks for ARM64, so this runner won't get SillyGit jobs."

# ---------------------------------------------------------------- tools

step "Xcode Command Line Tools"
if xcode-select -p >/dev/null 2>&1; then
  note "installed at $(xcode-select -p)"
else
  xcode-select --install || true
  die "Finish the Command Line Tools installer that just opened, then run this again."
fi

step "Homebrew"
if ! command -v brew >/dev/null 2>&1 && [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi
if command -v brew >/dev/null 2>&1; then
  note "installed at $(command -v brew)"
else
  # The installer asks for the admin password once.
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi
if ! grep -qs 'brew shellenv' "$HOME/.zprofile"; then
  # shellcheck disable=SC2016 # written unexpanded, for new shells to run
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
  note "added brew to ~/.zprofile"
fi

step "git, git-lfs, gh, jq, Node $NODE_MAJOR"
for formula in git git-lfs gh jq "node@$NODE_MAJOR"; do
  if brew list --formula "$formula" >/dev/null 2>&1; then
    note "$formula already installed"
  else
    brew install "$formula"
  fi
done
# node@22 is keg-only, so put it on PATH for this run and for new shells.
NODE_PREFIX="$(brew --prefix "node@$NODE_MAJOR")"
export PATH="$NODE_PREFIX/bin:$PATH"
if ! grep -qs "node@$NODE_MAJOR/bin" "$HOME/.zprofile"; then
  echo "export PATH=\"$NODE_PREFIX/bin:\$PATH\"" >> "$HOME/.zprofile"
  note "added node@$NODE_MAJOR to ~/.zprofile"
fi
note "node $(node --version), npm $(npm --version)"
git lfs install --skip-repo >/dev/null
note "git-lfs hooks installed"

if [ "$WITH_WINE" = 1 ]; then
  step "Rosetta and Wine"
  if /usr/bin/pgrep -q oahd; then
    note "Rosetta already installed"
  else
    softwareupdate --install-rosetta --agree-to-license
  fi
  # Homebrew disabled its Wine casks in September 2026 (they fail Gatekeeper),
  # but still knows the build and checksum, so fetch that build ourselves and
  # link it the way the cask did.
  wine_app="/Applications/Wine Stable.app"
  if command -v wine >/dev/null 2>&1; then
    note "wine already installed at $(command -v wine)"
  elif [ -d "$wine_app" ]; then
    note "$wine_app already there"
  else
    cask="$(brew info --cask --json=v2 wine-stable)"
    wine_url="$(printf '%s' "$cask" | jq -r '.casks[0].url')"
    wine_sha="$(printf '%s' "$cask" | jq -r '.casks[0].sha256')"
    wine_tmp="$(mktemp -d)"
    curl -fsSL -o "$wine_tmp/wine.tar.xz" "$wine_url"
    if [ "$(shasum -a 256 "$wine_tmp/wine.tar.xz" | cut -d' ' -f1)" = "$wine_sha" ]; then
      tar -xJf "$wine_tmp/wine.tar.xz" -C /Applications
    else
      fail_later "Wine download checksum mismatch, skipped"
    fi
    rm -rf "$wine_tmp"
  fi
  if [ -d "$wine_app" ]; then
    for bin in wine wineserver wineboot winepath; do
      src="$wine_app/Contents/Resources/wine/bin/$bin"
      if [ -e "$src" ] && [ ! -e "/opt/homebrew/bin/$bin" ]; then
        ln -s "$src" "/opt/homebrew/bin/$bin"
      fi
    done
  fi
fi

step "GitHub sign-in"
if ! gh auth status >/dev/null 2>&1; then
  if [ -t 0 ]; then
    gh auth login --hostname github.com --git-protocol https --web
  else
    die "gh isn't signed in. Run 'gh auth login' in Terminal, then run this again."
  fi
fi
gh auth setup-git
[ -n "$OWNER" ] || OWNER="$(gh api user --jq .login)"
note "signed in; cloning repos of $OWNER"

# ---------------------------------------------------------------- repos

if [ "$SKIP_CLONE" = 0 ]; then
  step "Cloning into $PROJECTS_DIR"
  mkdir -p "$PROJECTS_DIR"
  filter='.[] | select(.isArchived | not) | .name'
  [ "$INCLUDE_ARCHIVED" = 1 ] && filter='.[] | .name'
  repos="$(gh repo list "$OWNER" --limit 500 --json name,isArchived --jq "$filter")"
  [ -n "$repos" ] || warn "No repos found for $OWNER."

  for name in $repos; do
    dir="$PROJECTS_DIR/$name"
    if [ -d "$dir/.git" ]; then
      note "$name: already cloned, fetching"
      git -C "$dir" fetch --all --prune --quiet || fail_later "$name: fetch failed"
    elif [ -e "$dir" ]; then
      fail_later "$name: $dir exists but isn't a git repo, skipped"
      continue
    else
      note "$name: cloning"
      gh repo clone "$OWNER/$name" "$dir" -- --quiet || { fail_later "$name: clone failed"; continue; }
    fi

    if [ "$SKIP_NPM" = 0 ] && [ -f "$dir/package.json" ] && [ ! -d "$dir/node_modules" ]; then
      note "$name: npm install"
      if [ -f "$dir/package-lock.json" ]; then
        (cd "$dir" && npm ci --no-audit --no-fund) || fail_later "$name: npm ci failed"
      else
        (cd "$dir" && npm install --no-audit --no-fund) || fail_later "$name: npm install failed"
      fi
    fi
  done
fi

# ---------------------------------------------------------------- runners

register_runner() {
  repo="$1"
  short="$(basename "$repo" | tr '[:upper:]' '[:lower:]')"
  dir="$HOME/actions-runner-$short"
  name="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"

  if [ -f "$dir/.runner" ]; then
    note "$repo: runner already configured in $dir"
  else
    note "$repo: setting up a runner in $dir"
    mkdir -p "$dir"
    if [ ! -x "$dir/config.sh" ]; then
      # Latest osx-arm64 build, checked against the SHA-256 in the release notes.
      release="$(gh api repos/actions/runner/releases/latest)"
      version="$(printf '%s' "$release" | jq -r .tag_name | sed 's/^v//')"
      tarball="actions-runner-osx-arm64-$version.tar.gz"
      expected="$(printf '%s' "$release" | jq -r .body \
        | sed -n 's/.*<!-- BEGIN SHA osx-arm64 -->\([0-9a-f]*\)<!-- END SHA osx-arm64 -->.*/\1/p')"
      curl -fsSL -o "$dir/$tarball" \
        "https://github.com/actions/runner/releases/download/v$version/$tarball"
      actual="$(shasum -a 256 "$dir/$tarball" | cut -d' ' -f1)"
      if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
        rm -f "$dir/$tarball"
        fail_later "$repo: runner download checksum mismatch, skipped"
        return
      fi
      tar -xzf "$dir/$tarball" -C "$dir"
      rm -f "$dir/$tarball"
    fi
    token="$(gh api -X POST "repos/$repo/actions/runners/registration-token" --jq .token)" \
      || { fail_later "$repo: no registration token (needs repo admin)"; return; }
    (cd "$dir" && ./config.sh --unattended --replace \
      --url "https://github.com/$repo" --token "$token" \
      --name "$name" --labels "$RUNNER_LABELS" --work _work) \
      || { fail_later "$repo: runner config failed"; return; }
  fi

  if (cd "$dir" && ./svc.sh status 2>/dev/null | grep -q 'Started'); then
    note "$repo: service already running"
  else
    (cd "$dir" && { ./svc.sh install >/dev/null 2>&1 || true; } && ./svc.sh start) \
      || fail_later "$repo: couldn't start the runner service"
  fi
}

if [ "$SKIP_RUNNER" = 0 ]; then
  step "GitHub Actions runners"
  if [ -z "$RUNNER_REPOS" ]; then
    RUNNER_REPOS="bryn-hill/SillyGit"
    for wf_dir in "$PROJECTS_DIR"/*/.github/workflows; do
      [ -d "$wf_dir" ] || continue
      if grep -rqs 'self-hosted' "$wf_dir"; then
        repo_dir="$(dirname "$(dirname "$wf_dir")")"
        repo="$(git -C "$repo_dir" remote get-url origin \
          | sed -E 's#^(https://github.com/|git@github.com:)##; s#\.git$##')"
        case " $(echo "$RUNNER_REPOS" | tr '[:upper:]' '[:lower:]') " in
          *" $(echo "$repo" | tr '[:upper:]' '[:lower:]') "*) ;;
          *) RUNNER_REPOS="$RUNNER_REPOS $repo" ;;
        esac
      fi
    done
  fi
  for repo in $RUNNER_REPOS; do
    register_runner "$repo"
  done
fi

# ---------------------------------------------------------------- done

step "Done"
if [ -n "$FAILURES" ]; then
  warn "Finished with problems:$FAILURES"
  exit 1
fi
note "Everything is set up. Open a new terminal to pick up the PATH changes."
