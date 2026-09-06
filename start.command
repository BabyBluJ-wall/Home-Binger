#!/bin/sh
cd "$(dirname "$0")"
echo "Starting Home Binger... your browser: http://localhost:8181"
exec node server/server.js
