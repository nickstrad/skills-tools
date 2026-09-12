package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

var errLoseReply = errors.New("publication reply deliberately lost")
var errStopAfterRef = errors.New("replay deliberately stopped after ref update")

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := run(ctx, os.Args[1:]); err != nil {
		if errors.Is(err, errLoseReply) {
			os.Exit(86)
		}
		if errors.Is(err, errStopAfterRef) {
			os.Exit(87)
		}
		fmt.Fprintln(os.Stderr, "cursor:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	if len(args) < 1 {
		return usage()
	}
	switch args[0] {
	case "publish":
		if len(args) < 3 || len(args) > 4 || (args[2] != "a" && args[2] != "b") {
			return usage()
		}
		lose := len(args) == 4 && args[3] == "--lose-reply"
		if len(args) == 4 && !lose {
			return usage()
		}
		lab, err := ownedLab(args[1])
		if err != nil {
			return err
		}
		return publish(ctx, lab, args[2], lose, newStore())
	case "replay":
		if len(args) < 3 || len(args) > 4 {
			return usage()
		}
		stop := ""
		if len(args) == 4 {
			stop = strings.TrimPrefix(args[3], "--stop-after-ref=")
			if stop == args[3] || stop == "" {
				return usage()
			}
		}
		lab, err := ownedLab(args[1])
		if err != nil {
			return err
		}
		return withLock(ctx, lab, args[2], func() error { _, err := replay(ctx, lab, args[2], stop, newStore(), nil); return err })
	case "read":
		if len(args) != 3 {
			return usage()
		}
		lab, err := ownedLab(args[1])
		if err != nil {
			return err
		}
		return withLock(ctx, lab, args[2], func() error { return read(ctx, lab, args[2], newStore()) })
	case "wake":
		if len(args) < 3 || len(args) > 4 {
			return usage()
		}
		drop := len(args) == 4 && args[3] == "--drop"
		if len(args) == 4 && !drop {
			return usage()
		}
		lab, err := ownedLab(args[1])
		if err != nil {
			return err
		}
		if err := validName(args[2]); err != nil {
			return err
		}
		if drop {
			fmt.Println("wake dropped")
			return nil
		}
		return withLock(ctx, lab, args[2], func() error { _, err := replay(ctx, lab, args[2], "", newStore(), nil); return err })
	default:
		return usage()
	}
}

func usage() error {
	return errors.New("usage: cursor publish LAB a|b [--lose-reply] | cursor replay LAB NAME [--stop-after-ref=OP] | cursor read LAB NAME | cursor wake LAB NAME [--drop]")
}
