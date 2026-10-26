import json

import pytest

from kryomcode.ai.context import ContextDocument, collect_project_context
from kryomcode.ai.meta_provider import MetaProvider
from kryomcode.ai.providers import ChatMessage, GenerationRequest
from kryomcode.ai.selection import select_relevant_context
from kryomcode.ai.tool_calling import (
    ToolCall,
    ToolCallingResponse,
    ToolResult,
)

# ============================================================
# Project context collection tests
# ============================================================


def test_collects_text_files_in_deterministic_order(tmp_path):
    (tmp_path / "z.py").write_text("z = 1\n", encoding="utf-8")
    (tmp_path / "a.py").write_text("a = 1\n", encoding="utf-8")

    documents = collect_project_context(tmp_path)

    assert [document.path for document in documents] == ["a.py", "z.py"]
    assert documents[0].content == "a = 1\n"


def test_excludes_common_secrets_and_virtual_environments(tmp_path):
    (tmp_path / ".env").write_text("API_KEY=secret", encoding="utf-8")
    (tmp_path / "app.py").write_text("print('safe')", encoding="utf-8")

    virtual_env = tmp_path / ".venv" / "Lib"
    virtual_env.mkdir(parents=True)
    (virtual_env / "package.py").write_text(
        "ignored = True",
        encoding="utf-8",
    )

    documents = collect_project_context(tmp_path, include_hidden=True)

    assert [document.path for document in documents] == ["app.py"]


def test_ignores_unsupported_extensions(tmp_path):
    (tmp_path / "app.py").write_text("print('hello')", encoding="utf-8")
    (tmp_path / "image.png").write_bytes(b"\x89PNG\r\n")

    documents = collect_project_context(tmp_path)

    assert [document.path for document in documents] == ["app.py"]


def test_skips_files_over_per_file_limit(tmp_path):
    (tmp_path / "large.py").write_text("x" * 20, encoding="utf-8")
    (tmp_path / "small.py").write_text("ok", encoding="utf-8")

    documents = collect_project_context(tmp_path, max_file_bytes=10)

    assert [document.path for document in documents] == ["small.py"]


def test_context_collection_respects_total_byte_limit(tmp_path):
    (tmp_path / "a.py").write_text("12345", encoding="utf-8")
    (tmp_path / "b.py").write_text("67890", encoding="utf-8")

    documents = collect_project_context(tmp_path, max_total_bytes=5)

    assert len(documents) == 1
    assert documents[0].path == "a.py"


def test_context_collection_respects_file_count_limit(tmp_path):
    for name in ("a.py", "b.py", "c.py"):
        (tmp_path / name).write_text("pass\n", encoding="utf-8")

    documents = collect_project_context(tmp_path, max_files=2)

    assert [document.path for document in documents] == ["a.py", "b.py"]


def test_skips_binary_content(tmp_path):
    (tmp_path / "binary.py").write_bytes(b"print('x')\x00")
    (tmp_path / "valid.py").write_text("print('ok')", encoding="utf-8")

    documents = collect_project_context(tmp_path)

    assert [document.path for document in documents] == ["valid.py"]


@pytest.mark.parametrize(
    "limits",
    [
        {"max_files": 0},
        {"max_file_bytes": 0},
        {"max_total_bytes": 0},
    ],
)
def test_context_collection_rejects_non_positive_limits(tmp_path, limits):
    with pytest.raises(ValueError):
        collect_project_context(tmp_path, **limits)


# ============================================================
# Shared test helper for context selection
# ============================================================


def make_document(path, content, size_bytes=None):
    if size_bytes is None:
        size_bytes = len(content.encode("utf-8"))

    return ContextDocument(
        path=path,
        content=content,
        size_bytes=size_bytes,
    )


# ============================================================
# Task-aware context selection tests
# ============================================================


def test_ranks_relevant_files_first():
    auth = make_document(
        "src/auth.py",
        "Validate authentication tokens and permissions.",
    )
    billing = make_document(
        "src/billing.py",
        "Calculate invoices and payment totals.",
    )

    result = select_relevant_context(
        [billing, auth],
        "fix authentication token validation",
    )

    assert [doc.path for doc in result] == ["src/auth.py"]


