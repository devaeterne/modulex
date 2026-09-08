#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import math
import re
import tempfile
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"x": MAIN_NS, "r": DOC_REL_NS}

REQUIRED_HEADERS = [
    "Customer",
    "Project Name",
    "Project Address",
    "Start Date",
    "End Date",
    "Sales Rep",
    "Initial Contract Price",
    "Price After Change Orders",
    "Profit Margin",
]

HEADER_ALIASES = {
    "customer": {"customer"},
    "project_name": {"project name", "project"},
    "project_address": {"project address", "address"},
    "start_date": {"start date"},
    "end_date": {"end date"},
    "sales_rep": {"sales rep", "sales representative"},
    "initial_contract_price": {"initial contract price", "contract price"},
    "price_after_change_orders": {"price after change orders", "price after change order"},
    "profit_margin": {"profit margin", "margin"},
}
ALIAS_TO_KEY = {alias: key for key, aliases in HEADER_ALIASES.items() for alias in aliases}

BUILTIN_DATE_STYLE_IDS = set(range(14, 23)) | {27, 30, 36, 45, 46, 47, 50, 57}
BUILTIN_PERCENT_STYLE_IDS = {9, 10}


def norm_header(value):
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def column_index(ref):
    letters = "".join(ch for ch in ref if ch.isalpha())
    result = 0
    for ch in letters.upper():
        result = result * 26 + (ord(ch) - 64)
    return result - 1


def excel_date(value):
    serial = float(value)
    base = dt.datetime(1899, 12, 30)
    result = base + dt.timedelta(days=serial)
    return result.date().isoformat()


def parse_date(value):
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return excel_date(value)
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m.%d.%Y", "%m-%d-%Y", "%m/%d/%y", "%m.%d.%y"):
        try:
            return dt.datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    try:
        return excel_date(float(text))
    except (ValueError, OverflowError):
        raise ValueError(f"Unsupported date value: {text}")


def parse_number(value):
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        if not math.isfinite(float(value)):
            raise ValueError("Non-finite numeric value")
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    negative = text.startswith("(") and text.endswith(")")
    text = text.strip("()").replace("$", "").replace(",", "").strip()
    if not text:
        return None
    number = float(text)
    return -number if negative else number


def parse_margin(value, percent_style=False):
    if value is None or value == "":
        return None, None
    text = str(value).strip()
    if not text:
        return None, None
    if text.endswith("%"):
        return float(text[:-1].replace(",", "").strip()), "percent"
    number = parse_number(value)
    if percent_style:
        return number * 100.0, "percent"
    return number, "number"


def is_date_format(code):
    cleaned = re.sub(r'"[^"]*"', "", code or "")
    cleaned = re.sub(r"\[[^\]]*\]", "", cleaned).lower()
    return bool(re.search(r"(?<!\\)[dmy]", cleaned))


def is_percent_format(code):
    return "%" in (code or "")


