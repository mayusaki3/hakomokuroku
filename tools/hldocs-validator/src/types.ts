export type ValidationLevel =
  | "PASS"
  | "WARN"
  | "FAIL";

export type ValidationIssue = {
  level: ValidationLevel;
  validator: string;
  file: string;
  message: string;
};

export type MarkdownFile = {
  path: string;
  content: string;
};

export type ManagedBlock = {
  doc_id?: string;
  lang?: string;
  canonical_title?: string;
  document_type?: string;
  canonical_document?: string;
};
