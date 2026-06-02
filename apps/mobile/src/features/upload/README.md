# Mobile file upload

Reusable upload layer for Expo (Android, iOS, web). Works around Expo fetch
FormData, which does **not** support React Native `{ uri, name, type }` parts.

## API

| Export | Use when |
|--------|----------|
| `uploadLocalFile(source)` | One-shot upload without React state |
| `useFileUpload()` | Single file + `status` / `error` / `result` |
| `useUploadQueue()` | Multiple files, chips, send-on-submit |
| `resolveUploadMimeType()` | Android `application/octet-stream` fixes |
| `formatUploadError()` | User-friendly errors |

## Example — single file

```tsx
const { upload, isUploading, error } = useFileUpload();

await upload({
  uri: pickedUri,
  filename: 'report.pdf',
  mimeType: 'application/pdf',
});
```

## Example — queue (custom UI)

```tsx
const queue = useUploadQueue({ limits: { maxItems: 5 } });

queue.add({ uri, filename: 'a.pdf' });
await queue.uploadAll();
```

Chat uses `useChatAttachments()` built on `useUploadQueue` with chat limits and previews.
