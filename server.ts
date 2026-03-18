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
    const client = await Client.connect("http://127.0.0.1:7860/");
    
    // Call the new API: /fn_voice_clone
    const result = await client.predict("/fn_voice_clone", { 
      text: text,
      lang: "Auto",
      ref_audio: handle_file(path.resolve(voice.audioPath)),
      ref_text: voice.refText || ""
    });
    
    console.log("Gradio API Result:", JSON.stringify(result.data, null, 2));
    
    const GRADIO_URL = "http://127.0.0.1:7860/";
    let audioUrl = null;

    // Enhanced helper to make URL absolute and handle Gradio /file= prefix
    const makeAbsolute = (path: string) => {
      if (!path) return null;
      if (path.startsWith('http')) return path;
      
      let cleanPath = path;
      // If it's a local path like "tmp/xxx.wav", Gradio needs "file=" prefix to serve it
      if (!cleanPath.startsWith('file=') && !cleanPath.startsWith('/file=')) {
        cleanPath = "file=" + (cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath);
      }
      
      const baseUrl = GRADIO_URL.replace(/\/$/, '');
      const finalPath = cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath;
      return `${baseUrl}/${finalPath}`;
    };

    // Recursive search for anything that looks like an audio file or URL
    const findAudio = (obj: any): string | null => {
      if (!obj) return null;
      if (typeof obj === 'string') {
        if (obj.toLowerCase().endsWith('.wav') || obj.toLowerCase().endsWith('.mp3') || obj.includes('file=')) {
          return makeAbsolute(obj);
        }
        return null;
      }
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const found = findAudio(item);
          if (found) return found;
        }
      }
      if (typeof obj === 'object') {
        // Check common Gradio file object properties
        if (obj.url) return makeAbsolute(obj.url);
        if (obj.path) return makeAbsolute(obj.path);
        if (obj.name && (obj.name.toLowerCase().endsWith('.wav') || obj.name.toLowerCase().endsWith('.mp3'))) {
          return makeAbsolute(obj.name);
        }
        // Deep search all keys
        for (const key in obj) {
          const found = findAudio(obj[key]);
          if (found) return found;
        }
      }
      return null;
    };

    // 1. Try to find audio in the primary result
    audioUrl = findAudio(result.data);
    
    // 2. Fallback to checking file explorer if primary result didn't have it
    if (!audioUrl) {
      console.log("Primary result didn't have audio, checking file explorer...");
      try {
        const updateResult = await client.predict("/update", []);
        audioUrl = findAudio(updateResult.data);
        
        if (!audioUrl && Array.isArray(updateResult.data) && updateResult.data.length > 0) {
            const files = updateResult.data[0];
            if (Array.isArray(files) && files.length > 0) {
                const latestFile = files[files.length - 1]; 
                const lambdaResult = await client.predict("/lambda", { x: [latestFile] });
                audioUrl = findAudio(lambdaResult.data);
            }
        }
      } catch (e) {
        console.error("Fallback search failed:", e);
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
