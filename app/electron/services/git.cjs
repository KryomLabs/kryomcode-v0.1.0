const { execFile } = require("node:child_process");
const path = require("node:path");

const COMMAND_TIMEOUT = 15000;
const MAX_BUFFER = 4 * 1024 * 1024;

function runGit(projectPath, args) {
  if (
    typeof projectPath !== "string" ||
    !projectPath.trim()
  ) {
    return Promise.reject(
      new Error("A project folder is required.")
    );
  }

  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd: path.resolve(projectPath),
        encoding: "utf8",
        timeout: COMMAND_TIMEOUT,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        shell: false,
      },
      (error, stdout, stderr) => {
        if (error) {
          const message = String(stderr || "").trim();

          reject(
            new Error(
              message || error.message || "Git command failed."
            )
          );
          return;
        }

        resolve(String(stdout || "").trimEnd());
      }
    );
  });
}

function parseChanges(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const filePath = line.slice(3).trim();

      let kind = "modified";

      if (status === "??") {
        kind = "untracked";
      } else if (status.includes("A")) {
        kind = "added";
      } else if (status.includes("D")) {
        kind = "deleted";
      } else if (status.includes("R")) {
        kind = "renamed";
      }

      return {
        path: filePath,
        status,
        kind,
        staged: status[0] !== " " && status[0] !== "?",
        unstaged: status[1] !== " ",
      };
    });
}

async function getStatus(projectPath) {
  const isRepo = await runGit(projectPath, [
    "rev-parse",
    "--is-inside-work-tree",
  ]);

  if (isRepo !== "true") {
    throw new Error("The selected folder is not a Git repository.");
  }

  const [branch, statusOutput] = await Promise.all([
    runGit(projectPath, ["branch", "--show-current"]),
    runGit(projectPath, ["status", "--porcelain=v1", "-uall"]),
  ]);

  return {
    success: true,
    branch: branch || "(detached HEAD)",
    changes: parseChanges(statusOutput),
  };
}

async function getHistory(projectPath, limit = 20) {
  const safeLimit = Math.max(
    1,
    Math.min(Number(limit) || 20, 100)
  );

  const output = await runGit(projectPath, [
    "log",
    `-${safeLimit}`,
    "--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI",
  ]);

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, message, author, date] =
        line.split("\x1f");

      return { hash, shortHash, message, author, date };
    });
}

function validateRelativePaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error("Select at least one file.");
  }

  return paths.map((filePath) => {
    if (
      typeof filePath !== "string" ||
      !filePath.trim() ||
      path.isAbsolute(filePath) ||
      filePath.split(/[\\/]+/).includes("..")
    ) {
      throw new Error("Invalid repository-relative file path.");
    }

    return filePath;
  });
}

async function stageFiles(projectPath, paths) {
  const safePaths = validateRelativePaths(paths);

  await runGit(projectPath, [
    "add",
    "--",
    ...safePaths,
  ]);

  return getStatus(projectPath);
}

async function unstageFiles(projectPath, paths) {
  const safePaths = validateRelativePaths(paths);

  await runGit(projectPath, [
    "restore",
    "--staged",
    "--",
    ...safePaths,
  ]);

  return getStatus(projectPath);
}

async function commitChanges(projectPath, message) {
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("Enter a commit message.");
  }

  await runGit(projectPath, [
    "commit",
    "-m",
    message.trim(),
  ]);

  return getStatus(projectPath);
}

async function pushChanges(projectPath) {
  await runGit(projectPath, ["push"]);
  return getStatus(projectPath);
}

async function pullChanges(projectPath) {
  await runGit(projectPath, ["pull"]);
  return getStatus(projectPath);
}

module.exports = {
  getStatus,
  getHistory,
  stageFiles,
  unstageFiles,
  commitChanges,
  pushChanges,
  pullChanges,
};