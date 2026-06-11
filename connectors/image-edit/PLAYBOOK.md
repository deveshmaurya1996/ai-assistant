# Image Edit

Use the `image.edit` capability when the user explicitly asks to create or modify an image.

## Capabilities

| Capability | Use for |
|------------|---------|
| `image.edit` | Generate a new image or edit an existing one from a text prompt |

## Rules

- Requires user confirmation before execution
- If the user attached an image, include it via `sourceImageBase64` in args when available
- Outputs are stored under the user's generated files prefix in object storage
