#!/usr/bin/env bash
# Source this Bash glue to prepare a lesson and expose its CLI and cleanup helpers.
# Do not set shell options here: this file runs in the learner's interactive shell.
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  echo 'Use: source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 2' >&2
  exit 1
fi

_duck_session_start() {
  local lesson=${1:-} mode=${2:-script} course lab source_file
  if [[ $# -lt 1 || $# -gt 2 || ! $lesson =~ ^[1-5]$ || ! $mode =~ ^(script|manual)$ ]]; then
    echo 'Usage: source .../lab/session.sh LESSON_NUMBER (1–5) [script|manual]' >&2
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
  if (( lesson >= 3 )); then
    source_file=source.sqlite
    if [[ $lesson == 5 ]]; then source_file=orders.csv; fi
    if ! sha256sum "$lab/$source_file" > "$lab/source.sha256"; then
      bash "$course/lab/cleanup.sh" "$lab"
      return 1
    fi
  fi
  export DUCK_COURSE="$course" DUCK_LAB="$lab"
  export DUCK_DB=:memory:
  if [[ $lesson == 2 ]]; then DUCK_DB="$lab/local.duckdb"; fi

  duck() { bash "$DUCK_COURSE/lab/duckdb.sh" "$@"; }
  duck_run() {
    if [[ -z ${DUCK_LAB:-} || ! -f $DUCK_LAB/query.sql || ! -f $DUCK_LAB/session.sql ]]; then
      echo 'No complete lab is selected. Source session.sh with the lesson number first.' >&2
      return 1
    fi
    # Redirection reads both files before starting DuckDB, so a missing input cannot
    # silently execute only the other half of a pipeline.
    local connection query
    connection=$(cat "$DUCK_LAB/session.sql") || return
    query=$(cat "$DUCK_LAB/query.sql") || return
    duck "$DUCK_DB" -bail -csv <<< "$connection
$query"
  }
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
    unset DUCK_LAB DUCK_DB
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
  if [[ $mode == script ]] && ! bash "$course/lab/inspect.sh" "$lesson" "$lab"; then
    duck_cleanup
    return 1
  fi
  if [[ $mode == manual ]]; then
    echo 'Fixture ready. Run the lesson’s manual DuckDB setup commands next.'
  fi
  printf 'Lesson %s ready. Edit the supplied starter: %s/query.sql\nRun:\n' "$lesson" "$DUCK_LAB"
  if [[ $lesson == 5 ]]; then
    printf '%s\n' 'duck :memory: -bail -csv < "$DUCK_LAB/query.sql"'
  elif [[ $lesson == 2 ]]; then
    printf '%s\n' 'cat "$DUCK_LAB/session.sql" "$DUCK_LAB/query.sql" |' \
      '  duck "$DUCK_LAB/local.duckdb" -bail -csv'
  else
    printf '%s\n' 'cat "$DUCK_LAB/session.sql" "$DUCK_LAB/query.sql" |' \
      '  duck :memory: -bail -csv'
  fi
  printf 'Cleanup: duck_cleanup\n'
}

_duck_session_start "$@"
