QR-Shield ML Starter (Windows / PowerShell)
===========================================

Existing website is not modified by these scripts.

1) Create/use the ML environment
--------------------------------
Open PowerShell:
  cd D:\QR-Shield
  py -3.12 -m venv ml\.venv
  .\ml\.venv\Scripts\Activate.ps1
  python -m pip install --upgrade pip
  pip install -r D:\QR-Shield\QR-Shield-ML-Starter\requirements-ml.txt

If you extracted this package elsewhere, adjust the requirements path.

2) URL model
------------
Place the existing file at:
  D:\QR-Shield\datasets\url\Training Dataset.arff

Inspect:
  python D:\QR-Shield\QR-Shield-ML-Starter\scripts\inspect_url_dataset.py

Train:
  python D:\QR-Shield\QR-Shield-ML-Starter\scripts\train_url_model.py

Expected outputs:
  D:\QR-Shield\models\xgboost_url_model.json
  D:\QR-Shield\models\url_feature_names.joblib
  D:\QR-Shield\reports\url_model_metrics.json

Label mapping for this UCI dataset:
  -1 = phishing, +1 = legitimate.
The script maps phishing -> 1 and legitimate -> 0.

IMPORTANT:
This dataset uses 30 precomputed website features. This model is NOT a raw-URL
classifier and must not be wired to raw URL input until a matching feature
extractor is built and validated. Some features depend on webpage content or
domain/network information, not just the URL string.

3) QR image model
-----------------
Download and extract the dataset. Before running scripts, inspect its actual
folder names. Organize/copy the images into:
  D:\QR-Shield\datasets\qr_images\benign\
  D:\QR-Shield\datasets\qr_images\malicious\

If the archive uses different names, edit SOURCE_CLASSES in
scripts\prepare_qr_dataset.py to match. Do not guess labels from filenames
without verifying the dataset documentation.

Prepare split:
  python D:\QR-Shield\QR-Shield-ML-Starter\scripts\prepare_qr_dataset.py

Train:
  python D:\QR-Shield\QR-Shield-ML-Starter\scripts\train_qr_resnet.py

Expected outputs:
  D:\QR-Shield\models\resnet18_qr_classifier.pth
  D:\QR-Shield\reports\qr_model_metrics.json

ResNet-18 uses pretrained ImageNet weights on first run, so internet access
may be needed to download the weights. On CPU, training may take a while.

4) Evaluation and honesty
-------------------------
Metrics are computed on held-out test data. Results depend on dataset quality,
split, and model settings. Do not claim the thesis's reported scores unless
your own evaluation reproduces them.

The 1,000-image Mendeley dataset's published description says it labels QR
images by benign/malicious URL content. That is not automatically a visual
tampering label. This script classifies the supplied folders; it does not
prove that it detects visual tampering.

Do not connect either model to the live site until inference preprocessing
and class mappings have been checked end-to-end.
