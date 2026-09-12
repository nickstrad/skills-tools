#!/usr/bin/env bash
set -euo pipefail
course_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tools_dir="$course_dir/.tools"
if [[ $(uname -s) != Linux || $(uname -m) != x86_64 ]]; then
  echo 'This pinned lab installer supports Linux x86-64.' >&2
  exit 1
fi
mkdir -p "$tools_dir/bin" "$tools_dir/downloads"
fetch() {
  local url=$1 file=$2 digest=$3
  curl --fail --location --silent --show-error --connect-timeout 20 --max-time 300 "$url" -o "$file"
  printf '%s  %s\n' "$digest" "$file" | sha256sum --check --status
}
if [[ ! -x "$tools_dir/go/bin/go" ]]; then
  fetch https://go.dev/dl/go1.26.8.linux-amd64.tar.gz "$tools_dir/downloads/go.tar.gz" d0f743b33e8d8945e6b1f432edd15785c70507121d6e2a723b21285eddf8b57b
  tar -xzf "$tools_dir/downloads/go.tar.gz" -C "$tools_dir"
  rm -- "$tools_dir/downloads/go.tar.gz"
fi
if [[ ! -x "$tools_dir/bin/protoc" ]]; then
  fetch https://github.com/protocolbuffers/protobuf/releases/download/v36.1/protoc-36.1-linux-x86_64.zip "$tools_dir/downloads/protoc.zip" c4bc672d9d49214dc8cafdceadf4df92182d6ca8e3ec65a56b2d7de5602669b4
  python3 - "$tools_dir" <<'PY'
import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(root/'downloads/protoc.zip') as z:
    z.extractall(root)
(root/'bin/protoc').chmod(0o755)
PY
  rm -- "$tools_dir/downloads/protoc.zip"
fi
if [[ ! -x "$tools_dir/bin/grpcurl" ]]; then
  fetch https://github.com/fullstorydev/grpcurl/releases/download/v1.9.4/grpcurl_1.9.4_linux_x86_64.tar.gz "$tools_dir/downloads/grpcurl.tar.gz" 97e13d58d2733a0e62cd2571d1d5f0c02823f0d25282f08bddedf1ad9c5d1736
  tar -xzf "$tools_dir/downloads/grpcurl.tar.gz" -C "$tools_dir/bin" grpcurl
  rm -- "$tools_dir/downloads/grpcurl.tar.gz"
fi
export PATH="$tools_dir/bin:$tools_dir/go/bin:$PATH"
export GOPATH="$tools_dir/gopath" GOCACHE="$tools_dir/go-cache" GOBIN="$tools_dir/bin" GOTOOLCHAIN=local
go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.12
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1
cd "$course_dir/lab"
mkdir -p generated bin
protoc -I proto --go_out=generated --go_opt=paths=source_relative --go-grpc_out=generated --go-grpc_opt=paths=source_relative proto/counter.proto
go mod tidy
go build -o bin/counter .
go version
protoc --version
grpcurl --version
echo 'Course tools and local counter are ready.'