def test_file_path_matches_help_determine_relevance():
    auth = make_document("src/auth.py", "def check(): pass")
    unrelated = make_document(
        "src/misc.py",
        "Authentication tokens require careful validation.",
    )

    result = select_relevant_context(
        [unrelated, auth],
        "change auth implementation",
    )

    assert result
    assert result[0].path == "src/auth.py"


def test_selection_results_are_deterministic_for_equal_scores():
    first = make_document("src/a_auth.py", "validate token")
    second = make_document("src/b_auth.py", "validate token")

    result = select_relevant_context(
        [second, first],
        "auth token validation",
    )

    assert [doc.path for doc in result] == [
        "src/a_auth.py",
        "src/b_auth.py",
    ]


def test_selection_excludes_documents_without_task_matches():
    document = make_document("src/billing.py", "calculate invoice totals")

    result = select_relevant_context(
        [document],
        "authentication tokens",
    )

    assert result == []


def test_selection_respects_file_count_limit():
    documents = [
        make_document("src/auth.py", "auth token validation"),
        make_document("src/token.py", "token validation"),
        make_document("src/security.py", "auth security checks"),
    ]

    result = select_relevant_context(
        documents,
        "auth token validation",
        max_files=2,
    )

    assert len(result) == 2


def test_selection_respects_total_byte_limit():
    first = make_document("src/auth.py", "auth token", size_bytes=6)
    second = make_document("src/token.py", "auth token", size_bytes=6)

    result = select_relevant_context(
        [first, second],
        "auth token",
        max_total_bytes=6,
    )

    assert len(result) == 1
    assert result[0].size_bytes == 6


def test_selection_rejects_empty_task():
    with pytest.raises(ValueError, match="task"):
        select_relevant_context([], "   ")


@pytest.mark.parametrize(
    "limits",
    [
        {"max_files": 0},
        {"max_total_bytes": 0},
    ],
)
def test_selection_rejects_non_positive_limits(limits):
    with pytest.raises(ValueError):
        select_relevant_context([], "authentication", **limits)


def test_selection_returns_empty_for_task_without_useful_tokens():
    document = make_document("src/app.py", "application startup")

    result = select_relevant_context([document], "a to in")

    assert result == []


# ============================================================
# AI engine context preparation tests
# ============================================================


def test_engine_prepares_context_for_task(tmp_path):
    from kryomcode.ai.engine import prepare_context

    (tmp_path / "auth.py").write_text(
        "def validate_token(token):\n    return bool(token)\n",
        encoding="utf-8",
    )
    (tmp_path / "billing.py").write_text(
        "def calculate_invoice():\n    return 100\n",
        encoding="utf-8",
    )

    package = prepare_context(
        tmp_path,
        "fix authentication token validation",
    )

    assert package.task == "fix authentication token validation"
    assert [doc.path for doc in package.documents] == ["auth.py"]
    assert package.total_bytes > 0


def test_engine_returns_immutable_document_collection(tmp_path):
    from kryomcode.ai.engine import ContextPackage, prepare_context

    (tmp_path / "auth.py").write_text(
        "authentication token validation",
        encoding="utf-8",
    )

    package = prepare_context(tmp_path, "authentication token")

    assert isinstance(package, ContextPackage)
    assert isinstance(package.documents, tuple)


def test_engine_formats_selected_files(tmp_path):
    from kryomcode.ai.engine import prepare_context

    (tmp_path / "auth.py").write_text(
        "def validate_token():\n    pass\n",
        encoding="utf-8",
    )

    package = prepare_context(tmp_path, "validate token")
    formatted = package.format_context()

    assert "--- BEGIN FILE: auth.py ---" in formatted
    assert "def validate_token():" in formatted
    assert "--- END FILE: auth.py ---" in formatted


def test_engine_returns_empty_package_when_no_files_match(tmp_path):
    from kryomcode.ai.engine import prepare_context

    (tmp_path / "billing.py").write_text(
        "calculate invoice totals",
        encoding="utf-8",
    )

    package = prepare_context(tmp_path, "authentication tokens")

    assert package.documents == ()
    assert package.total_bytes == 0
    assert package.format_context() == ""


