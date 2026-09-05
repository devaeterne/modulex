# PB-6 Gross Profit Commission Acceptance

Status: implementation in progress

Approved business rule: gross-profit commission equals scoped non-cancelled Project Order line revenue minus canonical current product cost, multiplied by the commission percentage. Missing cost, mixed currency, and non-positive gross profit fail closed. Existing fixed and sales-percentage semantics remain unchanged.

Verification evidence will be recorded here after RED→GREEN implementation and rollback-only smoke testing.
