#!/bin/sh
# Prepare a versioned service release; does not start services or change the website.
set -eu
test "$(id -u)" = 0 || { echo 'Run as root on the target host' >&2; exit 1; }
source_dir=$(CDPATH= cd -- "${1:?Usage: prepare.sh PROJECT_ROOT}" && pwd)
test -f "$source_dir/services/youtube/service.py"
python3 -c 'import sys; assert sys.version_info >= (3, 10)'
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
getent passwd svyoutube >/dev/null || useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin svyoutube
release_dir=/opt/short-videos-youtube/releases/$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$release_dir"
install -m 644 "$source_dir/services/youtube/service.py" "$release_dir/service.py"
install -m 644 "$source_dir/services/youtube/requirements.txt" "$release_dir/requirements.txt"
python3 -m venv "$release_dir/venv"
"$release_dir/venv/bin/python" -m pip install -r "$release_dir/requirements.txt"
"$release_dir/venv/bin/python" -c 'import yt_dlp, yt_dlp_ejs'
chmod -R go-w "$release_dir"
printf 'Prepared %s\n' "$release_dir"
