import "./ai.css";

export type AIActionType =
  | "explain"
  | "fix"
  | "refactor"
  | "generate-tests"
  | "review"
  | "document";

export type AIActionItem = {
  id: AIActionType;
  label: string;
  description: string;
  icon: string;
};

type AIActionsProps = {
  onAction: (action: AIActionType) => void;
  disabled?: boolean;
};

const AI_ACTIONS: AIActionItem[] = [
  {
    id: "explain",
    label: "Explain Code",
    description: "Understand the selected code",
    icon: "ⓘ",
  },
  {
    id: "fix",
    label: "Fix Code",
    description: "Find and fix potential issues",
    icon: "✦",
  },
  {
    id: "refactor",
    label: "Refactor",
    description: "Improve code structure",
    icon: "⟳",
  },
  {
    id: "generate-tests",
    label: "Generate Tests",
    description: "Create relevant test cases",
    icon: "✓",
  },
  {
    id: "review",
    label: "Review Code",
    description: "Check quality and risks",
    icon: "⌕",
  },
  {
    id: "document",
    label: "Add Documentation",
    description: "Generate useful code comments",
    icon: "≡",
  },
];

export default function AIActions({
  onAction,
  disabled = false,
}: AIActionsProps) {
  return (
    <section className="kc-ai-actions" aria-label="AI quick actions">
      <div className="kc-ai-actions-heading">
        <div>
          <h3>Quick Actions</h3>
          <p>Choose an action for your code</p>
        </div>
        <span className="kc-ai-actions-badge">Muse AI ready to integrate</span>
      </div>

      <div className="kc-ai-actions-grid">
        {AI_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="kc-ai-action-card"
            disabled={disabled}
            onClick={() => onAction(action.id)}
            aria-label={action.label}
          >
            <span className="kc-ai-action-icon" aria-hidden="true">
              {action.icon}
            </span>

            <span className="kc-ai-action-copy">
              <strong>{action.label}</strong>
              <small>{action.description}</small>
            </span>

            <span className="kc-ai-action-arrow" aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>

      <p className="kc-ai-actions-note">
        These are UI actions only. Real AI responses will work after the Meta
        Muse AI service is integrated.
      </p>
    </section>
  );
}