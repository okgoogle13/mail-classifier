import React, { useState } from 'react';
import { MailAnalysisResult, ClassificationType } from '../types';
import { uploadFileToDrive } from '../services/googleDriveService';
import { 
  ArchiveBoxIcon, 
  PaperAirplaneIcon, 
  TrashIcon, 
  QuestionMarkCircleIcon,
  DocumentDuplicateIcon,
  ArrowDownTrayIcon,
  BellAlertIcon,
  Square2StackIcon,
  MapPinIcon,
  CloudArrowUpIcon,
  CheckIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

interface AnalysisCardProps {
  result: MailAnalysisResult;
  originalFile: File;
  itemIndex?: number;
  totalItems?: number;
  driveConfig?: { id: string; name: string } | null;
}

const getCategoryStyles = (category: ClassificationType) => {
  switch (category) {
    case ClassificationType.FORWARD_AYR:
      return { 
        bg: 'bg-blue-50', 
        border: 'border-blue-200', 
        text: 'text-blue-800', 
        icon: <PaperAirplaneIcon className="w-6 h-6" />,
        label: '🇬🇧 Forward to Ayr'
      };
    case ClassificationType.FORWARD_OZ:
      return { 
        bg: 'bg-indigo-50', 
        border: 'border-indigo-200', 
        text: 'text-indigo-800', 
        icon: <PaperAirplaneIcon className="w-6 h-6 rotate-90" />,
        label: '🇦🇺 Forward to Oz'
      };
    case ClassificationType.DIGITAL_STORE_ACTION:
      return { 
        bg: 'bg-orange-50', 
        border: 'border-orange-200', 
        text: 'text-orange-800', 
        icon: <BellAlertIcon className="w-6 h-6" />,
        label: '⚡ Digital (Action Req)'
      };
    case ClassificationType.DIGITAL_STORE:
      return { 
        bg: 'bg-green-50', 
        border: 'border-green-200', 
        text: 'text-green-800', 
        icon: <ArchiveBoxIcon className="w-6 h-6" />,
        label: '💾 Digital Store'
      };
    case ClassificationType.SHRED:
      return { 
        bg: 'bg-gray-50', 
        border: 'border-gray-200', 
        text: 'text-gray-800', 
        icon: <TrashIcon className="w-6 h-6" />,
        label: '🗑️ Shred'
      };
    default:
      return { 
        bg: 'bg-yellow-50', 
        border: 'border-yellow-200', 
        text: 'text-yellow-800', 
        icon: <QuestionMarkCircleIcon className="w-6 h-6" />,
        label: '❓ TBC'
      };
  }
};

const AnalysisCard: React.FC<AnalysisCardProps> = ({ result, originalFile, itemIndex = 1, totalItems = 1, driveConfig }) => {
  const styles = getCategoryStyles(result.classification);
  const isBatch = totalItems > 1;
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');

  const copyToClipboard = () => {
    const text = `
ITEM ID: ${result.itemId}
CLASSIFICATION: ${result.classification}
TAG: ${result.tag}
ADDRESSEE: ${result.addressee}
SENDER: ${result.sender}
ORIGINAL ADDRESS: ${result.originalAddress}
REASON: ${result.reason}
DEADLINE: ${result.deadline}
AUTO ACTION: ${result.auto_action || 'N/A'}
    `.trim();
    navigator.clipboard.writeText(text);
    alert("Item details copied to clipboard.");
  };

  const handleDownloadRenamed = () => {
    const blob = new Blob([originalFile], { type: originalFile.type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const extension = originalFile.name.split('.').pop() || 'pdf';
    let filename = result.suggestedFilename || `item_${result.itemId}`;
    if (!filename.toLowerCase().endsWith(`.${extension}`)) {
        filename = `${filename}.${extension}`;
    }
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUploadToDrive = async () => {
      if (!driveConfig) return;
      setUploadStatus('uploading');
      
      const extension = originalFile.name.split('.').pop() || 'pdf';
      let filename = result.suggestedFilename || `item_${result.itemId}`;
      if (!filename.toLowerCase().endsWith(`.${extension}`)) {
          filename = `${filename}.${extension}`;
      }

      const description = `
Sender: ${result.sender}
Addressee: ${result.addressee}
Reason: ${result.reason}
Classification: ${result.classification}
ID: ${result.itemId}
      `.trim();

      try {
          await uploadFileToDrive(originalFile, driveConfig.id, filename, description);
          setUploadStatus('success');
      } catch (e) {
          console.error("Upload failed", e);
          setUploadStatus('error');
          alert("Upload failed. Please ensure you have write access to the selected Drive folder.");
      }
  };

  return (
    <div className={`rounded-xl border-2 ${styles.border} overflow-hidden shadow-sm transition-all duration-300`}>
      {isBatch && (
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2 flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wide">
             <Square2StackIcon className="w-4 h-4" />
             Batch Item {itemIndex} of {totalItems}
             {result.week_batch_id && (
                 <span className="ml-auto bg-slate-200 px-2 py-0.5 rounded text-[10px]">
                     BATCH: {result.week_batch_id}
                 </span>
             )}
        </div>
      )}

      <div className={`${styles.bg} p-6 border-b ${styles.border} flex items-center justify-between`}>
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-full bg-white bg-opacity-60 ${styles.text}`}>
            {styles.icon}
          </div>
          <div>
            <h2 className={`text-xl font-bold ${styles.text}`}>{styles.label}</h2>
            <div className="flex items-center gap-2">
                <p className={`text-sm opacity-80 ${styles.text}`}>{result.tag || "(No Tag)"}</p>
                {result.auto_action && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-white/50 rounded text-gray-600 border border-black/10">
                        {result.auto_action.replace(/_/g, ' ')}
                    </span>
                )}
            </div>
          </div>
        </div>
        <button onClick={copyToClipboard} className="p-2 hover:bg-white/50 rounded-lg text-gray-600 transition-colors">
          <DocumentDuplicateIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 bg-white space-y-6">
        {/* Critical Address Section */}
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-start gap-3">
           <MapPinIcon className="w-5 h-5 text-brand-500 mt-0.5" />
           <div className="space-y-1">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Original Delivery Address</label>
             <p className="text-sm text-gray-900 font-semibold leading-tight">{result.originalAddress}</p>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Addressee</label>
            <p className="text-gray-900 font-medium">{result.addressee}</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sender</label>
            <p className="text-gray-900 font-medium">{result.sender}</p>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Classification Reasoning</label>
          <p className="text-gray-700 leading-relaxed text-sm mt-1">{result.reason}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Action Deadline</label>
            <p className={`font-medium ${result.deadline !== 'None' ? 'text-red-600' : 'text-gray-500'}`}>
              {result.deadline}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Item ID</label>
            <p className="text-gray-500 font-mono text-sm">{result.itemId}</p>
            {result.importance && (
                <p className={`text-[10px] font-bold mt-1 ${result.importance.includes('CRITICAL') ? 'text-red-600' : 'text-gray-400'}`}>
                    {result.importance}
                </p>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 bg-gray-50/50 -mx-6 -mb-6 p-4 flex items-center justify-between">
            <div className="text-[10px] text-gray-400 font-mono truncate max-w-xs" title={result.suggestedFilename}>
                {result.suggestedFilename}
            </div>
            <div className="flex items-center gap-2">
                {driveConfig && (
                    <button
                        onClick={handleUploadToDrive}
                        disabled={uploadStatus === 'uploading' || uploadStatus === 'success'}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm border
                           ${uploadStatus === 'success' 
                               ? 'bg-green-100 text-green-700 border-green-200' 
                               : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:text-blue-600 hover:border-blue-200'
                           }
                        `}
                    >
                        {uploadStatus === 'uploading' ? (
                             <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        ) : uploadStatus === 'success' ? (
                             <CheckIcon className="w-4 h-4" />
                        ) : (
                             <CloudArrowUpIcon className="w-4 h-4" />
                        )}
                        {uploadStatus === 'success' ? 'Saved' : 'Save to Drive'}
                    </button>
                )}
                <button
                    onClick={handleDownloadRenamed}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-xs font-bold text-gray-700 hover:bg-gray-50 hover:text-brand-600 hover:border-brand-200 transition-colors shadow-sm"
                >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                    Download
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisCard;