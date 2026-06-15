# @ai-assistant/icons

Icon components backed by [Iconify](https://iconify.design) (200k+ icons) with MaterialCommunityIcons fallback.

```tsx
import { IconifyIcon, PickerIcon, resolveModelIcon } from '@ai-assistant/icons';

<IconifyIcon icon="simple-icons:openai" size={24} color="#10A37F" fallbackIcon="robot-outline" />

const spec = resolveModelIcon('nvidia/deepseek-v4-flash');
<PickerIcon spec={spec} />
```

Icons load from the public Iconify API and are cached in memory.
