import logging
import os
import urllib.request
import numpy as np
import onnxruntime as ort

logger = logging.getLogger(__name__)

class SileroVAD:
    def __init__(self, model_path: str = None):
        if not model_path:
            # use a local cache directory
            base_dir = os.path.dirname(os.path.abspath(__file__))
            cache_dir = os.path.abspath(os.path.join(base_dir, "..", "..", "cache"))
            os.makedirs(cache_dir, exist_ok=True)
            model_path = os.path.join(cache_dir, "silero_vad.onnx")
            
            if not os.path.exists(model_path):
                url = "https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx"
                logger.info(f"Downloading Silero VAD model from {url} to {model_path}...")
                try:
                    urllib.request.urlretrieve(url, model_path)
                except Exception as e:
                    logger.error(f"Failed to download Silero VAD model: {e}")
                    raise e
                    
        logger.info(f"Loading Silero VAD from {model_path}")
        # Disable CPU execution provider warnings by forcing CPUProvider
        self.session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        self.reset()

    def reset(self):
        self._state = np.zeros((2, 1, 128), dtype=np.float32)

    def __call__(self, x: np.ndarray, sr: int = 16000) -> float:
        """
        Run VAD inference on raw 1D float32 audio array normalized to [-1.0, 1.0].
        Length of x must be a multiple of 16 (e.g. 512, 1024, 1536).
        """
        if x.ndim == 1:
            x = np.expand_dims(x, axis=0)
            
        sr_input = np.array(sr, dtype=np.int64)
        
        inputs = {
            "input": x,
            "state": self._state,
            "sr": sr_input
        }
        
        try:
            out, new_state = self.session.run(None, inputs)
            self._state = new_state
            return float(out[0][0])
        except Exception as e:
            logger.error(f"Silero VAD inference failed: {e}")
            return 0.0
