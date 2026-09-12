# Normalize locale-sensitive shell observations

slug: normalize-shell-observations
category: lab-and-shell-discipline
difficulty: beginner
tags: lab, shell
prerequisites: build-disposable-linux-lab
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 8
revision: 2

## Overview
Create a tiny observation input, show the active locale and ordering, then run the same observation under LC_ALL=C. Stable labels prevent a locale or timezone difference from looking like a systems regression.

## Syntax breakdown
### In plain terms

The same bytes can sort differently under different locales. This experiment makes a small controlled input, records the active setting, then produces a stable comparison under the C locale.

### What you are learning

- Locale controls collation and message formatting.
- An epoch timestamp is a sampled observation, not a reproducible expected number.

### Piece by piece

- **printf** writes exactly four newline-delimited records to the lab file; `>` replaces only that experiment file.
- **locale charmap** reports the active character encoding, and **sort** orders the records under the active locale; `raw_order` may differ across machines.
- **LC_ALL=C sort** sets C only for that command. `stable_order=A,B,a,b,` is the byte-order control observation.
- **tr '\n' ','** makes sorted line endings visible as commas.
- **date +%s** prints seconds since the Unix epoch; `epoch_seconds` must change between runs. **rm -f** removes the exact file and the test prints cleanup evidence.

## Setup
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
```

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
ORDER_FILE=$LAB/locale-order.txt
printf 'b\nA\na\nB\n' > "$ORDER_FILE"
if [ -z "$LC_ALL" ]; then printf 'active_locale=unset\n'; else printf 'active_locale=%s\n' "$LC_ALL"; fi
printf 'active_charmap=%s\n' "$(locale charmap)"
printf 'raw_order='; sort "$ORDER_FILE" | tr '\n' ','; printf '\n'
printf 'stable_locale=C\n'
printf 'stable_order='; LC_ALL=C sort "$ORDER_FILE" | tr '\n' ','; printf '\n'
printf 'epoch_seconds=%s\n' "$(LC_ALL=C date +%s)"
rm -f "$ORDER_FILE"
printf 'cleanup=order_file_absent:%s\n' "$(test ! -e "$ORDER_FILE" && echo yes || echo no)"
```

## Expected result
active_locale is C when LC_ALL was exported as lesson 1 asks (unset otherwise), stable_locale=C, and stable_order is A,B,a,b,. epoch_seconds is a changing numeric timestamp, while the locale and ordering labels are stable. cleanup=order_file_absent:yes proves the only artifact was removed.

## Systems lens
Measurements are part of the experiment's control plane. LC_ALL=C fixes collation and diagnostics so diffs represent kernel behavior rather than a machine's language configuration.

## Optional variation
**Predict.** Whether `raw_order` equals `stable_order` when the inherited locale is already C.

**Inspect and explain.** Compare the two labeled orders and explain why the epoch number is deliberately excluded from a stable assertion.

**Vary.** Run LC_ALL=C sort on ORDER_FILE only while the file exists, then rerun the supplied cleanup.

**Hint.** The code removes ORDER_FILE at the end; add the one command immediately before that rm if exploring manually.

**Apply.** Choose one locale-sensitive field in a production diagnostic and state the fixed representation you would log.
