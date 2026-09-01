#!/usr/bin/env bash
set -e

echo "=== [SentinelOps AI] Starting Production Deployment Build ==="

echo "1. Installing dependencies..."
npm ci

echo "2. Running TypeScript type check..."
npm run typecheck

echo "3. Building Next.js application..."
npm run build

echo "=== [Success] Build complete and verified. Ready for deployment! ==="
