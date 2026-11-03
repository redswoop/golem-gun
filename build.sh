#!/bin/sh
# Build GolemGun.mcaddon after checking that version numbers agree and that the
# generated files fit together. The checks are in tools/check_pack.py.
cd "$(dirname "$0")" || exit 1
python3 tools/check_pack.py || exit 1
rm -f GolemGun.mcaddon && zip -qrX GolemGun.mcaddon behavior_pack resource_pack -x '*.DS_Store' && echo "built GolemGun.mcaddon"
