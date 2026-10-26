"""Meta Model API adapter for KryomCode."""

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

DEFAULT_BASE_URL = "https://api.meta.ai/v1"
DEFAULT_MODEL = "muse-spark-1.3"


class MetaProvider:
    """Implement KryomCode's provider interface using Meta Model API."""

    name = "meta"

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
        """Generate text and normalize the Meta API response."""
        if not isinstance(request, GenerationRequest):
            raise TypeError("request must be a GenerationRequest")

        input_messages = self._build_input_messages(request)
        payload = self._build_payload(
            request,
            input_items=input_messages,
        )
        response_data = self._post_response(payload)

        content = self._extract_response_text(response_data)

        if not content:
            raise RuntimeError(
                "Meta Model API returned no readable text."
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
                usage.get("input_tokens")
            ),
            output_tokens=self._read_token_count(
                usage.get("output_tokens")
            ),
        )

    def generate_with_tools(
        self,
        request: GenerationRequest,
        tool_registry: ToolRegistry,
        *,
        max_tool_iterations: int = 5,
    ) -> ToolCallingResponse:
        """Generate a response while executing approved registered tools."""
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

        input_items = self._build_input_messages(request)
        tools = [
            {
                "type": "function",
                **definition,
            }
            for definition in tool_registry.definitions()
        ]

        executed_calls: list[ToolCall] = []

        for iteration in range(max_tool_iterations + 1):
            payload = self._build_payload(
                request,
                input_items=input_items,
                tools=tools,
                include_reasoning=True,
            )
            response_data = self._post_response(payload)
            output_items = self._get_output_items(response_data)

            function_calls = [
                item
                for item in output_items
                if item.get("type") == "function_call"
            ]

            if not function_calls:
                content = self._extract_response_text(response_data)

                if not content:
                    raise RuntimeError(
                        "Meta Model API returned no readable text."
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

            # Replay the full response output in the next stateless request.
            # This includes the function_call items that the results answer.
            input_items.extend(output_items)

            for item in function_calls:
                call_id = item.get("call_id")
                name = item.get("name")
                raw_arguments = item.get("arguments")

                if (
                    not isinstance(call_id, str)
                    or not call_id.strip()
                    or len(call_id) > 64
                    or not isinstance(name, str)
                    or not name.strip()
                ):
                    raise RuntimeError(
                        "Meta returned a tool call without a valid ID or name."
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

                input_items.append(
                    {
                        "type": "function_call_output",
                        "call_id": result.call_id,
                        "output": result.content,
                    }
                )

        raise RuntimeError("Tool-calling loop exited unexpectedly.")

    def _build_input_messages(
        self,
        request: GenerationRequest,
    ) -> list[dict[str, Any]]:
        """Convert shared messages to Meta Responses API input items."""
        input_messages: list[dict[str, Any]] = []

        for message in request.messages:
            if message.role == "system":
                continue

            content_type = (
                "output_text"
                if message.role == "assistant"
                else "input_text"
            )

            input_messages.append(
                {
                    "role": message.role,
                    "content": [
                        {
                            "type": content_type,
                            "text": message.content,
                        }
                    ],
                }
            )

        if not input_messages:
            raise ValueError(
                "Meta requests must contain at least one user "
                "or assistant message."
            )

        return input_messages

    @staticmethod
    def _get_instructions(request: GenerationRequest) -> str:
        return "\n\n".join(
            message.content
            for message in request.messages
            if message.role == "system"
        ).strip()

    def _build_payload(
        self,
        request: GenerationRequest,
        *,
        input_items: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        include_reasoning: bool = False,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": request.model or DEFAULT_MODEL,
            "input": input_items,
            "temperature": request.temperature,
            "max_output_tokens": request.max_output_tokens,
            "store": False,
        }

        instructions = self._get_instructions(request)
        if instructions:
            payload["instructions"] = instructions

        if tools is not None:
            payload["tools"] = tools

        if include_reasoning:
            payload["include"] = ["reasoning.encrypted_content"]

        return payload

    def _post_response(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Send one authenticated request and return its JSON response."""
        api_key = self._api_key

        if api_key is None:
            api_key = os.environ.get("MODEL_API_KEY")

        if not isinstance(api_key, str) or not api_key.strip():
            raise ValueError(
                "Meta Model API key is required. "
                "Set MODEL_API_KEY before sending an AI request."
            )

        encoded_payload = json.dumps(payload).encode("utf-8")

        http_request = Request(
            url=f"{self._base_url}/responses",
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
                f"Meta Model API returned HTTP {exc.code}: {detail}"
            ) from exc
        except URLError as exc:
            raise RuntimeError(
                f"Could not connect to Meta Model API: {exc.reason}"
            ) from exc
        except TimeoutError as exc:
            raise RuntimeError(
                "The Meta Model API request timed out."
            ) from exc

        try:
            response_data = json.loads(response_body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise RuntimeError(
                "Meta Model API returned invalid JSON."
            ) from exc

        if not isinstance(response_data, dict):
            raise RuntimeError(
                "Meta Model API returned an unexpected response."
            )

        return response_data

    @staticmethod
    def _get_output_items(
        response_data: dict[str, Any],
    ) -> list[dict[str, Any]]:
        output = response_data.get("output")

        if not isinstance(output, list):
            return []

        return [
            item
            for item in output
            if isinstance(item, dict)
        ]

    @classmethod
    def _extract_response_text(
        cls,
        response_data: dict[str, Any],
    ) -> str:
        direct_text = response_data.get("output_text")

        if isinstance(direct_text, str) and direct_text.strip():
            return direct_text.strip()

        text_parts: list[str] = []

        for item in cls._get_output_items(response_data):
            content = item.get("content")

            if not isinstance(content, list):
                continue

            for part in content:
                if not isinstance(part, dict):
                    continue

                if (
                    part.get("type") in {"output_text", "text"}
                    and isinstance(part.get("text"), str)
                ):
                    text_parts.append(part["text"])

        return "\n".join(text_parts).strip()

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