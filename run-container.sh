#!/bin/sh
set -eu

IMAGE_NAME="focusroom"
CONTAINER_NAME="focusroom"
PORT=5173

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker bulunamadi. Docker kurulu ve calisir durumda olmali." >&2
  exit 1
fi

echo "Image derleniyor..."
docker build -t "$IMAGE_NAME" .

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "Eski container kaldiriliyor..."
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

echo "Container baslatiliyor..."
docker run -d --name "$CONTAINER_NAME" -p "$PORT:$PORT" "$IMAGE_NAME" >/dev/null

echo "Uygulama: http://localhost:$PORT"
echo "Loglar:   docker logs -f $CONTAINER_NAME"
echo "Durdurma: docker rm -f $CONTAINER_NAME"
