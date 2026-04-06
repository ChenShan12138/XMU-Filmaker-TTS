import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, RefreshCw, Loader2, CheckCircle2, AlertCircle, Mic, FileText, Plus, Trash2, Library, Wand2, Settings, X, Edit2, Download } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface Scene {
  "scene information": {
    who: string[];
    where: string;
    what: string;
  };
  scene: Array<{
    speaker: string;
    content: string;
    shot?: string;
    actions?: any[];
    "current position"?: any[];
    shot_anchors?: string[];
    camera?: number;
    motion_description?: string;
  }>;
}

interface ReferenceAudio {
  id: string;
  audioPath: string;
  refText?: string;
  emotion: string;
  audioUrl: string;
}

interface Voice {
  id: string;
  name: string;
  gender: string;
  category: string;
  cv: string;
  copyright: string;
  ip: string;
  description: string;
  references: ReferenceAudio[];
}

interface Line {
  id: string;
  speaker: string;
  content: string;
  audioUrl: string | null;
  status: 'idle' | 'generating' | 'success' | 'error';
  errorMsg?: string;
  emotion?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'script' | 'voices'>('script');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [scriptName, setScriptName] = useState<string>('script');
  const [uniqueCharacters, setUniqueCharacters] = useState<string[]>([]);
  const [characterVoices, setCharacterVoices] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice Form State
  const [isAddingVoice, setIsAddingVoice] = useState(false);
  const [voiceForm, setVoiceForm] = useState({
    name: '', gender: '', category: '', cv: '', copyright: '', ip: '', description: ''
  });
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [isSubmittingVoice, setIsSubmittingVoice] = useState(false);
  
  const [apiUrl, setApiUrl] = useState("http://127.0.0.1:7860/");
  const [isUpdatingUrl, setIsUpdatingUrl] = useState(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [llmConfig, setLlmConfig] = useState({ apiKey: '', baseUrl: 'https://api.openai.com/v1', modelName: 'gpt-4o-mini' });
  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  // Custom Modals State
  const [alertDialog, setAlertDialog] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null);
  
  // Add Reference Modal State
  const [refModalVoiceId, setRefModalVoiceId] = useState<string | null>(null);
  const [refForm, setRefForm] = useState({ emotion: '默认', refText: '' });
  const [refFile, setRefFile] = useState<File | null>(null);
  const [isSubmittingRef, setIsSubmittingRef] = useState(false);

  const showAlert = (msg: string) => setAlertDialog(msg);
  const showConfirm = (msg: string, onConfirm: () => void) => setConfirmDialog({ message: msg, onConfirm });

  useEffect(() => {
    fetchVoices();
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config/url');
      const data = await res.json();
      if (data.url) setApiUrl(data.url);
      
      const llmRes = await fetch('/api/config/llm');
      const llmData = await llmRes.json();
      if (llmData.config) setLlmConfig(llmData.config);
    } catch (e) {
      console.error("Failed to fetch config", e);
    }
  };

