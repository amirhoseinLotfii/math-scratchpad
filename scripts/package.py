"""Package source, documentation and built files; never include dependencies or git state."""
from pathlib import Path
import hashlib
import zipfile

root = Path(__file__).resolve().parents[1]
files = sorted(p for p in root.rglob('*') if p.is_file() and not set(p.relative_to(root).parts) & {'node_modules', '.git', 'coverage'} and not p.name.endswith('.log') and p.name != 'MANIFEST.sha256')
manifest = '\n'.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(root).as_posix()}' for p in files) + '\n'
(root / 'MANIFEST.sha256').write_text(manifest)
files.append(root / 'MANIFEST.sha256')
output = root.parent / 'math-scratchpad-redux-v0.3.0.zip'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        archive.write(path, Path('math-scratchpad-redux') / path.relative_to(root))
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert 'math-scratchpad-redux/src/store.ts' in archive.namelist()
    assert 'math-scratchpad-redux/dist/standalone.html' in archive.namelist()
print(f'{output}\nFiles: {len(files)}\nBytes: {output.stat().st_size}\nSHA256: {hashlib.sha256(output.read_bytes()).hexdigest()}')
