#!/bin/sh
# Idempotent root setup script on us for least-privilege GitHub Actions auto-deploy.
# Usage: sudo sh deploy/ci/setup-server.sh <path-to-server-deploy.py> <path-to-deploy-pubkey.pub>
set -eu
test "$(id -u)" = 0 || { echo "Run as root on the target server" >&2; exit 1; }

DEPLOY_SCRIPT=${1:?Usage: setup-server.sh SERVER_DEPLOY_PY PUBKEY_FILE}
PUBKEY_FILE=${2:?Usage: setup-server.sh SERVER_DEPLOY_PY PUBKEY_FILE}
test -f "$DEPLOY_SCRIPT"
test -f "$PUBKEY_FILE"

DEPLOY_USER=svdeploy
DEPLOY_HOME=/var/lib/short-videos-deploy
TARGET_BIN=/usr/local/sbin/short-videos-deploy
SUDOERS_FILE=/etc/sudoers.d/short-videos-deploy

if ! getent passwd "$DEPLOY_USER" >/dev/null; then
    useradd --system --create-home --home-dir "$DEPLOY_HOME" --shell /bin/sh "$DEPLOY_USER"
fi

# Unlock passwordless SSH key login without setting a password (account locked '!' can block sshd on some configs)
passwd -d "$DEPLOY_USER" >/dev/null 2>&1 || true
usermod -p '*' "$DEPLOY_USER"

install -o root -g root -m 0755 "$DEPLOY_SCRIPT" "$TARGET_BIN"

TMP_SUDO=$(mktemp)
trap 'rm -f "$TMP_SUDO"' EXIT
cat > "$TMP_SUDO" <<EOF
Defaults:$DEPLOY_USER !requiretty
$DEPLOY_USER ALL=(root) NOPASSWD: $TARGET_BIN
EOF
visudo -cf "$TMP_SUDO"
install -o root -g root -m 0440 "$TMP_SUDO" "$SUDOERS_FILE"

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0700 "$DEPLOY_HOME/.ssh"
PUBKEY=$(tr -d '\r\n' < "$PUBKEY_FILE")
case "$PUBKEY" in
    ssh-ed25519\ *) ;;
    *) echo "Expected an ssh-ed25519 public key" >&2; exit 1 ;;
esac

cat > "$DEPLOY_HOME/.ssh/authorized_keys" <<EOF
command="sudo -n $TARGET_BIN",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $PUBKEY
EOF
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.ssh/authorized_keys"
chmod 0600 "$DEPLOY_HOME/.ssh/authorized_keys"

"$TARGET_BIN" --list
echo "Setup complete for $DEPLOY_USER -> $TARGET_BIN"