def test_engine_rejects_empty_task_before_collecting(tmp_path):
    from kryomcode.ai.engine import prepare_context

    with pytest.raises(ValueError, match="task"):
        prepare_context(tmp_path, "   ")


def test_engine_respects_context_limits(tmp_path):
    from kryomcode.ai.engine import prepare_context

    (tmp_path / "auth.py").write_text(
        "auth token validation",
        encoding="utf-8",
    )
    (tmp_path / "token.py").write_text(
        "auth token handling",
        encoding="utf-8",
    )

    package = prepare_context(
        tmp_path,
        "auth token",
        max_context_files=1,
    )

    assert len(package.documents) <= 1
    assert package.total_bytes <= 200_000


# ============================================================
# Provider-independent AI interface tests
# ============================================================


def test_chat_message_accepts_supported_roles():
    from kryomcode.ai.providers import ChatMessage

    message = ChatMessage(role="user", content="Explain this function")

    assert message.role == "user"
    assert message.content == "Explain this function"


@pytest.mark.parametrize("role", ["system", "user", "assistant"])
def test_chat_message_accepts_each_supported_role(role):
    from kryomcode.ai.providers import ChatMessage

    assert ChatMessage(role=role, content="Hello").role == role


def test_chat_message_rejects_unsupported_role():
    from kryomcode.ai.providers import ChatMessage

    with pytest.raises(ValueError, match="role"):
        ChatMessage(role="tool", content="Result")


def test_chat_message_rejects_empty_content():
    from kryomcode.ai.providers import ChatMessage

    with pytest.raises(ValueError, match="content"):
        ChatMessage(role="user", content="  ")


def test_generation_request_normalizes_messages_to_tuple():
    from kryomcode.ai.providers import ChatMessage, GenerationRequest

    message = ChatMessage(role="user", content="Write a test")
    request = GenerationRequest(model="example-model", messages=[message])

    assert request.messages == (message,)
    assert isinstance(request.messages, tuple)


def test_generation_request_rejects_empty_messages():
    from kryomcode.ai.providers import GenerationRequest

    with pytest.raises(ValueError, match="at least one"):
        GenerationRequest(model="example-model", messages=())


@pytest.mark.parametrize(
    "temperature",
    [-0.1, 2.1, float("nan"), float("inf")],
)
def test_generation_request_rejects_invalid_temperature(temperature):
    from kryomcode.ai.providers import ChatMessage, GenerationRequest

    with pytest.raises(ValueError, match="temperature"):
        GenerationRequest(
            model="example-model",
            messages=(ChatMessage(role="user", content="Hello"),),
            temperature=temperature,
        )


def test_generation_request_rejects_invalid_token_limit():
    from kryomcode.ai.providers import ChatMessage, GenerationRequest

    message = ChatMessage(role="user", content="Hello")

    with pytest.raises(ValueError, match="max_output_tokens"):
        GenerationRequest(
            model="example-model",
            messages=(message,),
            max_output_tokens=0,
        )


def test_generation_response_preserves_usage_metadata():
    from kryomcode.ai.providers import GenerationResponse

    response = GenerationResponse(
        content="Generated result",
        provider="example",
        model="example-model",
        input_tokens=12,
        output_tokens=8,
    )

    assert response.content == "Generated result"
    assert response.provider == "example"
    assert response.input_tokens == 12
    assert response.output_tokens == 8


def test_generation_response_allows_unknown_token_usage():
    from kryomcode.ai.providers import GenerationResponse

    response = GenerationResponse(
        content="Generated result",
        provider="example",
        model="example-model",
    )

    assert response.input_tokens is None
    assert response.output_tokens is None


def test_generation_response_rejects_negative_token_usage():
    from kryomcode.ai.providers import GenerationResponse

    with pytest.raises(ValueError, match="input_tokens"):
        GenerationResponse(
            content="Result",
            provider="example",
            model="example-model",
            input_tokens=-1,
        )


