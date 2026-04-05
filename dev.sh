#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"

# Start backend
(cd "$DIR/backend" && source .venv/bin/activate && uvicorn main:app --reload --port 3002) &
BACKEND_PID=$!

# Start frontend
(cd "$DIR/frontend" && npm run dev) &
FRONTEND_PID=$!

# Handle Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl+C to stop both servers"

wait
