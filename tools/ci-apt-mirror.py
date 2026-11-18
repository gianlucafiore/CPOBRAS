#!/usr/bin/env python3
"""Use Ubuntu's main HTTPS archive on ephemeral GitHub Linux runners."""
from pathlib import Path
import re

sources = Path('/etc/apt/sources.list.d')
paths = [Path('/etc/apt/sources.list'), *sources.glob('*.list'), *sources.glob('*.sources')]
for path in paths:
    if not path.is_file():
        continue
    original = path.read_text()
    updated, count = re.subn(
        r'https?://(?:[a-zA-Z0-9.-]+\.)?archive\.ubuntu\.com/ubuntu/?',
        'https://archive.ubuntu.com/ubuntu/', original,
    )
    if updated != original:
        path.write_text(updated)
        print(f'Ubuntu archive configured: {path} ({count} entries)')