def test_fake_provider_implements_provider_contract():
    from kryomcode.ai.providers import (
        ChatMessage,
        GenerationRequest,
        GenerationResponse,
    )

    class FakeProvider:
        name = "fake"

        def generate(self, request):
            return GenerationResponse(
                content=f"Processed: {request.messages[-1].content}",
                provider=self.name,
                model=request.model,
            )

    provider = FakeProvider()
    request = GenerationRequest(
        model="test-model",
        messages=(ChatMessage(role="user", content="Hello KryomCode"),),
    )

    response = provider.generate(request)

    assert response.provider == "fake"
    assert response.model == "test-model"
    assert response.content == "Processed: Hello KryomCode"


# ============================================================
# Meta provider adapter tests
# ============================================================


class FakeMetaHTTPResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def install_fake_meta_response(
    monkeypatch,
    response_payload,
    captured=None,
):
    monkeypatch.setenv("MODEL_API_KEY", "test-meta-key")

    def fake_urlopen(request, timeout):
        if captured is not None:
            captured["url"] = request.full_url
            captured["authorization"] = request.get_header(
                "Authorization"
            )
            captured["timeout"] = timeout
            captured["payload"] = json.loads(
                request.data.decode("utf-8")
            )

        return FakeMetaHTTPResponse(response_payload)

    monkeypatch.setattr(
        "kryomcode.ai.meta_provider.urlopen",
        fake_urlopen,
    )


def test_meta_provider_maps_request_and_response(monkeypatch):
    captured = {}

    install_fake_meta_response(
        monkeypatch,
        {
            "model": "muse-spark-1.3",
            "output": [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": "Generated Python code",
                        }
                    ],
                }
            ],
            "usage": {
                "input_tokens": 15,
                "output_tokens": 9,
            },
        },
        captured,
    )

    request = GenerationRequest(
        model="muse-spark-1.3",
        messages=(
            ChatMessage(
                role="system",
                content="You are a coding assistant.",
            ),
            ChatMessage(
                role="user",
                content="Write a Python function.",
            ),
        ),
        temperature=0.3,
        max_output_tokens=512,
    )

    result = MetaProvider().generate(request)

    assert result.provider == "meta"
    assert result.model == "muse-spark-1.3"
    assert result.content == "Generated Python code"
    assert result.input_tokens == 15
    assert result.output_tokens == 9

    assert captured["url"] == "https://api.meta.ai/v1/responses"
    assert captured["authorization"] == "Bearer test-meta-key"

    payload = captured["payload"]
    assert payload["model"] == "muse-spark-1.3"
    assert payload["instructions"] == "You are a coding assistant."
    assert payload["temperature"] == 0.3
    assert payload["max_output_tokens"] == 512
    assert payload["store"] is False
    assert payload["input"][0]["role"] == "user"
    assert payload["input"][0]["content"][0]["text"] == (
        "Write a Python function."
    )


def test_meta_provider_handles_missing_usage(monkeypatch):
    install_fake_meta_response(
        monkeypatch,
        {
            "model": "muse-spark-1.3",
            "output_text": "Hello",
        },
    )

    request = GenerationRequest(
        model="muse-spark-1.3",
        messages=(
            ChatMessage(role="user", content="Hello"),
        ),
    )

    result = MetaProvider().generate(request)

    assert result.content == "Hello"
    assert result.input_tokens is None
    assert result.output_tokens is None


