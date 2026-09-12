package render

import "testing"

// TestStyleMarkdown covers every StyleMarkdown rule from a hand-written 12-line sample: h1/h2/h3
// headings, a fenced block (fence lines dim, inner lines cyan), two bold spans on one line, a
// top-level "- " bullet and an indented "  - " bullet, two trailing spaces stripped, and a plain
// line left unchanged.
func TestStyleMarkdown(t *testing.T) {
	input := "# Title\n" +
		"## Section\n" +
		"### Sub\n" +
		"```sql\n" +
		"SELECT 1;\n" +
		"```\n" +
		"**bold1** and **bold2**\n" +
		"- top bullet\n" +
		"  - nested bullet\n" +
		"trailing space line  \n" +
		"plain line\n" +
		"final"

	want := "\x1b[1;36mTitle\x1b[0m\n" +
		"\x1b[1;33mSection\x1b[0m\n\x1b[2m" + dashes72 + "\x1b[0m\n" +
		"\x1b[1;32mSub\x1b[0m\n" +
		"\x1b[2m```sql\x1b[0m\n" +
		"\x1b[36mSELECT 1;\x1b[0m\n" +
		"\x1b[2m```\x1b[0m\n" +
		"\x1b[1mbold1\x1b[22m and \x1b[1mbold2\x1b[22m\n" +
		"\x1b[35m•\x1b[0m top bullet\n" +
		"  \x1b[35m•\x1b[0m nested bullet\n" +
		"trailing space line\n" +
		"plain line\n" +
		"final"

	if got := StyleMarkdown(input); got != want {
		t.Fatalf("StyleMarkdown mismatch\n--- got ---\n%q\n--- want ---\n%q", got, want)
	}
}

const dashes72 = "────────────────────────────────────────────────────────────────────────"

func TestDashes72Length(t *testing.T) {
	if n := len([]rune(dashes72)); n != 72 {
		t.Fatalf("dashes72 has %d runes, want 72", n)
	}
}
