import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EnvelopeIcon, SparklesIcon, XCircleIcon, CheckCircleIcon, ClockIcon, EyeIcon, ExclamationCircleIcon, CloudIcon, PlayIcon, LightBulbIcon, InformationCircleIcon, BoltIcon, ChartBarIcon, ArrowPathIcon, QuestionMarkCircleIcon, Cog6ToothIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { TableCellsIcon, FolderArrowDownIcon, ClipboardDocumentListIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';
import JSZip from 'jszip';
import FileUpload from './components/FileUpload';
import AnalysisCard from './components/AnalysisCard';
import ActionSummary from './components/ActionSummary';
import { SettingsModal } from './components/SettingsModal';
import { analyzeMailItem } from './services/geminiService';
import { initGoogleDrive, authenticateDrive, openFolderPicker, listFilesInFolder, getFileBase64 } from './services/googleDriveService';
import { optimizeFile } from './services/optimizationService';
import { BatchItem, ClassificationType } from './types';

const HEAVY_FILE_THRESHOLD = 8 * 1024 * 1024; // 8MB

const EFFICIENCY_TIPS = [
    "DPI Matters: 150-200 DPI is the sweet spot. Higher resolutions slow down AI analysis without adding accuracy.",
    "File Naming: UK Postbox reference IDs in filenames help the AI verify identity more quickly.",
    "B&W vs Color: Greyscale scans upload 4x faster and are often easier for the AI to OCR.",
    "ZIP Power: Uploading a ZIP of 50 files is significantly more reliable than dragging 50 individual items.",
    "Multi-Letter PDFs: One PDF containing 10 letters? No problem. Our AI splits them automatically.",
    "Avoid Shadows: High-contrast shadows in phone-scanned mail can confuse address detection logic."
];

// Helper to safely infer MIME type if the browser misses it (common with ZIPs)
const inferMimeType = (filename: string, existingType?: string): string => {
    if (existingType && existingType.trim() !== "") return existingType;
    
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'pdf': return 'application/pdf';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'webp': return 'image/webp';
        case 'heic': return 'image/heic';
        case 'heif': return 'image/heif';
        default: return ''; // Let the service handle the error if unknown
    }
};

