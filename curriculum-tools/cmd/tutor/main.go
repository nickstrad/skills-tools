// Command tutor is the Go course CLI; the command tree lives in internal/cli.
//
// version is stamped by the bin/tutor launcher with -ldflags "-X main.version=<git short hash>";
// a plain `go build ./cmd/tutor` leaves it as "dev".
package main

import (
	"os"

	"skills-tools/tutor/internal/cli"
)

var version = "dev"

func main() {
	cli.Version = version
	os.Exit(cli.Execute(os.Args[1:], os.Stdout, os.Stderr))
}