class XlsxReader:
    def __init__(self, path):
        self.path = Path(path)
        self.shared_strings = []
        self.style_num_fmt_ids = []
        self.custom_num_fmts = {}
        self.sheet_targets = {}
        self.sheet_order = []

    def _read_xml(self, zf, name):
        return ET.fromstring(zf.read(name))

    def _load_shared_strings(self, zf):
        if "xl/sharedStrings.xml" not in zf.namelist():
            return
        root = self._read_xml(zf, "xl/sharedStrings.xml")
        for si in root.findall("x:si", NS):
            parts = [node.text or "" for node in si.findall(".//x:t", NS)]
            self.shared_strings.append("".join(parts))

    def _load_styles(self, zf):
        if "xl/styles.xml" not in zf.namelist():
            return
        root = self._read_xml(zf, "xl/styles.xml")
        numfmts = root.find("x:numFmts", NS)
        if numfmts is not None:
            for item in numfmts.findall("x:numFmt", NS):
                self.custom_num_fmts[int(item.attrib["numFmtId"])] = item.attrib.get("formatCode", "")
        cellxfs = root.find("x:cellXfs", NS)
        if cellxfs is not None:
            for xf in cellxfs.findall("x:xf", NS):
                self.style_num_fmt_ids.append(int(xf.attrib.get("numFmtId", "0")))

    def _load_workbook(self, zf):
        workbook = self._read_xml(zf, "xl/workbook.xml")
        rels = self._read_xml(zf, "xl/_rels/workbook.xml.rels")
        rel_map = {r.attrib["Id"]: r.attrib["Target"] for r in rels.findall(f"{{{PKG_REL_NS}}}Relationship")}
        sheets = workbook.find("x:sheets", NS)
        if sheets is None:
            return
        for sheet in sheets.findall("x:sheet", NS):
            name = sheet.attrib.get("name", "")
            rid = sheet.attrib.get(f"{{{DOC_REL_NS}}}id")
            target = rel_map.get(rid)
            if target:
                if target.startswith("/"):
                    full = target.lstrip("/")
                else:
                    full = "xl/" + target.lstrip("/")
                self.sheet_targets[name] = full
                self.sheet_order.append(name)

    def _style_flags(self, style_id):
        if style_id is None or style_id < 0 or style_id >= len(self.style_num_fmt_ids):
            return False, False
        fmt_id = self.style_num_fmt_ids[style_id]
        code = self.custom_num_fmts.get(fmt_id, "")
        return fmt_id in BUILTIN_DATE_STYLE_IDS or is_date_format(code), fmt_id in BUILTIN_PERCENT_STYLE_IDS or is_percent_format(code)

    def _cell_value(self, cell):
        cell_type = cell.attrib.get("t")
        style_id = int(cell.attrib["s"]) if "s" in cell.attrib else None
        date_style, percent_style = self._style_flags(style_id)
        if cell_type == "inlineStr":
            parts = [node.text or "" for node in cell.findall(".//x:t", NS)]
            return "".join(parts), date_style, percent_style
        v = cell.find("x:v", NS)
        raw = None if v is None else v.text
        if raw is None:
            return None, date_style, percent_style
        if cell_type == "s":
            return self.shared_strings[int(raw)], date_style, percent_style
        if cell_type in ("str", "e"):
            return raw, date_style, percent_style
        if cell_type == "b":
            return raw == "1", date_style, percent_style
        try:
            number = float(raw)
            if number.is_integer():
                number = int(number)
            return number, date_style, percent_style
        except ValueError:
            return raw, date_style, percent_style

    def rows(self, sheet_name=None):
        with zipfile.ZipFile(self.path) as zf:
            self._load_shared_strings(zf)
            self._load_styles(zf)
            self._load_workbook(zf)
            if not self.sheet_order:
                raise ValueError("Workbook has no worksheets")
            chosen = sheet_name or self.sheet_order[0]
            if chosen not in self.sheet_targets:
                raise ValueError(f"Worksheet not found: {chosen}")
            root = self._read_xml(zf, self.sheet_targets[chosen])
            sheet_data = root.find("x:sheetData", NS)
            if sheet_data is None:
                return []
            result = []
            for row in sheet_data.findall("x:row", NS):
                values = {}
                for cell in row.findall("x:c", NS):
                    ref = cell.attrib.get("r", "")
                    values[column_index(ref)] = self._cell_value(cell)
                result.append((int(row.attrib.get("r", len(result) + 1)), values))
            return result


def extract(path, sheet_name=None):
    rows = XlsxReader(path).rows(sheet_name)
    if not rows:
        return {"sheet": sheet_name, "rows": [], "headers": []}

    header_position = None
    mapping = {}
    header_labels = []
    for row_number, cells in rows:
        labels = {}
        for idx, (value, _date_style, _percent_style) in cells.items():
            label = norm_header(value)
            if label:
                labels[idx] = label
        candidate = {idx: ALIAS_TO_KEY[label] for idx, label in labels.items() if label in ALIAS_TO_KEY}
        if "customer" in candidate.values() and "project_name" in candidate.values():
            header_position = row_number
            mapping = candidate
            header_labels = [value for _, (value, *_flags) in sorted(cells.items())]
            break

    if header_position is None:
        raise ValueError("Could not find a header row containing Customer and Project Name")

    required_keys = {
        "customer", "project_name", "project_address", "start_date", "end_date", "sales_rep",
        "initial_contract_price", "price_after_change_orders", "profit_margin",
    }
    missing_keys = sorted(required_keys - set(mapping.values()))
    if missing_keys:
        raise ValueError("Missing required columns: " + ", ".join(missing_keys))

    out = []
    for row_number, cells in rows:
        if row_number <= header_position:
            continue
        raw = {}
        styles = {}
        for idx, key in mapping.items():
            value, date_style, percent_style = cells.get(idx, (None, False, False))
            raw[key] = value
            styles[key] = {"date": date_style, "percent": percent_style}
        if not any(value not in (None, "") for value in raw.values()):
            continue

        start_value = raw["start_date"]
        end_value = raw["end_date"]
        start_date = excel_date(start_value) if styles["start_date"]["date"] and isinstance(start_value, (int, float)) else parse_date(start_value)
        end_date = excel_date(end_value) if styles["end_date"]["date"] and isinstance(end_value, (int, float)) else parse_date(end_value)
        margin_value, margin_unit = parse_margin(raw["profit_margin"], styles["profit_margin"]["percent"])

        normalized = {
            "row_number": row_number,
            "customer": None if raw["customer"] is None else str(raw["customer"]).strip() or None,
            "project_name": None if raw["project_name"] is None else str(raw["project_name"]).strip() or None,
            "project_address": None if raw["project_address"] is None else str(raw["project_address"]).strip() or None,
            "start_date": start_date,
            "end_date": end_date,
            "sales_rep": None if raw["sales_rep"] is None else str(raw["sales_rep"]).strip() or None,
            "initial_contract_price": parse_number(raw["initial_contract_price"]),
            "price_after_change_orders": parse_number(raw["price_after_change_orders"]),
            "profit_margin": margin_value,
            "profit_margin_unit": margin_unit,
            "raw_payload": {key: raw[key] for key in raw},
        }
        out.append(normalized)

    return {"sheet": sheet_name, "headers": header_labels, "rows": out}


