package course

import (
	"fmt"
	"strings"
)

const setupScriptHeading = "### Setup - script"
const setupManualHeading = "### Setup - manual"

// HasSetupChoices distinguishes the optional Markdown setup alternatives from legacy raw code.
func HasSetupChoices(setup string) bool {
	return strings.HasPrefix(setup, setupScriptHeading+"\n")
}

// SetupCommands selects one setup path. Legacy setup remains unchanged. A scripted choice has
// exactly one code block; a manual choice can explain several commands in separate blocks.
// Manual blocks must use the lesson's execution language to be run together by a validator.
func SetupCommands(setup, choice string) (string, error) {
	if choice != "script" && choice != "manual" {
		return "", fmt.Errorf("unknown setup choice %q", choice)
	}
	if !HasSetupChoices(setup) {
		if choice == "manual" {
			return "", fmt.Errorf("lesson has no manual setup choice")
		}
		return setup, nil
	}
	blocks := map[string][]string{"script": {}, "manual": {}}
	current, fenceLen := "", 0
	var code []string
	seen := map[string]bool{}
	for _, line := range strings.Split(setup, "\n") {
		n := leadingBackticks(line)
		if fenceLen > 0 {
			if n >= fenceLen && strings.Trim(line, "`") == "" {
				blocks[current] = append(blocks[current], strings.Join(code, "\n"))
				fenceLen, code = 0, nil
			} else {
				code = append(code, line)
			}
			continue
		}
		if line == setupScriptHeading || line == setupManualHeading {
			current = "script"
			if line == setupManualHeading {
				current = "manual"
			}
			if seen[current] {
				return "", fmt.Errorf("duplicate setup choice %q", current)
			}
			seen[current] = true
		} else if n >= 3 {
			fenceLen = n
		}
	}
	if fenceLen != 0 {
		return "", fmt.Errorf("unclosed setup choice fence")
	}
	if !seen["manual"] || len(blocks["script"]) != 1 || len(blocks["manual"]) == 0 {
		return "", fmt.Errorf("setup choices need one script block and at least one manual block")
	}
	for mode, list := range blocks {
		for _, block := range list {
			if strings.TrimSpace(block) == "" {
				return "", fmt.Errorf("empty %s setup block", mode)
			}
		}
	}
	return strings.Join(blocks[choice], "\n"), nil
}
