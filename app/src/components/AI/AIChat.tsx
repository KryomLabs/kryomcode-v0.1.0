import { useState, type FormEvent } from "react";
import AIActions, { type AIActionType } from "./AIActions";
import "./ai.css";

type AIChatProps = {
  projectPath?: string;
  onAction?: (action: string) => void;
  onOpenProblems?: () => void;
};

const QUICK_ACTIONS = [
  {
    icon: "⌕",
    title: "Analyze project",
    description: "Understand folders and architecture",
    action: "Analyze project structure",
  },
  {
    icon: "⌘",
    title: "Plan implementation",
    description: "Break work into clear steps",
    action: "Create implementation plan",
  },
  {
    icon: "✓",
    title: "Review code",
    description: "Prepare a code review",
    action: "Review code and potential problems",
  },
];

const ACTION_PROMPTS: Record<AIActionType, string> = {
  explain: "Explain the selected code",
  fix: "Find and suggest fixes for code issues",
  refactor: "Suggest a refactor for the selected code",
  "generate-tests": "Generate test cases for the selected code",
  review: "Review code quality and potential risks",
  document: "Generate documentation for the selected code",
};

export default function AIChat({
  projectPath,
  onAction,
  onOpenProblems,
}: AIChatProps) {
  const [prompt, setPrompt] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = prompt.trim();
    if (!message) return;

    onAction?.(message);
    setPrompt("");
  }

  function handleQuickAction(action: AIActionType) {
    onAction?.(ACTION_PROMPTS[action]);
  }

  return (
    <section className="kc-ai-chat" aria-label="KryomCode AI assistant">
      <header className="kc-ai-chat__header">
        <div className="kc-ai-chat__brand">
          <span className="kc-ai-chat__logo" aria-hidden="true">
            ✧
          </span>
          <div>
            <h2>KryomCode Assistant</h2>
            <p>AI engineering workspace</p>
          </div>
        </div>

        <span className="kc-ai-chat__status">
          <span className="kc-ai-chat__status-dot" />
          UI preview
        </span>
      </header>

      <div className="kc-ai-chat__body">
        <div className="kc-ai-chat__welcome">
          <span className="kc-ai-chat__welcome-icon" aria-hidden="true">
            ✦
          </span>
          <h3>Build something great.</h3>
          <p>
            Explore your codebase, plan features, and prepare your next
            implementation step.
          </p>
        </div>

        <div className="kc-ai-chat__workspace">
          <span className="kc-ai-chat__eyebrow">CURRENT WORKSPACE</span>
          <p title={projectPath || "No project selected"}>
            <span aria-hidden="true">▣</span>{" "}
            {projectPath || "No project selected"}
          </p>
          {!projectPath && (
            <small>Open a project to use workspace-aware actions.</small>
          )}
        </div>

        <div className="kc-ai-chat__section-heading">
          <h3>Project actions</h3>
          <span>3 tools</span>
        </div>

        <div className="kc-ai-chat__actions">
          {QUICK_ACTIONS.map((item) => (
            <button
              className="kc-ai-chat__action"
              type="button"
              key={item.action}
              onClick={() => onAction?.(item.action)}
            >
              <span className="kc-ai-chat__action-icon" aria-hidden="true">
                {item.icon}
              </span>

              <span className="kc-ai-chat__action-copy">
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>

              <span className="kc-ai-chat__action-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
        </div>

        <div className="kc-ai-chat__section-heading">
          <h3>Code actions</h3>
          <span>6 tools</span>
        </div>

        <AIActions onAction={handleQuickAction} />

        <button
          className="kc-ai-chat__problems"
          type="button"
          onClick={onOpenProblems}
        >
          <span aria-hidden="true">✓</span>
          Open Problems panel
          <span aria-hidden="true">→</span>
        </button>

        <p className="kc-ai-chat__notice">
          AI responses are not connected yet. These actions prepare the
          interface for future Meta Muse AI integration.
        </p>
      </div>

      <form className="kc-ai-chat__composer" onSubmit={handleSubmit}>
        <label className="kc-ai-chat__sr-only" htmlFor="kc-ai-prompt">
          Ask the assistant
        </label>

        <textarea
          id="kc-ai-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask AI to explain, plan, or review code…"
          rows={2}
        />

        <div className="kc-ai-chat__composer-footer">
          <span>Enter your task to prepare an action</span>
          <button
            type="submit"
            disabled={!prompt.trim()}
            aria-label="Submit prompt"
            title="Submit prompt"
          >
            ↑
          </button>
        </div>
      </form>
    </section>
  );
}