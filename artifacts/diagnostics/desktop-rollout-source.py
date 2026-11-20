import hashlib
import json
import pathlib
import tarfile

# Application code only. No databases, student records, device IDs or logs.
for release in ('1.0.8', '1.0.9'):
    archive = pathlib.Path('/root/lms-releases/20261119-feker-' + release + '/website-before.tgz')
    if not archive.exists():
        continue
    with tarfile.open(archive) as bundle:
        scripts = [bundle.extractfile(item).read() for item in bundle if item.isfile() and item.name.endswith('.js')]
    print(json.dumps({'beforeRelease': release, 'desktopBridgePresent': any(b'__fekerDesktop' in script for script in scripts), 'profileIdPresent': any(b'lms_device_id' in script for script in scripts)}))
for relative in ('modules/auth/auth.service.js', 'modules/auth/device.service.js', 'modules/auth/auth.controller.js', 'modules/auth/auth.validators.js', 'models/Device.js', 'models/Session.js', 'config/constants.js'):
    content = pathlib.Path('/opt/lms/server/src/' + relative).read_bytes()
    print(json.dumps({'source': relative, 'sha256': hashlib.sha256(content).hexdigest()}))
