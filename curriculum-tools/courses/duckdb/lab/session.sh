#!/usr/bin/env bash
# Source this Bash glue to prepare a lesson and expose its CLI and cleanup helpers.
# Do not set shell options here: this file runs in the learner's interactive shell.
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  echo 'Use: source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 2' >&2
  exit 1
fi

_duck_session_start() {
  local lesson=${1:-} course lab source_file
  if [[ $# != 1 || ! $lesson =~ ^[2-5]$ ]]; then
    echo 'Usage: source .../lab/session.sh LESSON_NUMBER (2–5)' >&2
    return 1
  fi
  if [[ -n ${DUCK_LAB:-} ]]; then
    echo 'A DUCK_LAB is already selected. Finish its cleanup before starting another lesson.' >&2
    return 1
  fi
  course=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd) || return
  lab=$(bash "$course/lab/setup.sh" "$lesson") || return
  if [[ -z $lab ]]; then
    echo 'Setup returned no lab directory.' >&2
    return 1
  fi
  if [[ $lesson != 2 ]]; then
    source_file=source.sqlite
    if [[ $lesson == 5 ]]; then source_file=orders.csv; fi
    if ! sha256sum "$lab/$source_file" > "$lab/source.sha256"; then
      bash "$course/lab/cleanup.sh" "$lab"
      return 1
    fi
  fi
  export DUCK_COURSE="$course" DUCK_LAB="$lab"

  duck() { bash "$DUCK_COURSE/lab/duckdb.sh" "$@"; }
  duck_check_source() {
    if [[ -z ${DUCK_LAB:-} || ! -f $DUCK_LAB/source.sha256 ]]; then
      echo 'No file fingerprint is active (available in lessons 3–5).' >&2
      return 1
    fi
    sha256sum -c "$DUCK_LAB/source.sha256"
  }
  duck_cleanup() {
    if [[ -z ${DUCK_LAB:-} ]]; then return 0; fi
    bash "$DUCK_COURSE/lab/cleanup.sh" "$DUCK_LAB" || return
    unset DUCK_LAB
    if [[ ${_DUCK_SESSION_EXIT_TRAP:-} == "$(trap -p EXIT)" ]]; then
      trap - EXIT
    fi
    unset _DUCK_SESSION_EXIT_TRAP
  }

  # Retain a caller's existing EXIT handler; explicit cleanup always works.
  if [[ -z $(trap -p EXIT) ]]; then
    trap 'duck_cleanup' EXIT
    _DUCK_SESSION_EXIT_TRAP=$(trap -p EXIT)
  else
    echo 'Existing EXIT trap retained; run duck_cleanup when finished.' >&2
  fi
  printf 'Lesson %s ready. DUCK_LAB=%s\nCleanup: duck_cleanup\n' "$lesson" "$DUCK_LAB"
}

_duck_session_start "$@"
