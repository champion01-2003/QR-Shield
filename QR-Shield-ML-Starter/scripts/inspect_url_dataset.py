from pathlib import Path
import pandas as pd
from scipy.io import arff

DATA_PATH = Path(r"D:\QR-Shield\datasets\url\Training Dataset.arff")

records, metadata = arff.loadarff(DATA_PATH)
df = pd.DataFrame(records)

for col in df.columns:
    df[col] = df[col].map(
        lambda v: v.decode("utf-8") if isinstance(v, bytes) else v
    )

df.columns = df.columns.str.strip()
print("Shape:", df.shape)
print("Columns:", df.columns.tolist())
print("\nTarget distribution:")
print(df["Result"].value_counts(dropna=False))
print("\nMissing values:", int(df.isna().sum().sum()))
print("\nDuplicate rows:", int(df.duplicated().sum()))
print("\nFirst rows:")
print(df.head())
