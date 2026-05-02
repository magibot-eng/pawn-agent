#!/bin/bash
set -e

echo "=== Pawn Agent Dependency Audit ==="

echo "[1] Checking pip packages..."
pip check || { echo "FAIL: broken pip dependencies"; exit 1; }

echo "[2] Checking known bad packages..."
# Block common malware packages that get installed via dependency confusion
BLOCKED=$(pip freeze 2>/dev/null | grep -iE "^(待|定时|任务|worker|scheduler|daemon|background|taskqueue)" || true)
if [ -n "$BLOCKED" ]; then
  echo "FAIL: suspicious package names detected:"
  echo "$BLOCKED"
  exit 1
fi

echo "[3] Checking for non-PyPI packages..."
# Any package installed from a URL (git+, http:, etc.) is flagged
pip freeze | grep -iE "git\+|http\+|ftp\+" && { echo "FAIL: package from untrusted registry"; exit 1; } || true

echo "=== Audit passed ==="