package progress_test

// Ports of tests/main_test.ts:
//   "show, done, next, undone, skip, and status preserve explicit progress"
//     -> TestShowDoneNextUndoneSkipStatusPreserveExplicitProgress
//   "a revised lesson becomes stale and is served again"
//     -> TestRevisedLessonBecomesStaleAndIsServedAgain
//   "search requires every term, list filters by category, modules summarizes"
//     -> TestSearchRequiresEveryTermListFiltersByCategoryModulesSummarizes
//   "topics lists tags and --topic serves the next unfinished matching lesson"
//     -> TestTopicsListsTagsAndTopicServesNextUnfinishedMatchingLesson
// plus additional coverage called for in the work package: repeated Done, case-insensitive
// multi-word topic matching, the List multi-flag error, Get's NotFoundError and a read-only
// guarantee check.

import (
	"crypto/sha256"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"skills-tools/tutor/internal/progress"
	"skills-tools/tutor/internal/testutil"
)

// setup builds a fixture "demo" course of n lessons and an initialized progress database for it.
func setup(t *testing.T, n int) *sql.DB {
	t.Helper()
	fx := testutil.NewCourse(t, n)
	db, err := progress.Open(filepath.Join(t.TempDir(), "progress.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := progress.Init(db, fx.Lessons); err != nil {
		t.Fatal(err)
	}
	return db
}

// Port of "show, done, next, undone, skip, and status preserve explicit progress".
func TestShowDoneNextUndoneSkipStatusPreserveExplicitProgress(t *testing.T) {
	db := setup(t, 9)

	// show 2 --json: ordinal 2, non-empty overview/syntaxBreakdown/code.
	shown, err := progress.Get(db, 2)
	if err != nil {
		t.Fatal(err)
	}
	if shown.Ordinal != 2 || shown.Overview == "" || shown.SyntaxBreakdown == "" || shown.Code == "" {
		t.Fatalf("show 2: %+v", shown)
	}

	// done 1 --note "ran it"; next -> ordinal 2.
	if err := progress.Done(db, 1, "ran it"); err != nil {
		t.Fatal(err)
	}
	row, _, complete, err := progress.Next(db, "")
	if err != nil || complete || row.Ordinal != 2 {
		t.Fatalf("next after done 1: row=%+v complete=%v err=%v", row, complete, err)
	}

	// skip 2; next -> ordinal 3.
	if err := progress.Skip(db, 2, ""); err != nil {
		t.Fatal(err)
	}
	row, _, complete, err = progress.Next(db, "")
	if err != nil || complete || row.Ordinal != 3 {
		t.Fatalf("next after skip 2: row=%+v complete=%v err=%v", row, complete, err)
	}

	// undone 1; next -> ordinal 1 again.
	if err := progress.Undone(db, 1); err != nil {
		t.Fatal(err)
	}
	row, _, complete, err = progress.Next(db, "")
	if err != nil || complete || row.Ordinal != 1 {
		t.Fatalf("next after undone 1: row=%+v complete=%v err=%v", row, complete, err)
	}

	// show 1 --json: notes "ran it" survived undone.
	one, err := progress.Get(db, 1)
	if err != nil {
		t.Fatal(err)
	}
	if one.Notes != "ran it" {
		t.Fatalf("note lost by undone: %q", one.Notes)
	}

	// status: done 0, skipped 1, todo total-1.
	status, err := progress.GetStatus(db)
	if err != nil {
		t.Fatal(err)
	}
	if status.Done != 0 || status.Skipped != 1 || status.Todo != status.Total-1 {
		t.Fatalf("status: %+v", status)
	}
}

// Port of "a revised lesson becomes stale and is served again".
func TestRevisedLessonBecomesStaleAndIsServedAgain(t *testing.T) {
	db := setup(t, 9)

	if err := progress.Done(db, 1, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("UPDATE lessons SET revision = revision + 1 WHERE ordinal = 1"); err != nil {
		t.Fatal(err)
	}
	row, _, complete, err := progress.Next(db, "")
	if err != nil {
		t.Fatal(err)
	}
	if complete || row.Ordinal != 1 || row.DisplayStatus() != "stale" {
		t.Fatalf("next after revision bump: row=%+v complete=%v", row, complete)
	}

	status, err := progress.GetStatus(db)
	if err != nil {
		t.Fatal(err)
	}
	if status.Stale != 1 {
		t.Fatalf("status stale: %+v", status)
	}
}

// Port of "search requires every term, list filters by category, modules summarizes".
// Fixture categories: "intro" (ordinals 1-2), "core" (ordinals 3-9). Every lesson's title
// contains "lesson"; only the intro lessons' category contains "intro".
func TestSearchRequiresEveryTermListFiltersByCategoryModulesSummarizes(t *testing.T) {
	db := setup(t, 9)

	rows, err := progress.Search(db, []string{"lesson", "intro"})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].Ordinal != 1 || rows[1].Ordinal != 2 {
		t.Fatalf("search requiring every term: %+v", rows)
	}

	none, err := progress.Search(db, []string{"zzzz-no-such-term"})
	if err != nil {
		t.Fatal(err)
	}
	if len(none) != 0 {
		t.Fatalf("search with no matches: %+v", none)
	}

	if _, err := progress.Search(db, []string{""}); err == nil || err.Error() != "search text is required" {
		t.Fatalf("empty search terms: %v", err)
	}

	listed, err := progress.List(db, progress.ListFilter{Category: "intro"})
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != 2 {
		t.Fatalf("list --category intro count: %+v", listed)
	}
	for _, r := range listed {
		if r.Category != "intro" {
			t.Fatalf("list --category intro leaked a row: %+v", r)
		}
	}

	modules, err := progress.Modules(db)
	if err != nil {
		t.Fatal(err)
	}
	if len(modules) != 2 {
		t.Fatalf("modules: %+v", modules)
	}
	if modules[0] != (progress.Module{Category: "intro", First: 1, Last: 2, Total: 2, Done: 0, Minutes: 10}) {
		t.Fatalf("modules[0]: %+v", modules[0])
	}
	if modules[1].Category != "core" || modules[1].First != 3 || modules[1].Last != 9 || modules[1].Total != 7 {
		t.Fatalf("modules[1]: %+v", modules[1])
	}
}

// Port of "topics lists tags and --topic serves the next unfinished matching lesson". Fixture
// tags: every lesson carries "demo" plus "topic-1"/"topic-2"/"topic-3" cycling by ordinal, so
// "topic-1" tags ordinals 1, 4, 7.
func TestTopicsListsTagsAndTopicServesNextUnfinishedMatchingLesson(t *testing.T) {
	db := setup(t, 9)

	topics, err := progress.Topics(db)
	if err != nil {
		t.Fatal(err)
	}
	var demo, topic1 *progress.Topic
	for i := range topics {
		switch topics[i].Tag {
		case "demo":
			demo = &topics[i]
		case "topic-1":
			topic1 = &topics[i]
		}
	}
	if demo == nil || demo.First != 1 || demo.Total != 9 {
		t.Fatalf("topics: demo tag: %+v", demo)
	}
	if topic1 == nil || topic1.First != 1 || topic1.Total != 3 || !reflect.DeepEqual(topic1.Lessons, []int{1, 4, 7}) {
		t.Fatalf("topics: topic-1 tag: %+v", topic1)
	}

	// --topic serves the next unfinished lesson matching every word, case-insensitively, against
	// tags/category/title.
	row, matched, complete, err := progress.Next(db, "DEMO CORE")
	if err != nil {
		t.Fatal(err)
	}
	if complete || matched != 7 || row.Ordinal != 3 {
		t.Fatalf("next --topic 'DEMO CORE': row=%+v matched=%d complete=%v", row, matched, complete)
	}

	if err := progress.Done(db, 3, ""); err != nil {
		t.Fatal(err)
	}
	row, matched, complete, err = progress.Next(db, "demo core")
	if err != nil {
		t.Fatal(err)
	}
	if complete || matched != 7 || row.Ordinal != 4 {
		t.Fatalf("next --topic after done 3: row=%+v matched=%d complete=%v", row, matched, complete)
	}

	for ordinal := 4; ordinal <= 9; ordinal++ {
		if err := progress.Done(db, ordinal, ""); err != nil {
			t.Fatal(err)
		}
	}
	_, matched, complete, err = progress.Next(db, "demo core")
	if err != nil {
		t.Fatal(err)
	}
	if !complete || matched != 7 {
		t.Fatalf("next --topic all complete: matched=%d complete=%v", matched, complete)
	}

	_, matched, complete, err = progress.Next(db, "zzzz-no-such-topic")
	if err != nil {
		t.Fatal(err)
	}
	if matched != 0 || complete {
		t.Fatalf("next --topic no match: matched=%d complete=%v", matched, complete)
	}

	if _, _, _, err := progress.Next(db, "   "); err == nil || err.Error() != "--topic requires at least one word" {
		t.Fatalf("blank --topic: %v", err)
	}

	listedByTopic, err := progress.List(db, progress.ListFilter{Topic: "topic-1"})
	if err != nil {
		t.Fatal(err)
	}
	var ordinals []int
	for _, r := range listedByTopic {
		ordinals = append(ordinals, r.Ordinal)
	}
	if !reflect.DeepEqual(ordinals, []int{1, 4, 7}) {
		t.Fatalf("list --topic topic-1: %v", ordinals)
	}
}

// Additional: a second Done with an empty note keeps the first note and records a second attempt.
func TestDoneTwiceKeepsNoteAndAddsSecondAttempt(t *testing.T) {
	db := setup(t, 3)

	if err := progress.Done(db, 1, "first note"); err != nil {
		t.Fatal(err)
	}
	if err := progress.Done(db, 1, ""); err != nil {
		t.Fatal(err)
	}
	row, err := progress.Get(db, 1)
	if err != nil {
		t.Fatal(err)
	}
	if row.Notes != "first note" {
		t.Fatalf("second done with empty note overwrote the first: %q", row.Notes)
	}
	var attempts int
	if err := db.QueryRow("SELECT count(*) FROM attempts WHERE lesson_id=?", row.ID).Scan(&attempts); err != nil {
		t.Fatal(err)
	}
	if attempts != 2 {
		t.Fatalf("attempts rows: %d", attempts)
	}
}

// Additional: List refuses more than one of --todo/--done/--all with the flags-joined message.
func TestListRejectsMultipleStatusFilters(t *testing.T) {
	db := setup(t, 3)

	if _, err := progress.List(db, progress.ListFilter{Todo: true, Done: true}); err == nil || err.Error() != "choose one of --todo, --done" {
		t.Fatalf("--todo --done: %v", err)
	}
	if _, err := progress.List(db, progress.ListFilter{Todo: true, All: true}); err == nil || err.Error() != "choose one of --todo, --all" {
		t.Fatalf("--todo --all: %v", err)
	}
}

// Additional: Get on an unknown ordinal returns a detectable NotFoundError.
func TestGetUnknownOrdinalReturnsNotFoundError(t *testing.T) {
	db := setup(t, 3)

	_, err := progress.Get(db, 99)
	var notFound progress.NotFoundError
	if !errors.As(err, &notFound) || notFound.Ordinal != 99 || err.Error() != "lesson 99 not found" {
		t.Fatalf("get 99: %v", err)
	}
}

// Additional: every read operation, run against an OpenReadOnly connection, leaves the database
// file byte-for-byte unchanged and creates no rollback journal.
func TestReadOperationsDoNotWrite(t *testing.T) {
	fx := testutil.NewCourse(t, 9)
	path := filepath.Join(t.TempDir(), "progress.sqlite")
	db, err := progress.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := progress.Init(db, fx.Lessons); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	beforeSum := sha256.Sum256(before)

	ro, err := progress.OpenReadOnly(path)
	if err != nil {
		t.Fatal(err)
	}
	defer ro.Close()

	if _, err := progress.Get(ro, 1); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := progress.Next(ro, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := progress.List(ro, progress.ListFilter{}); err != nil {
		t.Fatal(err)
	}
	if _, err := progress.Topics(ro); err != nil {
		t.Fatal(err)
	}
	if _, err := progress.Modules(ro); err != nil {
		t.Fatal(err)
	}
	if _, err := progress.GetStatus(ro); err != nil {
		t.Fatal(err)
	}
	if _, err := progress.Search(ro, []string{"lesson"}); err != nil {
		t.Fatal(err)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if sha256.Sum256(after) != beforeSum {
		t.Fatal("a read operation modified the database file")
	}
	if _, err := os.Stat(path + "-journal"); !os.IsNotExist(err) {
		t.Fatalf("a read operation left a rollback journal (err=%v)", err)
	}
}
