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
let apiBaseUrl = "http://127.0.0.1:7860/";
let llmApiConfig = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  modelName: "gpt-4o-mini"
};

if (fs.existsSync(VOICES_FILE)) {
  try {
    voices = JSON.parse(fs.readFileSync(VOICES_FILE, 'utf-8'));
    // Migrate old voices to new format
    voices = voices.map(v => {
      if (!v.references) {
        v.references = [];
        if (v.audioPath) {
          v.references.push({
            id: crypto.randomUUID(),
            emotion: '默认',
            refText: v.refText || '',
            audioPath: v.audioPath,
            originalFilename: v.originalFilename,
            audioUrl: v.audioUrl
          });
        }
      }
      return v;
    });
  } catch (e) {
    console.error("Failed to parse voices.json", e);
  }
}

const saveVoices = () => fs.writeFileSync(VOICES_FILE, JSON.stringify(voices, null, 2));

app.get('/api/voices', (req, res) => {
  res.json(voices);
});

app.post('/api/voices', (req, res) => {
  try {
    const newVoice = {
      id: crypto.randomUUID(),
      name: req.body.name,
      gender: req.body.gender,
      category: req.body.category,
      cv: req.body.cv,
      copyright: req.body.copyright,
      ip: req.body.ip,
      description: req.body.description,
      references: []
    };

    voices.push(newVoice);
    saveVoices();
    res.json(newVoice);
  } catch (error) {
    console.error("Error adding voice:", error);
    res.status(500).json({ error: String(error) });
  }
});

app.put('/api/voices/:id', (req, res) => {
  const id = req.params.id;
  const index = voices.findIndex(v => v.id === id);
  if (index !== -1) {
    voices[index] = { ...voices[index], ...req.body };
    saveVoices();
    res.json(voices[index]);
  } else {
    res.status(404).json({ error: 'Voice not found' });
  }
});

app.post('/api/voices/:id/references', upload.single('audio'), (req, res) => {
  const id = req.params.id;
  const index = voices.findIndex(v => v.id === id);
  if (index !== -1) {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    const newRef = {
      id: crypto.randomUUID(),
      emotion: req.body.emotion || '默认',
      refText: req.body.refText || '',
      audioPath: file.path,
      originalFilename: file.originalname,
      audioUrl: `/uploads/${file.filename}`
    };
    if (!voices[index].references) {
      voices[index].references = [];
    }
    voices[index].references.push(newRef);
    saveVoices();
    res.json(voices[index]);
  } else {
    res.status(404).json({ error: 'Voice not found' });
  }
});

app.delete('/api/voices/:id/references/:refId', (req, res) => {
  const { id, refId } = req.params;
  const voice = voices.find(v => v.id === id);
  if (voice && voice.references) {
    const refIndex = voice.references.findIndex((r: any) => r.id === refId);
    if (refIndex !== -1) {
       const ref = voice.references[refIndex];
       if (fs.existsSync(ref.audioPath)) {
         fs.unlinkSync(ref.audioPath);
       }
       voice.references.splice(refIndex, 1);
       saveVoices();
       res.json(voice);
       return;
    }
  }
  res.status(404).json({ error: 'Reference not found' });
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

app.post('/api/config/url', (req, res) => {
  const { url } = req.body;
  if (url) {
    apiBaseUrl = url.endsWith('/') ? url : url + '/';
    res.json({ success: true, url: apiBaseUrl });
  } else {
    res.status(400).json({ error: "URL is required" });
  }
});

app.get('/api/config/url', (req, res) => {
  res.json({ url: apiBaseUrl });
});

app.post('/api/config/llm', (req, res) => {
  const { apiKey, baseUrl, modelName } = req.body;
  llmApiConfig = { apiKey, baseUrl, modelName };
  res.json({ success: true, config: llmApiConfig });
});

app.get('/api/config/llm', (req, res) => {
  res.json({ config: llmApiConfig });
});

app.post('/api/tts/clone', async (req, res) => {
  try {
    const { text, voiceId, scriptName, lineIndex, language, emotion } = req.body;
    const voice = voices.find(v => v.id === voiceId);
    
    if (!voice) {
      return res.status(404).json({ error: 'Voice not found' });
    }

    let refAudioPath = voice.audioPath;
    let refText = voice.refText || "";

    if (voice.references && voice.references.length > 0) {
      let selectedRef = voice.references.find((r: any) => r.emotion === emotion);
      if (!selectedRef) {
        selectedRef = voice.references[0]; // fallback
      }
      refAudioPath = selectedRef.audioPath;
      refText = selectedRef.refText || "";
    }

    if (!refAudioPath) {
      return res.status(400).json({ error: 'No reference audio found for this voice' });
    }

    console.log(`Generating Clone TTS for: "${text}" with voice: "${voice.name}" (Emotion: ${emotion}) using API: ${apiBaseUrl}`);
    
    // Create client with potential SSL issues ignored for local/internal IPs
    const client = await Client.connect(apiBaseUrl);
    
    // Helper to fetch audio list
    const getAudioList = async () => {
      try {
        const url = new URL('/audio/list', apiBaseUrl).toString();
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) return data;
          if (data && Array.isArray(data.files)) return data.files;
          if (data && Array.isArray(data.data)) return data.data;
        }
      } catch (e) {
        console.error("Failed to fetch audio list", e);
      }
      return [];
    };

    const getFilename = (f: any) => typeof f === 'string' ? f : (f.name || f.filename);

    const beforeList = await getAudioList();
    const beforeNames = beforeList.map(getFilename);

    // Call the new API: /generate_clone_fn
    const result = await client.predict("/generate_clone_fn", {
      model_name: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
      text: text,
      language: "auto",
      ref_audio: handle_file(path.resolve(refAudioPath)),
      ref_text: refText,
      segment_gen: false,
      output_filename: `output_${Date.now()}.wav`
    });
    
    console.log("Gradio API Result:", JSON.stringify(result.data, null, 2));
    
    const afterList = await getAudioList();
    const newFiles = afterList.filter((f: any) => !beforeNames.includes(getFilename(f)));
    
    let gradioAudioUrl = null;
    if (newFiles.length > 0) {
      const newFile = newFiles[newFiles.length - 1];
      gradioAudioUrl = new URL(`/audio/download/${getFilename(newFile)}`, apiBaseUrl).toString();
    } else if (afterList.length > 0) {
      // Fallback: just take the last file in the list
      const lastFile = afterList[afterList.length - 1];
      gradioAudioUrl = new URL(`/audio/download/${getFilename(lastFile)}`, apiBaseUrl).toString();
    }

    let audioUrl = null;
    if (gradioAudioUrl) {
      try {
        // Download the audio from Gradio so we can name it correctly
        const audioRes = await fetch(gradioAudioUrl);
        if (audioRes.ok) {
          const buffer = await audioRes.arrayBuffer();
          const safeScriptName = (scriptName || 'script').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '');
          const safeLang = (language || 'zh').replace(/[^a-zA-Z0-9_-]/g, '');
          const safeIndex = parseInt(lineIndex) || 0;
          const fileName = `${safeScriptName}-${safeIndex}-${safeLang}.wav`;
          const filePath = path.join(UPLOADS_DIR, fileName);
          fs.writeFileSync(filePath, Buffer.from(buffer));
          audioUrl = `/uploads/${fileName}`;
        } else {
          audioUrl = gradioAudioUrl; // fallback
        }
      } catch (e) {
        console.error("Failed to download audio from Gradio", e);
        audioUrl = gradioAudioUrl; // fallback
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
