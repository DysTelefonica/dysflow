export interface ProcessRow {
  ProcessId: number;
  ParentProcessId: number;
  Name: string;
  CommandLine?: string | null;
}

export declare function formatZombieReport(input: { rows: ProcessRow[]; childPid: number }): string[];
