package route

import (
	"fmt"
	"skills-tools/tutor/internal/course"
)

// ValidateNames rejects ambiguous command namespaces before command registration or writes.
// Keep the reserved set in step with the root commands, including Cobra's built-in commands.
func ValidateNames(courses []CourseDiscovery) error {
	owners := map[string]string{}
	for _, name := range []string{"help", "completion", "courses", "roadmap", "version", "new-course", "install", "progress"} {
		owners[name] = "top-level command"
	}
	for _, c := range courses {
		local := map[string]bool{}
		for _, name := range []string{c.ID, c.StorageID()} {
			if local[name] {
				continue
			}
			local[name] = true
			if !course.ValidSlug(name) {
				return fmt.Errorf("invalid course command name %q", name)
			}
			owner := "course " + c.StorageID()
			if previous, exists := owners[name]; exists {
				return fmt.Errorf("course command name %q collides between %s and %s", name, previous, owner)
			}
			owners[name] = owner
		}
	}
	return nil
}
