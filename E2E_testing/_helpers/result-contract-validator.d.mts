export type HarnessLikeResult = {
  response?: {
    result?: {
      content?: Array<{ text?: string }>;
      isError?: boolean;
    };
  };
  text?: string;
};

export function validateMcpResultAgainstDescription(input: {
  tool: string;
  descriptionResult: HarnessLikeResult;
  executionResult: HarnessLikeResult;
  expectError?: boolean;
}): { ok: true; contractKind: string };
