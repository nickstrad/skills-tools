package course_test

import (
	"strings"
	"testing"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/testutil"
)

const setupChoices = "### Setup - script\n\nChoose one option.\n\n```sh\nprintf scripted\n```\n\n### Setup - manual\n\nPrepare explicitly.\n\n```sh\nprintf first\n```\n\nThen continue.\n\n```sh\nprintf second\n```"

func TestSetupChoicesRoundTripAndSelection(t *testing.T) {
	l := testutil.Lesson(1)
	l.Setup = setupChoices
	roundTrip(t, demo, l, nil)
	for mode, want := range map[string]string{"script": "printf scripted", "manual": "printf first\nprintf second"} {
		got, err := course.SetupCommands(l.Setup, mode)
		if err != nil || got != want {
			t.Fatalf("%s: %q, %v", mode, got, err)
		}
	}
	if got, err := course.SetupCommands("printf legacy", "script"); err != nil || got != "printf legacy" {
		t.Fatalf("legacy setup changed: %q %v", got, err)
	}
}

func TestSetupChoicesRejectIncompleteAlternatives(t *testing.T) {
	for _, bad := range []string{
		strings.Split(setupChoices, "### Setup - manual")[0],
		strings.Replace(setupChoices, "printf scripted", "", 1),
		setupChoices + "\n### Setup - manual\n```sh\necho duplicate\n```",
		strings.Replace(setupChoices, "Choose one option.", "```sh\necho extra\n```", 1),
	} {
		l := testutil.Lesson(1)
		l.Setup = bad
		if _, _, err := course.ParseLessonFile("bad.md", course.FormatLessonFile(demo, l, nil)); err == nil {
			t.Fatalf("accepted invalid setup: %s", bad)
		}
	}
}
