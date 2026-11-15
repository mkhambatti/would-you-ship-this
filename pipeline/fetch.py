"""Download the three source files at the pinned revision and verify their checksums."""
import hashlib
import sys
import urllib.request

from .config import RAW, SOURCE_FILES, SOURCE_REPO, SOURCE_REVISION


def sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name, expected in SOURCE_FILES.items():
        path = RAW / name
        if not path.exists():
            url = f"{SOURCE_REPO}/raw/{SOURCE_REVISION}/shopping_queries_dataset/{name}"
            print(f"fetching {url}")
            urllib.request.urlretrieve(url, path)
        actual = sha256(path)
        if actual != expected:
            sys.exit(f"checksum mismatch for {name}: expected {expected}, got {actual}")
        print(f"ok  {name}  sha256={actual[:16]}…")


if __name__ == "__main__":
    main()
