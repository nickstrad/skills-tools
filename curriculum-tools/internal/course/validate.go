package course

import "fmt"

var (
	// Difficulties, SafetyLevels and RunIn are the closed vocabularies of the lesson header.
	Difficulties = []string{"beginner", "intermediate", "advanced"}
	SafetyLevels = []string{"read-only", "writes-data", "ddl", "locking", "privileged", "dangerous"}
	RunIn        = []string{"tool", "shell", "mixed"}
)

func in(set []string, v string) bool {
	for _, s := range set {
		if s == v {
			return true
		}
	}
	return false
}

// Validate checks a complete, ordinal-sorted catalog the way the Deno engine's validateLessons did.
func Validate(lessons []Lesson) error {
	if len(lessons) == 0 {
		return fmt.Errorf("a course must contain at least one lesson")
	}
	ordinals := map[int]bool{}
	slugs := map[string]bool{}
	consecutive := true
	for i, l := range lessons {
		ordinals[l.Ordinal] = true
		slugs[l.Slug] = true
		if l.Ordinal != i+1 {
			consecutive = false
		}
	}
	if len(ordinals) != len(lessons) || len(slugs) != len(lessons) || !consecutive {
		return fmt.Errorf("lessons must have unique slugs and consecutive ordinals 1..%d", len(lessons))
	}
	for _, l := range lessons {
		where := fmt.Sprintf("lesson %d (%s)", l.Ordinal, l.Slug)
		for _, f := range []struct{ name, value string }{
			{"title", l.Title}, {"overview", l.Overview}, {"syntaxBreakdown", l.SyntaxBreakdown},
			{"code", l.Code}, {"expectedResult", l.ExpectedResult}, {"systemsLens", l.SystemsLens},
			{"category", l.Category}, {"minVersion", l.MinVersion},
		} {
			if trimSpace(f.value) == "" {
				return fmt.Errorf("%s has an empty %s", where, f.name)
			}
		}
		if !ValidSlug(l.Slug) {
			return fmt.Errorf("%s has a bad slug", where)
		}
		seen := map[string]bool{}
		for _, t := range l.Tags {
			if !ValidSlug(t) {
				return fmt.Errorf("%s has a bad tag (use kebab-case)", where)
			}
			if seen[t] {
				return fmt.Errorf("%s repeats a tag", where)
			}
			seen[t] = true
		}
		if !in(Difficulties, l.Difficulty) {
			return fmt.Errorf("%s has a bad difficulty", where)
		}
		if !in(SafetyLevels, l.SafetyLevel) {
			return fmt.Errorf("%s has a bad safetyLevel", where)
		}
		if !in(RunIn, l.RunIn) {
			return fmt.Errorf("%s has a bad runIn", where)
		}
		if l.Sessions < 1 || l.Sessions > 4 {
			return fmt.Errorf("%s has a bad sessions count", where)
		}
		if l.EstimatedMinutes < 1 {
			return fmt.Errorf("%s has a bad estimatedMinutes", where)
		}
		if l.Revision < 1 {
			return fmt.Errorf("%s has a bad revision", where)
		}
		seenP := map[int]bool{}
		for _, p := range l.Prerequisites {
			if seenP[p] {
				return fmt.Errorf("%s repeats a prerequisite", where)
			}
			seenP[p] = true
		}
		for _, p := range l.Prerequisites {
			if p >= l.Ordinal || !ordinals[p] {
				return fmt.Errorf("%s has an invalid prerequisite", where)
			}
		}
	}
	return nil
}
