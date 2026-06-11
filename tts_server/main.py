import io
import soundfile as sf
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from supertonic import TTS

app = FastAPI(title="Supertonic TTS Server")

# Initialize TTS and download models automatically on startup
try:
    print("Loading Supertonic TTS model...")
    tts = TTS(auto_download=True)
    print("Model loaded successfully!")
except Exception as e:
    print(f"Error loading TTS model: {e}")
    tts = None

@app.get("/tts")
async def generate_tts(
    text: str = Query(..., description="The text to convert to speech"),
    lang: str = Query("en", description="Language code (e.g., 'en', 'ko', or 'na' for language-agnostic)"),
    voice: str = Query("M1", description="Preset voice name (e.g., 'M1', 'F1')"),
    speed: float = Query(1.0, description="Speed modifier from 0.7 to 2.0")
):
    if tts is None:
        raise HTTPException(status_code=500, detail="TTS engine is not initialized.")
    
    try:
        # 1. Fetch the requested voice style
        voice_style = tts.get_voice_style(voice_name=voice)
        
        # 2. Synthesize text to raw audio array
        wav, duration = tts.synthesize(
            text=text,
            lang=lang,
            voice_style=voice_style,
            total_steps=8,  # Default standard quality step
            speed=speed
        )
        
        # 3. Convert the numpy array into a WAV file format in memory
        # Supertonic outputs 44.1kHz audio
        wav_buffer = io.BytesIO()
        sf.write(wav_buffer, wav.squeeze(), 44100, format='WAV', subtype='PCM_16')
        wav_buffer.seek(0)
        
        # 4. Return the binary audio data directly
        return Response(content=wav_buffer.getvalue(), media_type="audio/wav")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS Generation failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)