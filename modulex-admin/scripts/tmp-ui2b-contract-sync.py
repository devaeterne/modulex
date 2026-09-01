from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    source = path.read_text()
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    path.write_text(source.replace(old, new, 1))


low_stock = ROOT / "scripts/low-stock-ui-contract.mjs"
replace_once(
    low_stock,
    """expect(\n  manager.includes('className=\"w-full min-w-[1120px]\"'),\n  \"Low Stock table must fill the available card width while retaining its responsive minimum width\",\n);""",
    """expect(\n  manager.includes('minWidth=\"wide\"'),\n  \"Low Stock table must use the shared wide table width preset\",\n);""",
    "Low Stock width assertion",
)
replace_once(
    low_stock,
    """expect(\n  manager.includes(\"min-w-[1120px]\"),\n  \"Low Stock table needs an explicit responsive minimum width\"\n);""",
    """expect(\n  manager.includes(\"TableStateRow\") && manager.includes(\"TABLE_COLUMN_COUNT = 9\"),\n  \"Low Stock table states must use the shared column-count contract\"\n);""",
    "Low Stock state-row assertion",
)

inventory = ROOT / "scripts/inventory-warehouse-qr-ui-contract.mjs"
replace_once(
    inventory,
    """expect(inventoryTable.includes('className=\"w-full min-w-[1040px]\"'), \"Inventory table must fill the available card width while retaining its mobile minimum width\");""",
    """expect(inventoryTable.includes('minWidth=\"wide\"'), \"Inventory table must use the shared wide table width preset\");""",
    "Inventory width assertion",
)

print("Synchronized Low Stock and Inventory domain table contracts with UI-2B")
