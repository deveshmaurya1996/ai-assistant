# @ai-assistant/icons

Icon components for AI Assistant — [Iconify](https://iconify.design) (200k+ icons), LobeHub brand SVGs, and MaterialCommunityIcons fallback.

## Usage

```tsx
import { IconifyIcon, PickerIcon, resolveModelIcon } from '@ai-assistant/icons';

<IconifyIcon icon="simple-icons:openai" size={24} color="#10A37F" fallbackIcon="robot-outline" />

const spec = resolveModelIcon('nvidia/deepseek-v4-flash');
<PickerIcon spec={spec} />
```

## Icon ID conventions

| Prefix | Source | Example |
|--------|--------|---------|
| `simple-icons:` | [Iconify](https://iconify.design) brand set | `simple-icons:nvidia` |
| `mdi:` | Material Design Icons via Iconify | `mdi:whatsapp` |
| `lobehub:` | [LobeHub](https://icons.lobehub.com) AI brand CDN | `lobehub:qwen-color` |
| `hugeicons:` | Hugeicons via Iconify | `hugeicons:kimi-ai` |
| `token-branded:` | Branded crypto/token icons via Iconify | `token-branded:glm` |

Model/provider pickers use `resolveModelIcon`, `resolvePersonalityIcon`, and `resolveProviderIcon` in `src/resolvers.ts`.

Icons load from Iconify API or LobeHub CDN and are cached in memory.
