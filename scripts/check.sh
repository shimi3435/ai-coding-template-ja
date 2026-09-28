#!/bin/sh
set -eu

if [ "$#" -ne 0 ]; then
  echo 'usage: ./scripts/check.sh (no arguments)' >&2
  exit 2
fi

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd -- "$repository_root"
node repo-tools/entrypoint.mjs check-contracts
exec task check
