#!/usr/bin/env bash
# 하루등불 배포 — 서버에서 한 번에. (레포 어디서 실행해도 루트로 이동)
#   git pull → 이미지 빌드 → DB 마이그레이션+시드(항상 실행) → 서비스 기동.
# 마이그레이션을 "명시적으로 항상" 돌려, 재배포 시 누락(--build 깜빡/일회용 미재실행)을 막는다.
# 마이그레이션 실패 시 여기서 멈추므로(set -e) 깨진 코드가 기동되지 않는다.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[deploy] 1/4 git pull"
git pull --ff-only

echo "[deploy] 2/4 이미지 빌드"
docker compose build

echo "[deploy] 3/4 DB 마이그레이션 + 시드 (멱등)"
docker compose run --rm migrate

echo "[deploy] 4/4 서비스 기동"
docker compose up -d

docker compose ps
echo "[deploy] 완료 ✅"
