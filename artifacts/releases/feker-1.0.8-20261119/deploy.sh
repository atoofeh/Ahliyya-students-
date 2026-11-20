#!/usr/bin/env bash
set -euo pipefail
release=/root/lms-releases/20261119-feker-1.0.8
app=/opt/lms
test "$(readlink -f "$release")" = /root/lms-releases/20261119-feker-1.0.8
test "$(readlink -f "$app/client/dist")" = /opt/lms/client/dist
test ! -e "$release/installed.ok"
umask 077
files=(
  server/src/modules/videos/videos.service.js
  server/src/modules/videos/videos.controller.js
  server/src/modules/videos/byteRange.js
  server/src/modules/announcements/announcements.routes.js
  server/src/modules/announcements/announcements.service.js
  server/src/models/Announcement.js
)
mkdir -p "$release/website" "$release/patch" "$release/backup" "$release/check"
tar -xzf "$release/website.tgz" -C "$release/website"
tar -xzf "$release/server-patch.tgz" -C "$release/patch"
tar -xzf "$release/verification.tgz" -C "$release/check"
for file in "${files[@]}"; do node --check "$release/patch/$file"; done
if test ! -e "$release/backup.ok"; then
  tar -czf "$release/website-before.tgz" -C "$app/client/dist" .
  for file in "${files[@]}"; do
    if test -f "$app/$file"; then
      mkdir -p "$release/backup/$(dirname "$file")"
      cp -p "$app/$file" "$release/backup/$file"
    fi
  done
  touch "$release/backup.ok"
fi
installed=0
rollback() {
  if test "$installed" = 1; then
    echo 'Verification failed; restoring previous website and API files.' >&2
    for file in "${files[@]}"; do
      if test -f "$release/backup/$file"; then
        install -o lms -g lms -m 644 "$release/backup/$file" "$app/$file"
      else
        rm -f -- "$app/$file"
      fi
    done
    tar -xzf "$release/website-before.tgz" -C "$app/client/dist"
    systemctl restart lms-api
  fi
}
trap rollback ERR
installed=1
for file in "${files[@]}"; do install -o lms -g lms -m 644 "$release/patch/$file" "$app/$file"; done
systemctl restart lms-api
curl --fail --silent --show-error --retry 8 --retry-connrefused --retry-delay 1 http://127.0.0.1:5000/api/health
cd "$app/server"
node <<'NODE'
const mongoose = require('mongoose');
const env = require('./src/config/env');
const Announcement = require('./src/models/Announcement');
(async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    await Announcement.init();
    const index = (await Announcement.collection.indexes()).find((item) => item.name === 'author_1_requestId_1');
    if (!index?.unique || index.partialFilterExpression?.requestId?.$type !== 'string') throw new Error('Announcement deduplication index is missing');
    console.log('\nAnnouncement deduplication index verified.');
  } finally { await mongoose.disconnect(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
NODE
ln -sfn "$app/server/src" "$release/check/server/src"
ln -sfn "$app/server/node_modules" "$release/check/server/node_modules"
cd "$release/check/server"
node --test tests/video-stream.test.js > "$release/deployed-stream-tests.log" 2>&1
tail -n 10 "$release/deployed-stream-tests.log"
# Existing browser tabs may still request old lazy chunks. Do not delete them.
rsync -a --chown=lms:lms --exclude=index.html "$release/website/" "$app/client/dist/"
install -o lms -g lms -m 644 "$release/website/index.html" "$app/client/dist/index.html.next"
mv -T "$app/client/dist/index.html.next" "$app/client/dist/index.html"
cmp "$release/website/index.html" "$app/client/dist/index.html"
sha256sum "$app/client/dist/index.html"
for file in "${files[@]}"; do cmp "$release/patch/$file" "$app/$file"; done
systemctl is-active lms-api mongod nginx
curl --fail --silent --show-error http://127.0.0.1:5000/api/health
date --iso-8601=seconds
touch "$release/installed.ok"
trap - ERR
echo 'Website and targeted API release installed and verified.'
