#!/usr/bin/env python3
"""
Universal raw-to-markdown converter for the agentic-fx-qa domain wiki.

Scans <wiki-root>/inbox/ (default: <qa-root>/wiki/inbox/ — .stlc/ or qa/ — relative to the CWD), converts
binary/proprietary files (.xlsx, .xls, .csv, .json, .pdf, .doc, .docx, .txt, .log,
.sql, .yaml, .yml) into markdown under <wiki-root>/.tmp/ (mirroring inbox subfolders),
and moves the originals to <wiki-root>/archive/. Large outputs are chunked so no file
truncates an AI context window. `.md` inbox files are copied through verbatim.

Usage:
    python3 raw_to_md_converter.py [wiki-root]

Optional deps for richer parsing: pandas + openpyxl + tabulate (Excel/CSV), pypdf (PDF).
.doc/.docx conversion uses macOS `textutil`.
"""

import csv
import json
import os
import shutil
import subprocess
import sys

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

try:
    import pypdf
    HAS_PYPDF = True
except ImportError:
    try:
        import PyPDF2 as pypdf
        HAS_PYPDF = True
    except ImportError:
        HAS_PYPDF = False


def convert_excel_to_md(filepath, outpath):
    if not HAS_PANDAS:
        print("Pandas not installed — cannot parse Excel. Run: pip install pandas openpyxl tabulate")
        return False
    try:
        xls = pd.ExcelFile(filepath)
        base_outpath, _ = os.path.splitext(outpath)
        for sheet_name in xls.sheet_names:
            df = pd.read_excel(xls, sheet_name=sheet_name)
            safe_sheet_name = "".join(c for c in sheet_name if c.isalnum() or c in (" ", "-", "_")).strip()
            sheet_outpath = f"{base_outpath}_{safe_sheet_name}.md"
            with open(sheet_outpath, "w", encoding="utf-8") as f:
                f.write(f"# Extracted from Excel: {os.path.basename(filepath)}\n")
                f.write(f"## Sheet: {sheet_name}\n\n")
                f.write(df.to_markdown(index=False))
                f.write("\n\n")
        return True
    except Exception as e:
        print(f"Failed to parse Excel: {e}")
        return False


def convert_csv_to_md(filepath, outpath):
    try:
        if HAS_PANDAS:
            df = pd.read_csv(filepath)
            with open(outpath, "w", encoding="utf-8") as f:
                f.write(f"# Extracted from CSV: {os.path.basename(filepath)}\n\n")
                f.write(df.to_markdown(index=False))
        else:
            with open(filepath, "r", encoding="utf-8") as fin, open(outpath, "w", encoding="utf-8") as fout:
                reader = csv.reader(fin)
                headers = next(reader, None)
                if headers:
                    fout.write("| " + " | ".join(headers) + " |\n")
                    fout.write("|" + "|".join("---" for _ in headers) + "|\n")
                    for row in reader:
                        fout.write("| " + " | ".join(row) + " |\n")
        return True
    except Exception as e:
        print(f"Failed to parse CSV: {e}")
        return False


