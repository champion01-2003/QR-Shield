
from pathlib import Path

import pandas as pd
from scipy.io import arff

DATA_PATH = Path(
    r"D:\QR-Shield\datasets\url\Training Dataset.arff"
)

# Load the ARFF dataset
records, metadata = arff.loadarff(DATA_PATH)

df = pd.DataFrame(records)

# Convert byte-string values, if present
for column in df.columns:
    df[column] = df[column].map(
        lambda value: (
            value.decode("utf-8")
            if isinstance(value, bytes)
            else value
        )
    )

print("\n--- Dataset shape ---")
print(f"Rows: {df.shape[0]}")
print(f"Columns: {df.shape[1]}")

print("\n--- Column names ---")
print(df.columns.tolist())

print("\n--- First 5 records ---")
print(df.head())

print("\n--- Target distribution ---")
print(df["Result"].value_counts(dropna=False))

print("\n--- Missing values ---")
print(df.isnull().sum().sum())

print("\n--- Target data type ---")
print(df["Result"].dtype)


