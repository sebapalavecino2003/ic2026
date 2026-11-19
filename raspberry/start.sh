#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ ! -f .env ]; then cp .env.example .env; fi
docker compose up -d --build
docker compose ps
