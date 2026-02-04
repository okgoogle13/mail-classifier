import React, { useMemo, useState } from 'react';
import { BatchItem, ClassificationType, MailAnalysisResult } from '../types';
import { 
  ArchiveBoxIcon, 
  ClipboardDocumentListIcon, 
  ExclamationTriangleIcon, 
  CalendarDaysIcon, 
  EnvelopeIcon, 
  ArrowTopRightOnSquareIcon,
  TruckIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  MapPinIcon
} from '@heroicons/react/24/outline';

interface ActionSummaryProps {
  items: BatchItem[];
}

type ConsignmentType = 'ayr' | 'oz' | null;

const ActionSummary: React.FC<ActionSummaryProps> = ({ items }) => {
  const [activeConsignment, setActiveConsignment] = useState<ConsignmentType>(null);

  const groupedResults = useMemo(() => {
    const groups = {
      ayr: [] as MailAnalysisResult[],
      oz: [] as MailAnalysisResult[],
      action: [] as MailAnalysisResult[],
      digital: [] as MailAnalysisResult[],
      shred: [] as MailAnalysisResult[],
      tbc: [] as MailAnalysisResult[],
    };

    items.forEach(item => {
      if ((item.status === 'success' || item.status === 'needs_manual_review') && item.results) {
        item.results.forEach(result => {
          if (result.classification === ClassificationType.FORWARD_AYR) groups.ayr.push(result);
          else if (result.classification === ClassificationType.FORWARD_OZ) groups.oz.push(result);
          else if (result.classification === ClassificationType.DIGITAL_STORE_ACTION) groups.action.push(result);
          else if (result.classification === ClassificationType.DIGITAL_STORE) groups.digital.push(result);
          else if (result.classification === ClassificationType.SHRED) groups.shred.push(result);
          else groups.tbc.push(result);
        });
      }
    });

    return groups;
  }, [items]);

  const totalItems = (Object.values(groupedResults) as MailAnalysisResult[][]).reduce((acc, curr) => acc + curr.length, 0);
  const hasResults = totalItems > 0;

  if (!hasResults) return null;

  // --- Handlers ---

  const copyToClipboard = (title: string, results: MailAnalysisResult[]) => {
    if (results.length === 0) return;
    const idList = results.map(r => `- Item ID: ${r.itemId} (${r.addressee})`).join('\n');
    const message = `REQUEST: ${title}\n\nPlease process the following items:\n${idList}\n\nThank you.`.trim();
    navigator.clipboard.writeText(message);
    alert(`Copied details for ${results.length} items to clipboard.`);
  };

  const copyIdsForSearch = (results: MailAnalysisResult[]) => {
      const ids = results.map(r => r.itemId).join(', ');
      navigator.clipboard.writeText(ids);
      alert("Item IDs copied! You can paste these into the UK Postbox search bar.");
  };

  const handleOpenGoogleCalendar = () => {
    if (groupedResults.action.length === 0) return;
    const item = groupedResults.action[0];
    let dates = "";
    if (item.deadline && item.deadline.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const start = item.deadline.replace(/-/g, '');
        dates = `&dates=${start}/${start}`;
    } else {
        const tmrw = new Date();
        tmrw.setDate(tmrw.getDate() + 1);
        const start = tmrw.toISOString().slice(0, 10).replace(/-/g, '');
        dates = `&dates=${start}/${start}`;
    }
    const title = encodeURIComponent(`[ACTION] ${item.sender}: ${item.suggestedFilename}`);
    const details = encodeURIComponent(`Reason: ${item.reason}\nItem ID: ${item.itemId}\nAddressee: ${item.addressee}\n\nProcessed by Postbox Classifier`);
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}${dates}`;
    window.open(url, '_blank');
  };

  const handleEmailSelf = () => {
    if (groupedResults.action.length === 0) return;
    const subject = encodeURIComponent(`Action Required: ${groupedResults.action.length} Postbox Items`);
    const bodyText = groupedResults.action.map(item => 
        `Sender: ${item.sender}\nFile: ${item.suggestedFilename}\nReason: ${item.reason}\nDeadline: ${item.deadline}\n---\n`
    ).join('\n');
    const body = encodeURIComponent(`These items require action:\n\n${bodyText}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  // --- Modal Content Generators ---

  const getConsignmentConfig = (type: ConsignmentType) => {
      if (type === 'ayr') {
          return {
              title: "Forward to Ayr (Dad's Mail)",
              items: groupedResults.ayr,
              address: "10 Uist Wynd, Ayr, KA7 4GF",
              recipient: "Arvind/Ashima Dougall",
              color: "blue",
              shippingNote: "Standard Royal Mail is usually sufficient for domestic forwarding."
          };
      } else {
          return {
              title: "Forward to Australia (Essentials)",
              items: groupedResults.oz,
              address: "Nishant Dougall, [Australian Address]",
              recipient: "Nishant Dougall",
              color: "indigo",
              shippingNote: "⚠️ CRITICAL: Use DHL or UPS for international tracking. Declare as 'Personal Documents' for customs."
          };
      }
  };

  const ActionButton = ({ count, label, subLabel, onClick, colorClass, icon: Icon, extraAction }: any) => (
    <div className={`flex flex-col rounded-xl border transition-all ${
        count > 0 
          ? `${colorClass}` 
          : 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
      }`}>
        <button
          onClick={onClick}
          disabled={count === 0}
          className="flex items-center justify-between p-4 w-full text-left"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-white/60`}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium opacity-90">{label}</p>
              <p className="text-xs opacity-75">{subLabel}</p>
            </div>
          </div>
          <span className="text-2xl font-bold">{count}</span>
        </button>
        {extraAction && count > 0 && (
            <div className="px-4 pb-4 pt-0">
                {extraAction}
            </div>
        )}
    </div>
  );

  const renderConsignmentModal = () => {
      if (!activeConsignment) return null;
      const config = getConsignmentConfig(activeConsignment);
      const isOz = activeConsignment === 'oz';
      const themeColor = isOz ? 'indigo' : 'blue';

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className={`p-6 bg-${themeColor}-50 border-b border-${themeColor}-100 flex items-center justify-between`}>
                    <div>
                        <h2 className={`text-xl font-bold text-${themeColor}-900`}>{config.title}</h2>
                        <p className={`text-sm text-${themeColor}-700`}>{config.items.length} items to consolidate</p>
                    </div>
                    <button onClick={() => setActiveConsignment(null)} className="p-2 hover:bg-white/50 rounded-full transition-colors">
                        <XMarkIcon className="w-6 h-6 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto p-6 space-y-8">
                    
                    {/* Step 1: List */}
                    <section>
                        <div className="flex items-center justify-between mb-3">
                             <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">1. Locate Items in Inbox</h3>
                             <button 
                                onClick={() => copyIdsForSearch(config.items)}
                                className={`text-xs flex items-center gap-1 font-medium text-${themeColor}-600 hover:text-${themeColor}-700 bg-${themeColor}-50 px-2 py-1 rounded-md`}
                             >
                                <MagnifyingGlassIcon className="w-3 h-3" />
                                Copy IDs for Search
                             </button>
                        </div>
                        <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item ID</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sender</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {config.items.map(item => (
                                        <tr key={item.itemId}>
                                            <td className="px-4 py-2 text-sm font-mono text-gray-700 select-all">{item.itemId}</td>
                                            <td className="px-4 py-2 text-sm text-gray-900">{item.sender}</td>
                                            <td className="px-4 py-2 text-xs text-gray-500">{item.reason}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Step 2: Instructions */}
                    <section className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">2. Manual Batch Forwarding Guide</h3>
                        <ol className="list-decimal list-inside space-y-3 text-sm text-gray-700">
                            <li><strong className="text-gray-900">Log In:</strong> Access the UK Postbox Web App.</li>
                            <li><strong className="text-gray-900">Select Items:</strong> Use the search bar (paste IDs) or browse your inbox to tick the {config.items.length} boxes listed above.</li>
                            <li><strong className="text-gray-900">Create Batch:</strong> Click the 'Forward' action button.</li>
                            <li>
                                <strong className="text-gray-900">Choose Destination:</strong> Select address for:
                                <div className="mt-2 ml-4 p-2 bg-white border border-gray-300 rounded text-gray-800 font-medium flex items-center gap-2">
                                    <MapPinIcon className="w-4 h-4 text-red-500" />
                                    {config.address}
                                </div>
                            </li>
                            <li><strong className="text-gray-900">Finalise:</strong> {config.shippingNote}</li>
                        </ol>
                    </section>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                     <button 
                        onClick={() => copyToClipboard(`Forward to ${config.recipient}`, config.items)}
                        className="text-sm font-medium text-gray-500 hover:text-gray-700 px-4 py-2"
                     >
                        Copy for Support Ticket instead
                     </button>
                     <button 
                        onClick={() => setActiveConsignment(null)}
                        className={`px-4 py-2 bg-${themeColor}-600 hover:bg-${themeColor}-700 text-white rounded-lg font-medium shadow-sm transition-colors`}
                     >
                        Done
                     </button>
                </div>
            </div>
        </div>
      );
  };

  return (
    <>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-8">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ClipboardDocumentListIcon className="w-5 h-5 text-brand-600" />
                Batch Actions
            </h3>
            <span className="bg-brand-100 text-brand-700 text-xs font-bold px-3 py-1 rounded-full border border-brand-200 shadow-sm">
                {totalItems} Scans Classified
            </span>
            </div>
            <span className="text-xs text-gray-500 hidden sm:block">Grouped by Routing Logic</span>
        </div>
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* Ayr */}
            <ActionButton 
            count={groupedResults.ayr.length}
            label="Forward to Ayr"
            subLabel="Create Consignment"
            icon={TruckIcon}
            colorClass="bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100 hover:shadow-md"
            onClick={() => setActiveConsignment('ayr')}
            />

            {/* Oz */}
            <ActionButton 
            count={groupedResults.oz.length}
            label="Forward to Oz"
            subLabel="Create Consignment"
            icon={TruckIcon}
            colorClass="bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100 hover:shadow-md"
            onClick={() => setActiveConsignment('oz')}
            />

            {/* Action Required - No-Config Tools */}
            <ActionButton 
            count={groupedResults.action.length}
            label="Action & Shred"
            subLabel="Task Reminders"
            icon={CalendarDaysIcon}
            colorClass="bg-orange-50 border-orange-200 text-orange-800"
            onClick={handleOpenGoogleCalendar}
            extraAction={
                <div className="flex gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleOpenGoogleCalendar(); }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-white text-gray-700 border border-gray-300 hover:bg-orange-100 shadow-sm transition-all"
                        title="Open Google Calendar Event"
                    >
                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                        Open G-Cal
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleEmailSelf(); }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-white text-gray-700 border border-gray-300 hover:bg-orange-100 shadow-sm transition-all"
                        title="Email details to self (Add to Tasks in Gmail)"
                    >
                        <EnvelopeIcon className="w-4 h-4" />
                        Email Self
                    </button>
                </div>
            }
            />

            {/* Shred */}
            <ActionButton 
            count={groupedResults.shred.length}
            label="Shred / Junk"
            subLabel="Generate Ticket"
            icon={ClipboardDocumentListIcon}
            colorClass="bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200 hover:shadow-md"
            onClick={() => copyToClipboard("Please Shred These Items", groupedResults.shred)}
            />

            {/* TBC Alert */}
            <div className={`col-span-1 md:col-span-2 lg:col-span-1 flex items-center justify-between p-4 rounded-xl border ${
            groupedResults.tbc.length > 0 
                ? 'bg-yellow-50 border-yellow-200 text-yellow-800' 
                : 'bg-green-50 border-green-200 text-green-800'
            }`}>
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/60">
                <ExclamationTriangleIcon className="w-6 h-6" />
                </div>
                <div>
                <p className="text-sm font-medium">Manual Review</p>
                <p className="text-xs opacity-75">{groupedResults.tbc.length > 0 ? 'Items need attention' : 'All clear'}</p>
                </div>
            </div>
            <span className="text-2xl font-bold">{groupedResults.tbc.length}</span>
            </div>

        </div>
        
        {/* Digital Stats */}
        <div className="bg-green-50/50 p-4 border-t border-green-100 flex items-center justify-center gap-2 text-sm text-green-800">
            <ArchiveBoxIcon className="w-4 h-4" />
            <span>{groupedResults.digital.length} Passive Digital items (Store only) + {groupedResults.action.length} Action Items.</span>
        </div>
        </div>

        {renderConsignmentModal()}
    </>
  );
};

export default ActionSummary;