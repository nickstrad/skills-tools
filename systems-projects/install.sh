#!/bin/sh
# Install links, preserving any unrelated command or skill already present.
set -eu
SYSTEMS_INSTALL_ROOT=$(dirname "$(readlink -f "$0")")
SYSTEMS_BIN_DIR=${1:-/usr/local/bin}
SYSTEMS_SKILLS_DIR=${2:-${CODEX_HOME:-$HOME/.codex}/skills}
if [ "$#" -gt 2 ]; then
  echo 'usage: install.sh [BIN_DIRECTORY [SKILLS_DIRECTORY]]' >&2
  exit 2
fi
check_link() {
  if [ -e "$2" ] || [ -L "$2" ]; then
    if [ "$(readlink -f "$2")" != "$(readlink -f "$1")" ]; then
      echo "Refusing to overwrite existing path: $2" >&2
      exit 1
    fi
  fi
}
# Check both destinations before creating either link.
check_link "$SYSTEMS_INSTALL_ROOT/bin/systemscoach" "$SYSTEMS_BIN_DIR/systemscoach"
check_link "$SYSTEMS_INSTALL_ROOT/skills/systemscoach" "$SYSTEMS_SKILLS_DIR/systemscoach"
mkdir -p "$SYSTEMS_BIN_DIR" "$SYSTEMS_SKILLS_DIR"
if [ ! -e "$SYSTEMS_BIN_DIR/systemscoach" ]; then
  ln -s "$SYSTEMS_INSTALL_ROOT/bin/systemscoach" "$SYSTEMS_BIN_DIR/systemscoach"
fi
if [ ! -e "$SYSTEMS_SKILLS_DIR/systemscoach" ]; then
  ln -s "$SYSTEMS_INSTALL_ROOT/skills/systemscoach" "$SYSTEMS_SKILLS_DIR/systemscoach"
fi
printf 'Launcher: %s/systemscoach\nSkill: %s/systemscoach\n' "$SYSTEMS_BIN_DIR" "$SYSTEMS_SKILLS_DIR"
