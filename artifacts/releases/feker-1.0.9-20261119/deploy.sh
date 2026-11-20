#!/usr/bin/env bash
set -euo pipefail
release=/root/lms-releases/20261119-feker-1.0.9
app=/opt/lms
file=server/src/modules/courses/courses.service.js
test "$(readlink -f "$release")" = /root/lms-releases/20261119-feker-1.0.9
test "$(readlink -f "$app/client/dist")" = /opt/lms/client/dist
test ! -e "$release/installed.ok"
test "$(sha256sum "$app/$file" | cut -d' ' -f1)" = 01edc30c3b2775b9a02ed19eb381503cf8fe3d063378aadcf1e3523c55a233b5
umask 077
mkdir -p "$release/website" "$release/patch" "$release/backup"
tar -xzf "$release/website.tgz" -C "$release/website"
tar -xzf "$release/server-patch.tgz" -C "$release/patch"
node --check "$release/patch/$file"
tar -czf "$release/website-before.tgz" -C "$app/client/dist" .
cp -p "$app/$file" "$release/backup/courses.service.js"
rollback() {
  echo 'Restoring the previous website and course API file.' >&2
  install -o lms -g lms -m 644 "$release/backup/courses.service.js" "$app/$file"
  tar -xzf "$release/website-before.tgz" -C "$app/client/dist"
  systemctl restart lms-api
}
trap rollback ERR
install -o lms -g lms -m 644 "$release/patch/$file" "$app/$file"
systemctl restart lms-api
curl --fail --silent --show-error --retry 8 --retry-connrefused --retry-delay 1 http://127.0.0.1:5000/api/health
# Preserve old hashed chunks for already-open browsers. Switch HTML last.
rsync -a --chown=lms:lms --exclude=index.html "$release/website/" "$app/client/dist/"
install -o lms -g lms -m 644 "$release/website/index.html" "$app/client/dist/index.html.next"
mv -T "$app/client/dist/index.html.next" "$app/client/dist/index.html"
cmp "$release/website/index.html" "$app/client/dist/index.html"
cmp "$release/patch/$file" "$app/$file"
sha256sum "$app/client/dist/index.html" "$app/$file"
systemctl is-active lms-api mongod nginx
curl --fail --silent --show-error http://127.0.0.1:5000/api/health
date --iso-8601=seconds
touch "$release/installed.ok"
trap - ERR
echo 'Website and course API release installed and verified.'
