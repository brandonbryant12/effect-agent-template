#!/bin/sh
set -eu

cleanup() { docker compose down --remove-orphans; }
trap cleanup EXIT INT TERM

docker compose up -d --build
i=0
while [ "$i" -lt 60 ]; do
  if curl -fsS http://localhost:3000/readyz >/dev/null 2>&1 && \
     curl -fsS http://localhost:3001/healthz >/dev/null 2>&1 && \
     curl -fsS http://localhost:5173/healthz >/dev/null 2>&1; then
    docker compose ps
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done

docker compose ps
docker compose logs --no-color
exit 1
