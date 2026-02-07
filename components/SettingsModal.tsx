import React, { useState, useEffect } from 'react';
import { XMarkIcon, KeyIcon, ExclamationTriangleIcon, CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const [clientId, setClientId] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [appId, setAppId] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setClientId(localStorage.getItem('ukpostbox_google_client_id') || '');
            setApiKey(localStorage.getItem('ukpostbox_google_api_key') || '');
            setAppId(localStorage.getItem('ukpostbox_google_app_id') || '');
            setValidationError(null);
        }
    }, [isOpen]);

    const handleSave = () => {
        setValidationError(null);
        
        // Validation
        if (!clientId.trim()) return setValidationError("Client ID is required.");
        if (!apiKey.trim()) return setValidationError("API Key is required.");
        if (!appId.trim()) return setValidationError("App ID is required.");
        
        if (!/^\d+$/.test(appId.trim())) {
            return setValidationError("App ID (Project Number) must be numeric. It is NOT the project ID string.");
        }

        if (!clientId.includes('.apps.googleusercontent.com')) {
             if (!confirm("The Client ID doesn't look like a standard Google Client ID. Save anyway?")) {
                 return;
             }
        }

        localStorage.setItem('ukpostbox_google_client_id', clientId.trim());
        localStorage.setItem('ukpostbox_google_api_key', apiKey.trim());
        localStorage.setItem('ukpostbox_google_app_id', appId.trim());
        
        // Prompt for reload to initialize
        if (confirm("Credentials saved. The application must reload to authenticate with Google Services. Reload now?")) {
            window.location.reload();
        } else {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100 border border-slate-100">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-2">
                         <div className="bg-brand-100 p-2 rounded-xl border border-brand-200">
                            <KeyIcon className="w-5 h-5 text-brand-600" />
                         </div>
                         <div>
                            <h3 className="font-bold text-slate-800">Drive API Configuration</h3>
                            <p className="text-xs text-slate-500">Secure Client-Side Integration</p>
                         </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-all">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-6 space-y-6">
                    {validationError && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-xs font-bold text-red-700 animate-in slide-in-from-top-2">
                            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
                            {validationError}
                        </div>
                    )}

                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 leading-relaxed space-y-2">
                        <p className="flex items-start gap-2">
                            <InformationCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600" />
                            <span><strong>Privacy Note:</strong> Keys are stored strictly in your browser's local storage. No data is sent to third-party servers.</span>
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Google Client ID</label>
                            <input 
                                type="text" 
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                className="w-full text-sm p-3.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none font-mono text-slate-600 transition-all bg-slate-50/50 focus:bg-white placeholder:text-slate-300"
                                placeholder="123456789-abc...apps.googleusercontent.com"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Google API Key</label>
                            <input 
                                type="text" 
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="w-full text-sm p-3.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none font-mono text-slate-600 transition-all bg-slate-50/50 focus:bg-white placeholder:text-slate-300"
                                placeholder="AIzaSy..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">App ID (Project Number)</label>
                            <input 
                                type="text" 
                                value={appId}
                                onChange={(e) => setAppId(e.target.value)}
                                className="w-full text-sm p-3.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none font-mono text-slate-600 transition-all bg-slate-50/50 focus:bg-white placeholder:text-slate-300"
                                placeholder="867091085935"
                            />
                            <p className="text-[10px] text-slate-400 font-medium px-1">Must be the numeric <strong>Project Number</strong> (found in GCP Dashboard), NOT the Project ID.</p>
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-5 py-2.5 text-slate-500 font-bold text-xs uppercase hover:text-slate-700 transition-colors hover:bg-slate-200/50 rounded-xl"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave}
                        className="bg-brand-600 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide hover:bg-brand-700 transition-all shadow-lg shadow-brand-200 active:scale-95 flex items-center gap-2"
                    >
                        <CheckCircleIcon className="w-4 h-4" />
                        Save & Initialize
                    </button>
                </div>
            </div>
        </div>
    );
};