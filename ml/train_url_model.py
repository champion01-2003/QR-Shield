
from pathlib import Path
import runpy


TRAINING_SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "QR-Shield-ML-Starter"
    / "scripts"
    / "train_url_model.py"
)
runpy.run_path(str(TRAINING_SCRIPT), run_name="__main__")
