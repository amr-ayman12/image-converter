#!/usr/bin/env sh
cd "$(dirname "$0")"
printf 'Open http://127.0.0.1:8080\n'
node server.mjs 8080
