#!/usr/bin/env bash
# Installs dependencies (first run) and starts the Flask server and Vite UI together.
# Usage: ./start.sh            (set PYTHON=python3.11 to choose a specific interpreter)
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/server/.venv"
PYTHON="${PYTHON:-python3}"

command -v "$PYTHON" >/dev/null || { echo "Error: $PYTHON not found. Install Python 3.8-3.11."; exit 1; }
command -v npm >/dev/null || { echo "Error: npm not found. Install Node.js (https://nodejs.org)."; exit 1; }

# --- Server dependencies ---
if [ ! -d "$VENV" ]; then
    echo "Creating Python virtual environment in server/.venv..."
    "$PYTHON" -m venv "$VENV"
fi
echo "Installing server dependencies..."
"$VENV/bin/pip" install -q --disable-pip-version-check -r "$ROOT/server/requirements.txt"
if ! (cd "$ROOT/server" && "$VENV/bin/python" -c "import streaming_elastic" 2>/dev/null); then
    echo "Installing streaming_elastic..."
    # --no-deps: its setup.py lists compiled modules that come from fdasrsf instead
    "$VENV/bin/pip" install -q --disable-pip-version-check --no-deps \
        "git+https://github.com/allisonaustin/streaming-depths.git#subdirectory=elastic_depth"
fi

# --- Multivariate data files (data/ is gitignored, so build them from the per-feature CSVs) ---
if { [ -d "$ROOT/server/data/wisdm" ] && [ ! -f "$ROOT/server/data/accel_phone_x.csv" ]; } \
    || { [ -d "$ROOT/server/data/hpc-oda" ] && { [ ! -f "$ROOT/server/data/hpc_oda_1sec.csv" ] || [ ! -f "$ROOT/server/data/hpc_oda_1min.csv" ]; }; }; then
    echo "Combining per-feature data files..."
    (cd "$ROOT/server" && "$VENV/bin/python" combine_data.py)
fi

# --- UI dependencies ---
echo "Installing UI dependencies..."
(cd "$ROOT/ui" && npm install --silent)

# --- Run both; Ctrl+C stops both ---
trap 'kill 0' EXIT

(cd "$ROOT/server" && "$VENV/bin/python" server.py) &
SERVER_PID=$!
(cd "$ROOT/ui" && npm run dev) &
UI_PID=$!

echo ""
echo "ElasticVis running at http://127.0.0.1:3001 (server on port 5001). Press Ctrl+C to stop."

# If either process exits, stop the other (macOS bash 3.2 has no `wait -n`)
while kill -0 "$SERVER_PID" 2>/dev/null && kill -0 "$UI_PID" 2>/dev/null; do
    sleep 1
done
echo "A process exited; shutting down."
