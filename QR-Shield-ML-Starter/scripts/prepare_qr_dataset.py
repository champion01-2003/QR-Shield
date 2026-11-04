from pathlib import Path
import random
import shutil

# Expected input:
# D:\QR-Shield\datasets\qr_images\benign\*.png
# D:\QR-Shield\datasets\qr_images\malicious\*.png
#
# If the downloaded archive uses different class-folder names, inspect them
# and update SOURCE_CLASSES below before running this script.

ROOT = Path(r"D:\QR-Shield\datasets\qr_images")
OUT = Path(r"D:\QR-Shield\datasets\qr_split")
SOURCE_CLASSES = {
    "benign": ["benign", "safe", "legitimate", "legit"],
    "malicious": ["malicious", "phishing", "phish", "unsafe"],
}
EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}
SEED = 42
TRAIN_FRAC, VAL_FRAC = 0.70, 0.15

def find_class_dir(candidates):
    for name in candidates:
        p = ROOT / name
        if p.is_dir():
            return p
    return None

random.seed(SEED)
class_dirs = {label: find_class_dir(names) for label, names in SOURCE_CLASSES.items()}
missing = [label for label, path in class_dirs.items() if path is None]
if missing:
    print("Could not find folders for:", missing)
    print("Dataset root:", ROOT)
    print("Folders found:")
    for p in ROOT.iterdir():
        if p.is_dir():
            print(" -", p.name)
    raise SystemExit(
        "Please inspect the archive and either create benign/ and malicious/ "
        "folders, or edit SOURCE_CLASSES to match the real folder names."
    )

if OUT.exists():
    raise SystemExit(
        f"{OUT} already exists. Rename/delete that output folder yourself "
        "if you want to regenerate it; this script will not overwrite it."
    )

for label, class_dir in class_dirs.items():
    files = [p for p in class_dir.rglob("*") if p.is_file() and p.suffix.lower() in EXTS]
    if len(files) < 10:
        raise SystemExit(f"Too few images in {class_dir}: {len(files)}")
    random.shuffle(files)
    n = len(files)
    n_train = int(n * TRAIN_FRAC)
    n_val = int(n * VAL_FRAC)
    split_files = {
        "train": files[:n_train],
        "val": files[n_train:n_train + n_val],
        "test": files[n_train + n_val:],
    }
    for split, paths in split_files.items():
        dest = OUT / split / label
        dest.mkdir(parents=True, exist_ok=True)
        for i, src in enumerate(paths):
            # Copy images; preserve source files and avoid filename collisions.
            target = dest / f"{i:05d}_{src.name}"
            shutil.copy2(src, target)
    print(f"{label}: {n} images -> train {len(split_files['train'])}, "
          f"val {len(split_files['val'])}, test {len(split_files['test'])}")

print("\nPrepared split at:", OUT)
print("Labels describe benign/malicious URL class, not necessarily visual tampering.")
