<!-- user-supplement:dysflow:pointer -->
## Dysflow runtime-first rule

When the cwd contains `.dysflow/project.json`, any `.dysflow/*` artifact,
`*.accdb`, `*.bas`, `*.cls`, `*.form.txt`, or `tests/*.json`, `dysflow-usage`
and `dysflow-arnes` are **MUST-LOAD** skills. Load `dysflow-usage` first, then
the arnés. Call `get_capabilities({})` before inspecting static project files,
forming a diagnosis, or modifying configuration. The live runtime wins over
cached documentation and assumptions.
<!-- /user-supplement:dysflow:pointer -->