def test_meta_provider_requires_api_key(monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY", raising=False)

    request = GenerationRequest(
        model="muse-spark-1.3",
        messages=(
            ChatMessage(role="user", content="Hello"),
        ),
    )

    with pytest.raises(ValueError, match="MODEL_API_KEY"):
        MetaProvider().generate(request)


def test_meta_provider_rejects_response_without_text(monkeypatch):
    install_fake_meta_response(
        monkeypatch,
        {
            "model": "muse-spark-1.3",
            "output": [],
        },
    )

    request = GenerationRequest(
        model="muse-spark-1.3",
        messages=(
            ChatMessage(role="user", content="Hello"),
        ),
    )

    with pytest.raises(RuntimeError, match="readable text"):
        MetaProvider().generate(request)


def test_meta_provider_rejects_system_only_request(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-meta-key")

    request = GenerationRequest(
        model="muse-spark-1.3",
        messages=(
            ChatMessage(role="system", content="System instruction"),
        ),
    )

    with pytest.raises(ValueError, match="user or assistant"):
        MetaProvider().generate(request)


# ============================================================
# AI provider registry tests
# ============================================================


def test_registry_registers_and_retrieves_providers():
    from kryomcode.ai.registry import AIProviderRegistry

    registry = AIProviderRegistry()
    provider = FakeProviderForRegistryTests("example")

    registry.register(provider)

    assert registry.get("example") is provider
    assert registry.provider_names == ("example",)


def test_registry_rejects_duplicate_provider_names():
    from kryomcode.ai.registry import (
        AIProviderRegistry,
        DuplicateProviderError,
    )

    registry = AIProviderRegistry()
    first = FakeProviderForRegistryTests("mock")
    second = FakeProviderForRegistryTests("mock")

    registry.register(first)

    with pytest.raises(DuplicateProviderError, match="already registered"):
        registry.register(second)


def test_registry_can_replace_a_provider():
    from kryomcode.ai.registry import AIProviderRegistry

    registry = AIProviderRegistry()
    first = FakeProviderForRegistryTests("mock")
    second = FakeProviderForRegistryTests("mock")

    registry.register(first)
    registry.register(second, replace=True)

    assert registry.get("mock") is second


def test_registry_reports_unknown_provider():
    from kryomcode.ai.registry import (
        AIProviderRegistry,
        ProviderNotFoundError,
    )

    registry = AIProviderRegistry()
    registry.register(FakeProviderForRegistryTests("example"))

    with pytest.raises(ProviderNotFoundError, match="unavailable"):
        registry.get("unavailable")


def test_registry_generates_using_selected_provider():
    from kryomcode.ai.providers import ChatMessage, GenerationRequest
    from kryomcode.ai.registry import AIProviderRegistry

    registry = AIProviderRegistry()
    provider = FakeProviderForRegistryTests("mock")
    registry.register(provider)

    request = GenerationRequest(
        model="test-model",
        messages=(ChatMessage(role="user", content="Hello"),),
    )

    response = registry.generate("mock", request)

    assert response.provider == "mock"
    assert response.content == "Mock response"
    assert provider.last_request is request


def test_registry_returns_sorted_provider_names():
    from kryomcode.ai.registry import AIProviderRegistry

    registry = AIProviderRegistry()
    registry.register(FakeProviderForRegistryTests("example"))
    registry.register(FakeProviderForRegistryTests("alpha"))

    assert registry.provider_names == ("alpha", "example")


class FakeProviderForRegistryTests:
    """Minimal provider used only by registry unit tests."""

    def __init__(self, name):
        self.name = name
        self.last_request = None

    def generate(self, request):
        from kryomcode.ai.providers import GenerationResponse

        self.last_request = request
        return GenerationResponse(
            content="Mock response",
            provider=self.name,
            model=request.model,
        )


class FakeClientForRegistryTests:
    """Placeholder client for a provider registration test."""


# ============================================================
# AI orchestration tests
# ============================================================


def test_orchestrator_sends_task_to_selected_provider(tmp_path):
    from kryomcode.ai.orchestrator import AIOrchestrator
    from kryomcode.ai.registry import AIProviderRegistry

    registry = AIProviderRegistry()
    provider = FakeProviderForRegistryTests("mock")
    registry.register(provider)

    orchestrator = AIOrchestrator(registry)

    result = orchestrator.run(
        project_root=tmp_path,
        task="Explain this project",
        provider_name="mock",
        model="test-model",
    )

    assert result.content == "Mock response"
    assert result.provider == "mock"
    assert provider.last_request.model == "test-model"

    messages = provider.last_request.messages
    assert messages[0].role == "system"
    assert messages[1].role == "user"
    assert "Explain this project" in messages[1].content


def test_orchestrator_includes_relevant_project_context(tmp_path):
    from kryomcode.ai.orchestrator import AIOrchestrator
    from kryomcode.ai.registry import AIProviderRegistry

    (tmp_path / "calculator.py").write_text(
        "def add_numbers(a, b):\n"
        "    return a + b\n",
        encoding="utf-8",
    )

    registry = AIProviderRegistry()
    provider = FakeProviderForRegistryTests("mock")
    registry.register(provider)

    orchestrator = AIOrchestrator(registry)

    orchestrator.run(
        project_root=tmp_path,
        task="Explain the add_numbers function in calculator.py",
        provider_name="mock",
        model="test-model",
    )

    user_message = provider.last_request.messages[1].content

    assert "calculator.py" in user_message
    assert "def add_numbers(a, b):" in user_message


def test_orchestrator_handles_project_without_relevant_files(tmp_path):
    from kryomcode.ai.orchestrator import AIOrchestrator
    from kryomcode.ai.registry import AIProviderRegistry

    registry = AIProviderRegistry()
    provider = FakeProviderForRegistryTests("mock")
    registry.register(provider)

    orchestrator = AIOrchestrator(registry)

    result = orchestrator.run(
        project_root=tmp_path,
        task="Explain an unknown system",
        provider_name="mock",
        model="test-model",
    )

    assert result.content == "Mock response"
    assert "No relevant project files were selected" in (
        provider.last_request.messages[1].content
    )


def test_orchestrator_rejects_empty_task(tmp_path):
    from kryomcode.ai.orchestrator import AIOrchestrator
    from kryomcode.ai.registry import AIProviderRegistry

    orchestrator = AIOrchestrator(AIProviderRegistry())

    with pytest.raises(ValueError, match="task"):
        orchestrator.run(
            project_root=tmp_path,
            task=" ",
            provider_name="mock",
            model="test-model",
        )


def test_orchestrator_rejects_empty_model(tmp_path):
    from kryomcode.ai.orchestrator import AIOrchestrator
    from kryomcode.ai.registry import AIProviderRegistry

    orchestrator = AIOrchestrator(AIProviderRegistry())

    with pytest.raises(ValueError, match="model"):
        orchestrator.run(
            project_root=tmp_path,
            task="Explain the code",
            provider_name="mock",
            model=" ",
        )


# ============================================================
# Controlled AI tool registry tests
# ============================================================


def test_project_tools_list_safe_project_entries(tmp_path):
    from kryomcode.ai.tools import create_project_tool_registry

    (tmp_path / "app.py").write_text("print('safe')\n", encoding="utf-8")
    (tmp_path / ".env").write_text("API_KEY=secret\n", encoding="utf-8")
    (tmp_path / "node_modules").mkdir()

    registry = create_project_tool_registry(tmp_path)

    result = registry.execute("list_project_files", {})
    paths = [entry["path"] for entry in result["entries"]]

    assert "app.py" in paths
    assert ".env" not in paths
    assert "node_modules" not in paths


def test_project_tools_read_text_file(tmp_path):
    from kryomcode.ai.tools import create_project_tool_registry

    source = tmp_path / "app.py"
    source.write_text("def greet():\n    return 'hello'\n", encoding="utf-8")

    registry = create_project_tool_registry(tmp_path)

    result = registry.execute(
        "read_project_file",
        {"path": "app.py"},
    )

    assert result["path"] == "app.py"
    assert "def greet():" in result["content"]
    assert result["bytes"] > 0


def test_project_tools_reject_parent_directory_traversal(tmp_path):
    from kryomcode.ai.tools import create_project_tool_registry

    outside = tmp_path.parent / "outside.py"
    outside.write_text("private = True\n", encoding="utf-8")

    registry = create_project_tool_registry(tmp_path)

    with pytest.raises(ValueError, match="traversal"):
        registry.execute(
            "read_project_file",
            {"path": "../outside.py"},
        )


def test_project_tools_reject_sensitive_files(tmp_path):
    from kryomcode.ai.tools import create_project_tool_registry

    (tmp_path / ".env").write_text("API_KEY=secret\n", encoding="utf-8")
    registry = create_project_tool_registry(tmp_path)

    with pytest.raises(ValueError, match="sensitive"):
        registry.execute(
            "read_project_file",
            {"path": ".env"},
        )


def test_tool_registry_rejects_unknown_tool():
    from kryomcode.ai.tools import (
        ToolRegistry,
        UnknownToolError,
    )

    registry = ToolRegistry()

    with pytest.raises(UnknownToolError, match="Unknown tool"):
        registry.execute("run_terminal_command", {})


def test_tool_registry_rejects_unexpected_arguments(tmp_path):
    from kryomcode.ai.tools import (
        InvalidToolArguments,
        create_project_tool_registry,
    )

    registry = create_project_tool_registry(tmp_path)

    with pytest.raises(InvalidToolArguments, match="Unexpected arguments"):
        registry.execute(
            "list_project_files",
            {"path": ".", "execute_command": "whoami"},
        )


def test_tool_registry_validates_argument_types(tmp_path):
    from kryomcode.ai.tools import (
        InvalidToolArguments,
        create_project_tool_registry,
    )

    registry = create_project_tool_registry(tmp_path)

    with pytest.raises(InvalidToolArguments, match="integer"):
        registry.execute(
            "list_project_files",
            {"max_entries": "many"},
        )


def test_tool_registry_enforces_read_size_limit(tmp_path):
    from kryomcode.ai.tools import (
        InvalidToolArguments,
        create_project_tool_registry,
    )

    (tmp_path / "app.py").write_text("print('hello')\n", encoding="utf-8")
    registry = create_project_tool_registry(tmp_path)

    with pytest.raises(InvalidToolArguments, match="maximum"):
        registry.execute(
            "read_project_file",
            {"path": "app.py", "max_bytes": 100_001},
        )


def test_tool_definitions_do_not_expose_handlers(tmp_path):
    from kryomcode.ai.tools import create_project_tool_registry

    registry = create_project_tool_registry(tmp_path)

    definitions = registry.definitions()

    assert [item["name"] for item in definitions] == [
        "list_project_files",
        "read_project_file",
    ]
    assert all("handler" not in item for item in definitions)


# ============================================================
# Provider-independent tool-calling model tests
# ============================================================


def test_tool_call_accepts_valid_arguments():
    call = ToolCall(
        call_id="call_1",
        name="read_project_file",
        arguments={"path": "src/main.py", "max_bytes": 1000},
    )

    assert call.call_id == "call_1"
    assert call.name == "read_project_file"
    assert call.arguments["path"] == "src/main.py"


def test_tool_call_rejects_invalid_arguments():
    with pytest.raises(ValueError, match="arguments"):
        ToolCall(
            call_id="call_1",
            name="read_project_file",
            arguments={"value": object()},
        )


def test_tool_call_rejects_empty_call_id():
    with pytest.raises(ValueError, match="call_id"):
        ToolCall(
            call_id=" ",
            name="read_project_file",
            arguments={},
        )


def test_tool_result_preserves_error_status():
    result = ToolResult(
        call_id="call_1",
        name="read_project_file",
        content="Access denied",
        is_error=True,
    )

    assert result.content == "Access denied"
    assert result.is_error is True


def test_tool_calling_response_accepts_multiple_calls():
    first = ToolCall("call_1", "list_project_files", {"path": "."})
    second = ToolCall("call_2", "read_project_file", {"path": "main.py"})

    response = ToolCallingResponse(
        content="I will inspect the project.",
        tool_calls=[first, second],
        provider="meta",
        model="test-model",
        finish_reason="tool_calls",
    )

    assert len(response.tool_calls) == 2
    assert response.finish_reason == "tool_calls"


def test_tool_calling_response_rejects_duplicate_call_ids():
    first = ToolCall("duplicate", "first_tool", {})
    second = ToolCall("duplicate", "second_tool", {})

    with pytest.raises(ValueError, match="unique"):
        ToolCallingResponse(
            content="",
            tool_calls=(first, second),
        )


def test_tool_calling_response_rejects_invalid_tool_call():
    with pytest.raises(TypeError, match="ToolCall"):
        ToolCallingResponse(
            content="",
            tool_calls=("not-a-tool-call",),
        )