  const handleSaveSettings = async () => {
    setIsUpdatingUrl(true);
    try {
      await fetch('/api/config/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: apiUrl })
      });
      await fetch('/api/config/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmConfig)
      });
      showAlert("设置保存成功");
      setIsSettingsOpen(false);
    } catch (e) {
      showAlert("网络错误");
    } finally {
      setIsUpdatingUrl(false);
    }
  };

  useEffect(() => {
    // Auto-match voices to characters when voices change
    setCharacterVoices(prev => {
      const updated = { ...prev };
      let changed = false;
      uniqueCharacters.forEach(char => {
        if (!updated[char]) {
          const matched = voices.find(v => v.name === char);
          if (matched) {
            updated[char] = matched.id;
            changed = true;
          }
        }
      });
      return changed ? updated : prev;
    });
  }, [voices, uniqueCharacters]);

  const fetchVoices = async () => {
    try {
      const res = await fetch('/api/voices');
      const data = await res.json();
      setVoices(data);
    } catch (e) {
      console.error("Failed to fetch voices", e);
    }
  };

  const handleAddVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceForm.name) return showAlert("角色名为必填项");
    if (!voiceFile) return showAlert("请上传默认情绪的参考音频");

    setIsSubmittingVoice(true);
    try {
      const res = await fetch('/api/voices', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voiceForm) 
      });
      if (!res.ok) throw new Error("Failed to create voice");
      const newVoice = await res.json();
      
      const formData = new FormData();
      formData.append('audio', voiceFile);
      formData.append('emotion', '默认');
      formData.append('refText', '');
      
      const refRes = await fetch(`/api/voices/${newVoice.id}/references`, { method: 'POST', body: formData });
      if (!refRes.ok) {
        throw new Error("Failed to upload reference audio");
      }
      
      await fetchVoices();
      setIsAddingVoice(false);
      setVoiceForm({ name: '', gender: '', category: '', cv: '', copyright: '', ip: '', description: '' });
      setVoiceFile(null);
    } catch (e) {
      console.error(e);
      showAlert("添加失败");
    } finally {
      setIsSubmittingVoice(false);
    }
  };

  const submitAddReference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refModalVoiceId || !refFile) return showAlert("请选择音频文件");
    if (!refForm.emotion) return showAlert("请输入情绪标签");

    setIsSubmittingRef(true);
    const formData = new FormData();
    formData.append('audio', refFile);
    formData.append('emotion', refForm.emotion);
    formData.append('refText', refForm.refText);

    try {
      const res = await fetch(`/api/voices/${refModalVoiceId}/references`, { method: 'POST', body: formData });
      if (res.ok) {
        await fetchVoices();
        setRefModalVoiceId(null);
        setRefForm({ emotion: '默认', refText: '' });
        setRefFile(null);
      } else {
        showAlert("添加参考音频失败");
      }
    } catch (e) {
      console.error(e);
      showAlert("添加参考音频失败");
    } finally {
      setIsSubmittingRef(false);
    }
  };

  const handleDeleteReference = async (voiceId: string, refId: string) => {
    showConfirm("确定要删除这条参考音频吗？", async () => {
      try {
        await fetch(`/api/voices/${voiceId}/references/${refId}`, { method: 'DELETE' });
        await fetchVoices();
      } catch (e) {
        console.error(e);
      }
    });
  };

  const handleDeleteVoice = async (id: string) => {
    showConfirm("确定要删除这个音色吗？", async () => {
      try {
        await fetch(`/api/voices/${id}`, { method: 'DELETE' });
        await fetchVoices();
      } catch (e) {
        console.error(e);
      }
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setScriptName(file.name.replace(/\.[^/.]+$/, ""));
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data: Scene[] = JSON.parse(content);
        
        const extractedLines: Line[] = [];
        const chars = new Set<string>();
        
        data.forEach((sceneObj, sceneIndex) => {
          sceneObj.scene.forEach((dialog, dialogIndex) => {
            if (dialog.content && dialog.speaker) {
              const speakerName = dialog.speaker === 'default' ? '旁白' : dialog.speaker;
              chars.add(speakerName);
              
              extractedLines.push({
                id: `${sceneIndex}-${dialogIndex}`,
                speaker: speakerName,
                content: dialog.content,
                audioUrl: null,
                status: 'idle'
              });
            }
          });
        });
        
        const uniqueCharsArray = Array.from(chars);
        setUniqueCharacters(uniqueCharsArray);
        setLines(extractedLines);
        
        // Initial auto-match
        const newCharVoices: Record<string, string> = {};
        uniqueCharsArray.forEach(char => {
          const matchedVoice = voices.find(v => v.name === char);
          if (matchedVoice) {
            newCharVoices[char] = matchedVoice.id;
          }
        });
        setCharacterVoices(newCharVoices);
      } catch (error) {
        console.error("Failed to parse JSON:", error);
        showAlert("Failed to parse JSON file. Please ensure it is a valid script format.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const generateAudio = async (id: string, text: string, voiceId: string, lineIndex: number, emotion?: string) => {
    setLines(prev => prev.map(line => 
      line.id === id ? { ...line, status: 'generating', errorMsg: undefined } : line
    ));

    try {
      const response = await fetch('/api/tts/clone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, voiceId, scriptName, lineIndex, language: 'zh', emotion }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate audio');
      }

      setLines(prev => prev.map(line => 
        line.id === id ? { ...line, status: 'success', audioUrl: data.audioUrl } : line
      ));
    } catch (error) {
      console.error("Generation error:", error);
      setLines(prev => prev.map(line => 
        line.id === id ? { ...line, status: 'error', errorMsg: String(error) } : line
      ));
    }
  };

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const voiceId = characterVoices[line.speaker];
      if (line.status !== 'success' && voiceId) {
        await generateAudio(line.id, line.content, voiceId, i, line.emotion);
      }
    }
    setIsGeneratingAll(false);
  };

  const handleAutoSelect = async () => {
    if (!llmConfig.apiKey) {
      showAlert("请先在设置中配置 LLM API Key");
      setIsSettingsOpen(true);
      return;
    }
    setIsAutoSelecting(true);
    try {
      const prompt = `
你是一个专业的配音导演。请根据以下剧本和可用的音色库，为每个角色分配最合适的音色，并为每句台词分配最合适的情绪。

可用音色库:
${JSON.stringify(voices.map(v => ({ id: v.id, name: v.name, description: v.description, gender: v.gender, category: v.category, availableEmotions: v.references?.map((r: any) => r.emotion) || [] })), null, 2)}

剧本角色:
${uniqueCharacters.join(', ')}

剧本台词:
${JSON.stringify(lines.map(l => ({ id: l.id, speaker: l.speaker, content: l.content })), null, 2)}

请返回 JSON 格式，包含两个字段：
1. characterVoices: 键为角色名，值为选中的音色 ID。
2. lineEmotions: 键为台词 ID，值为选中的情绪（必须是该音色 availableEmotions 中的一个，如果没有则填 "默认"）。

JSON 格式示例:
{
  "characterVoices": { "角色A": "voice-id-1" },
  "lineEmotions": { "0-0": "开心" }
}
`;

      const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmConfig.apiKey}`
        },
        body: JSON.stringify({
          model: llmConfig.modelName,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) throw new Error("LLM API 请求失败");
      const data = await response.json();
      const content = JSON.parse(data.choices[0].message.content);

      if (content.characterVoices) {
        setCharacterVoices(prev => ({ ...prev, ...content.characterVoices }));
      }
      if (content.lineEmotions) {
        setLines(prev => prev.map(line => ({
          ...line,
          emotion: content.lineEmotions[line.id] || line.emotion
        })));
      }
      showAlert("智能分配完成！");
    } catch (error) {
      console.error(error);
      showAlert("智能分配失败: " + String(error));
    } finally {
      setIsAutoSelecting(false);
    }
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      let hasAudio = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.audioUrl) {
          hasAudio = true;
          const response = await fetch(line.audioUrl);
          const blob = await response.blob();
          zip.file(`${i}.wav`, blob);
        }
      }

      if (!hasAudio) {
        showAlert("没有可下载的音频");
        return;
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${scriptName}_audios.zip`);
    } catch (error) {
      console.error("Failed to create zip:", error);
      showAlert("打包下载失败");
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans pb-20">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Filmaker TTS配音生成</h1>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
              title="设置"
            >
              <Settings className="w-5 h-5" />
            </button>
            <div className="flex space-x-1 bg-zinc-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('script')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'script' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                <FileText className="w-4 h-4" />
                剧本配音
              </button>
              <button
                onClick={() => setActiveTab('voices')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'voices' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                <Library className="w-4 h-4" />
                音色库
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 mt-8">
        {activeTab === 'script' && (
          <div className="space-y-6">
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">上传剧本</h2>
                  <p className="text-sm text-zinc-500">选择包含台词的 JSON 剧本文件</p>
                </div>
                <div>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {isUploading ? '解析中...' : '选择 JSON 文件'}
                  </button>
                </div>
              </div>
            </section>

            {uniqueCharacters.length > 0 && (
              <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">角色音色配置</h2>
                  <button
                    onClick={handleAutoSelect}
                    disabled={isAutoSelecting || voices.length === 0}
                    className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isAutoSelecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    一键智能分配
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {uniqueCharacters.map(char => (
                    <div key={char} className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                      <span className="font-medium text-zinc-700 truncate mr-2" title={char}>{char}</span>
                      <select
                        value={characterVoices[char] || ''}
                        onChange={(e) => setCharacterVoices(prev => ({ ...prev, [char]: e.target.value }))}
                        className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40 flex-shrink-0"
                      >
                        <option value="">-- 选择音色 --</option>
                        {voices.map(v => (
                          <option key={v.id} value={v.id}>{v.name} ({v.category || '未分类'})</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {lines.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">台词列表 ({lines.length})</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadZip}
                      disabled={isZipping || !lines.some(l => l.audioUrl)}
                      className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                      {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {isZipping ? '打包中...' : '一键下载ZIP'}
                    </button>
                    <button
                      onClick={handleGenerateAll}
                      disabled={isGeneratingAll || !lines.some(l => characterVoices[l.speaker] && l.status !== 'success')}
                      className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                      {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      {isGeneratingAll ? '生成中...' : '一键生成全部'}
                    </button>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {lines.map((line, index) => {
                    const voiceId = characterVoices[line.speaker];
                    return (
                    <div key={line.id} className="bg-white p-5 rounded-xl shadow-sm border border-zinc-200 flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-sm font-bold text-zinc-400">
                              {index}.
                            </span>
                            <span className="inline-block bg-zinc-100 text-zinc-700 text-xs font-medium px-2.5 py-1 rounded-full">
                              {line.speaker}
                            </span>
                            {!voiceId && (
                              <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                未配置音色
                              </span>
                            )}
                            {voiceId && (
                              <select
                                value={line.emotion || voices.find(v => v.id === voiceId)?.references?.[0]?.emotion || ''}
                                onChange={(e) => setLines(prev => prev.map(l => l.id === line.id ? { ...l, emotion: e.target.value } : l))}
                                className="text-xs border border-zinc-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-indigo-500"
                              >
                                {voices.find(v => v.id === voiceId)?.references?.map((r: any) => (
                                  <option key={r.id} value={r.emotion}>{r.emotion}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          <p className="text-zinc-800 leading-relaxed">{line.content}</p>
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-2">
                          <button
                            onClick={() => generateAudio(line.id, line.content, voiceId!, index, line.emotion)}
                            disabled={line.status === 'generating' || !voiceId || isGeneratingAll}
                            className="flex items-center gap-2 bg-zinc-100 text-zinc-900 px-3 py-1.5 rounded-lg hover:bg-zinc-200 transition-colors text-sm font-medium disabled:opacity-50"
                          >
                            {line.status === 'generating' ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : line.status === 'success' ? (
                              <RefreshCw className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                            {line.status === 'generating' ? '生成中...' : line.status === 'success' ? '重新生成' : '生成'}
                          </button>
                          
                          {line.status === 'success' && (
                            <div className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              完成
                            </div>
                          )}
                          {line.status === 'error' && (
                            <div className="flex items-center gap-1 text-red-600 text-xs font-medium" title={line.errorMsg}>
                              <AlertCircle className="w-3 h-3" />
                              失败
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {line.audioUrl && (
                        <div className="pt-3 border-t border-zinc-100 flex items-center gap-4">
                          <audio controls src={line.audioUrl} className="flex-1 h-10" />
                          <a 
                            href={line.audioUrl} 
                            download={`${index}.wav`}
                            className="flex items-center gap-1 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
                            title="下载音频"
                          >
                            <Upload className="w-4 h-4 rotate-180" />
                            下载
                          </a>
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'voices' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">音色库管理</h2>
              <button
                onClick={() => setIsAddingVoice(!isAddingVoice)}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                {isAddingVoice ? '取消添加' : <><Plus className="w-4 h-4" /> 添加音色</>}
              </button>
            </div>

            {isAddingVoice && (
              <form onSubmit={handleAddVoice} className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 space-y-4">
                <h3 className="font-medium text-lg border-b border-zinc-100 pb-2">新增音色</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">角色名 *</label>
                    <input required type="text" value={voiceForm.name} onChange={e => setVoiceForm({...voiceForm, name: e.target.value})} className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="例如: 医生伊芙琳" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">默认情绪音频 *</label>
                    <input required type="file" accept="audio/*" onChange={e => setVoiceFile(e.target.files?.[0] || null)} className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">性别</label>
                    <input type="text" value={voiceForm.gender} onChange={e => setVoiceForm({...voiceForm, gender: e.target.value})} className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="例如: 女" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">类别</label>
                    <input type="text" value={voiceForm.category} onChange={e => setVoiceForm({...voiceForm, category: e.target.value})} className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="例如: 科幻/成熟" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">CV</label>
                    <input type="text" value={voiceForm.cv} onChange={e => setVoiceForm({...voiceForm, cv: e.target.value})} className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="配音演员名字" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">版权方</label>
                    <input type="text" value={voiceForm.copyright} onChange={e => setVoiceForm({...voiceForm, copyright: e.target.value})} className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">IP出处</label>
                    <input type="text" value={voiceForm.ip} onChange={e => setVoiceForm({...voiceForm, ip: e.target.value})} className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-zinc-700 mb-1">音色描述</label>
                    <input type="text" value={voiceForm.description} onChange={e => setVoiceForm({...voiceForm, description: e.target.value})} className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="例如: 声音清脆，带有一丝忧郁" />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button type="submit" disabled={isSubmittingVoice} className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50">
                    {isSubmittingVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    保存音色
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {voices.map(voice => (
                <div key={voice.id} className="bg-white p-5 rounded-xl shadow-sm border border-zinc-200 flex flex-col">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-lg text-zinc-900">{voice.name}</h3>
                    <button onClick={() => handleDeleteVoice(voice.id)} className="text-zinc-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs text-zinc-500 space-y-1 mb-4 flex-1">
                    <p><span className="font-medium">性别:</span> {voice.gender || '-'}</p>
                    <p><span className="font-medium">类别:</span> {voice.category || '-'}</p>
                    <p><span className="font-medium">CV:</span> {voice.cv || '-'}</p>
                    <p><span className="font-medium">IP:</span> {voice.ip || '-'}</p>
                    {voice.description && <p className="line-clamp-2 mt-2"><span className="font-medium">描述:</span> {voice.description}</p>}
                  </div>
                  <div className="pt-3 border-t border-zinc-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-zinc-700">参考音频 ({voice.references?.length || 0})</p>
                      <button 
                        onClick={() => setRefModalVoiceId(voice.id)}
                        className="cursor-pointer text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> 添加
                      </button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {voice.references?.map((ref: any) => (
                        <div key={ref.id} className="bg-zinc-50 p-2 rounded border border-zinc-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-zinc-700 bg-white px-1.5 py-0.5 rounded border border-zinc-200">{ref.emotion}</span>
                            <button onClick={() => handleDeleteReference(voice.id, ref.id)} className="text-zinc-400 hover:text-red-500">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          {ref.refText && <p className="text-[10px] text-zinc-500 mb-1 truncate" title={ref.refText}>{ref.refText}</p>}
                          <audio controls src={ref.audioUrl} className="w-full h-6" />
                        </div>
                      ))}
                      {(!voice.references || voice.references.length === 0) && (
                        <p className="text-xs text-zinc-400 text-center py-2">暂无参考音频</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {voices.length === 0 && !isAddingVoice && (
                <div className="col-span-full py-12 text-center text-zinc-500 bg-white rounded-xl border border-zinc-200 border-dashed">
                  暂无音色，请点击右上角添加
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-100">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                系统设置
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-zinc-900 border-b border-zinc-100 pb-2">Qwen3 TTS API 配置</h3>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">API 地址 (本地或公网)</label>
                  <input 
                    type="text" 
                    value={apiUrl} 
                    onChange={e => setApiUrl(e.target.value)} 
                    className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                    placeholder="例如: http://127.0.0.1:7860/" 
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-zinc-900 border-b border-zinc-100 pb-2">LLM API 配置 (用于智能分配音色)</h3>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Base URL</label>
                  <input 
                    type="text" 
                    value={llmConfig.baseUrl} 
                    onChange={e => setLlmConfig({...llmConfig, baseUrl: e.target.value})} 
                    className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">API Key</label>
                  <input 
                    type="password" 
                    value={llmConfig.apiKey} 
                    onChange={e => setLlmConfig({...llmConfig, apiKey: e.target.value})} 
                    className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Model Name</label>
                  <input 
                    type="text" 
                    value={llmConfig.modelName} 
                    onChange={e => setLlmConfig({...llmConfig, modelName: e.target.value})} 
                    className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-zinc-100 flex justify-end gap-2 bg-zinc-50">
              <button onClick={() => setIsSettingsOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors">
                取消
              </button>
              <button onClick={handleSaveSettings} disabled={isUpdatingUrl} className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                {isUpdatingUrl && <Loader2 className="w-4 h-4 animate-spin" />}
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Custom Alert Modal */}
      {alertDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
            <h3 className="text-lg font-semibold mb-2">提示</h3>
            <p className="text-zinc-600 text-sm mb-6">{alertDialog}</p>
            <div className="flex justify-end">
              <button onClick={() => setAlertDialog(null)} className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors">确定</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirm Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
            <h3 className="text-lg font-semibold mb-2">确认操作</h3>
            <p className="text-zinc-600 text-sm mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors">取消</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors">确认</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Reference Modal */}
      {refModalVoiceId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-100">
              <h2 className="text-lg font-semibold">添加参考音频</h2>
              <button onClick={() => { setRefModalVoiceId(null); setRefFile(null); }} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitAddReference} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">情绪标签 *</label>
                <input 
                  required 
                  type="text" 
                  value={refForm.emotion} 
                  onChange={e => setRefForm({...refForm, emotion: e.target.value})} 
                  className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="例如: 开心, 悲伤, 愤怒, 默认" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">参考音频文本 (选填)</label>
                <textarea 
                  value={refForm.refText} 
                  onChange={e => setRefForm({...refForm, refText: e.target.value})} 
                  className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-20" 
                  placeholder="音频对应的文本内容" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">音频文件 *</label>
                <input 
                  required 
                  type="file" 
                  accept="audio/*" 
                  onChange={e => setRefFile(e.target.files?.[0] || null)} 
                  className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <button type="button" onClick={() => { setRefModalVoiceId(null); setRefFile(null); }} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 rounded-lg transition-colors">
                  取消
                </button>
                <button type="submit" disabled={isSubmittingRef || !refFile} className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                  {isSubmittingRef && <Loader2 className="w-4 h-4 animate-spin" />}
                  确认添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