def write_self_test_workbook(path):
    shared = REQUIRED_HEADERS + [
        "GMC Enterprises", "Kitchen Remodel", "123 Test Ave", "Safak Sariyildiz"
    ]
    shared_xml = "".join(f"<si><t>{value}</t></si>" for value in shared)
    header_cells = "".join(
        f'<c r="{chr(65+i)}1" t="s"><v>{i}</v></c>' for i in range(len(REQUIRED_HEADERS))
    )
    body = [
        '<c r="A2" t="s"><v>9</v></c>',
        '<c r="B2" t="s"><v>10</v></c>',
        '<c r="C2" t="s"><v>11</v></c>',
        '<c r="D2" s="1"><v>46037</v></c>',
        '<c r="E2" s="1"><v>46073</v></c>',
        '<c r="F2" t="s"><v>12</v></c>',
        '<c r="G2" s="2"><v>10000</v></c>',
        '<c r="H2" s="2"><v>12500</v></c>',
        '<c r="I2" s="3"><v>0.25</v></c>',
    ]
    files = {
        "[Content_Types].xml": f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>''',
        "_rels/.rels": f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="{PKG_REL_NS}">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>''',
        "xl/workbook.xml": f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="{MAIN_NS}" xmlns:r="{DOC_REL_NS}"><sheets><sheet name="Projects" sheetId="1" r:id="rId1"/></sheets></workbook>''',
        "xl/_rels/workbook.xml.rels": f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="{PKG_REL_NS}">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>''',
        "xl/sharedStrings.xml": f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="{MAIN_NS}" count="{len(shared)}" uniqueCount="{len(shared)}">{shared_xml}</sst>''',
        "xl/styles.xml": f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="{MAIN_NS}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="$#,##0.00"/></numFmts>
<fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="10"/></cellXfs>
</styleSheet>''',
        "xl/worksheets/sheet1.xml": f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="{MAIN_NS}"><sheetData><row r="1">{header_cells}</row><row r="2">{''.join(body)}</row></sheetData></worksheet>''',
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)


def self_test():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "sample.xlsx"
        write_self_test_workbook(path)
        result = extract(path, "Projects")
        assert len(result["rows"]) == 1
        row = result["rows"][0]
        assert row["customer"] == "GMC Enterprises"
        assert row["project_name"] == "Kitchen Remodel"
        assert row["start_date"] == "2026-01-15", row["start_date"]
        assert row["end_date"] == "2026-02-20", row["end_date"]
        assert row["initial_contract_price"] == 10000.0
        assert row["price_after_change_orders"] == 12500.0
        assert row["profit_margin"] == 25.0
        assert row["profit_margin_unit"] == "percent"
    print("PASS: PB-9 XLSX extractor self-test")


def main():
    parser = argparse.ArgumentParser(description="Extract Modulex PB-9 historical Project rows from XLSX")
    parser.add_argument("file", nargs="?")
    parser.add_argument("--sheet")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.file:
        parser.error("file is required unless --self-test is used")
    print(json.dumps(extract(args.file, args.sheet), ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
