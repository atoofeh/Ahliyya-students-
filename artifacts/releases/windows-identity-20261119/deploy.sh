#!/usr/bin/env bash
set -euo pipefail
release=/root/lms-releases/20261119-windows-identity
app=/opt/lms
test "$(readlink -f "$release")" = /root/lms-releases/20261119-windows-identity
test "$(readlink -f "$app/client/dist")" = /opt/lms/client/dist
test ! -e "$release/installed.ok"
umask 077
mkdir -p "$release/website" "$release/patch" "$release/backup"
tar -xzf "$release/website.tgz" -C "$release/website"
tar -xzf "$release/server-patch.tgz" -C "$release/patch"
mapfile -t files < <(python3 - "$release/manifest.json" <<'PY'
import json, sys
for item in json.load(open(sys.argv[1])): print(item['file'])
PY
)
python3 - "$release/manifest.json" "$release/patch" <<'PY'
import hashlib, json, pathlib, sys
for item in json.load(open(sys.argv[1])):
    for root, key in (('/opt/lms', 'before'), (sys.argv[2], 'after')):
        actual = hashlib.sha256(pathlib.Path(root, item['file']).read_bytes()).hexdigest()
        if actual != item[key]: raise SystemExit('Unexpected source hash: ' + item['file'])
print('Verified production baseline and all seven focused patch files.')
PY
for file in "${files[@]}"; do
  node --check "$release/patch/$file"
  mkdir -p "$release/backup/$(dirname "$file")"
  cp -p "$app/$file" "$release/backup/$file"
done
tar -czf "$release/website-before.tgz" -C "$app/client/dist" .
rollback() {
  echo 'Restoring previous website and authentication source files.' >&2
  for file in "${files[@]}"; do install -o lms -g lms -m 644 "$release/backup/$file" "$app/$file"; done
  tar -xzf "$release/website-before.tgz" -C "$app/client/dist"
  systemctl restart lms-api
}
trap rollback ERR
for file in "${files[@]}"; do install -o lms -g lms -m 644 "$release/patch/$file" "$app/$file"; done
systemctl restart lms-api
curl --fail --silent --show-error --retry 8 --retry-connrefused --retry-delay 1 http://127.0.0.1:5000/api/health
rsync -a --chown=lms:lms --exclude=index.html "$release/website/" "$app/client/dist/"
install -o lms -g lms -m 644 "$release/website/index.html" "$app/client/dist/index.html.next"
mv -T "$app/client/dist/index.html.next" "$app/client/dist/index.html"
cmp "$release/website/index.html" "$app/client/dist/index.html"
for file in "${files[@]}"; do cmp "$release/patch/$file" "$app/$file"; done
sha256sum "$app/client/dist/index.html"
systemctl is-active lms-api mongod nginx
curl --fail --silent --show-error http://127.0.0.1:5000/api/health
date --iso-8601=seconds
touch "$release/installed.ok"
trap - ERR
echo 'Windows identity compatibility installed; account bindings are upgraded only on a verified user login.'
