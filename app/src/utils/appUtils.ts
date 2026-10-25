/**
 * Shared utility functions for KryomCode.
 */

export function getFileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function getLanguage(path: string): string {
  const fileName = getFileName(path);
  const extension = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : "";

  const languages: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    mts: "typescript",
    cts: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    jsonc: "json",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    md: "markdown",
    mdx: "markdown",
    py: "python",
    java: "java",
    c: "c",
    h: "cpp",
    cc: "cpp",
    cpp: "cpp",
    hpp: "cpp",
    cs: "csharp",
    go: "go",
    rs: "rust",
    php: "php",
    rb: "ruby",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    yml: "yaml",
    yaml: "yaml",
    xml: "xml",
    svg: "xml",
    toml: "ini",
    ini: "ini",
    env: "ini",
    dockerfile: "dockerfile",
    graphql: "graphql",
    gql: "graphql",
    kt: "kotlin",
    swift: "swift",
    dart: "dart",
    lua: "lua",
    r: "r",
    ipynb: "json",
  };

  if (fileName.toLowerCase() === "dockerfile") {
    return "dockerfile";
  }

  return languages[extension ?? ""] ?? "plaintext";
}

export function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(Math.max(value, min), max);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}