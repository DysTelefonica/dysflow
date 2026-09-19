# `@aroman22/dysflow-pi`

This Pi package provides one native tool named `dysflow`. It delegates through the official Dysflow MCP stdio boundary and renders collapsed rows with a bounded `⚡ Dysflow` label.

It ships inside every Dysflow runtime. Install it through Dysflow, which activates the runtime copy by local path so package ownership and the matching release version remain explicit:

```powershell
dysflow install --agents pi --no-tui
```

Enter `/reload` in Pi, then verify the facade with `dysflow({ tool: "bootstrap", args: {} })`.

The package does not register another MCP, replace adapter-owned tools, or expose parameters, paths, secrets, and arbitrary MCP errors in collapsed output.

The [Pi-native integration guide](https://github.com/DysTelefonica/dysflow/blob/main/docs/pi-native-integration.md) is the source of truth for architecture, lifecycle, troubleshooting, release, and sandbox testing.
