package route

import "testing"

func TestCommandNamespace(t *testing.T) {
	legacy := CourseDiscovery{ID: "demo-legacy", StoredID: "demo", Implemented: true}
	if err := ValidateNames([]CourseDiscovery{legacy, {ID: "future-demo", Planned: true}}); err != nil {
		t.Fatal(err)
	}
	for _, other := range []CourseDiscovery{
		{ID: "demo", Planned: true},
		{ID: "demo-legacy", Planned: true},
		{ID: "other", StoredID: "demo-legacy", Implemented: true},
		{ID: "demo-legacy", StoredID: "other", Implemented: true},
		{ID: "install"}, {ID: "help"}, {ID: "completion"},
		{ID: "other", StoredID: "progress"}, {ID: "Bad Name"},
	} {
		t.Run(other.ID+"/"+other.StoredID, func(t *testing.T) {
			if err := ValidateNames([]CourseDiscovery{legacy, other}); err == nil {
				t.Fatalf("accepted ambiguous or invalid namespace: %+v", other)
			}
		})
	}
}
