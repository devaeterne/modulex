from pathlib import Path
p=Path('modulex-admin/scripts/project-base-contract.mjs')
s=p.read_text()
old='console.log("PASS: project-base foundation contract");\n'
new='await import("./project-pb9-historical-import-contract.mjs");\n\nconsole.log("PASS: project-base foundation contract");\n'
assert old in s, 'project-base final anchor drifted'
p.write_text(s.replace(old,new,1))
