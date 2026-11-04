from pathlib import Path
import json

import joblib
import pandas as pd
from scipy.io import arff
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix,
)
from xgboost import XGBClassifier

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT_DIR / "datasets" / "url" / "Training Dataset.arff"
MODEL_DIR = ROOT_DIR / "models"
REPORT_DIR = ROOT_DIR / "reports"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
REPORT_DIR.mkdir(parents=True, exist_ok=True)

records, metadata = arff.loadarff(DATA_PATH)
df = pd.DataFrame(records)
for col in df.columns:
    df[col] = df[col].map(
        lambda v: v.decode("utf-8") if isinstance(v, bytes) else v
    )
df.columns = df.columns.str.strip()

target = "Result"
if target not in df.columns:
    raise ValueError(f"Missing {target!r}. Found columns: {df.columns.tolist()}")

df = df.dropna(subset=[target]).copy()
labels = set(df[target].astype(str).str.strip().unique())
if labels != {"-1", "1"}:
    raise ValueError(f"Expected labels -1 and 1; found {labels}")

# UCI Phishing Websites labels: -1 = phishing, 1 = legitimate.
# Binary target here: 1 = phishing, 0 = legitimate.
y = df[target].astype(str).str.strip().map({"-1": 1, "1": 0}).astype(int)
X = df.drop(columns=[target])
for col in X.columns:
    X[col] = pd.to_numeric(X[col], errors="raise")
if X.isna().any().any():
    raise ValueError("Feature columns contain missing values.")

print("Dataset shape:", df.shape)
print("Features:", X.shape[1])
print("Target counts (0=legitimate, 1=phishing):")
print(y.value_counts().sort_index())

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)

model = XGBClassifier(
    n_estimators=250,
    max_depth=5,
    learning_rate=0.06,
    subsample=0.85,
    colsample_bytree=0.85,
    objective="binary:logistic",
    eval_metric="logloss",
    random_state=42,
    n_jobs=-1,
)
model.fit(X_train, y_train)
pred = model.predict(X_test)

report_text = classification_report(
    y_test, pred, target_names=["Legitimate", "Phishing"], zero_division=0
)
metrics = {
    "accuracy": float(accuracy_score(y_test, pred)),
    "confusion_matrix": confusion_matrix(y_test, pred).tolist(),
    "classification_report": classification_report(
        y_test, pred,
        target_names=["Legitimate", "Phishing"],
        output_dict=True,
        zero_division=0,
    ),
    "target_mapping": {"0": "legitimate", "1": "phishing"},
    "feature_names": X.columns.tolist(),
    "test_size": 0.20,
    "random_state": 42,
}

model_path = MODEL_DIR / "xgboost_url_model.json"
features_path = MODEL_DIR / "url_feature_names.joblib"
report_path = REPORT_DIR / "url_model_metrics.json"
model.save_model(model_path)
joblib.dump(X.columns.tolist(), features_path)
report_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

print("\n--- Held-out test metrics ---")
print(f"Accuracy: {metrics['accuracy']:.4f}")
print(report_text)
print("Confusion matrix (rows=true [legitimate, phishing], cols=predicted):")
print(metrics["confusion_matrix"])
print("\nSaved model:", model_path)
print("Saved feature list:", features_path)
print("Saved metrics:", report_path)
print(
    "\nIMPORTANT: this model expects the dataset's 30 precomputed features, "
    "not a raw URL string. Do not wire it to live URL input until a compatible "
    "feature extractor is implemented and validated."
)
