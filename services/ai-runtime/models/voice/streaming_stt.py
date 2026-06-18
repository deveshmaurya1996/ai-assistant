import asyncio
import json
import logging
import os
import time
from typing import List
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect
from faster_whisper import WhisperModel
from models.voice.vad import SileroVAD

logger = logging.getLogger(__name__)

_whisper_model = None
_model_lock = asyncio.Lock()

def get_whisper_model() -> WhisperModel:
    global _whisper_model
    if _whisper_model is None:
        model_size = os.getenv("FASTER_WHISPER_MODEL", "base.en").strip() or "base.en"
        device = os.getenv("FASTER_WHISPER_DEVICE", "cpu").strip() or "cpu"
        compute_type = os.getenv("FASTER_WHISPER_COMPUTE_TYPE", "int8").strip() or "int8"
        logger.info(f"Initializing faster-whisper Model '{model_size}' on '{device}' with '{compute_type}'")
        _whisper_model = WhisperModel(model_size, device=device, compute_type=compute_type)
    return _whisper_model


def transcribe_audio_chunk(audio_samples: np.ndarray, language: str = "en") -> str:
    try:
        model = get_whisper_model()
        segments, _ = model.transcribe(
            audio_samples,
            beam_size=3,
            language=language if language else None,
            vad_filter=False
        )
        return " ".join([segment.text for segment in segments]).strip()
    except Exception as e:
        logger.error(f"Whisper transcribe failed: {e}")
        return ""


async def handle_stt_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("[stt-ws] connection accepted")
    
    language = "en"
    sample_rate = 16000
    
    try:
        init_msg = await websocket.receive_json()
        if init_msg.get("type") == "start":
            language = init_msg.get("language", "en")
            sample_rate = init_msg.get("sample_rate", 16000)
            logger.info(f"[stt-ws] started session: rate={sample_rate}, lang={language}")
        else:
            await websocket.send_json({"type": "error", "message": "Expected start message"})
            await websocket.close()
            return
    except Exception as e:
        logger.error(f"[stt-ws] handshake failed: {e}")
        return

    vad = SileroVAD()
    
    CHUNK_SAMPLES = 512
    CHUNK_BYTES = CHUNK_SAMPLES * 2
    
    audio_buffer = bytearray()
    preroll_chunks: List[np.ndarray] = []
    MAX_PREROLL_CHUNKS = 10
    
    speech_chunks: List[np.ndarray] = []
    speech_active = False
    
    silence_samples = 0
    SILENCE_TIMEOUT_SAMPLES = int(0.6 * sample_rate) 
    MAX_UTTERANCE_SAMPLES = int(12.0 * sample_rate)
    
    last_decode_time = 0.0
    DECODE_INTERVAL_SEC = 0.40 
    last_partial_text = ""
    
    decode_in_progress = False

    async def run_final_decode():
        nonlocal speech_active, last_partial_text
        if not speech_chunks:
            return
        
        # Concatenate speech frames
        full_audio = np.concatenate(speech_chunks)
        speech_chunks.clear()
        
        # Threaded decode to avoid blocking event loop
        async with _model_lock:
            final_text = await asyncio.to_thread(transcribe_audio_chunk, full_audio, language)
            
        final_text = final_text.strip()
        logger.info(f"[stt-ws] final transcript: '{final_text}'")
        
        await websocket.send_json({"type": "final", "text": final_text})
        await websocket.send_json({"type": "speech_ended"})
        
        last_partial_text = ""
        speech_active = False
        vad.reset()

    try:
        while True:
            # Await incoming message (can be binary audio frame or json command)
            message = await websocket.receive()
            
            if "bytes" in message:
                audio_buffer.extend(message["bytes"])
                
                while len(audio_buffer) >= CHUNK_BYTES:
                    # Extract 512 samples (1024 bytes)
                    chunk_bytes = audio_buffer[:CHUNK_BYTES]
                    del audio_buffer[:CHUNK_BYTES]
                    
                    # Convert to float32 normalized [-1.0, 1.0]
                    audio_int16 = np.frombuffer(chunk_bytes, dtype=np.int16)
                    audio_float32 = audio_int16.astype(np.float32) / 32768.0
                    
                    # Check speech probability
                    speech_prob = vad(audio_float32, sample_rate)
                    
                    now = time.time()
                    
                    if speech_prob >= 0.50:
                        if not speech_active:
                            speech_active = True
                            logger.info("[stt-ws] speech_started detected")
                            await websocket.send_json({"type": "speech_started"})
                            # Prepend preroll buffer to include first syllables
                            speech_chunks = list(preroll_chunks)
                            last_decode_time = now
                            silence_samples = 0
                        
                        speech_chunks.append(audio_float32)
                        silence_samples = 0
                    elif speech_prob < 0.35:  # Hysteresis
                        if speech_active:
                            speech_chunks.append(audio_float32)
                            silence_samples += CHUNK_SAMPLES
                            
                            # Check if silence timeout exceeded or max utterance length reached
                            speech_duration = len(speech_chunks) * CHUNK_SAMPLES
                            if silence_samples >= SILENCE_TIMEOUT_SAMPLES or speech_duration >= MAX_UTTERANCE_SAMPLES:
                                await run_final_decode()
                        else:
                            # Keep sliding preroll window when silent
                            preroll_chunks.append(audio_float32)
                            if len(preroll_chunks) > MAX_PREROLL_CHUNKS:
                                preroll_chunks.pop(0)
                    else:
                        # Moderate speech probability, continue speech if active
                        if speech_active:
                            speech_chunks.append(audio_float32)
                            silence_samples = 0
                    
                    # 3. Incremental Decode (Partials)
                    if speech_active and not decode_in_progress:
                        speech_duration = len(speech_chunks) * CHUNK_SAMPLES
                        if now - last_decode_time >= DECODE_INTERVAL_SEC and speech_duration > int(0.5 * sample_rate):
                            last_decode_time = now
                            decode_in_progress = True
                            
                            # Capture snapshot of current speech buffer
                            current_audio = np.concatenate(speech_chunks)
                            
                            # Run Whisper decode in background thread to avoid blockages
                            async def task_wrapper(audio_data):
                                nonlocal decode_in_progress, last_partial_text
                                try:
                                    async with _model_lock:
                                        partial_text = await asyncio.to_thread(transcribe_audio_chunk, audio_data, language)
                                    
                                    partial_text = partial_text.strip()
                                    # Deduplicate identical partials
                                    if partial_text and partial_text != last_partial_text:
                                        last_partial_text = partial_text
                                        await websocket.send_json({"type": "partial", "text": partial_text})
                                except Exception as err:
                                    logger.error(f"[stt-ws] partial decode error: {err}")
                                finally:
                                    decode_in_progress = False
                                    
                            asyncio.create_task(task_wrapper(current_audio))
            
            elif "text" in message:
                try:
                    data = websocket.receive_json() if False else json.loads(message["text"])
                    msg_type = data.get("type")
                    if msg_type == "flush":
                        if speech_active:
                            await run_final_decode()
                    elif msg_type == "stop":
                        logger.info("[stt-ws] stop requested by client")
                        if speech_active:
                            await run_final_decode()
                        break
                except Exception as e:
                    logger.warn(f"[stt-ws] json payload error: {e}")
                    
    except WebSocketDisconnect:
        logger.info("[stt-ws] disconnected")
    except Exception as e:
        logger.error(f"[stt-ws] connection error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass
    finally:
        speech_chunks.clear()
        preroll_chunks.clear()
        logger.info("[stt-ws] session cleaned up")
