<!-- user-supplement:dysflow:pointer -->
## Dysflow runtime-first rule

When the cwd contains `.dysflow/project.json`, any `.dysflow/*` artifact,
`*.accdb`, `*.bas`, `*.cls`, `*.form.txt`, or `tests/*.json`, `dysflow-usage`
and `dysflow-arnes` are **MUST-LOAD** skills. Load `dysflow-usage` first, then
the arnés. Call `bootstrap({})` before inspecting static project files,
forming a diagnosis, or modifying configuration. Route through
`schema({view:"index"})`, which lists every callable tool and marks the active
advertised surface. Expand with `get_capabilities({view:"compact"})`, an
explicit full view, or selective `describe_tool` only when needed. The live
runtime wins over cached documentation and assumptions.
<!-- /user-supplement:dysflow:pointer -->
