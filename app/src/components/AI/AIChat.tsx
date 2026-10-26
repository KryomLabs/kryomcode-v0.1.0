import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type {
  AIPlanStep,
  AIProposedFileChange,
  AIRequest,
  AIResponse,
  AITaskType,
} from "../../types/ai";
import AIActions, { type AIActionType } from "./AIActions";
import "./ai.css";

type AIChatProps = {
  projectPath?: string;
  activeFilePath?: string;
  onSendMessage?: (request: AIRequest) => Promise<AIResponse>;
  onAction?: (action: string) => void;
  onOpenProblems?: () => void;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  changes?: AIProposedFileChange[];
  plan?: AIPlanStep[];
};

const PROJECT_ACTIONS = [
  {
    icon: "⌕",
    title: "Analyze project",
    description: "Understand folders and architecture",
    prompt: "Analyze the current project structure and explain its main parts.",
    taskType: "analyze" as const,
  },
  {
    icon: "⌘",
    title: "Plan implementation",
    description: "Break work into clear steps",
    prompt: "Create a practical implementation plan for this project.",
    taskType: "plan" as const,
  },
  {
    icon: "✓",
    title: "Review code",
    description: "Find risks and improvement opportunities",
    prompt: "Review the project code and report the most important issues.",
    taskType: "analyze" as const,
  },
];

const ACTION_PROMPTS: Record<
  AIActionType,
  { prompt: string; taskType: AITaskType }
> = {
  explain: {
    prompt: "Explain the relevant code and how it works.",
    taskType: "explain",
  },
  fix: {
    prompt: "Find the most important code issue and suggest a safe fix.",
    taskType: "debug",
  },
  refactor: {
    prompt: "Suggest a focused refactor for the relevant code.",
    taskType: "refactor",
  },
  "generate-tests": {
    prompt: "Suggest useful tests for the relevant code.",
    taskType: "test",
  },
  review: {
    prompt: "Review the relevant code for bugs and risks.",
    taskType: "analyze",
  },
  document: {
    prompt: "Suggest clear documentation for the relevant code.",
    taskType: "generate",
  },
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong while contacting the AI service.";
}

function getResponseText(response: AIResponse): string {
  if (response.message?.trim()) {
    return response.message.trim();
  }

  if (response.changes?.length) {
    return "I prepared proposed file changes for review.";
  }

  if (response.plan?.length) {
    return "I prepared an implementation plan.";
  }

  return "The task completed without a text response.";
}

