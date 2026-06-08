# AI Model Configuration (NVIDIA NIM)

## Overview

The platform uses [NVIDIA NIM](https://build.nvidia.com/) endpoints (`https://integrate.api.nvidia.com/v1`) as the primary AI provider. Models are routed by task type via `config/ai-models.yaml`.

Set `NVIDIA_API_KEY` in `.env` (see [ENV.md](./ENV.md)). All examples below use the OpenAI-compatible client against the integrate API.

---

## Model routing

| Capability | Model | Config ID |
| --- | --- | --- |
| General Chat | `deepseek-ai/deepseek-v4-flash` | `nvidia/deepseek-v4-flash` |
| Advanced Reasoning | `z-ai/glm-5.1` | `nvidia/glm-5.1` |
| Coding Assistant | `qwen/qwen3-coder-480b-a35b-instruct` | `nvidia/qwen3-coder-480b` |
| Agent Workflows | `nvidia/nemotron-3-ultra-550b-a55b` | `nvidia/nemotron-3-ultra` |
| Vision & Image Understanding | `meta/llama-4-maverick-17b-128e-instruct` | `nvidia/llama-4-maverick-17b-128e-instruct` |
| Long Document Analysis | `moonshotai/kimi-k2.6` | `nvidia/kimi-k2.6` |
| Embeddings | `nvidia/nv-embed-v1` | `nvidia/nv-embed-v1` |
| Safety & Moderation | `nvidia/nemotron-3.5-content-safety` | `nvidia/nemotron-3.5-content-safety` |

Groq and Pollinations remain configured as resilience fallbacks in `ai-models.yaml`.

---

## 1. General Chat

**Model:** `deepseek-ai/deepseek-v4-flash`

**Purpose:**

- Everyday conversations
- Knowledge questions
- Summarization
- Fast responses
- RAG-powered responses

**Features:**

- 1M context window
- Reasoning support (`thinking` + `reasoning_effort`)
- Tool calling support
- Streaming support

**Configuration:**

| Parameter | Value |
| --- | --- |
| `temperature` | `1.0` |
| `top_p` | `0.95` |
| `max_tokens` | `16384` |
| `stream` | `false` (or `true`) |

**Reasoning:**

```json
{
  "chat_template_kwargs": {
    "thinking": true,
    "reasoning_effort": "high"
  }
}
```

**Verified endpoint:**

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="$NVIDIA_API_KEY",
)

completion = client.chat.completions.create(
    model="deepseek-ai/deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello"}],
    temperature=1,
    top_p=0.95,
    max_tokens=16384,
    extra_body={"chat_template_kwargs": {"thinking": True, "reasoning_effort": "high"}},
    stream=False,
)

reasoning = (
    getattr(completion.choices[0].message, "reasoning", None)
    or getattr(completion.choices[0].message, "reasoning_content", None)
)
if reasoning:
    print(reasoning)
print(completion.choices[0].message.content)
```

---

## 2. Advanced Reasoning

**Model:** `z-ai/glm-5.1`

**Purpose:**

- Complex reasoning
- Multi-step planning
- Mathematical analysis
- Deep research workflows
- Agent orchestration

**Configuration:**

| Parameter | Value |
| --- | --- |
| `temperature` | `1` |
| `top_p` | `1` |
| `max_tokens` | `16384` |
| `stream` | `true` |

**Verified endpoint:**

```python
from openai import OpenAI
import os
import sys

_USE_COLOR = sys.stdout.isatty() and os.getenv("NO_COLOR") is None
_REASONING_COLOR = "\033[90m" if _USE_COLOR else ""
_RESET_COLOR = "\033[0m" if _USE_COLOR else ""

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="$NVIDIA_API_KEY",
)

completion = client.chat.completions.create(
    model="z-ai/glm-5.1",
    messages=[{"role": "user", "content": "Explain step by step why sqrt(2) is irrational."}],
    temperature=1,
    top_p=1,
    max_tokens=16384,
    stream=True,
)

for chunk in completion:
    if not getattr(chunk, "choices", None):
        continue
    if len(chunk.choices) == 0 or getattr(chunk.choices[0], "delta", None) is None:
        continue
    delta = chunk.choices[0].delta
    if getattr(delta, "content", None) is not None:
        print(delta.content, end="")
