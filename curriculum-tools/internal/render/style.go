package render

import (
	"regexp"
	"strings"
)

// ANSI escape sequences used by StyleMarkdown; a byte-for-byte port of main.ts's ANSI table.
const (
	ansiReset  = "\x1b[0m"
	ansiBold   = "\x1b[1m"
	ansiUnbold = "\x1b[22m"
	ansiDim    = "\x1b[2m"
	ansiTitle  = "\x1b[1;36m"
	ansiH2     = "\x1b[1;33m"
	ansiH3     = "\x1b[1;32m"
	ansiCode   = "\x1b[36m"
	ansiBullet = "\x1b[35m"
)

var (
	headingRE = regexp.MustCompile(`^(#{1,3}) (.*)$`)
	boldRE    = regexp.MustCompile(`\*\*(.+?)\*\*`)
	bulletRE  = regexp.MustCompile(`^(\s*)- `)
)

// stripHardBreak removes exactly two trailing spaces, if present, matching JavaScript's
// /  $/ non-global replace: only the final two characters are ever removed, regardless of how
// many trailing spaces preceded them.
func stripHardBreak(s string) string {
	if len(s) >= 2 && s[len(s)-1] == ' ' && s[len(s)-2] == ' ' {
		return s[:len(s)-2]
	}
	return s
}

// StyleMarkdown colours the Markdown produced by RenderLesson/RenderRoute for a terminal: dim
// fence lines, cyan code, coloured headings (with a dim rule under "## " headings), bold text,
// magenta bullets. Byte-for-byte port of main.ts styleMarkdown.
func StyleMarkdown(markdown string) string {
	lines := strings.Split(markdown, "\n")
	out := make([]string, 0, len(lines))
	inCode := false
	for _, raw := range lines {
		line := stripHardBreak(raw)
		if strings.HasPrefix(line, "```") {
			inCode = !inCode
			out = append(out, ansiDim+line+ansiReset)
			continue
		}
		if inCode {
			out = append(out, ansiCode+line+ansiReset)
			continue
		}
		if m := headingRE.FindStringSubmatch(line); m != nil {
			var colour string
			switch len(m[1]) {
			case 1:
				colour = ansiTitle
			case 2:
				colour = ansiH2
			default:
				colour = ansiH3
			}
			rule := ""
			if len(m[1]) == 2 {
				rule = "\n" + ansiDim + strings.Repeat("─", 72) + ansiReset
			}
			out = append(out, colour+m[2]+ansiReset+rule)
			continue
		}
		styled := boldRE.ReplaceAllString(line, ansiBold+"$1"+ansiUnbold)
		styled = bulletRE.ReplaceAllString(styled, "$1"+ansiBullet+"•"+ansiReset+" ")
		out = append(out, styled)
	}
	return strings.Join(out, "\n")
}