def convert_json_swagger_to_md(filepath, outpath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        with open(outpath, "w", encoding="utf-8") as f:
            title = data.get("info", {}).get("title", "API Reference") if isinstance(data, dict) else "JSON data"
            f.write(f"# {title}\n\n")
            if isinstance(data, dict) and "paths" in data:
                f.write("## Endpoints\n\n")
                for path, methods in data["paths"].items():
                    for method, details in methods.items():
                        if not isinstance(details, dict):
                            continue
                        summary = details.get("summary", "No summary")
                        f.write(f"### {method.upper()} {path}\n")
                        f.write(f"**Summary:** {summary}\n\n")
                        if "parameters" in details:
                            f.write("**Parameters:**\n")
                            for param in details["parameters"]:
                                name = param.get("name", "")
                                in_type = param.get("in", "")
                                required = "Required" if param.get("required") else "Optional"
                                f.write(f"- `{name}` ({in_type}) - {required}\n")
                            f.write("\n")
            else:
                f.write("```json\n")
                f.write(json.dumps(data, indent=2, ensure_ascii=False))
                f.write("\n```\n")
        return True
    except Exception as e:
        print(f"Failed to parse JSON: {e}")
        return False


def write_chunked_text(text, filepath, outpath, lang="", max_chars=100000):
    """Split large text into multiple markdown files to prevent context truncation."""
    base_outpath, _ = os.path.splitext(outpath)
    if len(text) <= max_chars:
        with open(outpath, "w", encoding="utf-8") as f:
            f.write(f"# Extracted from: {os.path.basename(filepath)}\n\n")
            if lang:
                f.write(f"```{lang}\n")
            f.write(text)
            if lang:
                f.write(f"\n```\n")
        return
    chunks = [text[i:i + max_chars] for i in range(0, len(text), max_chars)]
    for idx, chunk in enumerate(chunks):
        chunk_outpath = f"{base_outpath}_part{idx + 1}.md"
        with open(chunk_outpath, "w", encoding="utf-8") as f:
            f.write(f"# Extracted from: {os.path.basename(filepath)} (Part {idx + 1} of {len(chunks)})\n\n")
            if lang:
                f.write(f"```{lang}\n")
            f.write(chunk)
            if lang:
                f.write(f"\n```\n")


def convert_doc_to_md(filepath, outpath):
    try:
        result = subprocess.run(
            ["textutil", "-convert", "txt", "-stdout", filepath],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            write_chunked_text(result.stdout, filepath, outpath)
            return True
        print(f"textutil failed: {result.stderr}")
        return False
    except FileNotFoundError:
        print("textutil not available (macOS only) — export the document to .md/.txt/.pdf instead.")
        return False
    except Exception as e:
        print(f"Failed to parse DOC/DOCX: {e}")
        return False


def convert_pdf_to_md(filepath, outpath):
    if not HAS_PYPDF:
        print("pypdf not installed — cannot parse PDF. Run: pip install pypdf")
        return False
    try:
        base_outpath, _ = os.path.splitext(outpath)
        with open(filepath, "rb") as file:
            reader = pypdf.PdfReader(file)
            total_pages = len(reader.pages)
            pages_per_chunk = 15
            for i in range(0, total_pages, pages_per_chunk):
                last = min(i + pages_per_chunk, total_pages)
                chunk_outpath = f"{base_outpath}_pages_{i + 1}_to_{last}.md"
                with open(chunk_outpath, "w", encoding="utf-8") as f:
                    f.write(f"# Extracted from PDF: {os.path.basename(filepath)} (Pages {i + 1}-{last})\n\n")
                    for page_num in range(i, last):
                        f.write(f"### Page {page_num + 1}\n\n")
                        f.write(reader.pages[page_num].extract_text() + "\n\n")
        return True
    except Exception as e:
        print(f"Failed to parse PDF: {e}")
        return False


def convert_plaintext_to_md(filepath, outpath):
    """Handle .txt, .log, .sql, .yaml, .yml by wrapping them in code blocks."""
    extension = os.path.splitext(filepath)[1].lower().replace(".", "")
    try:
        lang = "text" if extension in ("txt", "log") else extension
        with open(filepath, "r", encoding="utf-8", errors="ignore") as fin:
            content = fin.read()
        write_chunked_text(content, filepath, outpath, lang=lang)
        return True
    except Exception as e:
        print(f"Failed to parse plaintext ({extension}): {e}")
        return False


def main():
    # The QA root (CONTRACTS §2): QA_ROOT, else .stlc/ when it exists, else qa/.
    qa_root = os.environ.get("QA_ROOT") or next((n for n in (".stlc", "qa") if os.path.isdir(n)), ".stlc")
    wiki_root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(qa_root, "wiki")
    inbox_dir = os.path.join(wiki_root, "inbox")
    tmp_dir = os.path.join(wiki_root, ".tmp")
    archive_dir = os.path.join(wiki_root, "archive")

    if not os.path.isdir(inbox_dir):
        print(f"Inbox directory not found at {inbox_dir} — run from the repo root, or pass the wiki root as an argument.")
        sys.exit(1)

    print(f"🔍 Scanning {inbox_dir} for files to convert...")
    converted, skipped = 0, []

    for root, _dirs, files in os.walk(inbox_dir):
        for file in files:
            filepath = os.path.join(root, file)
            filename = file.lower()
            if filename.startswith(".") or filename == "readme.md":
                continue

            rel_path = os.path.relpath(root, inbox_dir)
            target_tmp_dir = os.path.join(tmp_dir, rel_path) if rel_path != "." else tmp_dir
            target_archive_dir = os.path.join(archive_dir, rel_path) if rel_path != "." else archive_dir
            os.makedirs(target_tmp_dir, exist_ok=True)
            os.makedirs(target_archive_dir, exist_ok=True)
            outpath = os.path.join(target_tmp_dir, os.path.splitext(file)[0] + ".md")

            print(f"🔄 Converting {file}...")
            if filename.endswith((".xlsx", ".xls")):
                success = convert_excel_to_md(filepath, outpath)
            elif filename.endswith(".csv"):
                success = convert_csv_to_md(filepath, outpath)
            elif filename.endswith(".json"):
                success = convert_json_swagger_to_md(filepath, outpath)
            elif filename.endswith((".doc", ".docx")):
                success = convert_doc_to_md(filepath, outpath)
            elif filename.endswith(".pdf"):
                success = convert_pdf_to_md(filepath, outpath)
            elif filename.endswith((".txt", ".log", ".sql", ".yaml", ".yml")):
                success = convert_plaintext_to_md(filepath, outpath)
            elif filename.endswith(".md"):
                shutil.copy2(filepath, outpath)
                success = True
            else:
                skipped.append((os.path.relpath(filepath, inbox_dir), "unsupported format"))
                print(f"⚠️ Unsupported format: {file}")
                continue

            if success:
                converted += 1
                archive_path = os.path.join(target_archive_dir, file)
                shutil.move(filepath, archive_path)
                print(f"✅ {os.path.basename(outpath)} → .tmp/ · original → archive/")
            else:
                skipped.append((os.path.relpath(filepath, inbox_dir), "conversion failed — see log above"))

    print(f"\n🎉 Finished: {converted} file(s) converted, {len(skipped)} skipped.")
    for path, reason in skipped:
        print(f"   ⚠️ skipped {path} — {reason}")
    sys.exit(0 if not skipped else 2)


if __name__ == "__main__":
    main()
