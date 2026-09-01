from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

SPECS = [
    {
        "path": "src/components/inventory/InventoryTable.tsx",
        "columns": 8,
        "width_from": '<Table variant="admin" className="w-full min-w-[1040px]">',
        "width_to": '<Table variant="admin" minWidth="wide">',
        "constant_marker": "const PAGE_SIZE = 25;",
    },
    {
        "path": "src/components/inventory/LowStockManager.tsx",
        "columns": 9,
        "width_from": '<Table variant="admin" className="w-full min-w-[1120px]">',
        "width_to": '<Table variant="admin" minWidth="wide">',
        "constant_marker": "const PAGE_SIZE_OPTIONS = [25, 50, 100];",
    },
    {
        "path": "src/components/warehouses/WarehousesTable.tsx",
        "columns": 7,
        "width_from": '<Table variant="admin" className="min-w-[1080px]">',
        "width_to": '<Table variant="admin" minWidth="wide">',
        "constant_marker": 'type WarehouseType = "sellable" | "non_sellable";',
    },
    {
        "path": "src/components/zones/ZonesTable.tsx",
        "columns": 8,
        "width_from": '<Table variant="admin" className="w-full min-w-[1520px]">',
        "width_to": '<Table variant="admin" minWidth="extraWide">',
        "constant_marker": 'type WarehouseType = "sellable" | "non_sellable";',
    },
]


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new, 1)


for spec in SPECS:
    path = ROOT / spec["path"]
    source = path.read_text()

    source = replace_once(
        source,
        "  TableViewport,\n} from \"@/components/ui/table\";",
        "  TableViewport,\n  TableStateRow,\n} from \"@/components/ui/table\";",
        f"{spec['path']} import",
    )

    marker = spec["constant_marker"]
    source = replace_once(
        source,
        marker,
        f"const TABLE_COLUMN_COUNT = {spec['columns']};\n{marker}",
        f"{spec['path']} column constant",
    )

    source = replace_once(
        source,
        spec["width_from"],
        spec["width_to"],
        f"{spec['path']} table width",
    )

    state_pattern = re.compile(
        rf"<TableRow>\s*<TableCell\b(?=[^>]*\bcolSpan=\{{{spec['columns']}\}})(?=[^>]*\bvariant=\"admin\")[^>]*>\s*(.*?)\s*</TableCell>\s*</TableRow>",
        re.S,
    )

    def state_replacement(match: re.Match[str]) -> str:
        content = match.group(1).strip()
        return (
            "<TableStateRow colSpan={TABLE_COLUMN_COUNT}>\n"
            f"                  {content}\n"
            "                </TableStateRow>"
        )

    source, state_count = state_pattern.subn(state_replacement, source)
    if state_count != 2:
        raise RuntimeError(
            f"{spec['path']} state rows: expected exactly 2 replacements, found {state_count}"
        )

    path.write_text(source)

print("Applied bounded UI-2B table layout transform")