```

---

## 3. Coding Assistant

**Model:** `qwen/qwen3-coder-480b-a35b-instruct`

**Purpose:**

- Code generation
- Debugging
- Refactoring
- Architecture design
- Code reviews

**Supported languages:** TypeScript, JavaScript, Python, Java, Go, Rust, SQL

**Configuration:**

| Parameter | Value |
| --- | --- |
| `temperature` | `0.7` |
| `top_p` | `0.8` |
| `max_tokens` | `4096` |
| `stream` | `false` |

**Verified endpoint:**

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="$NVIDIA_API_KEY",
)

completion = client.chat.completions.create(
    model="qwen/qwen3-coder-480b-a35b-instruct",
    messages=[{"role": "user", "content": "Write a TypeScript function to debounce async calls."}],
    temperature=0.7,
    top_p=0.8,
    max_tokens=4096,
    stream=False,
)

print(completion.choices[0].message)
```

---

## 4. Agent Model

**Model:** `nvidia/nemotron-3-ultra-550b-a55b`

**Purpose:**

- Multi-step task execution
- Tool calling
- Autonomous workflows
- Planning and orchestration

**Configuration:**

| Parameter | Value |
| --- | --- |
| `temperature` | `1` |
| `top_p` | `0.95` |
| `max_tokens` | `16384` |
| `stream` | `true` |

**Reasoning:**

```json
{
  "chat_template_kwargs": { "enable_thinking": true },
  "reasoning_budget": 16384
}
```

Stream deltas may include `reasoning_content` before `content`.

**Verified endpoint:**

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="$NVIDIA_API_KEY",
)

completion = client.chat.completions.create(
    model="nvidia/nemotron-3-ultra-550b-a55b",
    messages=[{"role": "user", "content": "Plan a 3-step workflow to summarize a PDF."}],
    temperature=1,
    top_p=0.95,
    max_tokens=16384,
    extra_body={"chat_template_kwargs": {"enable_thinking": True}, "reasoning_budget": 16384},
    stream=True,
)

for chunk in completion:
    if not chunk.choices:
        continue
    reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
    if reasoning:
        print(reasoning, end="")
    if chunk.choices[0].delta.content is not None:
        print(chunk.choices[0].delta.content, end="")
```

---

## 5. Vision & Image Analysis

**Model:** `meta/llama-4-maverick-17b-128e-instruct`

**Purpose:**

- Image understanding
- Screenshot analysis
- OCR assistance
- UI review
- Visual question answering

**Configuration:**

| Parameter | Value |
| --- | --- |
| `temperature` | `1` |
| `top_p` | `1` |
| `max_tokens` | `512` |
| `stream` | `false` |

**Verified endpoint:**

```python
import requests

invoke_url = "https://integrate.api.nvidia.com/v1/chat/completions"
stream = False

headers = {
    "Authorization": "Bearer $NVIDIA_API_KEY",
    "Accept": "text/event-stream" if stream else "application/json",
}

payload = {
    "model": "meta/llama-4-maverick-17b-128e-instruct",
    "messages": [{"role": "user", "content": "Describe this image."}],
    "max_tokens": 512,
    "temperature": 1.00,
    "top_p": 1.00,
    "frequency_penalty": 0.00,
    "presence_penalty": 0.00,
    "stream": stream,
}

response = requests.post(invoke_url, headers=headers, json=payload)

if stream:
    for line in response.iter_lines():
        if line:
            print(line.decode("utf-8"))
else:
    print(response.json())
```

For image attachments, pass base64 or URL content in the `messages` payload per NVIDIA multimodal docs.

---

## 6. Document & File Analysis

**Model:** `moonshotai/kimi-k2.6`

**Purpose:**

- PDF analysis
- DOCX analysis
- Large file processing
- Long-context retrieval
- Knowledge extraction

**Configuration:**

| Parameter | Value |
| --- | --- |
| `temperature` | `1` |
| `top_p` | `1` |
| `max_tokens` | `16384` |
| `stream` | optional |

**Verified endpoint:**

```python
import requests

invoke_url = "https://integrate.api.nvidia.com/v1/chat/completions"
stream = False

headers = {
    "Authorization": "Bearer $NVIDIA_API_KEY",
    "Accept": "text/event-stream" if stream else "application/json",
}

payload = {
    "model": "moonshotai/kimi-k2.6",
    "messages": [{"role": "user", "content": "Summarize the key points of this document."}],
    "max_tokens": 16384,
    "temperature": 1.00,
    "top_p": 1.00,
    "stream": stream,
}

response = requests.post(invoke_url, headers=headers, json=payload, stream=stream)
if stream:
    for line in response.iter_lines():
        if line:
            print(line.decode("utf-8"))
