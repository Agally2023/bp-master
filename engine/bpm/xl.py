"""Safe Excel reading + validation helpers. Never trusts Excel formula results blindly."""
from __future__ import annotations
import datetime as dt, hashlib, re
import openpyxl, pandas as pd

ERR = re.compile(r'^#(REF!|VALUE!|DIV/0!|N/A|NAME\?|NUM!|NULL!)$')

def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

def read_sheet(path, sheet, first_header, stop_after_blank=40):
    """Find the header row (first cell == first_header, case-insensitive), read until a run of blank rows.
    Returns (DataFrame, excel_error_counts, header_row_number). Excel error cells become NaN."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet]
    header, rows, blanks, errs, hdr_row = None, [], 0, {}, None
    for i, r in enumerate(ws.iter_rows(values_only=True), 1):
        if header is None:
            vals = [str(v).strip().lower() for v in r if v is not None]
            if vals and vals[0] == first_header.lower():
                keep = [j for j, v in enumerate(r) if v is not None and str(v).strip()]
                header = [re.sub(r'\s+', ' ', str(r[j]).strip()) for j in keep]
                hdr_row = i
            continue
        row = [r[j] if j < len(r) else None for j in keep]
        row_errs = [header[j] for j, v in enumerate(row) if isinstance(v, str) and ERR.match(v.strip())]
        row = [None if (isinstance(v, str) and ERR.match(v.strip())) else v for v in row]
        if all(v is None or v == '' for v in row):      # blank or formula-error-only template row
            blanks += 1
            if blanks >= stop_after_blank:
                break
            continue
        blanks = 0
        for h in row_errs:
            errs[h] = errs.get(h, 0) + 1
        rows.append(row)
    wb.close()
    if header is None:
        raise ValueError(f"Header '{first_header}' not found in sheet '{sheet}'")
    # de-duplicate header names
    seen, cols = {}, []
    for h in header:
        seen[h] = seen.get(h, 0) + 1
        cols.append(h if seen[h] == 1 else f"{h}.{seen[h]}")
    return pd.DataFrame(rows, columns=cols), errs, hdr_row

def col(df, *prefixes):
    """Case-insensitive prefix column lookup (headers differ slightly between sheets)."""
    low = {c.lower(): c for c in df.columns}
    for p in prefixes:
        p = p.lower()
        for k, c in low.items():
            if k.startswith(p):
                return c
    return None

def issue(sev, code, msg, count=0, sample=None):
    return {"severity": sev, "code": code, "message": msg, "count": int(count), "sample": sample or []}

def num(s):
    return pd.to_numeric(s, errors='coerce')

def split_future(df, date_col, as_of, label):
    """Rows dated after 'as_of' are almost always typing errors (e.g. 10/12 read as 12 Oct)."""
    fut = df[date_col] > pd.Timestamp(as_of)
    issues = []
    if fut.any():
        s = sorted({d.strftime('%Y-%m-%d') for d in df.loc[fut, date_col]})
        issues.append(issue('error', 'future_date',
                            f"{label}: {int(fut.sum())} row(s) dated after {as_of} were rejected - check day/month order.",
                            fut.sum(), s[:8]))
    return df[~fut].copy(), issues

def iso(df, date_col):
    c = df[date_col].dt.isocalendar()
    df['iso_year'], df['iso_week'] = c.year.astype(int), c.week.astype(int)
    return df
