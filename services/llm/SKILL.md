---
name: llm
version: 0.1.0
description: Local LLM inference via llama.cpp server (OpenAI-compatible API)
image: ghcr.io/ggml-org/llama.cpp:server
---

# LLM Service

Local language model server powered by llama.cpp. Provides an OpenAI-compatible API for chat completions. Runs on CPU.

## First-Time Setup

Before starting the service, download a model into the volume:

```bash
# Create a temporary container to access the volume
podman volume create bloom-llm-models

# Download a small model (Qwen2.5 0.5B, ~400MB, good for first boot)
podman run --rm -v bloom-llm-models:/models docker.io/curlimages/curl:latest \
  -L -o /models/default.gguf \
  "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"
```

To use a different model, replace the URL and restart the service.

## API

OpenAI-compatible endpoint at `http://localhost:8080`.

### Chat Completion

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "default", "messages": [{"role": "user", "content": "Hello"}]}'
```

### List Models

```bash
curl http://localhost:8080/v1/models
```

### Health Check

```bash
curl -sf http://localhost:8080/health
```

## Service Control

```bash
systemctl --user start bloom-llm.service
systemctl --user status bloom-llm
journalctl --user -u bloom-llm -f
```

## Notes

- Model must be downloaded before first start (see setup above)
- Memory usage: ~1-3GB depending on model size (CPU mode)
- Default model: Qwen2.5 0.5B Instruct (Q4_K_M) — small, fast, good for basic tasks
- Upgrade to a larger model (3B, 7B) for better quality if hardware allows
- Swappable with Ollama or any OpenAI-compatible server on port 8080
