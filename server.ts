import express from 'express';
import { Client, handle_file } from '@gradio/client';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use('/uploads', express.static(UPLOADS_DIR));

const upload = multer({ dest: UPLOADS_DIR });

const VOICES_FILE = path.join(process.cwd(), 'voices.json');
let voices: any[] = [];
if (fs.existsSync(VOICES_FILE)) {
  try {
    voices = JSON.parse(fs.readFileSync(VOICES_FILE, 'utf-8'));
  } catch (e) {
    console.error("Failed to parse voices.json", e);
  }
}

const saveVoices = () => fs.writeFileSync(VOICES_FILE, JSON.stringify(voices, null, 2));

app.get('/api/voices', (req, res) => {
  res.json(voices);
});

app.post('/api/voices', upload.single('audio'), (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const newVoice = {
      id: crypto.randomUUID(),
      name: req.body.name,
      gender: req.body.gender,
      category: req.body.category,
      cv: req.body.cv,
      copyright: req.body.copyright,
      ip: req.body.ip,
      description: req.body.description,
      refText: req.body.refText,
      audioPath: file.path,
      originalFilename: file.originalname,
      audioUrl: `/uploads/${file.filename}`
    };

    voices.push(newVoice);
    saveVoices();
    res.json(newVoice);
  } catch (error) {
    console.error("Error adding voice:", error);
    res.status(500).json({ error: String(error) });
  }
});

app.delete('/api/voices/:id', (req, res) => {
  const id = req.params.id;
  const index = voices.findIndex(v => v.id === id);
  if (index !== -1) {
    const voice = voices[index];
    if (fs.existsSync(voice.audioPath)) {
      fs.unlinkSync(voice.audioPath);
    }
    voices.splice(index, 1);
    saveVoices();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Voice not found' });
  }
});

app.post('/api/tts/clone', async (req, res) => {
  try {
    const { text, voiceId } = req.body;
    const voice = voices.find(v => v.id === voiceId);
    
    if (!voice) {
      return res.status(404).json({ error: 'Voice not found' });
    }

    console.log(`Generating Clone TTS for: "${text}" with voice: "${voice.name}"`);
    const client = await Client.connect("http://59.77.13.188:7860/");
    
    // Call the API for cloning
    const result = await client.predict("/generate_clone_fn", {
      model_name: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
      text: text,
      language: "auto",
      ref_audio: handle_file(path.resolve(voice.audioPath)),
      ref_text: voice.refText || "",
      segment_gen: false
    });
    
    console.log("Gradio API Result:", JSON.stringify(result.data, null, 2));
    
    const GRADIO_URL = "http://59.77.13.188:7860/";
    let audioUrl = null;

    // Helper to make URL absolute
    const makeAbsolute = (url: string) => {
      if (!url) return null;
      if (url.startsWith('http')) return url;
      return `${GRADIO_URL.replace(/\/$/, '')}/${url.startsWith('/') ? url.slice(1) : url}`;
    };

    // 1. Try to get audio from the primary result first (more reliable)
    if (Array.isArray(result.data)) {
      for (const item of result.data) {
        if (item && typeof item === 'object' && item.url) {
          audioUrl = makeAbsolute(item.url);
          break;
        }
        if (typeof item === 'string' && (item.endsWith('.wav') || item.endsWith('.mp3'))) {
          audioUrl = makeAbsolute(item);
          break;
        }
      }
    }
    
    // 2. Fallback to checking file explorer if primary result didn't have it
    if (!audioUrl) {
      console.log("Primary result didn't have audio, checking file explorer...");
      const updateResult = await client.predict("/update", []);
      
      if (Array.isArray(updateResult.data) && updateResult.data.length > 0) {
          const files = updateResult.data[0];
          if (Array.isArray(files) && files.length > 0) {
              const latestFile = files[files.length - 1]; 
              console.log("Latest file found in explorer:", latestFile);
              
              const lambdaResult = await client.predict("/lambda", { x: [latestFile] });
              if (Array.isArray(lambdaResult.data) && lambdaResult.data.length > 0) {
                  const audioObj = lambdaResult.data[0];
                  if (audioObj && typeof audioObj === 'object' && audioObj.url) {
                      audioUrl = makeAbsolute(audioObj.url);
                  } else if (typeof audioObj === 'string') {
                      audioUrl = makeAbsolute(audioObj);
                  }
              }
          }
      }
    }

    if (audioUrl) {
      console.log("Final Audio URL to frontend:", audioUrl);
      res.json({ audioUrl });
    } else {
      res.status(500).json({ error: "Failed to extract audio URL from response", data: result.data });
    }
  } catch (error) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: String(error) });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
