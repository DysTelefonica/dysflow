import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VbaOperationsAdapter } from "../../src/adapters/vba-sync/vba-operations-adapter";
import { VbaSyncAdapter, type VbaVerifyResult } from "../../src/adapters/vba-sync/vba-sync-adapter";

const REPO_ROOT = resolve(__dirname, "..", "..");
const FIXTURE_FRONT = join(REPO_ROOT, "E2E_testing", "NoConformidades.accdb");
const FIXTURE_BACK = join(REPO_ROOT, "E2E_testing", "NoConformidades_Datos.accdb");

const HAS_PWSH = platform() === "win32";
const PASSWORD = process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD;

const skipReason =
  HAS_PWSH && PASSWORD
    ? undefined
    : "pwsh or ACCESS_VBA_PASSWORD is not available on this platform";

describe.skipIf(skipReason !== undefined)(
  "compareSourceAgainstBinary real integration tests with NoConformidades fixture",
  { timeout: 240_000 },
  () => {
    it("runs semantic and strict comparison validations on real binary fixtures", async () => {
      // Ensure fixtures exist
      await expect(access(FIXTURE_FRONT)).resolves.toBeUndefined();
      await expect(access(FIXTURE_BACK)).resolves.toBeUndefined();

      // Create isolated temporary workspace
      const tempWorkspace = await mkdtemp(join(tmpdir(), "dysflow-verify-integration-"));
      const dbPath = join(tempWorkspace, "NoConformidades.accdb");
      const dbBackPath = join(tempWorkspace, "NoConformidades_Datos.accdb");
      const destinationRoot = join(tempWorkspace, "src");

      await cp(FIXTURE_FRONT, dbPath);
      await cp(FIXTURE_BACK, dbBackPath);
      await mkdir(destinationRoot, { recursive: true });

      // Instantiate VbaSyncAdapter pointing to our copied database and temp source folder
      const service = new VbaSyncAdapter({
        accessPath: dbPath,
        destinationRoot,
        cwd: REPO_ROOT,
        accessPassword: PASSWORD,
      });

      try {
        // Step 1: Discover database objects dynamically via list_objects
        const listResult = await service.execute("list_objects", {});
        if (!listResult.ok) {
          console.error("LIST_OBJECTS FAILED:", JSON.stringify(listResult.error, null, 2));
          throw new Error("LIST_OBJECTS FAILED");
        }
        expect(listResult.ok).toBe(true);

        const payload = listResult.data as {
          forms?: string[];
          reports?: string[];
          modules?: string[];
          classes?: string[];
          documentModules?: string[];
        };
        expect(payload).toBeDefined();

        const objects: Array<{ name: string; type: string }> = [];
        if (payload.forms) {
          objects.push(
            ...payload.forms.map((name) => {
              const componentName = /^(Form_|frm)/i.test(name) ? name : `Form_${name}`;
              return { name: componentName, type: "Form" };
            }),
          );
        }
        if (payload.reports) {
          objects.push(
            ...payload.reports.map((name) => {
              const componentName = /^Report_/i.test(name) ? name : `Report_${name}`;
              return { name: componentName, type: "Report" };
            }),
          );
        }
        if (payload.modules) {
          objects.push(...payload.modules.map((name) => ({ name, type: "Module" })));
        }
        if (payload.classes) {
          objects.push(...payload.classes.map((name) => ({ name, type: "Class" })));
        }
        if (payload.documentModules) {
          objects.push(
            ...payload.documentModules.map((name) => ({ name, type: "DocumentModule" })),
          );
        }

        // Find a standard module, a form, and a report (if any)
        const stdModule = objects.find((o) => o.type === "Module");
        const formObj = objects.find((o) => o.type === "Form");
        const reportObj = objects.find((o) => o.type === "Report");

        expect(stdModule).toBeDefined();
        expect(formObj).toBeDefined();
        if (!stdModule || !formObj) {
          throw new Error("stdModule or formObj is undefined");
        }

        const moduleName = stdModule.name;
        const formName = formObj.name;

        // Step 2: Export selected modules to setup the happy path source files
        const moduleNamesToExport = [moduleName, formName];
        if (reportObj) {
          moduleNamesToExport.push(reportObj.name);
        }

        const exportResult = await service.execute("export_modules", {
          moduleNames: moduleNamesToExport,
        });
        expect(exportResult.ok).toBe(true);

        // Assert files exist locally
        const basPath = join(destinationRoot, "modules", `${moduleName}.bas`);
        const formPath = join(destinationRoot, "forms", `${formName}.form.txt`);
        await expect(access(basPath)).resolves.toBeUndefined();
        await expect(access(formPath)).resolves.toBeUndefined();

        if (reportObj) {
          const reportPath = join(destinationRoot, "reports", `${reportObj.name}.report.txt`);
          await expect(access(reportPath)).resolves.toBeUndefined();
        }

        // Step 3: Happy path (Identical code)
        // Run verify_code on the exported modules
        const verifyHappy = await service.execute("verify_code", {
          moduleNames: moduleNamesToExport,
          diff: true,
        });

        if (!verifyHappy.ok) {
          console.error("DEBUG verifyHappy failed:", JSON.stringify(verifyHappy, null, 2));
          throw new Error("verifyHappy failed");
        }
        expect(verifyHappy.ok).toBe(true);
        const happyData = verifyHappy.data as VbaVerifyResult;
        expect(happyHappyData(happyData)).toBe(true);
        expect(happyData.matched.map((m) => m.moduleName)).toContain(moduleName);
        expect(happyData.matched.map((m) => m.moduleName)).toContain(formName);
        if (reportObj) {
          expect(happyData.matched.map((m) => m.moduleName)).toContain(reportObj.name);
        }
        expect(happyData.different).toHaveLength(0);
        expect(happyData.missingInSource).toHaveLength(0);
        expect(happyData.missingInBinary).toHaveLength(0);

        // Step 4: Whitespace Only noise edge case (LF vs CRLF, trailing spaces)
        const originalBasContent = await readFile(basPath, "utf8");
        // Convert to LF-only and append trailing space
        const lfContent = `${originalBasContent.replace(/\r\n/g, "\n")}   \n`;
        await writeFile(basPath, lfContent, "utf8");

        const verifySpace = await service.execute("verify_code", {
          moduleNames: [moduleName],
          diff: true,
        });
        if (!verifySpace.ok) {
          throw new Error("verifySpace failed");
        }
        expect(verifySpace.ok).toBe(true);
        const spaceData = verifySpace.data as VbaVerifyResult;
        expect(spaceData.ok).toBe(false); // byte-exact differences exist
        expect(spaceData.actionableOk).toBe(true); // but it's semantic OK
        expect(spaceData.hasFunctionalDifferences).toBe(false);
        expect(spaceData.different).toHaveLength(1);
        expect(spaceData.diffs?.[0]?.classification).toBe("whitespaceOnly");

        // Verify that strict mode catches the whitespace difference as non-actionableOk
        const verifySpaceStrict = await service.execute("verify_code", {
          moduleNames: [moduleName],
          strict: true,
          diff: true,
        });
        if (!verifySpaceStrict.ok) {
          throw new Error("verifySpaceStrict failed");
        }
        expect(verifySpaceStrict.ok).toBe(true);
        const spaceStrictData = verifySpaceStrict.data as VbaVerifyResult;
        expect(spaceStrictData.ok).toBe(false);
        expect(spaceStrictData.actionableOk).toBeUndefined(); // no semantic fields in strict

        // Restore original bas content
        await writeFile(basPath, originalBasContent, "utf8");

        // Step 5: Attribute Only noise edge case
        // Create an isolated Class Module with customized attributes to import
        const tempClassPath = join(destinationRoot, "modules", "TempVerifyClass.cls");
        const classContentV1 = [
          "VERSION 1.0 CLASS",
          "BEGIN",
          "  MultiUse = -1  'True",
          "END",
          'Attribute VB_Name = "TempVerifyClass"',
          "Attribute VB_GlobalNameSpace = False",
          "Attribute VB_Creatable = False",
          "Attribute VB_PredeclaredId = False",
          "Attribute VB_Exposed = False",
          'Attribute VB_Description = "V1"',
          "Option Compare Database",
          "Option Explicit",
          "",
          "Public Sub Test()",
          "End Sub",
        ].join("\r\n");

        await writeFile(tempClassPath, classContentV1, "utf8");

        // Import the Class Module into the temp database
        const importClass = await service.execute("import_modules", {
          moduleNames: ["TempVerifyClass"],
          importMode: "Code",
        });
        expect(importClass.ok).toBe(true);

        // Modify the Attribute VB_Description (attribute only difference)
        const classContentV2 = classContentV1.replace(
          'Attribute VB_Description = "V1"',
          'Attribute VB_Description = "V2"',
        );
        await writeFile(tempClassPath, classContentV2, "utf8");

        // Verify semantic vs strict attribute comparison
        const verifyAttr = await service.execute("verify_code", {
          moduleNames: ["TempVerifyClass"],
          diff: true,
        });
        if (!verifyAttr.ok) {
          throw new Error("verifyAttr failed");
        }
        expect(verifyAttr.ok).toBe(true);
        const attrData = verifyAttr.data as VbaVerifyResult;
        expect(attrData.ok).toBe(false);
        expect(attrData.actionableOk).toBe(true);
        expect(attrData.hasFunctionalDifferences).toBe(false);
        expect(attrData.diffs?.[0]?.classification).toBe("attributeOnly");

        // Step 6: Form Serialization noise edge case
        const originalFormContent = await readFile(formPath, "utf8");
        // Inject / modify Checksum property
        let formWithNoise = originalFormContent;
        if (/Checksum\s*=\s*-?\d+/.test(formWithNoise)) {
          formWithNoise = formWithNoise.replace(/Checksum\s*=\s*-?\d+/, "Checksum = 999999");
        } else {
          // Add Checksum after Begin Form, handling both CRLF and LF line endings
          formWithNoise = formWithNoise.replace(/(Begin Form\r?\n)/i, "$1   Checksum = 999999\r\n");
        }
        await writeFile(formPath, formWithNoise, "utf8");

        const verifyForm = await service.execute("verify_code", {
          moduleNames: [formName],
          diff: true,
        });
        if (!verifyForm.ok) {
          throw new Error("verifyForm failed");
        }
        expect(verifyForm.ok).toBe(true);
        const formData = verifyForm.data as VbaVerifyResult;
        expect(formData.ok).toBe(false);
        expect(formData.actionableOk).toBe(true);
        expect(formData.hasFunctionalDifferences).toBe(false);
        expect(formData.diffs?.[0]?.classification).toBe("formSerializationOnly");

        // Restore form content
        await writeFile(formPath, originalFormContent, "utf8");

        // Step 7: Sad path - actual functional difference
        const functionalDiffContent = `${originalBasContent}\r\nPublic Sub NewTestFunc()\r\nEnd Sub\r\n`;
        await writeFile(basPath, functionalDiffContent, "utf8");

        const verifySad = await service.execute("verify_code", {
          moduleNames: [moduleName],
          diff: true,
        });
        if (!verifySad.ok) {
          throw new Error("verifySad failed");
        }
        expect(verifySad.ok).toBe(true);
        const sadData = verifySad.data as VbaVerifyResult;
        expect(sadData.ok).toBe(false);
        expect(sadData.actionableOk).toBe(false);
        expect(sadData.hasFunctionalDifferences).toBe(true);
        expect(sadData.different).toHaveLength(1);
        expect(sadData.diffs?.[0]?.classification).toBe("sourceNewer");

        // Clean up the added class module from the database copy before finishing
        await service.execute("delete_module", { moduleName: "TempVerifyClass" });
      } finally {
        // Force cleanup of any lingering msaccess.exe process locking our db copy
        try {
          const opsAdapter = new VbaOperationsAdapter({ cwd: REPO_ROOT });
          await opsAdapter.runPreflightCleanup({ accessPath: dbPath, projectRoot: REPO_ROOT });
        } catch (err) {
          console.warn("Failed to run preflight cleanup during teardown:", err);
        }
        // Tear down workspace to keep everything clean and idempotent
        await rm(tempWorkspace, { recursive: true, force: true });
      }
    });
  },
);

function happyHappyData(data: VbaVerifyResult): boolean {
  return (
    data.ok === true &&
    (data.actionableOk === true || data.actionableOk === undefined) &&
    data.hasFunctionalDifferences === false
  );
}
