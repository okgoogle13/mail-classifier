import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EnvelopeIcon, SparklesIcon, XCircleIcon, CheckCircleIcon, ClockIcon, EyeIcon, ExclamationCircleIcon, CloudIcon, CloudArrowUpIcon, Cog6ToothIcon, ArrowRightOnRectangleIcon, KeyIcon, ComputerDesktopIcon, BoltIcon, FolderOpenIcon, PlayIcon } from '@heroicons/react/24/solid';
import { ArrowPathIcon, DocumentDuplicateIcon, TableCellsIcon, ArrowUpTrayIcon, FolderArrowDownIcon, DocumentTextIcon, DocumentMagnifyingGlassIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import JSZip from 'jszip';
import { jsPDF } from "jspdf";
import ExcelJS from 'exceljs';
import FileUpload from './components/FileUpload';
import AnalysisCard from './components/AnalysisCard';
import ActionSummary from './components/ActionSummary';
import { analyzeMailItem } from './services/geminiService';
import { initGoogleDrive, authenticateDrive, openFolderPicker, listFilesInFolder, getFileBase64 } from './services/googleDriveService';
import { BatchItem, ClassificationType } from './types';

interface SourceConfig {
  type: 'drive' | 'local';
  name: string;
  id?: string; // For Drive
  handle?: any; // For Local FileSystemDirectoryHandle
}

const App: React.FC = () => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isManualMode, setIsManualMode] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionMsg, setExtractionMsg] = useState('');
  
  // Processing Engine State
  const engineActiveRef = useRef<boolean>(false);
  const itemsRef = useRef<BatchItem[]>([]);
  
  // Update ref immediately on items change
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Source Integration State (Drive or Local)
  const [sourceConfig, setSourceConfig] = useState<SourceConfig | null>(null);
  const [isDriveReady, setIsDriveReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoadingSourceFiles, setIsLoadingSourceFiles] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);

  const folderInputRef = useRef<HTMLInputElement>(null);

  const [configForm, setConfigForm] = useState({
      clientId: localStorage.getItem('ukpostbox_google_client_id') || '867091085935-juv1m57ivbm98selovn02nr9onon6p3o.apps.googleusercontent.com',
      apiKey: localStorage.getItem('ukpostbox_google_api_key') || 'AIzaSyCujDvQWeakswsYBjGa59LaGrE8rs2U16E',
      appId: localStorage.getItem('ukpostbox_google_app_id') || '867091085935'
  });
  
  useEffect(() => {
    const loadDrive = async () => {
        setIsInitializing(true);
        try {
            const success = await initGoogleDrive();
            if (success) {
                setIsDriveReady(true);
                const savedConfig = localStorage.getItem('ukpostbox_drive_config');
                if (savedConfig) {
                    const config = JSON.parse(savedConfig);
                    if (config.id && config.name) {
                        const newConfig: SourceConfig = { type: 'drive', id: config.id, name: config.name };
                        setSourceConfig(newConfig);
                        fetchSourceFiles(newConfig).catch(console.error);
                    }
                }
            }
        } catch (e) {
            console.warn("Drive integration unavailable:", e);
        } finally {
            setIsInitializing(false);
        }
    };
    loadDrive();
  }, []); 

  const handleSaveConfig = async (e: React.FormEvent) => {
      e.preventDefault();
      localStorage.setItem('ukpostbox_google_client_id', configForm.clientId.trim());
      localStorage.setItem('ukpostbox_google_api_key', configForm.apiKey.trim());
      localStorage.setItem('ukpostbox_google_app_id', configForm.appId.trim());
      window.location.reload();
  };

  const handleConnectDrive = async () => {
      setIsConnectingDrive(true);
      try {
          const token = await authenticateDrive();
          const folder = await openFolderPicker(token);
          if (folder) {
              const newConfig: SourceConfig = { type: 'drive', id: folder.id, name: folder.name };
              setSourceConfig(newConfig);
              localStorage.setItem('ukpostbox_drive_config', JSON.stringify({ id: folder.id, name: folder.name }));
              setItems([]);
              fetchSourceFiles(newConfig);
          }
      } catch (e: any) {
          console.error("Error picking folder", e);
      } finally {
          setIsConnectingDrive(false);
      }
  };

  const handleConnectLocal = async () => {
      if ('showDirectoryPicker' in window) {
          try {
              const handle = await (window as any).showDirectoryPicker();
              const newConfig: SourceConfig = { type: 'local', name: handle.name, handle };
              setSourceConfig(newConfig);
              setItems([]); 
              fetchSourceFiles(newConfig);
              return;
          } catch (e: any) {}
      }
      folderInputRef.current?.click();
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
       const files = Array.from(e.target.files) as File[];
       const folderName = files[0].webkitRelativePath?.split('/')[0] || "Local Folder";
       setSourceConfig({ type: 'local', name: folderName });
       setItems([]);
       handleFilesAdd(files);
    }
  };

  const handleDisconnect = () => {
      items.forEach(i => i.previewUrl && !i.previewUrl.startsWith('http') && URL.revokeObjectURL(i.previewUrl));
      setSourceConfig(null);
      setItems([]);
      localStorage.removeItem('ukpostbox_drive_config');
      setIsManualMode(false);
  };

  const handleResetCredentials = () => {
      if(confirm("Disconnect and clear all settings?")) {
          localStorage.clear();
          window.location.reload();
      }
  };

  const fetchSourceFiles = async (config: SourceConfig) => {
      setIsLoadingSourceFiles(true);
      try {
          if (config.type === 'drive' && config.id) {
              const files = await listFilesInFolder(config.id);
              const existingIds = new Set(itemsRef.current.map(p => p.driveFileId));
              const newItems = files
                .filter(f => !existingIds.has(f.id))
                .map(f => ({
                    id: f.id,
                    driveFileId: f.id,
                    name: f.name,
                    driveMimeType: f.mimeType,
                    status: 'idle' as const,
                    previewUrl: f.thumbnailLink
                }));
              setItems(prev => [...prev, ...newItems]);
          } else if (config.type === 'local' && config.handle) {
              const newItems: BatchItem[] = [];
              for await (const entry of config.handle.values()) {
                  if (entry.kind === 'file') {
                      const lowerName = entry.name.toLowerCase();
                      if (lowerName.endsWith('.pdf') || lowerName.match(/\.(jpg|jpeg|png)$/)) {
                          const file = await entry.getFile();
                          newItems.push({
                              id: Math.random().toString(36).substr(2, 9),
                              file: file,
                              name: file.name,
                              status: 'idle' as const,
                              previewUrl: URL.createObjectURL(file)
                          });
                      }
                  }
              }
              const existingNames = new Set(itemsRef.current.map(p => p.name));
              const filtered = newItems.filter(i => !existingNames.has(i.name));
              setItems(prev => [...prev, ...filtered]);
          }
      } catch (e: any) {
          console.error("Fetch error", e);
      } finally {
          setIsLoadingSourceFiles(false);
      }
  };

  const getWeekBatchId = () => {
    const date = new Date();
    const year = date.getFullYear();
    const firstDayOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return `${year}-${weekNum.toString().padStart(2, '0')}`;
  };

  const handleFilesAdd = async (files: File[]) => {
    setIsExtracting(true);
    setExtractionMsg('Reading batch...');
    try {
        const processedFiles: File[] = [];
        for (const file of files) {
            const isZip = file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip');
            if (isZip) {
                const zip = new JSZip();
                const loadedZip = await zip.loadAsync(file);
                const fileKeys = Object.keys(loadedZip.files);
                for (const fileName of fileKeys) {
                    if (fileName.includes('__MACOSX') || fileName.includes('.DS_Store')) continue;
                    const entry = loadedZip.files[fileName];
                    if (entry.dir) continue;
                    const lowerName = fileName.toLowerCase();
                    if (lowerName.endsWith('.pdf') || lowerName.match(/\.(jpg|jpeg|png)$/)) {
                        const blob = await entry.async('blob');
                        let type = blob.type;
                        if (!type || type === 'application/octet-stream') {
                            if (lowerName.endsWith('.pdf')) type = 'application/pdf';
                            else if (lowerName.endsWith('.jpg')) type = 'image/jpeg';
                            else if (lowerName.endsWith('.png')) type = 'image/png';
                        }
                        processedFiles.push(new File([blob], fileName.split('/').pop()!, { type }));
                    }
                }
            } else {
                processedFiles.push(file);
            }
        }
        const validFiles = processedFiles.filter(file => file.type.startsWith('image/') || file.type === 'application/pdf');
        const newItems: BatchItem[] = validFiles.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            file,
            name: file.name,
            status: 'idle',
            previewUrl: URL.createObjectURL(file)
        }));
        setItems(prev => [...prev, ...newItems]);
        setIsManualMode(true);
    } catch (e: any) {
        alert("Error unpacking: " + e.message);
    } finally {
        setIsExtracting(false);
        setExtractionMsg('');
    }
  };

  // --- STABLE SEQUENTIAL ENGINE ---
  const startEngine = useCallback(async () => {
    if (engineActiveRef.current) return;
    engineActiveRef.current = true;

    while (true) {
      const nextItem = itemsRef.current.find(i => i.status === 'idle');
      if (!nextItem) break;

      setProcessingId(nextItem.id);
      setItems(prev => prev.map(i => i.id === nextItem.id ? { ...i, status: 'analyzing', statusMessage: 'Preparing data...' } : i));

      try {
        let base64Content = "";
        let mimeType = "";

        if (nextItem.driveFileId) {
             base64Content = await getFileBase64(nextItem.driveFileId);
             mimeType = nextItem.driveMimeType || 'application/pdf';
        } else if (nextItem.file) {
             base64Content = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res((reader.result as string).split(',')[1]);
                reader.onerror = (e) => rej(new Error("File read error: " + e));
                reader.readAsDataURL(nextItem.file!);
             });
             mimeType = nextItem.file.type;
        }

        if (!base64Content) throw new Error("File content is empty.");

        const results = await analyzeMailItem(
            base64Content, 
            mimeType, 
            { filename: nextItem.name, week_batch_id: getWeekBatchId() },
            (msg) => setItems(prev => prev.map(i => i.id === nextItem.id ? { ...i, statusMessage: msg } : i))
        );

        const hasTBC = results.some(r => r.classification === ClassificationType.TBC);
        setItems(prev => prev.map(i => i.id === nextItem.id ? { ...i, status: hasTBC ? 'needs_manual_review' : 'success', results, statusMessage: undefined } : i));
        
      } catch (error: any) {
        console.error(`Engine Error on ${nextItem.name}:`, error);
        setItems(prev => prev.map(i => i.id === nextItem.id ? { ...i, status: 'error', error: error.message || "Unknown analysis error", statusMessage: undefined } : i));
      }

      // Safe pause between items (approx 7.5s for deep thinking stability)
      await new Promise(res => setTimeout(res, 7500));
    }

    setProcessingId(null);
    engineActiveRef.current = false;
  }, []);

  useEffect(() => {
    const hasIdle = items.some(i => i.status === 'idle');
    if (hasIdle && !engineActiveRef.current) {
      startEngine();
    }
  }, [items, startEngine]);

  const removeItem = (id: string) => {
    setItems(prev => {
        const item = prev.find(i => i.id === id);
        if (item?.previewUrl && !item.previewUrl.startsWith('http')) URL.revokeObjectURL(item.previewUrl);
        return prev.filter(i => i.id !== id);
    });
  };

  const getProcessedItems = () => items.filter(i => (i.status === 'success' || i.status === 'needs_manual_review') && i.results);

  const handleDownloadCSV = () => {
      const processed = getProcessedItems();
      if (processed.length === 0) return;
      const headers = ["Item ID", "Filename", "Class", "Routing", "Action", "Sender", "Recipient", "Date"];
      const rows = processed.flatMap(item => (item.results || []).map(r => [
          r.itemId, r.suggestedFilename, r.classification, r.routing || "N/A", r.auto_action || r.tag, r.sender, r.addressee, r.deadline
      ].map(f => `"${(f || '').toString().replace(/"/g, '""')}"`).join(',')));
      const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Batch_${new Date().toISOString().slice(0,10)}.csv`;
      link.click();
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-900">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="p-1.5 bg-brand-600 rounded text-white shadow-sm"><EnvelopeIcon className="w-5 h-5" /></div>
             <span className="font-bold text-gray-900 hidden sm:block">Postbox Classifier</span>
          </div>
          <div className="flex items-center gap-2">
             {(processingId || isExtracting) && (
                 <div className="flex items-center gap-2 px-3 py-1 bg-brand-50 text-brand-700 rounded-full text-xs font-bold animate-pulse border border-brand-100">
                     <ArrowPathIcon className="w-4 h-4 animate-spin" />
                     {isExtracting ? "Unpacking..." : "Thinking..."}
                 </div>
             )}
             {!engineActiveRef.current && items.some(i => i.status === 'idle') && (
                <button onClick={startEngine} className="flex items-center gap-1.5 px-3 py-1 bg-brand-600 text-white rounded-full text-xs font-bold hover:bg-brand-700 shadow-md">
                    <PlayIcon className="w-3.5 h-3.5" /> Start Processing
                </button>
             )}
             <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-white shadow-sm">
                <ComputerDesktopIcon className="w-4 h-4 text-gray-400" />
                <span className="font-medium truncate max-w-[100px]">{sourceConfig?.name || "Local Batch"}</span>
                <button onClick={handleDisconnect} className="ml-2 text-gray-400 hover:text-red-500"><XCircleIcon className="w-4 h-4" /></button>
             </div>
             <button onClick={handleDownloadCSV} className="p-2 text-gray-400 hover:text-brand-600" title="Export CSV"><TableCellsIcon className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {!sourceConfig && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-20">
                <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 max-w-xl w-full text-center space-y-8">
                    <div className="space-y-2">
                         <h2 className="text-3xl font-extrabold text-gray-900">Upload Your Batch</h2>
                         <p className="text-gray-500">Classify PDFs, Images, or a ZIP archive (Max 100 items)</p>
                    </div>
                    <FileUpload onFilesSelect={handleFilesAdd} isProcessing={!!processingId || isExtracting} />
                    <div className="pt-6 border-t border-gray-50 flex items-center justify-center gap-4">
                        <button onClick={handleConnectDrive} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-gray-50"><CloudIcon className="w-4 h-4 text-brand-500" /> Google Drive</button>
                        <button onClick={handleConnectLocal} className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-gray-50"><FolderOpenIcon className="w-4 h-4 text-indigo-500" /> Local Folder</button>
                    </div>
                </div>
            </div>
        ) : (
            <>
                <ActionSummary items={items} />
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="text-sm font-semibold text-gray-600">
                        {items.filter(i => i.status === 'success' || i.status === 'needs_manual_review').length} / {items.length} Completed
                    </div>
                    <div className="w-48"><FileUpload onFilesSelect={handleFilesAdd} isProcessing={!!processingId || isExtracting} /></div>
                </div>
                <div className="space-y-4">
                  {items.map(item => (
                    <div key={item.id} className={`bg-white rounded-2xl border transition-all shadow-sm ${item.status === 'analyzing' ? 'border-brand-500 ring-4 ring-brand-50' : 'border-gray-200'}`}>
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4 overflow-hidden">
                            <div className="flex-shrink-0">
                                {item.status === 'idle' && <ClockIcon className="w-6 h-6 text-gray-300" />}
                                {item.status === 'analyzing' && <ArrowPathIcon className="w-6 h-6 text-brand-500 animate-spin" />}
                                {(item.status === 'success' || item.status === 'needs_manual_review') && <CheckCircleIcon className="w-6 h-6 text-green-500" />}
                                {item.status === 'error' && <ExclamationCircleIcon className="w-6 h-6 text-red-500" />}
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-bold truncate text-gray-900" title={item.name}>{item.name}</h3>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${item.status === 'analyzing' ? 'text-brand-600' : 'text-gray-400'}`}>
                                    {item.status === 'analyzing' ? (item.statusMessage || 'Analyzing...') : item.status.replace(/_/g, ' ')}
                                </p>
                            </div>
                        </div>
                        <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-500 p-2"><XMarkIcon className="w-5 h-5" /></button>
                      </div>
                      {item.results && (
                          <div className="px-4 pb-4 grid gap-4 border-t border-gray-50 pt-4">
                            {item.results.map((r, idx) => (
                              <AnalysisCard key={idx} result={r} originalFile={item.file || new File([], item.name)} itemIndex={idx+1} totalItems={item.results!.length} driveConfig={sourceConfig?.type === 'drive' ? {id: sourceConfig.id!, name: sourceConfig.name} : null} />
                            ))}
                          </div>
                      )}
                      {item.error && <div className="px-4 pb-4"><div className="bg-red-50 border border-red-100 text-red-700 text-[11px] p-3 rounded-xl font-bold">{item.error}</div></div>}
                    </div>
                  ))}
                </div>
            </>
        )}
      </main>
    </div>
  );
};

const XMarkIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
);

export default App;