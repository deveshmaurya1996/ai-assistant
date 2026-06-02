# Image Edit

Image generation and editing is **not** handled through chat attachment resolution.

Use the `image.edit` capability when the user explicitly asks to create or modify an image. Outputs are stored under the user's generated files prefix in object storage.

Chat attachments remain read-only inputs for analysis unless the user starts a dedicated image-edit flow.
