// The runtime-dir resolver now lives in src/shared so non-CLI layers (e.g. the
// vba-sync adapter's write-containment guard) can use it without importing from
// cli/. Re-exported here to keep the existing install/uninstall import paths
// working. See src/shared/runtime-dir.ts.
export * from "../../../shared/runtime-dir.js";
