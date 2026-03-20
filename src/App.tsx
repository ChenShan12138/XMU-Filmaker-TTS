import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, RefreshCw, Loader2, CheckCircle2, AlertCircle, Mic, FileText, Plus, Trash2, Library, Wand2, Settings } from 'lucide-react';

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

interface Voice {
  id: string;
  name: string;
  gender: string;
  category: string;
  cv: string;
  copyright: string;
  ip: string;
  description: string;
  refText?: string;
  audioUrl: string;
}

interface Line {
  id: string;
  speaker: string;
  content: string;
  audioUrl: string | null;
  status: 'idle' | 'generating' | 'success' | 'error';
  errorMsg?: string;
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
    name: '', gender: '', category: '', cv: '', copyright: '', ip: '', description: '', refText: ''
  });
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [isSubmittingVoice, setIsSubmittingVoice] = useState(false);
  const [apiUrl, setApiUrl] = useState("http://127.0.0.1:7860/");
  const [isUpdatingUrl, setIsUpdatingUrl] = useState(false);

  useEffect(() => {
    fetchVoices();
    fetchApiUrl();
  }, []);

  const fetchApiUrl = async () => {
    try {
      const res = await fetch('/api/config/url');
      const data = await res.json();
      if (data.url) setApiUrl(data.url);
    } catch (e) {
      console.error("Failed to fetch API URL", e);
    }
  };

  const handleUpdateApiUrl = async () => {
    setIsUpdatingUrl(true);
    try {
      const res = await fetch('/api/config/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: apiUrl })
      });
      if (res.ok) {
        alert("API 地址更新成功");
      } else {
        alert("更新失败");
      }
    } catch (e) {
      alert("网络错误");
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
    if (!voiceFile) return alert("请上传参考音频文件");
    if (!voiceForm.name || !voiceForm.refText) return alert("角色名和参考音频文本为必填项");

    setIsSubmittingVoice(true);
    const formData = new FormData();
    formData.append('audio', voiceFile);
    Object.entries(voiceForm).forEach(([key, value]) => formData.append(key, value as string));

    try {
      const res = await fetch('/api/voices', { method: 'POST', body: formData });
      if (res.ok) {
        await fetchVoices();
        setIsAddingVoice(false);
        setVoiceForm({ name: '', gender: '', category: '', cv: '', copyright: '', ip: '', description: '', refText: '' });
        setVoiceFile(null);
      } else {
        const err = await res.json();
        alert("添加失败: " + err.error);
      }
    } catch (e) {
      console.error(e);
      alert("添加失败");
    } finally {
      setIsSubmittingVoice(false);
    }
  };

  const handleDeleteVoice = async (id: string) => {
    if (!confirm("确定要删除这个音色吗？")) return;
    try {
      await fetch(`/api/voices/${id}`, { method: 'DELETE' });
      await fetchVoices();
    } catch (e) {
      console.error(e);
    }
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
        alert("Failed to parse JSON file. Please ensure it is a valid script format.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const generateAudio = async (id: string, text: string, voiceId: string, lineIndex: number) => {
    setLines(prev => prev.map(line => 
      line.id === id ? { ...line, status: 'generating', errorMsg: undefined } : line
    ));

    try {
      const response = await fetch('/api/tts/clone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, voiceId, scriptName, lineIndex, language: 'zh' }),
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
        await generateAudio(line.id, line.content, voiceId, i);
      }
    }
    setIsGeneratingAll(false);
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

            {/* API Settings Section */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-zinc-800">API 配置</h2>
              </div>
              <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Qwen3 API 地址 (本地或公网)</label>
                  <input 
                    type="text" 
                    value={apiUrl} 
                    onChange={e => setApiUrl(e.target.value)} 
                    className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                    placeholder="例如: http://127.0.0.1:7860/ 或 https://xxxx.gradio.live/" 
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    提示: 如果你在本地运行模型，请确保使用公网 IP 或 Gradio 分享链接，除非此应用也运行在本地。
                  </p>
                </div>
                <button 
                  onClick={handleUpdateApiUrl}
                  disabled={isUpdatingUrl}
                  className="px-4 py-2 bg-zinc-800 text-white rounded-md text-sm font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  {isUpdatingUrl ? "更新中..." : "保存配置"}
                </button>
              </div>
            </section>

            {uniqueCharacters.length > 0 && (
              <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
                <h2 className="text-lg font-semibold mb-4">角色音色配置</h2>
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
                  <button
                    onClick={handleGenerateAll}
                    disabled={isGeneratingAll || !lines.some(l => characterVoices[l.speaker] && l.status !== 'success')}
                    className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {isGeneratingAll ? '生成中...' : '一键生成全部'}
                  </button>
                </div>
                
                <div className="space-y-4">
                  {lines.map((line, index) => {
                    const voiceId = characterVoices[line.speaker];
                    return (
                    <div key={line.id} className="bg-white p-5 rounded-xl shadow-sm border border-zinc-200 flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="inline-block bg-zinc-100 text-zinc-700 text-xs font-medium px-2.5 py-1 rounded-full">
                              {line.speaker}
                            </span>
                            {!voiceId && (
                              <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                未配置音色
                              </span>
                            )}
                          </div>
                          <p className="text-zinc-800 leading-relaxed">{line.content}</p>
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-2">
                          <button
                            onClick={() => generateAudio(line.id, line.content, voiceId!, index)}
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
                            download={`${scriptName}-${index}-zh.wav`}
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
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-zinc-700 mb-1">参考音频文本 *</label>
                    <textarea required value={voiceForm.refText} onChange={e => setVoiceForm({...voiceForm, refText: e.target.value})} className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-20" placeholder="必须与上传的参考音频内容完全一致" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-zinc-700 mb-1">参考音频文件 *</label>
                    <input required type="file" accept="audio/*" onChange={e => setVoiceFile(e.target.files?.[0] || null)} className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
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
                    <p className="text-xs font-medium text-zinc-700 mb-2">参考音频:</p>
                    <audio controls src={voice.audioUrl} className="w-full h-8" />
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
    </div>
  );
}