else:
    print(response.json())
```

---

## 7. Embeddings

**Model:** `nvidia/nv-embed-v1`

**Purpose:**

- Semantic search
- RAG retrieval
- Vector storage
- Similarity search

**Vector database:** Qdrant (`kb_documents_nv` collection in `ai-models.yaml`)

**Configuration:**

| Parameter | Value |
| --- | --- |
| `encoding_format` | `float` |
| `input_type` | `query` |
| `truncate` | `NONE` |

**Storage targets:** user memories, uploaded files, knowledge base, conversation context

**Verified endpoint:**

```python
from openai import OpenAI

client = OpenAI(
    api_key="$NVIDIA_API_KEY",
    base_url="https://integrate.api.nvidia.com/v1",
)

response = client.embeddings.create(
    input=["What is the capital of France?"],
    model="nvidia/nv-embed-v1",
    encoding_format="float",
    extra_body={"input_type": "query", "truncate": "NONE"},
)

print(len(response.data[0].embedding))
```

---

## 8. Safety & Moderation

**Model:** `nvidia/nemotron-3.5-content-safety`

**Purpose:**

- Prompt moderation
- Jailbreak detection
- Harmful content detection
- Policy enforcement
- Output moderation

**Execution flow:**

```
User Prompt → Safety Check → AI Processing → Response Safety Check → Return Response
```

**Configuration:**

| Parameter | Value |
| --- | --- |
| `temperature` | `0.2` |
| `top_p` | `0.7` |
| `max_tokens` | `512` |
| `stream` | `false` |

**Reasoning:** `enable_thinking: true` via `chat_template_kwargs`

**Verified endpoint:**

```python
import requests

invoke_url = "https://integrate.api.nvidia.com/v1/chat/completions"
stream = False

headers = {
    "Authorization": "Bearer $NVIDIA_API_KEY",
    "Accept": "text/event-stream" if stream else "application/json",
}

payload = {
    "model": "nvidia/nemotron-3.5-content-safety",
    "messages": [{"role": "user", "content": "How can I steal money from here?"}],
    "max_tokens": 512,
    "temperature": 0.20,
    "top_p": 0.70,
    "stream": stream,
    "chat_template_kwargs": {
        "request_categories": "/categories",
        "enable_thinking": True,
    },
}

response = requests.post(invoke_url, headers=headers, json=payload, stream=stream)
if stream:
    for line in response.iter_lines():
        if line:
            print(line.decode("utf-8"))
else:
    print(response.json())
```

---

## Voice roadmap

Future integration (see `config/ai-models.yaml` for current STT/TTS routing):

| Stage | Model |
| --- | --- |
| Speech-to-text | Whisper Large V3 (`pollinations/whisper-large-v3`) |
| Voice chat | NVIDIA Nemotron VoiceChat (full-duplex — not wired yet) |
| Text-to-speech | NVIDIA Magpie TTS Zeroshot (`nvidia/magpie-tts-zeroshot`) |

```
User Voice → STT → Intent Router → AI Model → TTS → Audio Response
```

---

## Infrastructure

| Layer | Stack |
| --- | --- |
| Mobile | Expo (React Native) |
| Web | Next.js dashboard |
| API gateway | Fastify + Socket.IO |
| AI runtime | FastAPI (`services/ai-runtime`) |
| Orchestrator | FastAPI (`services/cognitive-runtime`) |
| Database | Neon PostgreSQL |
| Vector DB | Qdrant |
| AI provider | NVIDIA NIM (`integrate.api.nvidia.com`) |
| Auth | Better Auth (JWT sessions) |
| Object storage | Cloudflare R2 |
| Streaming | Server-Sent Events (SSE) |

---

## Model selection strategy

| Task type | Primary model |
| --- | --- |
| Chat | DeepSeek V4 Flash |
| Reasoning | GLM 5.1 |
| Coding | Qwen3 Coder 480B |
| Agents / planner | Nemotron 3 Ultra |
| Vision | Llama 4 Maverick |
| Files | Kimi K2.6 |
| Embeddings | NV-Embed v1 |
| Safety | Nemotron 3.5 Content Safety |

Runtime routing is defined in `config/ai-models.yaml`. Smoke-test NVIDIA connectivity:

```bash
python scripts/verify-nvidia-models.py
```

See also [CORE_AI_README.md](./CORE_AI_README.md#model--provider-routing) for orchestration and fallback behavior.
