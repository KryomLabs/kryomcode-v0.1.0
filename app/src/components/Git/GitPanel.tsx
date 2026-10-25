import { useCallback, useEffect, useState } from "react";
import "./git.css";

type GitPanelProps = {
  projectPath?: string;
  onOpenTerminal?: () => void;
};

type GitTab = "changes" | "history";

type GitChange = {
  path: string;
  status: string;
  kind:
    | "modified"
    | "untracked"
    | "added"
    | "deleted"
    | "renamed";
  staged: boolean;
  unstaged: boolean;
};

type GitStatusResult = {
  success: true;
  branch: string;
  changes: GitChange[];
};

type GitCommit = {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong while running the Git operation.";
}

export default function GitPanel({
  projectPath,
  onOpenTerminal,
}: GitPanelProps) {
  const [activeTab, setActiveTab] = useState<GitTab>("changes");
  const [commitMessage, setCommitMessage] = useState("");
  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [history, setHistory] = useState<GitCommit[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [operation, setOperation] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const api = window.kryomcode;

  const refreshStatus = useCallback(async () => {
    if (!projectPath) {
      setStatus(null);
      setHistory([]);
      setSelectedFiles([]);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const result = await api.gitGetStatus();

      setStatus(result);
      setSelectedFiles((previous) =>
        previous.filter((path) =>
          result.changes.some((change) => change.path === path),
        ),
      );
    } catch (err) {
      setStatus(null);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, projectPath]);

  const refreshHistory = useCallback(async () => {
    if (!projectPath) {
      setHistory([]);
      return;
    }

    setHistoryLoading(true);
    setError("");

    try {
      const result = await api.gitGetHistory(30);
      setHistory(result);
    } catch (err) {
      setHistory([]);
      setError(getErrorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }, [api, projectPath]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (activeTab === "history") {
      void refreshHistory();
    }
  }, [activeTab, refreshHistory]);

  const runOperation = async (
    label: string,
    action: () => Promise<GitStatusResult>,
  ) => {
    setOperation(label);
    setError("");
    setNotice("");

    try {
      const result = await action();
      setStatus(result);
      setSelectedFiles([]);
      setNotice(`${label} completed successfully.`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setOperation("");
    }
  };

  const handleStage = async () => {
    if (selectedFiles.length === 0) return;

    await runOperation("Stage files", () =>
      api.gitStageFiles(selectedFiles),
    );
  };

  const handleUnstage = async () => {
    if (selectedFiles.length === 0) return;

    await runOperation("Unstage files", () =>
      api.gitUnstageFiles(selectedFiles),
    );
  };

  const handleCommit = async () => {
    const message = commitMessage.trim();

    if (!message) {
      setError("Enter a commit message first.");
      return;
    }

    if (!status?.changes.some((change) => change.staged)) {
      setError("Stage at least one file before committing.");
      return;
    }

    await runOperation("Commit", () =>
      api.gitCommitChanges(message),
    );

    setCommitMessage("");
    await refreshHistory();
  };

  const handlePush = async () => {
    await runOperation("Push", () => api.gitPushChanges());
  };

  const handlePull = async () => {
    await runOperation("Pull", () => api.gitPullChanges());
  };

  const toggleFile = (path: string) => {
    setSelectedFiles((previous) =>
      previous.includes(path)
        ? previous.filter((item) => item !== path)
        : [...previous, path],
    );
  };

  const changes = status?.changes ?? [];
  const stagedChanges = changes.filter((change) => change.staged);
  const unstagedChanges = changes.filter((change) => !change.staged);

  const toggleAllUnstaged = () => {
    const paths = unstagedChanges.map((change) => change.path);

    setSelectedFiles((previous) => {
      const allSelected = paths.every((path) => previous.includes(path));

      if (allSelected) {
        return previous.filter((path) => !paths.includes(path));
      }

      return [...new Set([...previous, ...paths])];
    });
  };

  return (
    <section className="kc-git-panel" aria-label="Git source control">
      <header className="kc-git-header">
        <div className="kc-git-title">
          <span className="kc-git-logo" aria-hidden="true">
            ⑂
          </span>
          <div>
            <h2>Source Control</h2>
            <p>Git workspace</p>
          </div>
        </div>

        <button
          className="kc-git-icon-button"
          type="button"
          title="Refresh Git status"
          aria-label="Refresh Git status"
          disabled={!projectPath || loading || Boolean(operation)}
          onClick={() => void refreshStatus()}
        >
          {loading ? "…" : "↻"}
        </button>
      </header>

      {!projectPath ? (
        <div className="kc-git-empty">
          <span className="kc-git-empty-icon">⑂</span>
          <h3>No project open</h3>
          <p>Open a project folder to start using source control.</p>
        </div>
      ) : (
        <>
          <div className="kc-git-repository">
            <span className="kc-git-label">REPOSITORY</span>

            <p title={projectPath}>
              <span aria-hidden="true">▣</span>
              <span className="kc-git-path">{projectPath}</span>
            </p>

            <div className="kc-git-branch">
              <span aria-hidden="true">⑂</span>
              <span>
                {status
                  ? `Branch: ${status.branch}`
                  : loading
                    ? "Loading branch…"
                    : "Branch unavailable"}
              </span>
            </div>

            <div className="kc-git-remote-actions">
              <button
                type="button"
                onClick={() => void handlePull()}
                disabled={Boolean(operation) || loading}
              >
                {operation === "Pull" ? "Pulling…" : "Pull"}
              </button>

              <button
                type="button"
                onClick={() => void handlePush()}
                disabled={Boolean(operation) || loading}
              >
                {operation === "Push" ? "Pushing…" : "Push"}
              </button>
            </div>
          </div>

          <div className="kc-git-tabs" role="tablist" aria-label="Git views">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "changes"}
              className={activeTab === "changes" ? "active" : ""}
              onClick={() => setActiveTab("changes")}
            >
              Changes ({changes.length})
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "history"}
              className={activeTab === "history" ? "active" : ""}
              onClick={() => setActiveTab("history")}
            >
              History
            </button>
          </div>

          {error && (
            <div className="kc-git-notice" role="alert">
              <span aria-hidden="true">⚠</span>
              <div>
                <strong>Git operation failed</strong>
                <p>{error}</p>
              </div>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                ×
              </button>
            </div>
          )}

          {notice && !error && (
            <div className="kc-git-notice" role="status">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>{notice}</strong>
              </div>
              <button
                type="button"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}

          {activeTab === "changes" ? (
            <div className="kc-git-content">
              <div className="kc-git-section-heading">
                <strong>Changed files</strong>
                <span className="kc-git-count">{changes.length}</span>
              </div>

              {loading && (
                <p className="kc-git-helper">Loading repository status…</p>
              )}

              {!loading && !status && !error && (
                <div className="kc-git-notice">
                  <span aria-hidden="true">ⓘ</span>
                  <div>
                    <strong>Repository status unavailable</strong>
                    <p>Check that Git is installed and the project is a Git repository.</p>
                  </div>
                </div>
              )}

              {status && changes.length === 0 && !loading && (
                <div className="kc-git-empty">
                  <span className="kc-git-empty-icon">✓</span>
                  <h3>Working tree clean</h3>
                  <p>No changed files found in this repository.</p>
                </div>
              )}

              {unstagedChanges.length > 0 && (
                <div className="kc-git-file-group">
                  <div className="kc-git-section-heading">
                    <strong>Changes</strong>
                    <button
                      type="button"
                      onClick={toggleAllUnstaged}
                    >
                      Select all
                    </button>
                  </div>

                  {unstagedChanges.map((change) => (
                    <label
                      className="kc-git-file"
                      key={change.path}
                      title={change.path}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(change.path)}
                        onChange={() => toggleFile(change.path)}
                      />

                      <span className="kc-git-file-name">
                        {change.path}
                      </span>

                      <span className="kc-git-file-status">
                        {change.kind === "untracked"
                          ? "U"
                          : change.kind === "added"
                            ? "A"
                            : change.kind === "deleted"
                              ? "D"
                              : change.kind === "renamed"
                                ? "R"
                                : "M"}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {stagedChanges.length > 0 && (
                <div className="kc-git-file-group">
                  <div className="kc-git-section-heading">
                    <strong>Staged Changes</strong>
                    <span className="kc-git-count">
                      {stagedChanges.length}
                    </span>
                  </div>

                  {stagedChanges.map((change) => (
                    <label
                      className="kc-git-file"
                      key={change.path}
                      title={change.path}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(change.path)}
                        onChange={() => toggleFile(change.path)}
                      />

                      <span className="kc-git-file-name">
                        {change.path}
                      </span>

                      <span className="kc-git-file-status">
                        {change.kind === "untracked"
                          ? "U"
                          : change.kind === "added"
                            ? "A"
                            : change.kind === "deleted"
                              ? "D"
                              : change.kind === "renamed"
                                ? "R"
                                : "M"}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="kc-git-selection-actions">
                <button
                  type="button"
                  onClick={() => void handleStage()}
                  disabled={
                    Boolean(operation) ||
                    !selectedFiles.some((path) =>
                      unstagedChanges.some((change) => change.path === path),
                    )
                  }
                >
                  Stage selected
                </button>

                <button
                  type="button"
                  onClick={() => void handleUnstage()}
                  disabled={
                    Boolean(operation) ||
                    !selectedFiles.some((path) =>
                      stagedChanges.some((change) => change.path === path),
                    )
                  }
                >
                  Unstage selected
                </button>
              </div>

              <label className="kc-git-label" htmlFor="kc-git-commit">
                COMMIT MESSAGE
              </label>

              <textarea
                id="kc-git-commit"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder="Message (e.g. Add editor improvements)"
                rows={3}
                disabled={Boolean(operation)}
              />

              <button
                type="button"
                className="kc-git-commit-button"
                disabled={
                  !commitMessage.trim() ||
                  !stagedChanges.length ||
                  Boolean(operation)
                }
                onClick={() => void handleCommit()}
              >
                {operation === "Commit" ? "Committing…" : "Commit staged"}
              </button>

              <p className="kc-git-helper">
                Only staged changes are included in a commit.
              </p>
            </div>
          ) : (
            <div className="kc-git-content kc-git-history">
              <div className="kc-git-section-heading">
                <strong>Recent commits</strong>
                <button
                  type="button"
                  onClick={() => void refreshHistory()}
                  disabled={historyLoading}
                >
                  {historyLoading ? "Loading…" : "Refresh"}
                </button>
              </div>

              {historyLoading && (
                <p className="kc-git-helper">Loading commit history…</p>
              )}

              {!historyLoading && history.length === 0 && (
                <div className="kc-git-empty">
                  <span className="kc-git-empty-icon">◷</span>
                  <h3>No commits found</h3>
                  <p>Commit history will appear here when available.</p>
                </div>
              )}

              {history.map((commit) => (
                <article className="kc-git-commit" key={commit.hash}>
                  <strong>{commit.message}</strong>
                  <p>
                    <code>{commit.shortHash}</code>
                    {" · "}
                    {commit.author}
                  </p>
                  <time dateTime={commit.date}>
                    {commit.date}
                  </time>
                </article>
              ))}
            </div>
          )}

          <div className="kc-git-footer">
            <p>Need to run a Git command manually?</p>
            <button
              type="button"
              className="kc-git-terminal-button"
              onClick={onOpenTerminal}
            >
              Open Terminal <span aria-hidden="true">→</span>
            </button>
          </div>
        </>
      )}
    </section>
  );
}