function formatChangeType(type: AIProposedFileChange["type"]): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatStepStatus(status: AIPlanStep["status"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function AIChat({
  projectPath,
  activeFilePath,
  onSendMessage,
  onAction,
  onOpenProblems,
}: AIChatProps) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const messageIdRef = useRef(0);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const createMessageId = () => {
    messageIdRef.current += 1;
    return `message-${Date.now()}-${messageIdRef.current}`;
  };

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isSubmitting, error]);

  async function sendPrompt(
    rawPrompt: string,
    taskType: AITaskType = "analyze",
  ) {
    const message = rawPrompt.trim();

    if (!message || isSubmitting) {
      return;
    }

    setPrompt("");
    setError("");

    setMessages((current) => [
      ...current,
      {
        id: createMessageId(),
        role: "user",
        content: message,
      },
    ]);

    if (!onSendMessage) {
      onAction?.(message);
      setError(
        "AI service is not connected yet. Your message was not sent to a model.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const request: AIRequest = {
        prompt: message,
        taskType,
        ...(projectPath ? { projectPath } : {}),
        ...(activeFilePath ? { activeFilePath } : {}),
      };

      const response = await onSendMessage(request);

      if (!response.success) {
        throw new Error(
          response.error || "The AI service could not complete this request.",
        );
      }

      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content: getResponseText(response),
          changes: response.changes,
          plan: response.plan,
        },
      ]);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendPrompt(prompt);
  }

  function handleComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void sendPrompt(prompt);
    }
  }

  function handleQuickAction(action: AIActionType) {
    const selectedAction = ACTION_PROMPTS[action];
    void sendPrompt(selectedAction.prompt, selectedAction.taskType);
  }

  function clearConversation() {
    if (isSubmitting) {
      return;
    }

    setMessages([]);
    setError("");
  }

  const hasProject = Boolean(projectPath);

  return (
    <section className="kc-ai-chat" aria-label="KryomCode AI assistant">
      <header className="kc-ai-chat__header">
        <div className="kc-ai-chat__brand">
          <span className="kc-ai-chat__logo" aria-hidden="true">
            ✧
          </span>

          <div>
            <h2>KryomCode Assistant</h2>
            <p>Project-aware AI workspace</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            className="kc-ai-chat__status"
            aria-live="polite"
            title={
              onSendMessage
                ? "An AI send handler is available."
                : "The AI service has not been connected yet."
            }
          >
            <span
              className="kc-ai-chat__status-dot"
              style={{
                background: onSendMessage ? "#70cf91" : "#e8b45d",
              }}
            />
            {onSendMessage ? "AI ready" : "AI offline"}
          </span>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearConversation}
              disabled={isSubmitting}
              aria-label="Start a new conversation"
              title="Start a new conversation"
              style={{
                border: "1px solid #303847",
                borderRadius: 6,
                padding: "6px 9px",
                color: "#cbd5e1",
                background: "#171c25",
                cursor: isSubmitting ? "not-allowed" : "pointer",
              }}
            >
              New chat
            </button>
          )}
        </div>
      </header>

      <div className="kc-ai-chat__body">
        {messages.length === 0 ? (
          <>
            <div className="kc-ai-chat__welcome">
              <span className="kc-ai-chat__welcome-icon" aria-hidden="true">
                ✦
              </span>

              <h3>Build something great.</h3>

              <p>
                Ask about your project, plan a change, or review code. AI
                suggestions will be shown here for you to review.
              </p>
            </div>

            <div className="kc-ai-chat__workspace">
              <span className="kc-ai-chat__eyebrow">CURRENT WORKSPACE</span>

              <p title={projectPath || "No project selected"}>
                <span aria-hidden="true">▣</span>{" "}
                {projectPath || "No project selected"}
              </p>

              {activeFilePath && (
                <small>Active file: {activeFilePath}</small>
              )}

              {!hasProject && (
                <small>
                  Open a project to enable project and code actions.
                </small>
              )}
            </div>

            <div className="kc-ai-chat__section-heading">
              <h3>Project actions</h3>
              <span>3 actions</span>
            </div>

            <div className="kc-ai-chat__actions">
              {PROJECT_ACTIONS.map((item) => (
                <button
                  className="kc-ai-chat__action"
                  type="button"
                  key={item.title}
                  disabled={!hasProject || isSubmitting}
                  onClick={() => void sendPrompt(item.prompt, item.taskType)}
                  title={
                    hasProject
                      ? item.description
                      : "Open a project to use this action."
                  }
                >
                  <span
                    className="kc-ai-chat__action-icon"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>

                  <span className="kc-ai-chat__action-copy">
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </span>

                  <span
                    className="kc-ai-chat__action-arrow"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                </button>
              ))}
            </div>

            <div className="kc-ai-chat__section-heading">
              <h3>Code actions</h3>
              <span>6 actions</span>
            </div>

            <AIActions
              onAction={handleQuickAction}
              disabled={!hasProject || isSubmitting}
            />

            <button
              className="kc-ai-chat__problems"
              type="button"
              onClick={onOpenProblems}
              disabled={!onOpenProblems}
            >
              <span aria-hidden="true">✓</span>
              Open Problems panel
              <span aria-hidden="true">→</span>
            </button>
          </>
        ) : (
          <div
            role="log"
            aria-label="Conversation"
            aria-live="polite"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {messages.map((message) => (
              <article
                key={message.id}
                aria-label={
                  message.role === "user"
                    ? "Your message"
                    : "Assistant response"
                }
                style={{
                  alignSelf:
                    message.role === "user" ? "flex-end" : "stretch",
                  maxWidth: message.role === "user" ? "88%" : "100%",
                  padding: "12px 13px",
                  border: "1px solid #2b3340",
                  borderRadius: 10,
                  color: "#e8edf5",
                  background:
                    message.role === "user" ? "#1b2d40" : "#151a23",
                  overflowWrap: "anywhere",
                }}
              >
                <strong
                  style={{
                    display: "block",
                    marginBottom: 7,
                    color: message.role === "user" ? "#9bdcff" : "#c7d4e5",
                    fontSize: 11,
                  }}
                >
                  {message.role === "user" ? "You" : "KryomCode Assistant"}
                </strong>

                <p
                  style={{
                    margin: 0,
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {message.content}
                </p>

                {message.plan && message.plan.length > 0 && (
                  <ol
                    style={{
                      display: "grid",
                      gap: 8,
                      margin: "12px 0 0",
                      paddingLeft: 20,
                    }}
                  >
                    {message.plan.map((step) => (
                      <li key={step.id}>
                        <strong>{step.title}</strong>

                        {step.description && (
                          <div
                            style={{
                              marginTop: 3,
                              color: "#aab5c5",
                              lineHeight: 1.5,
                            }}
                          >
                            {step.description}
                          </div>
                        )}

                        <small
                          style={{
                            display: "block",
                            marginTop: 3,
                            color: "#8994a6",
                          }}
                        >
                          {formatStepStatus(step.status)}
                        </small>
                      </li>
                    ))}
                  </ol>
                )}

                {message.changes && message.changes.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <strong style={{ fontSize: 12 }}>
                      Proposed changes
                    </strong>

                    {message.changes.map((change, index) => (
                      <div
                        key={`${change.path}-${index}`}
                        style={{
                          padding: 9,
                          border: "1px solid #303847",
                          borderRadius: 7,
                          background: "#10151d",
                        }}
                      >
                        <strong
                          style={{
                            display: "block",
                            color: "#9bdcff",
                            fontSize: 11,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {formatChangeType(change.type)}: {change.path}
                        </strong>

                        {change.content && (
                          <pre
                            style={{
                              maxHeight: 180,
                              overflow: "auto",
                              margin: "8px 0 0",
                              color: "#cbd5e1",
                              fontSize: 11,
                              lineHeight: 1.5,
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {change.content.slice(0, 1200)}
                            {change.content.length > 1200 ? "\n…" : ""}
                          </pre>
                        )}
                      </div>
                    ))}

                    <small style={{ color: "#8994a6", lineHeight: 1.5 }}>
                      These are proposals only. They are not applied to files
                      automatically.
                    </small>
                  </div>
                )}
              </article>
            ))}

            {isSubmitting && (
              <p
                role="status"
                style={{
                  margin: 0,
                  color: "#aab5c5",
                  fontSize: 12,
                }}
              >
                KryomCode is preparing a response…
              </p>
            )}

            <div ref={messageEndRef} />
          </div>
        )}

        {error && (
          <p
            className="kc-ai-chat__notice"
            role="alert"
            style={{ marginTop: 14 }}
          >
            {error}
          </p>
        )}

        {!onSendMessage && (
          <p
            className="kc-ai-chat__notice"
            role="status"
            style={{ marginTop: 14 }}
          >
            AI service abhi connected nahi hai. Prompt bhejne par model call
            nahi hogi; pehle backend service connect karni hogi.
          </p>
        )}
      </div>

      <form className="kc-ai-chat__composer" onSubmit={handleSubmit}>
        <label className="kc-ai-chat__sr-only" htmlFor="kc-ai-prompt">
          Ask the assistant
        </label>

        <textarea
          id="kc-ai-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={
            hasProject
              ? "Ask about this project…"
              : "Ask the assistant…"
          }
          rows={2}
          disabled={isSubmitting}
        />

        <div className="kc-ai-chat__composer-footer">
          <span>
            {isSubmitting
              ? "Waiting for the assistant…"
              : "Enter to send · Shift+Enter for a new line"}
          </span>

          <button
            type="submit"
            disabled={!prompt.trim() || isSubmitting}
            aria-label="Send message"
            title="Send message"
          >
            {isSubmitting ? "…" : "↑"}
          </button>
        </div>
      </form>
    </section>
  );
}