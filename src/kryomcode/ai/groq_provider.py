"""Groq API adapter for KryomCode.

Uses Groq's OpenAI-compatible Chat Completions API.
The class name GroqProvider is retained for compatibility with
existing imports; the actual provider name is "groq".
"""

import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from kryomcode.ai.providers import (
    GenerationRequest,
    GenerationResponse,
)
from kryomcode.ai.tool_calling import (
    ToolCall,
    ToolCallingResponse,
    ToolResult,
)
from kryomcode.ai.tools import ToolRegistry

DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_MODEL = "llama-3.3-70b-versatile"


class MetaProvider:
    """Groq-backed implementation of KryomCode's provider interface."""

    name = "groq"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 60.0,
    ) -> None:
        if (
            isinstance(timeout, bool)
            or not isinstance(timeout, (int, float))
            or timeout <= 0
        ):
            raise ValueError("timeout must be a positive number")

        if not isinstance(base_url, str) or not base_url.strip():
            raise ValueError("base_url must be a non-empty string")

        normalized_base_url = base_url.strip().rstrip("/")

        if not normalized_base_url.startswith(("https://", "http://")):
            raise ValueError("base_url must use HTTP or HTTPS")

        self._api_key = api_key
        self._base_url = normalized_base_url
        self._timeout = float(timeout)

    def generate(self, request: GenerationRequest) -> GenerationResponse:
        """Generate a text response using Groq Chat Completions."""
        if not isinstance(request, GenerationRequest):
            raise TypeError("request must be a GenerationRequest")

        messages = self._build_messages(request)
        payload = self._build_payload(request, messages=messages)
        response_data = self._post_chat_completion(payload)

        content = self._extract_response_text(response_data)

        if not content:
            raise RuntimeError(
                "Groq API returned no readable text."
            )

        usage = response_data.get("usage")
        if not isinstance(usage, dict):
            usage = {}

        response_model = response_data.get("model")
        if not isinstance(response_model, str) or not response_model.strip():
            response_model = request.model or DEFAULT_MODEL

        return GenerationResponse(
            content=content,
            provider=self.name,
            model=response_model,
            input_tokens=self._read_token_count(
                usage.get("prompt_tokens")
            ),
            output_tokens=self._read_token_count(
                usage.get("completion_tokens")
            ),
        )

    def generate_with_tools(
        self,
        request: GenerationRequest,
        tool_registry: ToolRegistry,
        *,
        max_tool_iterations: int = 5,
    ) -> ToolCallingResponse:
        """Generate a response and execute registered tool calls."""
        if not isinstance(request, GenerationRequest):
            raise TypeError("request must be a GenerationRequest")

        if not isinstance(tool_registry, ToolRegistry):
            raise TypeError("tool_registry must be a ToolRegistry")

        if (
            isinstance(max_tool_iterations, bool)
            or not isinstance(max_tool_iterations, int)
            or not 1 <= max_tool_iterations <= 10
        ):
            raise ValueError(
                "max_tool_iterations must be between 1 and 10"
            )

        messages = self._build_messages(request)
        tools = self._build_tools(tool_registry)
        executed_calls: list[ToolCall] = []

        for iteration in range(max_tool_iterations + 1):
            payload = self._build_payload(
                request,
                messages=messages,
                tools=tools,
            )
            response_data = self._post_chat_completion(payload)
            assistant_message = self._get_assistant_message(
                response_data
            )

            raw_tool_calls = assistant_message.get("tool_calls")
            tool_calls = (
                raw_tool_calls
                if isinstance(raw_tool_calls, list)
                else []
            )

            if not tool_calls:
                content = self._extract_response_text(response_data)

                if not content:
                    raise RuntimeError(
                        "Groq API returned no readable text."
                    )

                response_model = response_data.get("model")
                if (
                    not isinstance(response_model, str)
                    or not response_model.strip()
                ):
                    response_model = request.model or DEFAULT_MODEL

                return ToolCallingResponse(
                    content=content,
                    tool_calls=tuple(executed_calls),
                    provider=self.name,
                    model=response_model,
                    finish_reason="stop",
                )

            if iteration >= max_tool_iterations:
                raise RuntimeError(
                    "Maximum tool-call iterations reached."
                )

            # Preserve the assistant tool-call message in the conversation.
            messages.append({
                "role": "assistant",
                "content": assistant_message.get("content"),
                "tool_calls": tool_calls,
            })

            for raw_call in tool_calls:
                function = raw_call.get("function", {})
                call_id = raw_call.get("id")
                name = function.get("name")
                raw_arguments = function.get("arguments")

                if (
                    not isinstance(call_id, str)
                    or not call_id.strip()
                    or len(call_id) > 64
                    or not isinstance(name, str)
                    or not name.strip()
                ):
                    raise RuntimeError(
                        "Groq returned a tool call without a valid ID or name."
                    )

                try:
                    if not isinstance(raw_arguments, str):
                        raise ValueError(
                            "Tool arguments must be a JSON string."
                        )

                    arguments = json.loads(raw_arguments)

                    if not isinstance(arguments, dict):
                        raise ValueError(
                            "Tool arguments must decode to a JSON object."
                        )

                    call = ToolCall(
                        call_id=call_id,
                        name=name,
                        arguments=arguments,
                    )
                    executed_calls.append(call)

                    # Only registered tools can be executed.
                    value = tool_registry.execute(name, arguments)

                    result = ToolResult(
                        call_id=call_id,
                        name=name,
                        content=json.dumps(
                            value,
                            ensure_ascii=False,
                            default=str,
                        ),
                    )
                except Exception as exc:
                    result = ToolResult(
                        call_id=call_id,
                        name=name,
                        content=json.dumps(
                            {
                                "error": type(exc).__name__,
                                "message": str(exc),
                            },
                            ensure_ascii=False,
                        ),
                        is_error=True,
                    )

                messages.append({
                    "role": "tool",
                    "tool_call_id": result.call_id,
                    "content": result.content,
                })

        raise RuntimeError("Tool-calling loop exited unexpectedly.")

    def _build_messages(
        self,
        request: GenerationRequest,
    ) -> list[dict[str, Any]]:
        """Convert shared messages to Chat Completions messages."""
        messages: list[dict[str, Any]] = []

        for message in request.messages:
            if message.role not in {
                "system",
                "user",
                "assistant",
            }:
                raise ValueError(
                    f"Unsupported message role: {message.role}"
                )

            messages.append({
                "role": message.role,
                "content": message.content,
            })

        if not any(message["role"] == "user" for message in messages):
            raise ValueError(
                "Groq requests must contain at least one user message."
            )

        return messages

    def _build_payload(
        self,
        request: GenerationRequest,
        *,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": request.model or DEFAULT_MODEL,
            "messages": messages,
            "temperature": request.temperature,
            "max_tokens": request.max_output_tokens,
        }

        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        return payload

    @staticmethod
    def _build_tools(
        tool_registry: ToolRegistry,
    ) -> list[dict[str, Any]]:
        """Convert registry definitions to Chat Completions tool schemas."""
        tools = []

        for definition in tool_registry.definitions():
            if not isinstance(definition, dict):
                raise ValueError(
                    "Tool definitions must be dictionaries."
                )

            # Support either a raw function schema or an already-wrapped tool.
            if definition.get("type") == "function":
                function = definition.get("function")
                if not isinstance(function, dict):
                    raise ValueError(
                        "Invalid wrapped function definition."
                    )
            else:
                function = definition

            if (
                not isinstance(function.get("name"), str)
                or not isinstance(function.get("parameters"), dict)
            ):
                raise ValueError(
                    "Each tool requires a name and parameters schema."
                )

            tools.append({
                "type": "function",
                "function": function,
            })

        return tools

    def _post_chat_completion(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Send an authenticated Chat Completions request."""
        api_key = self._api_key

        if api_key is None:
            api_key = os.environ.get("MODEL_API_KEY")

        if not isinstance(api_key, str) or not api_key.strip():
            raise ValueError(
                "Groq API key is required. "
                "Set MODEL_API_KEY before sending an AI request."
            )

        encoded_payload = json.dumps(payload).encode("utf-8")

        http_request = Request(
            url=f"{self._base_url}/chat/completions",
            data=encoded_payload,
            headers={
                "Authorization": f"Bearer {api_key.strip()}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        try:
            with urlopen(
                http_request,
                timeout=self._timeout,
            ) as http_response:
                response_body = http_response.read()
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            detail = self._extract_error_message(error_body)

            raise RuntimeError(
                f"Groq API returned HTTP {exc.code}: {detail}"
            ) from exc
        except URLError as exc:
            raise RuntimeError(
                f"Could not connect to Groq API: {exc.reason}"
            ) from exc
        except TimeoutError as exc:
            raise RuntimeError(
                "The Groq API request timed out."
            ) from exc

        try:
            response_data = json.loads(response_body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise RuntimeError(
                "Groq API returned invalid JSON."
            ) from exc

        if not isinstance(response_data, dict):
            raise RuntimeError(
                "Groq API returned an unexpected response."
            )

        return response_data

    @staticmethod
    def _get_assistant_message(
        response_data: dict[str, Any],
    ) -> dict[str, Any]:
        choices = response_data.get("choices")

        if not isinstance(choices, list) or not choices:
            raise RuntimeError(
                "Groq API response did not contain any choices."
            )

        message = choices[0].get("message")

        if not isinstance(message, dict):
            raise RuntimeError(
                "Groq API response did not contain an assistant message."
            )

        return message

    @classmethod
    def _extract_response_text(
        cls,
        response_data: dict[str, Any],
    ) -> str:
        message = cls._get_assistant_message(response_data)
        content = message.get("content")

        if isinstance(content, str):
            return content.strip()

        # Some compatible APIs may return text content as a list.
        if isinstance(content, list):
            parts = [
                item["text"]
                for item in content
                if isinstance(item, dict)
                and isinstance(item.get("text"), str)
            ]
            return "\n".join(parts).strip()

        return ""

    @staticmethod
    def _extract_error_message(error_body: str) -> str:
        try:
            error_data = json.loads(error_body)
        except json.JSONDecodeError:
            return error_body.strip()[:500] or "Unknown API error"

        if isinstance(error_data, dict):
            error = error_data.get("error")

            if isinstance(error, dict):
                message = error.get("message")
                if isinstance(message, str) and message.strip():
                    return message.strip()[:500]

            message = error_data.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()[:500]

        return "Unknown API error"

    @staticmethod
    def _read_token_count(value: Any) -> int | None:
        if (
            isinstance(value, int)
            and not isinstance(value, bool)
            and value >= 0
        ):
            return value

        return None