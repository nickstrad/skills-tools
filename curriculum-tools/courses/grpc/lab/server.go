// A small observable fixture, not a production service template.
package main

import (
	"context"
	"flag"
	"fmt"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/reflection"
	"google.golang.org/grpc/status"
	pb "grpcpractice/generated"
	"log"
	"net"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

type counter struct {
	pb.UnimplementedCounterServer
	mu    sync.Mutex
	value int32
	seen  map[string]int32
}

func caller(ctx context.Context) string {
	md, _ := metadata.FromIncomingContext(ctx)
	if names := md.Get("x-caller"); len(names) > 0 {
		return names[0]
	}
	return "anonymous"
}
func (c *counter) Add(ctx context.Context, req *pb.AddRequest) (*pb.CounterReply, error) {
	if req.Amount < 1 || req.Amount > 10 || req.ReplyDelayMs < 0 || req.ReplyDelayMs > 2000 {
		return nil, status.Error(codes.InvalidArgument, "amount must be 1..10 and reply_delay_ms 0..2000")
	}
	c.mu.Lock()
	duplicate := false
	if req.RequestId != "" {
		if prior, ok := c.seen[req.RequestId]; ok {
			if prior != req.Amount {
				c.mu.Unlock()
				return nil, status.Error(codes.AlreadyExists, "request_id already used with a different amount")
			}
			duplicate = true
		} else {
			c.seen[req.RequestId] = req.Amount
		}
	}
	if !duplicate {
		c.value += req.Amount
	}
	value := c.value
	log.Printf("effect value=%d request_id=%q duplicate=%t caller=%q", value, req.RequestId, duplicate, caller(ctx))
	c.mu.Unlock()
	// The effect has already happened. Cancellation stops only the delayed reply.
	if req.ReplyDelayMs > 0 && !duplicate {
		timer := time.NewTimer(time.Duration(req.ReplyDelayMs) * time.Millisecond)
		defer timer.Stop()
		select {
		case <-timer.C:
		case <-ctx.Done():
			log.Printf("reply cancelled; effect remains value=%d", value)
			return nil, status.FromContextError(ctx.Err()).Err()
		}
	}
	return &pb.CounterReply{Value: value, Deduplicated: duplicate, Caller: caller(ctx)}, nil
}
func (c *counter) Get(ctx context.Context, _ *pb.Empty) (*pb.CounterReply, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return &pb.CounterReply{Value: c.value, Caller: caller(ctx)}, nil
}
func (c *counter) Watch(req *pb.WatchRequest, stream grpc.ServerStreamingServer[pb.Tick]) error {
	if req.Count < 1 || req.Count > 10 || req.FailAfter < 0 || req.FailAfter > req.Count {
		return status.Error(codes.InvalidArgument, "count must be 1..10 and fail_after 0..count")
	}
	for i := int32(1); i <= req.Count; i++ {
		if err := stream.Send(&pb.Tick{Sequence: i}); err != nil {
			return err
		}
		if req.FailAfter == i {
			return status.Error(codes.Unavailable, "fixture stopped after partial output")
		}
		select {
		case <-time.After(50 * time.Millisecond):
		case <-stream.Context().Done():
			return status.FromContextError(stream.Context().Err()).Err()
		}
	}
	return nil
}
func main() {
	ready := flag.String("ready", "", "owned file for bound loopback address")
	reflect := flag.Bool("reflection", true, "enable schema discovery")
	flag.Parse()
	if *ready == "" {
		log.Fatal("-ready is required")
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	server := grpc.NewServer()
	pb.RegisterCounterServer(server, &counter{seen: make(map[string]int32)})
	if *reflect {
		reflection.Register(server)
	}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGTERM, syscall.SIGINT)
	go func() { <-stop; server.Stop() }()
	if err := os.WriteFile(*ready, []byte(listener.Addr().String()), 0600); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("ready=%s reflection=%t\n", listener.Addr(), *reflect)
	if err := server.Serve(listener); err != nil {
		log.Fatal(err)
	}
}
