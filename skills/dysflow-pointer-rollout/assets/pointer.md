<!-- user-supplement:dysflow:pointer -->
## Dysflow runtime-first rule

When the cwd contains `.dysflow/project.json`, any `.dysflow/*` artifact,
`*.accdb`, `*.bas`, `*.cls`, `*.form.txt`, or `tests/*.json`, `dysflow-usage`
and `dysflow-arnes` are **MUST-LOAD** skills. Load `dysflow-usage` first: its
**Recipes** section at the top holds the exact calls. Then load `dysflow-arnes`
for the rules. Call `bootstrap({cwd})`, with `cwd` set to the worktree root,
before inspecting static project files, forming a diagnosis, or modifying
configuration. Route with `schema({view:"index"})`, which lists every callable tool
and marks the advertised surface. Pass `cwd` to every tool whose schema takes it.
Expand with `get_capabilities({view:"compact"})` (or `{view:"full"}`) and
`describe_tool` only when needed. The live runtime wins over cached documentation and assumptions.
<!-- /user-supplement:dysflow:pointer -->