const App: React.FC = () => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  
  // Settings & Optimization State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOptimizeEnabled, setIsOptimizeEnabled] = useState(false);
  
  // Drive State
  const [driveConfig, setDriveConfig] = useState<{ id: string; name: string } | null>(null);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  
  // Progress Engine State
  const engineActiveRef = useRef<boolean>(false);
  const itemsRef = useRef<BatchItem[]>([]);
  const [statusHeartbeat, setStatusHeartbeat] = useState("System Ready");
  
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Tip Rotation logic
  useEffect(() => {
    const interval = setInterval(() => {
        setTipIndex(prev => (prev + 1) % EFFICIENCY_TIPS.length);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Load persisted drive config
    const savedConfig = localStorage.getItem('ukpostbox_drive_config');
    if (savedConfig) {
        try {
            setDriveConfig(JSON.parse(savedConfig));
        } catch (e) {
            localStorage.removeItem('ukpostbox_drive_config');
        }
    }
    
    // Attempt initialization
    initGoogleDrive()
        .then((success) => {
            setIsInitializing(false);
            if (!success) {
                console.warn("Google Drive initialization returned false. Configuration may be missing or invalid.");
                setInitError(true);
                // If we know keys are missing, we could prompt user immediately, 
                // but let's just let the UI show the warning icon to be less intrusive.
            }
        })
        .catch((e) => {
            console.error("Google Drive init error:", e);
            setIsInitializing(false);
            setInitError(true);
        });
  }, []);

  const handleConnectDrive = async () => {
      if (initError) {
          setIsSettingsOpen(true);
          return;
      }

      setIsDriveLoading(true);
      try {
          const token = await authenticateDrive();
          const folder = await openFolderPicker(token);
          if (folder) {
              setDriveConfig(folder);
              localStorage.setItem('ukpostbox_drive_config', JSON.stringify(folder));
          }
      } catch (e: any) {
          if (e.message && e.message.includes("User cancelled")) {
              // Ignore cancellation
          } else {
              alert(`Drive Connection Failed: ${e.message || e}`);
              // If it failed due to init issues, prompting settings might help
              if (e.message && (e.message.includes("not initialized") || e.message.includes("origin mismatch"))) {
                  setIsSettingsOpen(true);
              }
          }
      } finally {
          setIsDriveLoading(false);
      }
  };

  const handleDisconnectDrive = () => {
      if (confirm("Disconnect Google Drive Folder?")) {
          setDriveConfig(null);
          localStorage.removeItem('ukpostbox_drive_config');
      }
  };

  const handleImportFromDrive = async () => {
      if (!driveConfig) return;
      setIsExtracting(true);
      setStatusHeartbeat(`Scanning folder "${driveConfig.name}"...`);
      try {
          const files = await listFilesInFolder(driveConfig.id);
          if (files.length === 0) {
              alert("No suitable files (PDF/Image) found in the selected folder.");
              return;
          }
          
          const newItems: BatchItem[] = files.map(f => ({
              id: Math.random().toString(36).substr(2, 9),
              driveFileId: f.id,
              driveMimeType: f.mimeType,
              name: f.name,
              status: 'idle',
              previewUrl: f.thumbnailLink // Drive provides thumbnails
          }));
          
          // Filter out duplicates based on driveFileId
          const existingIds = new Set(items.map(i => i.driveFileId).filter(Boolean));
          const uniqueItems = newItems.filter(i => !existingIds.has(i.driveFileId));

          if (uniqueItems.length === 0) {
              setStatusHeartbeat("No new files found to import.");
          } else {
              setItems(prev => [...prev, ...uniqueItems]);
              setStatusHeartbeat(`Successfully queued ${uniqueItems.length} items from Drive.`);
          }
      } catch (e: any) {
          alert("Failed to list files from Drive: " + e.message);
      } finally {
          setIsExtracting(false);
          setTimeout(() => setStatusHeartbeat("Ready for processing"), 2000);
      }
  };

  const handleFilesAdd = async (files: File[]) => {
    if (files.length === 0) return;
    setIsExtracting(true);
    
    // Initial status
    setStatusHeartbeat(isOptimizeEnabled ? "Turbo Mode: Optimizing images..." : `Preparing ${files.length} items for queue...`);
    
    try {
        const processedItems: BatchItem[] = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            if (isOptimizeEnabled) {
                setStatusHeartbeat(`Optimizing ${i + 1}/${files.length}: ${file.name}`);
            }

            const isZip = file.name.toLowerCase().endsWith('.zip');
            if (isZip) {
                const zip = new JSZip();
                const loaded = await zip.loadAsync(file);
                for (const name of Object.keys(loaded.files)) {
                    if (name.includes('__MACOSX') || name.startsWith('.')) continue;
                    const entry = loaded.files[name];
                    if (entry.dir) continue;
                    const blob = await entry.async('blob');
                    
                    let processedFile = new File([blob], name.split('/').pop()!, { type: blob.type || '' });
                    
                    // Recursive optimization for ZIP contents if enabled
                    if (isOptimizeEnabled) {
                        try {
                            processedFile = await optimizeFile(processedFile);
                        } catch (err) {
                            console.warn("Failed to optimize inner zip file:", name, err);
                        }
                    }

                    processedItems.push({
                        id: Math.random().toString(36).substr(2, 9),
                        file: processedFile,
                        name: name.split('/').pop()!,
                        status: 'idle',
                        previewUrl: URL.createObjectURL(processedFile)
                    });
                }
            } else {
                let processedFile = file;
                if (isOptimizeEnabled) {
                     processedFile = await optimizeFile(file);
                }

                processedItems.push({
                    id: Math.random().toString(36).substr(2, 9),
                    file: processedFile,
                    name: processedFile.name,
                    status: 'idle',
                    previewUrl: URL.createObjectURL(processedFile)
                });
            }
        }
        setItems(prev => [...prev, ...processedItems]);
    } catch (e: any) {
        alert("Could not process your files: " + e.message);
    } finally {
        setIsExtracting(false);
        setStatusHeartbeat("Ready");
    }
  };

  const startEngine = useCallback(async () => {
    if (engineActiveRef.current) return;
    engineActiveRef.current = true;

    while (true) {
      const next = itemsRef.current.find(i => i.status === 'idle');
      if (!next) break;

      setProcessingId(next.id);
      setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'analyzing', statusMessage: 'Preparing document...' } : i));
      setStatusHeartbeat("Initializing AI Analyst...");

      try {
        let base64 = "";
        let mime = "application/pdf";
        let fileObj = next.file;

        if (next.driveFileId) {
            setStatusHeartbeat("Downloading file from Google Drive...");
            base64 = await getFileBase64(next.driveFileId);
            if (next.driveMimeType) mime = next.driveMimeType;
            
            // Reconstruct File object for UI components (download/preview/upload)
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mime });
            fileObj = new File([blob], next.name, { type: mime });
        } else if (next.file) {
            // Apply robust inference here
            mime = inferMimeType(next.name, next.file.type);
            setStatusHeartbeat("Reading local file...");
            
            base64 = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = () => res((r.result as string).split(',')[1]);
                r.onerror = () => rej(new Error("Local file read failed. Check permissions."));
                r.readAsDataURL(next.file!);
            });
        }

        const results = await analyzeMailItem(base64, mime, { filename: next.name }, (msg) => {
            setItems(prev => prev.map(i => i.id === next.id ? { ...i, statusMessage: msg } : i));
            setStatusHeartbeat(msg);
        });

        setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'success', results, file: fileObj } : i));
      } catch (error: any) {
        setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'error', error: error.message } : i));
        setStatusHeartbeat("Analysis failed for current item.");
      } finally {
        setStatusHeartbeat("Pacing requests (Rate Limit Guard)...");
        await new Promise(res => setTimeout(res, 8500));
      }
    }
    setProcessingId(null);
    engineActiveRef.current = false;
    setStatusHeartbeat("Queue finished. All tasks complete.");
  }, []);

  useEffect(() => {
    if (items.some(i => i.status === 'idle') && !engineActiveRef.current) startEngine();
  }, [items, startEngine]);

  const completedCount = items.filter(i => i.status === 'success' || i.status === 'error').length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  
  const estMinutesLeft = Math.ceil(((totalCount - completedCount) * 30) / 60);

  if (isInitializing) {
    return (
        <div className="h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 bg-brand-600 rounded-2xl animate-bounce shadow-xl flex items-center justify-center text-white mb-4">
                <EnvelopeIcon className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Initializing Intelligence Center</h2>
            <p className="text-slate-400 text-sm mt-1">Connecting to Google Drive & AI Services...</p>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-brand-100 selection:text-brand-900">
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      
      <header className="bg-white/80 border-b border-slate-200 sticky top-0 z-50 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-600 p-2 rounded-xl shadow-lg">
                <EnvelopeIcon className="w-5 h-5 text-white" />
            </div>
            <div>
                <h1 className="font-bold text-slate-800 leading-none">UK Postbox AI</h1>
                <p className="text-[10px] font-black uppercase text-brand-500 tracking-widest mt-1">Smart Routing</p>
            </div>
          </div>
          
          {totalCount > 0 && (
              <div className="flex-1 max-w-md mx-8 hidden sm:block">
                  <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                          <ChartBarIcon className="w-3 h-3 text-slate-400" />
                          <span className="text-[10px] font-black uppercase text-slate-400">Queue Progress</span>
                      </div>
                      <span className="text-[10px] font-black text-brand-600">{Math.round(progressPercent)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-600 transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }} />
                  </div>
              </div>
          )}

          <div className="flex items-center gap-3">
            {/* Drive Integration */}
            <div className="hidden sm:flex items-center gap-2">
                <button
                    onClick={driveConfig ? handleImportFromDrive : handleConnectDrive}
                    disabled={isDriveLoading}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all
                        ${driveConfig 
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' 
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-600'
                        }
                    `}
                    title={driveConfig ? `Import items from folder: ${driveConfig.name}` : "Connect Google Drive to import/save items"}
                >
                    {isDriveLoading ? (
                        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                    ) : driveConfig ? (
                        <CloudIcon className="w-3.5 h-3.5" />
                    ) : (
                        <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" className="w-3.5 h-3.5" alt="Drive" />
                    )}
                    {isDriveLoading ? 'Connecting...' : driveConfig ? `Scan: ${driveConfig.name}` : 'Connect Drive'}
                </button>
                
                {driveConfig && (
                    <button
                        onClick={handleDisconnectDrive}
                        className="p-1.5 text-slate-300 hover:text-red-400 transition-colors rounded-full hover:bg-red-50"
                        title="Disconnect Folder"
                    >
                        <XCircleIcon className="w-5 h-5" />
                    </button>
                )}
            </div>

            {processingId && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-full text-[10px] font-black uppercase border border-brand-100 animate-pulse">
                    <BoltIcon className="w-3 h-3 text-brand-500" />
                    {statusHeartbeat}
                </div>
            )}
            
            <div className="h-6 w-px bg-slate-200 mx-1"></div>

            <button
                onClick={() => setIsSettingsOpen(true)}
                className={`p-2 rounded-full transition-colors relative ${initError ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-brand-600 hover:bg-slate-50'}`}
                title="API Settings"
            >
                <Cog6ToothIcon className="w-5 h-5" />
                {initError && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                    </span>
                )}
            </button>

            <button 
                onClick={() => { if(confirm("Discard current batch?")) window.location.reload(); }} 
                className="p-2 text-slate-400 hover:text-red-600 transition-colors rounded-full hover:bg-slate-50"
                title="Reset Workspace"
            >
                <XCircleIcon className="w-5 h-5"/>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <ActionSummary items={items} />
          
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-4 border-slate-200">
                <div className="flex items-center gap-2">
                    <FolderArrowDownIcon className="w-5 h-5 text-slate-400" />
                    <h2 className="font-bold text-slate-700">Analysis Queue</h2>
                    <span className="bg-slate-200 text-slate-600 text-[10px] font-black px-2 py-0.5 rounded-full">{items.length} Files</span>
                </div>
                {estMinutesLeft > 0 && (
                    <div className="text-[10px] font-black uppercase text-slate-500 bg-white px-3 py-1 rounded-lg border border-slate-200">
                        Remaining: ~{estMinutesLeft}m
                    </div>
                )}
            </div>
            
            {items.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] p-16 text-center space-y-6">
                    <div className="bg-slate-50 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto rotate-6 shadow-inner">
                        <CloudIcon className="w-10 h-10 text-slate-300" />
                    </div>
                    <div className="max-w-sm mx-auto">
                        <h3 className="text-xl font-bold text-slate-800">Your mailroom is ready</h3>
                        <p className="text-sm text-slate-500 mt-1">Upload your UK Postbox scans to begin automated routing and metadata extraction.</p>
                    </div>
                    <div className="max-w-xs mx-auto pt-4 space-y-3">
                        <FileUpload 
                            onFilesSelect={handleFilesAdd} 
                            isProcessing={isExtracting} 
                            onOptimizeToggle={setIsOptimizeEnabled}
                            isOptimizeEnabled={isOptimizeEnabled}
                        />
                        
                        {driveConfig ? (
                            <button
                                onClick={handleImportFromDrive}
                                disabled={isExtracting}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-blue-100 bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-widest hover:bg-blue-100 transition-all"
                            >
                                <CloudIcon className="w-4 h-4" />
                                Import from {driveConfig.name}
                            </button>
                        ) : (
                            <button
                                onClick={handleConnectDrive}
                                disabled={isDriveLoading}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-600 text-xs font-bold uppercase tracking-widest hover:bg-slate-50 hover:text-slate-800 transition-all"
                            >
                                <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" className="w-4 h-4" alt="Drive" />
                                {initError ? 'Check API Settings' : 'Connect Google Drive'}
                            </button>
                        )}
                        {initError && (
                             <button onClick={() => setIsSettingsOpen(true)} className="w-full flex items-center justify-center gap-1.5 text-[10px] text-amber-600 font-bold bg-amber-50 p-2 rounded-lg hover:bg-amber-100 transition-colors">
                                <ExclamationTriangleIcon className="w-3 h-3" />
                                API Config Missing or Invalid. Click to Fix.
                             </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {items.map(item => (
                        <div key={item.id} className={`bg-white rounded-3xl border transition-all duration-500 ${item.id === processingId ? 'border-brand-400 shadow-xl ring-4 ring-brand-50' : 'border-slate-200 shadow-sm'}`}>
                            <div className="p-5 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        {item.status === 'analyzing' ? (
                                            <div className="bg-brand-50 p-3 rounded-2xl border border-brand-100">
                                                <ArrowPathIcon className="w-6 h-6 text-brand-600 animate-spin"/>
                                            </div>
                                        ) : item.status === 'success' ? (
                                            <div className="bg-green-50 p-3 rounded-2xl border border-green-100">
                                                <CheckCircleIcon className="w-6 h-6 text-green-600"/>
                                            </div>
                                        ) : item.status === 'error' ? (
                                            <div className="bg-red-50 p-3 rounded-2xl border border-red-100">
                                                <ExclamationCircleIcon className="w-6 h-6 text-red-600"/>
                                            </div>
                                        ) : (
                                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                                <ClockIcon className="w-6 h-6 text-slate-300"/>
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-black text-slate-800 truncate" title={item.name}>{item.name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${item.status === 'analyzing' ? 'text-brand-600' : item.status === 'error' ? 'text-red-600' : 'text-slate-400'}`}>
                                                {item.statusMessage || item.status.replace(/_/g, ' ')}
                                            </span>
                                            {(item.file?.size || 0) > HEAVY_FILE_THRESHOLD && (
                                                <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-black border border-amber-100">LARGE</span>
                                            )}
                                            {item.driveFileId && (
                                                <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-black border border-blue-100 flex items-center gap-1">
                                                    <CloudIcon className="w-2 h-2" /> DRIVE
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {item.results && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                                            {item.results.length} Pieces found
                                        </span>
                                    </div>
                                )}
                            </div>
                            {item.results && (
                                <div className="px-5 pb-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-700">
                                    <div className="border-t border-slate-50 pt-5 grid grid-cols-1 gap-5">
                                        {item.results.map((r, i) => (
                                            <AnalysisCard 
                                                key={i} 
                                                result={r} 
                                                originalFile={item.file!} 
                                                driveConfig={driveConfig}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {item.error && (
                                <div className="px-5 pb-5 animate-in slide-in-from-top-2">
                                    <div className="bg-red-50 border border-red-100 p-4 rounded-[1.5rem] flex items-start gap-4">
                                        <ExclamationCircleIcon className="w-6 h-6 text-red-500 mt-1" />
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs font-black text-red-900 uppercase">Analysis Interrupted</p>
                                                <QuestionMarkCircleIcon className="w-4 h-4 text-red-300 cursor-help" title="Possible causes: Corrupted PDF, Unsupported file type, or Password protection." />
                                            </div>
                                            <p className="text-[11px] font-medium text-red-700 mt-1 leading-relaxed">{item.error}</p>
                                            <div className="mt-4 flex gap-3">
                                                <button 
                                                    onClick={() => setItems(prev => prev.map(i => i.id === item.id ? {...i, status: 'idle', error: undefined} : i))}
                                                    className="px-4 py-2 bg-red-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                                                >
                                                    Retry Item
                                                </button>
                                                <button 
                                                    onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}
                                                    className="px-4 py-2 bg-white text-slate-500 text-[10px] font-black uppercase rounded-xl border border-slate-200 hover:text-red-600 hover:border-red-200 transition-colors"
                                                >
                                                    Discard
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>

        <aside className="lg:col-span-4 space-y-8">
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                    <LightBulbIcon className="w-32 h-32 rotate-12" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-2.5 mb-8">
                        <div className="bg-amber-100 p-2 rounded-xl">
                            <LightBulbIcon className="w-4 h-4 text-amber-600" />
                        </div>
                        <h3 className="font-black text-slate-800 text-[11px] uppercase tracking-[0.2em]">Efficiency Logic</h3>
                    </div>
                    <div className="min-h-[100px] flex flex-col justify-center">
                        <p className="text-sm text-slate-600 leading-relaxed font-bold italic animate-in fade-in">
                            "{EFFICIENCY_TIPS[tipIndex]}"
                        </p>
                    </div>
                    <div className="mt-8 flex items-center gap-2">
                        {EFFICIENCY_TIPS.map((_, i) => (
                            <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === tipIndex ? 'w-8 bg-brand-600' : 'w-2 bg-slate-200'}`} />
                        ))}
                    </div>
                </div>
            </div>

            {items.length > 0 && (
                <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-brand-500/10 rounded-full blur-3xl" />
                    <div className="relative z-10">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-8">Process Telemetry</h3>
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Queue Size</span>
                                <span className="text-2xl font-black">{totalCount}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Est. Time</span>
                                <span className="text-2xl font-black text-brand-400">~{estMinutesLeft}m</span>
                            </div>
                            <div className="pt-8 border-t border-slate-800">
                                <button 
                                    onClick={() => handleFilesAdd([])} 
                                    className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 active:scale-[0.98] transition-all shadow-xl"
                                >
                                    Push More Items
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </aside>
      </main>
      
      {processingId && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
              <div className="bg-brand-600 text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-4 border border-brand-400/50 animate-in slide-in-from-bottom-8">
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">{statusHeartbeat}</span>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;