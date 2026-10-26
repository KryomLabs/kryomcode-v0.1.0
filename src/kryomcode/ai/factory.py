"""Default AI provider setup for KryomCode."""

from kryomcode.ai.groq_provider import MetaProvider
from kryomcode.ai.orchestrator import AIOrchestrator
from kryomcode.ai.registry import AIProviderRegistry


def create_default_ai_registry() -> AIProviderRegistry:
    """Create a registry containing KryomCode's Meta provider."""
    registry = AIProviderRegistry()
    registry.register(MetaProvider())
    return registry


def create_default_ai_orchestrator() -> AIOrchestrator:
    """Create an AI orchestrator configured to use Meta."""
    return AIOrchestrator(create_default_ai_registry())