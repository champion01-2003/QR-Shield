from pathlib import Path
import json
import copy

import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import numpy as np

DATA_DIR = Path(r"D:\QR-Shield\datasets\qr_split")
MODEL_DIR = Path(r"D:\QR-Shield\models")
REPORT_DIR = Path(r"D:\QR-Shield\reports")
MODEL_DIR.mkdir(parents=True, exist_ok=True)
REPORT_DIR.mkdir(parents=True, exist_ok=True)

if not (DATA_DIR / "train").is_dir() or not (DATA_DIR / "val").is_dir() or not (DATA_DIR / "test").is_dir():
    raise SystemExit("Run prepare_qr_dataset.py first and confirm datasets/qr_split/train, val, test exist.")

IMG_SIZE = 224
BATCH_SIZE = 16
EPOCHS = 8
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("Device:", device)

train_tf = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.RandomRotation(5),
    transforms.ColorJitter(brightness=0.08, contrast=0.08),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])
eval_tf = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

train_ds = datasets.ImageFolder(DATA_DIR / "train", transform=train_tf)
val_ds = datasets.ImageFolder(DATA_DIR / "val", transform=eval_tf)
test_ds = datasets.ImageFolder(DATA_DIR / "test", transform=eval_tf)
if train_ds.classes != val_ds.classes or train_ds.classes != test_ds.classes:
    raise SystemExit("Class folder names/order differ across train, val and test.")
if len(train_ds.classes) != 2:
    raise SystemExit(f"Expected 2 classes, found {train_ds.classes}")

workers = 0  # reliable on Windows
train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=workers)
val_dl = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=workers)
test_dl = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=workers)

weights = models.ResNet18_Weights.DEFAULT
model = models.resnet18(weights=weights)
model.fc = nn.Linear(model.fc.in_features, len(train_ds.classes))
model = model.to(device)

# Faster initial transfer-learning run: freeze backbone, train classifier head.
for name, param in model.named_parameters():
    param.requires_grad = name.startswith("fc.")

criterion = nn.CrossEntropyLoss()
optimizer = torch.optim.Adam(model.fc.parameters(), lr=1e-3)
best_val_loss = float("inf")
best_state = copy.deepcopy(model.state_dict())

for epoch in range(EPOCHS):
    model.train()
    train_loss_sum = 0.0
    for images, labels in train_dl:
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        train_loss_sum += loss.item() * images.size(0)

    model.eval()
    val_loss_sum = 0.0
    with torch.no_grad():
        for images, labels in val_dl:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            val_loss_sum += criterion(outputs, labels).item() * images.size(0)

    train_loss = train_loss_sum / len(train_ds)
    val_loss = val_loss_sum / len(val_ds)
    print(f"Epoch {epoch+1}/{EPOCHS} - train_loss={train_loss:.4f} val_loss={val_loss:.4f}")
    if val_loss < best_val_loss:
        best_val_loss = val_loss
        best_state = copy.deepcopy(model.state_dict())

model.load_state_dict(best_state)
model.eval()
y_true, y_pred = [], []
with torch.no_grad():
    for images, labels in test_dl:
        outputs = model(images.to(device))
        preds = outputs.argmax(dim=1).cpu().numpy().tolist()
        y_pred.extend(preds)
        y_true.extend(labels.numpy().tolist())

report = classification_report(
    y_true, y_pred, labels=list(range(len(test_ds.classes))),
    target_names=test_ds.classes, output_dict=True, zero_division=0
)
metrics = {
    "accuracy": float(accuracy_score(y_true, y_pred)),
    "confusion_matrix": confusion_matrix(
        y_true, y_pred, labels=list(range(len(test_ds.classes)))
    ).tolist(),
    "classification_report": report,
    "classes": train_ds.classes,
    "best_validation_loss": best_val_loss,
    "epochs": EPOCHS,
}
model_path = MODEL_DIR / "resnet18_qr_classifier.pth"
torch.save({
    "state_dict": model.state_dict(),
    "classes": train_ds.classes,
    "image_size": IMG_SIZE,
}, model_path)
(REPORT_DIR / "qr_model_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

print("\nTest accuracy:", f"{metrics['accuracy']:.4f}")
print("Classes:", train_ds.classes)
print("Confusion matrix:", metrics["confusion_matrix"])
print("Saved model:", model_path)
print("Saved metrics:", REPORT_DIR / "qr_model_metrics.json")
print("This classifier predicts dataset classes, not visual tampering unless labels explicitly encode tampering.")
