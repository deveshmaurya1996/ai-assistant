import { useCallback, useRef, useState } from 'react';
import { formatUploadError } from './errors';
import { uploadLocalFile } from './uploadFile';
import type { FileAssetResponse } from '@ai-assistant/types';
import type { LocalFileSource } from './types';

export type FileUploadStatus = 'idle' | 'uploading' | 'success' | 'error';

export type UseFileUploadOptions = {
  onSuccess?: (result: FileAssetResponse) => void;
  onError?: (message: string) => void;
};

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [status, setStatus] = useState<FileUploadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FileAssetResponse | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setResult(null);
  }, []);

  const upload = useCallback(async (source: LocalFileSource) => {
    setStatus('uploading');
    setError(null);
    try {
      const asset = await uploadLocalFile(source);
      setResult(asset);
      setStatus('success');
      optionsRef.current.onSuccess?.(asset);
      return asset;
    } catch (err) {
      const message = formatUploadError(err);
      setError(message);
      setStatus('error');
      optionsRef.current.onError?.(message);
      throw err;
    }
  }, []);

  return {
    upload,
    reset,
    status,
    error,
    result,
    isUploading: status === 'uploading',
    isSuccess: status === 'success',
    isError: status === 'error',
  };
}
